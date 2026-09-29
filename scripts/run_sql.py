#!/usr/bin/env python3
"""Execute a KAVACH sql/*.sql build script statement by statement.

Splits on real statement boundaries (dollar-quoted procedure bodies and
Snowflake Scripting blocks survive intact) via the connector's own splitter,
applies account-portability substitutions, and reports per-statement outcome
so a failure halfway through a 800-line script is obvious.

Usage:
    run_sql.py sql/04_synthetic_data.sql [...]
    run_sql.py --keep-going sql/07_regulation_compiler.sql
    run_sql.py --dry-run sql/02_governance.sql      # split + substitute only

Connection comes from env (SNOWFLAKE_ACCOUNT/USER/PASSWORD) or, by default,
the CLI connection named by SNOWFLAKE_CONNECTION_NAME / the default in
~/.snowflake/connections.toml.
"""
from __future__ import annotations

import argparse
import io
import os
import re
import sys
import time

import snowflake.connector

# Words that open a Snowflake Scripting block, and the closers that pair with
# them as a two-word "END <kw>". Only consulted while inside a scripting body.
_BLOCK_OPENERS = {"BEGIN", "IF", "CASE", "FOR", "WHILE", "LOOP", "REPEAT"}
_END_PARTNERS = {"IF", "CASE", "FOR", "WHILE", "LOOP", "REPEAT"}


def split_sql(text: str) -> list[str]:
    """Split a script into statements on top-level semicolons.

    Aware of: line and block comments, single-quoted strings (with '' and
    backslash escapes), double-quoted identifiers, $$-delimited bodies, and
    Snowflake Scripting BEGIN/END nesting. The connector's own splitter handles
    everything here except the last one, which is why this exists: a
    `LANGUAGE SQL ... AS BEGIN LET x STRING; ... END;` procedure would
    otherwise be cut at the first inner semicolon.
    """
    out: list[str] = []
    buf: list[str] = []
    depth = 0
    scripting = False
    i, n = 0, len(text)

    def flush() -> None:
        nonlocal buf, depth, scripting
        if "".join(buf).strip():
            out.append("".join(buf))
        buf, depth, scripting = [], 0, False

    while i < n:
        ch = text[i]

        if text.startswith("--", i):
            j = text.find("\n", i)
            j = n if j < 0 else j + 1
            buf.append(text[i:j]); i = j; continue

        if text.startswith("/*", i):
            j = text.find("*/", i)
            j = n if j < 0 else j + 2
            buf.append(text[i:j]); i = j; continue

        if text.startswith("$$", i):
            j = text.find("$$", i + 2)
            j = n if j < 0 else j + 2
            buf.append(text[i:j]); i = j; continue

        if ch == "'":
            j = i + 1
            while j < n:
                if text[j] == "\\":
                    j += 2; continue
                if text[j] == "'":
                    if j + 1 < n and text[j + 1] == "'":
                        j += 2; continue
                    j += 1; break
                j += 1
            buf.append(text[i:j]); i = j; continue

        if ch == '"':
            j = text.find('"', i + 1)
            j = n if j < 0 else j + 1
            buf.append(text[i:j]); i = j; continue

        if ch.isalpha() or ch == "_":
            j = i
            while j < n and (text[j].isalnum() or text[j] == "_"):
                j += 1
            word = text[i:j]
            upper = word.upper()
            preceding = "".join(buf)
            buf.append(word)
            i = j

            if upper in ("BEGIN", "DECLARE") and not scripting:
                # A body only starts after AS, or at the very start of an
                # anonymous block. `BEGIN` elsewhere (e.g. BEGIN TRANSACTION
                # mid-script) must not arm the depth counter.
                if re.search(r"(\bAS\b)\s*$", preceding, re.I) or not preceding.strip():
                    scripting = True
                    if upper == "BEGIN":
                        depth += 1
                    continue

            if not scripting:
                continue

            if upper == "END":
                # Consume a paired "END IF" / "END FOR" / ... as one closer.
                k = j
                while k < n and text[k] in " \t\r\n":
                    k += 1
                m = re.match(r"[A-Za-z_]+", text[k:])
                if m and m.group(0).upper() in _END_PARTNERS:
                    buf.append(text[j:k + m.end()])
                    i = k + m.end()
                depth -= 1
            elif upper in _BLOCK_OPENERS:
                depth += 1
            continue

        if ch == ";":
            buf.append(ch)
            i += 1
            if depth <= 0:
                flush()
            continue

        buf.append(ch)
        i += 1

    flush()
    return out

# Substitutions applied to every statement before execution. The build scripts
# were authored against earlier accounts and hardcode that account's user name.
SUBS: list[tuple[str, str]] = [
    (r"\bPRATHAMAHUJA001\b", os.environ.get("KAVACH_USER", "PAHUJA")),
    (r"\bPRATHAMAHUJA\b", os.environ.get("KAVACH_USER", "PAHUJA")),
    (r"\bONFHCCI-TV84204\b", os.environ.get("KAVACH_ACCOUNT", "ZJXSMHI-BU67728")),
    (r"onfhcci-tv84204", os.environ.get("KAVACH_ACCOUNT", "ZJXSMHI-BU67728").lower()),
]


def substitute(sql: str) -> str:
    for pattern, replacement in SUBS:
        sql = re.sub(pattern, replacement, sql)
    return sql


def connect():
    if os.environ.get("SNOWFLAKE_PASSWORD"):
        return snowflake.connector.connect(
            account=os.environ["SNOWFLAKE_ACCOUNT"],
            user=os.environ["SNOWFLAKE_USER"],
            password=os.environ["SNOWFLAKE_PASSWORD"],
            role=os.environ.get("SNOWFLAKE_ROLE", "ACCOUNTADMIN"),
            warehouse=os.environ.get("SNOWFLAKE_WAREHOUSE", "KAVACH_WH"),
            client_session_keep_alive=True,
        )
    return snowflake.connector.connect(
        connection_name=os.environ.get("SNOWFLAKE_CONNECTION_NAME"),
        client_session_keep_alive=True,
    )


def label(stmt: str, width: int = 88) -> str:
    """First meaningful line of a statement, for progress output."""
    for line in stmt.splitlines():
        line = line.strip()
        if line and not line.startswith("--"):
            return line[:width]
    return stmt.strip()[:width]


def is_executable(stmt: str) -> bool:
    """True if the chunk has any line that is not blank and not a comment.

    The splitter attaches preceding comment blocks to the statement that
    follows them, so testing whether the chunk *starts* with '--' would throw
    away real statements that merely have a banner comment above them.
    """
    for line in stmt.splitlines():
        line = line.strip()
        if line and not line.startswith("--"):
            return True
    return False


def run_file(cur, path: str, keep_going: bool, dry_run: bool) -> int:
    with open(path) as fh:
        raw = substitute(fh.read())

    statements = [s for s in split_sql(raw) if is_executable(s)]

    print(f"\n=== {path}: {len(statements)} statements ===", flush=True)
    failures = 0

    for i, stmt in enumerate(statements, 1):
        head = label(stmt)
        if dry_run:
            print(f"  [{i:3}/{len(statements)}] {head}", flush=True)
            continue
        started = time.time()
        try:
            cur.execute(stmt)
            rows = cur.fetchall() if cur.description else []
            took = time.time() - started
            note = ""
            if rows and len(rows) == 1 and len(rows[0]) == 1:
                note = f" -> {str(rows[0][0])[:160]}"
            elif rows:
                note = f" -> {len(rows)} row(s)"
            print(f"  [{i:3}/{len(statements)}] {took:6.1f}s OK  {head}{note}", flush=True)
        except Exception as exc:  # noqa: BLE001 - report and optionally continue
            failures += 1
            took = time.time() - started
            print(f"  [{i:3}/{len(statements)}] {took:6.1f}s FAIL {head}", flush=True)
            print(f"        {type(exc).__name__}: {str(exc)[:900]}", flush=True)
            if not keep_going:
                print(f"\nHALTED at statement {i} of {path}", flush=True)
                return failures
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+")
    parser.add_argument("--keep-going", action="store_true",
                        help="continue after a failing statement")
    parser.add_argument("--dry-run", action="store_true",
                        help="print the split/substituted statements, execute nothing")
    args = parser.parse_args()

    if args.dry_run:
        for path in args.files:
            run_file(None, path, args.keep_going, True)
        return 0

    conn = connect()
    cur = conn.cursor()
    total_failures = 0
    try:
        print(f"connected: account={conn.account} user={conn.user} role={conn.role}", flush=True)
        for path in args.files:
            failures = run_file(cur, path, args.keep_going, False)
            total_failures += failures
            if failures and not args.keep_going:
                break
    finally:
        cur.close()
        conn.close()

    print(f"\n==== total failed statements: {total_failures} ====", flush=True)
    return 1 if total_failures else 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Recreate KAVACH's Cortex AI objects: semantic view, agent, and their grants.

Neither object has CREATE DDL in sql/ — they were originally built in the
Snowsight UI, so this script is the reproducible path. It is safe to re-run.

  semantic view : SYSTEM$CREATE_SEMANTIC_VIEW_FROM_YAML takes the YAML *inline*
                  (or as a bound string). It does NOT accept a stage path; the
                  "Invalid identifier '@stage/file.yaml'" error you get from
                  trying is misleading.
  agent         : CREATE OR REPLACE AGENT ... FROM SPECIFICATION $$<json>$$,
                  fed from the exported agent_spec. Orchestration model is
                  asserted to be claude-sonnet-5.

CREATE OR REPLACE AGENT drops the agent's grants, so the USAGE grants are
re-issued every run — that is deliberate, not redundant.
"""
from __future__ import annotations

import json
import os
import pathlib
import sys

import snowflake.connector

# The YAML and JSON payloads below contain '%' characters. With the connector's
# default 'pyformat' paramstyle those get treated as format specifiers and the
# bind fails with "not all arguments converted during string formatting", so bind
# positionally instead.
snowflake.connector.paramstyle = "qmark"

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEMANTIC_YAML = ROOT / "semantic" / "kavach_sv.yaml"
AGENT_JSON = ROOT / "data" / "exports" / "agent" / "agent.json"

REQUIRED_ORCHESTRATION_MODEL = "claude-sonnet-5"
AGENT_FQN = "KAVACH_DB.AI.KAVACH_AGENT"
SEMANTIC_VIEW_FQN = "KAVACH_DB.AI.KAVACH_SV"
SEARCH_SERVICE_FQN = "KAVACH_DB.AI.KAVACH_REG_SEARCH"
CONSUMER_ROLES = ["KAVACH_ADMIN", "KAVACH_ANALYST", "KAVACH_REVIEWER"]


def run(cur, sql: str, params=None, label: str | None = None):
    name = label or sql.strip().splitlines()[0][:80]
    try:
        cur.execute(sql, params)
        rows = cur.fetchall() if cur.description else []
        detail = f" -> {str(rows[0][0])[:200]}" if rows and len(rows[0]) == 1 else ""
        print(f"  OK   {name}{detail}", flush=True)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"  FAIL {name}\n       {type(exc).__name__}: {str(exc)[:600]}", flush=True)
        return False


def deploy_semantic_view(cur) -> bool:
    yaml_text = SEMANTIC_YAML.read_text()
    print(f"\n== semantic view ({len(yaml_text)} bytes of YAML) ==")
    # verify_only first: cheaper to learn the YAML is malformed than to have a
    # half-created object.
    ok = run(cur,
             "CALL SYSTEM$CREATE_SEMANTIC_VIEW_FROM_YAML('KAVACH_DB.AI', ?, TRUE)",
             (yaml_text,), label="validate YAML (verify_only)")
    if not ok:
        return False
    return run(cur,
               "CALL SYSTEM$CREATE_SEMANTIC_VIEW_FROM_YAML('KAVACH_DB.AI', ?)",
               (yaml_text,), label=f"create {SEMANTIC_VIEW_FQN}")


def deploy_agent(cur) -> bool:
    spec = json.loads(AGENT_JSON.read_text())["agent_spec"]

    model = spec.get("models", {}).get("orchestration")
    if model != REQUIRED_ORCHESTRATION_MODEL:
        print(f"  note: overriding orchestration model {model!r} -> "
              f"{REQUIRED_ORCHESTRATION_MODEL!r}")
        spec.setdefault("models", {})["orchestration"] = REQUIRED_ORCHESTRATION_MODEL

    spec_json = json.dumps(spec, indent=2)
    if "$$" in spec_json:
        raise SystemExit("agent spec contains '$$' and cannot be dollar-quoted")

    profile = json.dumps({"display_name": "KAVACH"})
    print(f"\n== agent (orchestration={spec['models']['orchestration']}) ==")
    return run(cur,
               f"CREATE OR REPLACE AGENT {AGENT_FQN} "
               f"WITH PROFILE='{profile}' FROM SPECIFICATION $${spec_json}$$",
               label=f"create {AGENT_FQN}")


def deploy_grants(cur) -> int:
    print("\n== grants (re-issued because CREATE OR REPLACE AGENT drops them) ==")
    failures = 0
    for role in CONSUMER_ROLES:
        for stmt in (
            f"GRANT USAGE ON AGENT {AGENT_FQN} TO ROLE {role}",
            f"GRANT SELECT ON SEMANTIC VIEW {SEMANTIC_VIEW_FQN} TO ROLE {role}",
            f"GRANT USAGE ON CORTEX SEARCH SERVICE {SEARCH_SERVICE_FQN} TO ROLE {role}",
        ):
            if not run(cur, stmt):
                failures += 1
    return failures


def main() -> int:
    conn = snowflake.connector.connect(
        connection_name=os.environ.get("SNOWFLAKE_CONNECTION_NAME"),
        client_session_keep_alive=True,
    )
    cur = conn.cursor()
    failures = 0
    try:
        run(cur, "USE ROLE ACCOUNTADMIN")
        run(cur, "USE WAREHOUSE KAVACH_WH")
        run(cur, "USE SCHEMA KAVACH_DB.AI")
        if not deploy_semantic_view(cur):
            failures += 1
        if not deploy_agent(cur):
            failures += 1
        failures += deploy_grants(cur)

        print("\n== verify ==")
        run(cur, f"DESCRIBE AGENT {AGENT_FQN}", label="describe agent")
        run(cur, "SHOW SEMANTIC VIEWS IN SCHEMA KAVACH_DB.AI", label="show semantic views")
    finally:
        cur.close()
        conn.close()
    print(f"\n==== failures: {failures} ====")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

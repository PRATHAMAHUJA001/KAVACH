#!/usr/bin/env python3
"""Minimal Snowflake control plane for the KAVACH SPCS deployment.

The `snow` CLI is not installed on the build machine, so redeploy.sh drives
Snowflake through Snowpark instead. Everything this script does is read-only or
an ALTER — it never drops the service, because dropping and recreating changes
the public ingress URL and would invalidate the live link in the README.

Credentials come from backend/.env (gitignored). Nothing is hardcoded here.

Usage:
    snowctl.py sql "<statement>"   run one statement, print rows as TSV
    snowctl.py alter               ALTER SERVICE ... FROM SPECIFICATION deploy/spec.yaml
    snowctl.py create              CREATE SERVICE IF NOT EXISTS (first deploy only)
    snowctl.py wait [timeout_s]    block until the service is READY and not upgrading
    snowctl.py url                 print the public ingress URL
    snowctl.py status              one-shot service + compute pool status
    snowctl.py logs [n]            tail the container log
    snowctl.py suspend|resume      stop/start the service and its compute pool
"""
from __future__ import annotations

import json
import os
import pathlib
import sys
import time

REPO = pathlib.Path(__file__).resolve().parent.parent
SERVICE = os.environ.get("KAVACH_SERVICE", "KAVACH_DB.APP.KAVACH_WEB")
POOL = os.environ.get("KAVACH_POOL", "KAVACH_POOL")
SPEC = REPO / "deploy" / "spec.yaml"
CONTAINER = "kavach-web"


def session():
    try:
        from dotenv import load_dotenv
        from snowflake.snowpark import Session
    except ImportError:  # pragma: no cover - surfaced to the operator, not tested
        sys.exit(
            "Missing dependencies. Install them into the interpreter you are "
            "running this with:\n    pip install snowflake-snowpark-python python-dotenv"
        )

    load_dotenv(REPO / "backend" / ".env")
    missing = [k for k in ("SNOWFLAKE_ACCOUNT", "SNOWFLAKE_USER", "SNOWFLAKE_PASSWORD") if not os.environ.get(k)]
    if missing:
        sys.exit(f"backend/.env is missing: {', '.join(missing)}")

    return Session.builder.configs(
        {
            "account": os.environ["SNOWFLAKE_ACCOUNT"],
            "user": os.environ["SNOWFLAKE_USER"],
            "password": os.environ["SNOWFLAKE_PASSWORD"],
            # KAVACH_ADMIN owns the service and holds USAGE + MONITOR on the
            # compute pool, so it can ALTER/suspend/resume both. It is also the
            # role the container itself runs as, which is why the service is
            # created under it rather than ACCOUNTADMIN: the mounted OAuth token
            # carries the owner role, and only KAVACH_ADMIN can USE ROLE into
            # the other three persona roles.
            "role": os.environ.get("KAVACH_DEPLOY_ROLE", "KAVACH_ADMIN"),
            "warehouse": os.environ.get("SNOWFLAKE_WAREHOUSE", "KAVACH_WH"),
            "database": os.environ.get("SNOWFLAKE_DATABASE", "KAVACH_DB"),
        }
    ).create()


def show(s, sql: str) -> list[dict]:
    return [r.as_dict() for r in s.sql(sql).collect()]


def container_states(s) -> list[str]:
    """Per-container status out of SYSTEM$GET_SERVICE_STATUS."""
    raw = s.sql(f"SELECT SYSTEM$GET_SERVICE_STATUS('{SERVICE}')").collect()[0][0]
    try:
        return [c.get("status") for c in json.loads(raw)]
    except (json.JSONDecodeError, TypeError):
        return [str(raw)]


def is_upgrading(s) -> bool:
    name = SERVICE.split(".")[-1]
    schema = ".".join(SERVICE.split(".")[:-1])
    rows = show(s, f"SHOW SERVICES LIKE '{name}' IN SCHEMA {schema}")
    if not rows:
        sys.exit(f"Service {SERVICE} does not exist. Run: deploy/redeploy.sh create")
    return str(rows[0].get("is_upgrading")).lower() == "true"


def cmd_wait(s, timeout: int = 600) -> None:
    """Poll until the new container is live.

    ALTER SERVICE returns immediately; the rollout happens afterwards. Checking
    only for READY is not enough — the *old* container still reports READY while
    the new one is pulling, so is_upgrading must be false too.
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        up, states = is_upgrading(s), container_states(s)
        elapsed = int(timeout - (deadline - time.time()))
        print(f"[{elapsed:>4}s] upgrading={up} containers={states}", flush=True)
        if not up and states == ["READY"]:
            print("READY")
            return
        time.sleep(15)
    sys.exit(f"Timed out after {timeout}s. Check: deploy/redeploy.sh logs")


def cmd_url(s) -> None:
    for _ in range(40):
        rows = show(s, f"SHOW ENDPOINTS IN SERVICE {SERVICE}")
        url = (rows[0].get("ingress_url") or "") if rows else ""
        if url and "provisioning" not in url.lower():
            print(f"https://{url}" if not url.startswith("http") else url)
            return
        print("endpoint still provisioning...", flush=True)
        time.sleep(15)
    sys.exit("Endpoint never finished provisioning.")


def cmd_status(s) -> None:
    print(f"service   {SERVICE}")
    print(f"upgrading {is_upgrading(s)}")
    print(f"container {container_states(s)}")
    for row in show(s, f"SHOW COMPUTE POOLS LIKE '{POOL}'"):
        print(f"pool      {row.get('name')} state={row.get('state')} nodes={row.get('active_nodes')}")
    for row in show(s, f"SHOW ENDPOINTS IN SERVICE {SERVICE}"):
        print(f"endpoint  {row.get('ingress_url')}")


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cmd, args = sys.argv[1], sys.argv[2:]
    s = session()
    try:
        if cmd == "sql":
            for row in show(s, args[0]):
                print("\t".join(str(v) for v in row.values()))
        elif cmd in ("alter", "create"):
            spec = SPEC.read_text()
            if cmd == "create":
                sql = (
                    f"CREATE SERVICE IF NOT EXISTS {SERVICE} IN COMPUTE POOL {POOL} "
                    f"FROM SPECIFICATION $${spec}$$ MIN_INSTANCES = 1 MAX_INSTANCES = 1"
                )
            else:
                sql = f"ALTER SERVICE {SERVICE} FROM SPECIFICATION $${spec}$$"
            print(s.sql(sql).collect()[0][0])
        elif cmd == "wait":
            cmd_wait(s, int(args[0]) if args else 600)
        elif cmd == "url":
            cmd_url(s)
        elif cmd == "status":
            cmd_status(s)
        elif cmd == "logs":
            n = int(args[0]) if args else 200
            out = s.sql(f"SELECT SYSTEM$GET_SERVICE_LOGS('{SERVICE}', 0, '{CONTAINER}', {n})").collect()
            print(out[0][0] if out else "(no logs)")
        elif cmd == "suspend":
            print(s.sql(f"ALTER SERVICE {SERVICE} SUSPEND").collect()[0][0])
            print(s.sql(f"ALTER COMPUTE POOL {POOL} SUSPEND").collect()[0][0])
        elif cmd == "resume":
            print(s.sql(f"ALTER COMPUTE POOL {POOL} RESUME").collect()[0][0])
            print(s.sql(f"ALTER SERVICE {SERVICE} RESUME").collect()[0][0])
        else:
            sys.exit(__doc__)
    finally:
        s.close()


if __name__ == "__main__":
    main()

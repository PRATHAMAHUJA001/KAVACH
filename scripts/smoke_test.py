"""
KAVACH backend smoke test.

Calls all 23 FastAPI endpoints with real IDs pulled live from Snowflake,
checks HTTP status + basic response shape, and prints a pass/fail table.

Usage:
    python3 scripts/smoke_test.py [--base-url http://localhost:8080]
"""
import argparse
import json
import os
import sys
import uuid

import requests
from dotenv import load_dotenv

BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..", "backend")
load_dotenv(os.path.join(BACKEND_DIR, ".env"))

from snowflake.snowpark import Session  # noqa: E402


def get_real_ids():
    """Pull real IDs from Snowflake to drive the smoke test."""
    params = {
        "account": os.environ["SNOWFLAKE_ACCOUNT"],
        "user": os.environ["SNOWFLAKE_USER"],
        "password": os.environ["SNOWFLAKE_PASSWORD"],
        "database": os.environ["SNOWFLAKE_DATABASE"],
        "warehouse": os.environ["SNOWFLAKE_WAREHOUSE"],
        "schema": os.environ["SNOWFLAKE_SCHEMA"],
        "role": os.environ["SNOWFLAKE_ROLE"],
    }
    session = Session.builder.configs(params).create()
    try:
        alert_id = session.sql(
            "SELECT alert_id FROM CORE.ALERTS ORDER BY created_at DESC LIMIT 1"
        ).collect()[0]["ALERT_ID"]

        txn_id = session.sql(
            "SELECT txn_id FROM CORE.TRANSACTIONS LIMIT 1"
        ).collect()[0]["TXN_ID"]

        ring_id = session.sql(
            "SELECT ring_id FROM CORE.RINGS ORDER BY ring_score DESC LIMIT 1"
        ).collect()[0]["RING_ID"]

        pending_rules = session.sql(
            "SELECT rule_id FROM RULES.RULE_LIBRARY WHERE status = 'PENDING_APPROVAL' "
            "ORDER BY created_at DESC LIMIT 2"
        ).collect()
        if len(pending_rules) < 2:
            # fall back to any 2 rules if fewer than 2 pending
            pending_rules = session.sql(
                "SELECT rule_id FROM RULES.RULE_LIBRARY ORDER BY created_at DESC LIMIT 2"
            ).collect()
        rule_id_approve = pending_rules[0]["RULE_ID"]
        rule_id_reject = pending_rules[1]["RULE_ID"]

        any_rule_id = session.sql(
            "SELECT rule_id FROM RULES.RULE_LIBRARY LIMIT 1"
        ).collect()[0]["RULE_ID"]

        return {
            "alert_id": alert_id,
            "txn_id": txn_id,
            "ring_id": ring_id,
            "rule_id_approve": rule_id_approve,
            "rule_id_reject": rule_id_reject,
            "rule_id_get": any_rule_id,
        }
    finally:
        session.close()


class SmokeTest:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.results = []

    def check(self, name, method, path, expected_status=200, json_body=None, params=None, shape_check=None):
        url = f"{self.base_url}{path}"
        try:
            resp = requests.request(method, url, json=json_body, params=params, timeout=30)
        except Exception as e:
            self.results.append((name, method, path, "ERROR", str(e)))
            return None

        ok_status = resp.status_code == expected_status
        note = f"HTTP {resp.status_code}"
        body = None
        if ok_status:
            try:
                body = resp.json()
                if shape_check:
                    shape_ok, shape_note = shape_check(body)
                    if not shape_ok:
                        self.results.append((name, method, path, "FAIL", f"shape: {shape_note}"))
                        return body
                    note += f" | {shape_note}" if shape_note else ""
            except Exception as e:
                self.results.append((name, method, path, "FAIL", f"bad JSON: {e}"))
                return None
            self.results.append((name, method, path, "PASS", note))
        else:
            self.results.append((name, method, path, "FAIL", f"expected {expected_status}, got {resp.status_code}: {resp.text[:200]}"))
        return body

    def print_table(self):
        print(f"\n{'ENDPOINT':45} {'METHOD':7} {'RESULT':6} NOTE")
        print("-" * 120)
        n_pass = 0
        for name, method, path, result, note in self.results:
            marker = "PASS" if result == "PASS" else result
            if result == "PASS":
                n_pass += 1
            print(f"{name:45} {method:7} {marker:6} {note}")
        print("-" * 120)
        print(f"TOTAL: {len(self.results)}  PASS: {n_pass}  FAIL: {len(self.results) - n_pass}")
        return n_pass == len(self.results)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:8080")
    args = parser.parse_args()

    print("Pulling real IDs from Snowflake...")
    ids = get_real_ids()
    print(json.dumps(ids, indent=2))

    t = SmokeTest(args.base_url)

    # --- Health / Core ---
    t.check("healthz", "GET", "/healthz",
            shape_check=lambda b: (b.get("status") == "healthy", b.get("status")))
    t.check("me", "GET", "/api/me",
            shape_check=lambda b: ("user_id" in b and "role" in b, b.get("role")))
    t.check("home", "GET", "/api/home",
            shape_check=lambda b: ("readiness_score" in b and "top_alerts" in b and "trend" in b, None))

    # --- Alerts ---
    t.check("alerts.list", "GET", "/api/alerts",
            shape_check=lambda b: ("alerts" in b and "total" in b, f"total={b.get('total')}"))
    t.check("alerts.detail", "GET", f"/api/alerts/{ids['alert_id']}",
            shape_check=lambda b: ("alert" in b and "txn_count" in b, None))

    # --- Evidence ---
    t.check("evidence.create", "POST", f"/api/alerts/{ids['alert_id']}/evidence",
            shape_check=lambda b: ("sha256_hash" in b, None))
    t.check("evidence.get", "GET", f"/api/alerts/{ids['alert_id']}/evidence",
            shape_check=lambda b: ("evidence_json" in b, None))
    t.check("evidence.verify", "GET", f"/api/alerts/{ids['alert_id']}/verify",
            shape_check=lambda b: ("verified" in b and "details" in b, b.get("verified")))
    t.check("evidence.feedback", "POST", f"/api/alerts/{ids['alert_id']}/feedback",
            json_body={"rating": 5, "comment": "Smoke test feedback"},
            shape_check=lambda b: ("message" in b, None))
    t.check("evidence.str_draft", "GET", f"/api/alerts/{ids['alert_id']}/str-draft",
            shape_check=lambda b: ("str_draft" in b and len(b["str_draft"]) > 0, None))

    # --- AI Ask ---
    t.check("ask", "POST", "/api/ask",
            json_body={"question": "How many alerts are open right now?"},
            shape_check=lambda b: ("sql" in b, None))

    # --- Analysis ---
    t.check("why_not", "GET", f"/api/why-not/{ids['txn_id']}",
            shape_check=lambda b: ("explanation" in b and "rules_checked" in b, None))
    t.check("time_machine", "GET", "/api/time-machine", params={"days": 30},
            shape_check=lambda b: (isinstance(b, list), f"{len(b)} rows"))

    # --- Rings ---
    t.check("rings.list", "GET", "/api/rings",
            shape_check=lambda b: ("rings" in b and "total" in b, f"total={b.get('total')}"))
    t.check("rings.detail", "GET", f"/api/rings/{ids['ring_id']}",
            shape_check=lambda b: ("ring" in b and "members" in b, None))

    # --- Rules ---
    t.check("rules.list", "GET", "/api/rules",
            shape_check=lambda b: ("rules" in b and "total" in b, f"total={b.get('total')}"))
    t.check("rules.get", "GET", f"/api/rules/{ids['rule_id_get']}",
            shape_check=lambda b: ("rule_id" in b, None))
    t.check("rules.approve", "POST", f"/api/rules/{ids['rule_id_approve']}/approve",
            json_body={"user": "smoke_test"},
            shape_check=lambda b: ("message" in b, None))
    t.check("rules.reject", "POST", f"/api/rules/{ids['rule_id_reject']}/reject",
            json_body={"user": "smoke_test", "reason": "Smoke test rejection"},
            shape_check=lambda b: ("message" in b, None))
    t.check("rules.conflicts", "GET", "/api/rules/conflicts",
            shape_check=lambda b: ("conflicts" in b, f"{len(b.get('conflicts', []))} conflicts"))
    t.check("rules.health", "GET", "/api/rules/health",
            shape_check=lambda b: ("total_rules" in b, f"total={b.get('total_rules')}"))

    job_id = str(uuid.uuid4())
    files = {"file": ("rules.csv", "rule_name,typology\n", "text/csv")}
    upload_resp = requests.post(f"{t.base_url}/api/rules/upload", files=files, timeout=30)
    if upload_resp.status_code == 200:
        body = upload_resp.json()
        t.results.append(("rules.upload", "POST", "/api/rules/upload", "PASS", f"job_id={body.get('job_id')}"))
        job_id = body.get("job_id", job_id)
    else:
        t.results.append(("rules.upload", "POST", "/api/rules/upload", "FAIL", f"HTTP {upload_resp.status_code}"))

    t.check("rules.job_status", "GET", f"/api/rules/jobs/{job_id}",
            shape_check=lambda b: ("status" in b, b.get("status")))

    all_pass = t.print_table()
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()

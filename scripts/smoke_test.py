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


def connect():
    params = {
        "account": os.environ["SNOWFLAKE_ACCOUNT"],
        "user": os.environ["SNOWFLAKE_USER"],
        "password": os.environ["SNOWFLAKE_PASSWORD"],
        "database": os.environ["SNOWFLAKE_DATABASE"],
        "warehouse": os.environ["SNOWFLAKE_WAREHOUSE"],
        "schema": os.environ["SNOWFLAKE_SCHEMA"],
        "role": os.environ["SNOWFLAKE_ROLE"],
    }
    return Session.builder.configs(params).create()


RULE_STATE_COLS = "status, approved_by, approved_at, rejected_by, rejection_reason, rejected_at"


def get_real_ids(session):
    """Pull real IDs from Snowflake. Writes go to the product tour's alert and rule,
    which /api/tour/reset puts back; other rule changes are snapshotted and restored."""
    one = lambda sql: session.sql(sql).collect()[0][0]  # noqa: E731
    tour = {r["KEY"]: r["VALUE"] for r in session.sql("SELECT key, value FROM APP.SETTINGS WHERE key LIKE 'TOUR_%'").collect()}
    rule_ids = [r["RULE_ID"] for r in session.sql(
        "SELECT rule_id FROM RULES.RULE_LIBRARY WHERE status = 'PENDING_APPROVAL' AND rule_id <> ? ORDER BY rule_name LIMIT 1",
        params=[tour.get("TOUR_RULE_ID", "")],
    ).collect()]
    return {
        "alert_id": tour.get("TOUR_ALERT_ID") or one("SELECT alert_id FROM CORE.ALERTS ORDER BY created_at DESC LIMIT 1"),
        "txn_id": one("SELECT txn_id FROM CORE.ALERTS WHERE txn_id IS NOT NULL LIMIT 1"),
        "ring_id": one("SELECT ring_id FROM CORE.RINGS ORDER BY ring_score DESC LIMIT 1"),
        "rule_id_approve": tour.get("TOUR_RULE_ID") or rule_ids[0],
        "rule_id_reject": rule_ids[0],
        "rule_id_get": one("SELECT rule_id FROM RULES.RULE_LIBRARY LIMIT 1"),
    }


def snapshot_rules(session, rule_ids):
    marks = ", ".join("?" * len(rule_ids))
    return [r.as_dict() for r in session.sql(f"SELECT rule_id, {RULE_STATE_COLS} FROM RULES.RULE_LIBRARY WHERE rule_id IN ({marks})", params=list(rule_ids)).collect()]


def restore_rules(session, snapshot):
    for r in snapshot:
        session.sql(
            "UPDATE RULES.RULE_LIBRARY SET status = ?, approved_by = ?, approved_at = ?, rejected_by = ?, rejection_reason = ?, rejected_at = ? WHERE rule_id = ?",
            params=[r["STATUS"], r["APPROVED_BY"], r["APPROVED_AT"], r["REJECTED_BY"], r["REJECTION_REASON"], r["REJECTED_AT"], r["RULE_ID"]],
        ).collect()


class SmokeTest:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.results = []

    def check(self, name, method, path, expected_status=200, json_body=None, params=None, shape_check=None, timeout=30):
        url = f"{self.base_url}{path}"
        try:
            resp = requests.request(method, url, json=json_body, params=params, timeout=timeout)
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
    parser.add_argument("--skip-llm", action="store_true", help="skip /api/ask and the STR draft (they call an LLM)")
    args = parser.parse_args()

    print("Pulling real IDs from Snowflake...")
    session = connect()
    ids = get_real_ids(session)
    print(json.dumps(ids, indent=2))
    snapshot = snapshot_rules(session, {ids["rule_id_approve"], ids["rule_id_reject"]})

    t = SmokeTest(args.base_url)
    try:
        run_checks(t, ids, args.skip_llm)
    finally:
        # Leave the account as we found it.
        restore_rules(session, snapshot)
        requests.post(f"{t.base_url}/api/tour/reset", timeout=60)
        session.close()

    all_pass = t.print_table()
    sys.exit(0 if all_pass else 1)


def run_checks(t, ids, skip_llm):
    has = lambda *keys: lambda b: (all(k in b for k in keys), None)  # noqa: E731
    # --- Health / Core ---
    t.check("healthz", "GET", "/healthz", shape_check=lambda b: (b.get("status") == "healthy", b.get("status")))
    t.check("me", "GET", "/api/me", shape_check=lambda b: ("user_id" in b and "role" in b, b.get("role")))
    t.check("home", "GET", "/api/home", shape_check=has("readiness_score", "kpis", "attention", "trend", "as_of"))

    # --- Alerts ---
    t.check("alerts.list", "GET", "/api/alerts", shape_check=lambda b: ("due_at" in b["alerts"][0], f"total={b.get('total')}"))
    t.check("alerts.list.filters", "GET", "/api/alerts", params={"due": "open", "sort": "amount", "typology": "CASH_REPORTING", "q": "a"},
            shape_check=lambda b: (all(a["typology"] == "CASH_REPORTING" for a in b["alerts"]), f"total={b.get('total')}"))
    t.check("alerts.detail", "GET", f"/api/alerts/{ids['alert_id']}",
            shape_check=lambda b: (bool(b["reasons"]) and bool(b["timeline"]) and "XCUSTX" not in (b["story_en"] or ""), f"{len(b['timeline'])} events"))

    # --- Evidence ---
    t.check("evidence.create", "POST", f"/api/alerts/{ids['alert_id']}/evidence", timeout=90,
            shape_check=lambda b: (b.get("generation_ms") is not None, f"{b.get('generation_ms')} ms"))
    t.check("evidence.get", "GET", f"/api/alerts/{ids['alert_id']}/evidence", shape_check=has("evidence_json"))
    t.check("evidence.verify", "GET", f"/api/alerts/{ids['alert_id']}/verify", shape_check=lambda b: (b.get("verified") is True, "MATCH"))
    t.check("evidence.feedback", "POST", f"/api/alerts/{ids['alert_id']}/feedback", json_body={"rating": 5, "verdict": "FRAUD"},
            shape_check=lambda b: (b.get("resolution") == "TRUE_POSITIVE", b.get("resolution")))
    if not skip_llm:
        t.check("evidence.str_draft", "GET", f"/api/alerts/{ids['alert_id']}/str-draft", timeout=90,
                shape_check=lambda b: ("str_draft" in b and len(b["str_draft"]) > 0, None))
        t.check("ask", "POST", "/api/ask", json_body={"question": "How many alerts are open right now?"}, timeout=120,
                shape_check=lambda b: ("answer" in b and "result_set" in b, "result_set" if b.get("result_set") else "no rows"))

    # --- Analysis ---
    t.check("why_not", "GET", f"/api/why-not/{ids['txn_id']}",
            shape_check=lambda b: (b["recommendation"].startswith("open_alert:") or all("result" in r for r in b["rules_checked"]), None))
    t.check("time_machine", "GET", "/api/time-machine", params={"days": 30}, shape_check=lambda b: (isinstance(b, list), f"{len(b)} rows"))
    tunables = t.check("time_machine.rules", "GET", "/api/time-machine/rules", shape_check=lambda b: (bool(b["rules"]), f"{len(b['rules'])} rules"))
    if tunables and tunables.get("rules"):
        r0 = tunables["rules"][0]
        t.check("time_machine.replay", "POST", "/api/time-machine/replay", timeout=120,
                json_body={"rule_id": r0["rule_id"], "value": r0["param"]["max"], "days": 90},
                shape_check=lambda b: ("current" in b and "proposed" in b, f"{b['current']['alerts']} -> {b['proposed']['alerts']} alerts"))

    # --- Rings ---
    t.check("rings.list", "GET", "/api/rings", shape_check=lambda b: (b["rings"][0].get("confidence") is not None, f"total={b.get('total')}"))
    t.check("rings.detail", "GET", f"/api/rings/{ids['ring_id']}",
            shape_check=lambda b: (bool(b["members"]) and all(m.get("role") for m in b["members"]), f"{len(b.get('edges', []))} links"))

    # --- Rules ---
    t.check("rules.list", "GET", "/api/rules", shape_check=lambda b: (bool(b["rules"][0].get("plain_english")), f"total={b.get('total')}"))
    t.check("rules.get", "GET", f"/api/rules/{ids['rule_id_get']}", shape_check=has("rule_id", "plain_hindi"))
    t.check("rules.versions", "GET", f"/api/rules/{ids['rule_id_get']}/versions", shape_check=lambda b: (bool(b["versions"]), None))
    t.check("rules.approve", "POST", f"/api/rules/{ids['rule_id_approve']}/approve", json_body={"user": "smoke_test"}, shape_check=has("message"))
    t.check("rules.reject", "POST", f"/api/rules/{ids['rule_id_reject']}/reject", json_body={"user": "smoke_test", "reason": "Smoke test rejection"},
            shape_check=has("message"))
    t.check("rules.conflicts", "GET", "/api/rules/conflicts", shape_check=lambda b: (True, f"{len(b.get('conflicts', []))} conflicts"))
    t.check("rules.health", "GET", "/api/rules/health", shape_check=lambda b: ("rules" in b, f"total={b.get('total_rules')}"))
    t.check("rules.eval", "GET", "/api/rules/eval", shape_check=lambda b: ("coverage" in b, f"recall={b.get('recall')}"))
    # Validation only: a real upload runs the LLM extraction and adds rules to the library.
    resp = requests.post(f"{t.base_url}/api/rules/upload", files={"file": ("rules.pdf", b"not a pdf", "application/pdf")}, timeout=30)
    t.results.append(("rules.upload (rejects non-PDF)", "POST", "/api/rules/upload", "PASS" if resp.status_code == 422 else "FAIL", f"HTTP {resp.status_code}"))
    t.check("rules.job_status (unknown)", "GET", f"/api/rules/jobs/{uuid.uuid4()}", expected_status=404)

    # --- Reference ---
    t.check("circulars.paragraph", "GET", "/api/circulars/paragraph", params={"circular_no": "KAVACH/2024/01", "para_no": 2}, shape_check=has("text", "before", "after"))
    t.check("search", "GET", "/api/search", params={"q": "RING"}, shape_check=lambda b: (bool(b["results"]), f"{len(b['results'])} results"))
    t.check("tour.reset", "POST", "/api/tour/reset", shape_check=lambda b: (b.get("ok") is True, b.get("alert_id")))


if __name__ == "__main__":
    main()

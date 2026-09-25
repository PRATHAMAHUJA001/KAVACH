"""
Read-only export of cost-sensitive table data + billing breakdown.
Uses KAVACH_WH (auto-resumes on first query, auto-suspends after 60s idle).
No DDL, no writes except the final "suspend running compute" step at the
bottom, which is explicitly requested by the migration runbook (not a normal
part of the read-only export).
"""
import csv
import json
import os

import snowflake.connector

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPORT = os.path.join(REPO, "data", "exports")

con = snowflake.connector.connect(connection_name="ibrlzhm-tk33637")
cur = con.cursor()


def q(sql):
    cur.execute(sql)
    return cur.fetchall(), [d[0] for d in cur.description]


def write_csv(relpath, rows, columns):
    path = os.path.join(EXPORT, relpath)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(columns)
        for r in rows:
            w.writerow(
                [json.dumps(c, default=str) if isinstance(c, (dict, list)) else c for c in r]
            )
    print(f"wrote {relpath} ({len(rows)} rows)")


def write_text(relpath, text):
    path = os.path.join(EXPORT, relpath)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text or "")
    print(f"wrote {relpath} ({len(text or '')} bytes)")


cur.execute("USE WAREHOUSE KAVACH_WH")

TABLES = [
    ("RULES.RULE_LIBRARY", "tables/RULE_LIBRARY.csv"),
    ("RULES.RULE_CANDIDATES", "tables/RULE_CANDIDATES.csv"),
    ("RULES.RULE_CONFLICTS", "tables/RULE_CONFLICTS.csv"),
    ("AI.REG_CHUNKS", "tables/REG_CHUNKS.csv"),
    ("AI.ALERT_STORIES", "tables/ALERT_STORIES.csv"),
    ("AI.AGENT_EVAL_DATA", "tables/AGENT_EVAL_DATA.csv"),
    ("ML.EVAL_REPORT", "tables/EVAL_REPORT.csv"),
    ("ML.EVAL_TYPOLOGY_COVERAGE", "tables/EVAL_TYPOLOGY_COVERAGE.csv"),
    ("APP.SETTINGS", "tables/SETTINGS.csv"),
]

for tbl, relpath in TABLES:
    try:
        rows, cols = q(f"SELECT * FROM KAVACH_DB.{tbl}")
        write_csv(relpath, rows, cols)
    except Exception as e:
        write_text(relpath.replace(".csv", ".ERROR.txt"), f"{tbl}: {e}")

# ---------- Model registry ----------
try:
    rows, cols = q("SHOW MODELS IN SCHEMA KAVACH_DB.ML")
    write_csv("model/models_list.csv", rows, cols)
    if not rows:
        write_text("model/NOTE.txt", "SHOW MODELS IN SCHEMA KAVACH_DB.ML returned 0 rows — no registered model artifacts to export.")
except Exception as e:
    write_text("model/models_list.ERROR.txt", str(e))

# ---------- Cost postmortem: metering ----------
try:
    rows, cols = q(
        """
        SELECT service_type, usage_date, SUM(credits_used) AS credits_used,
               SUM(credits_used_compute) AS credits_compute,
               SUM(credits_used_cloud_services) AS credits_cloud_services
        FROM SNOWFLAKE.ACCOUNT_USAGE.METERING_DAILY_HISTORY
        WHERE usage_date >= DATEADD('day', -30, CURRENT_DATE())
        GROUP BY 1, 2
        ORDER BY 2, 1
        """
    )
    write_csv("../cost/metering_daily_by_service.csv", rows, cols)
except Exception as e:
    write_text("../cost/metering_daily_by_service.ERROR.txt", str(e))

try:
    rows, cols = q(
        """
        SELECT service_type, SUM(credits_used) AS total_credits
        FROM SNOWFLAKE.ACCOUNT_USAGE.METERING_DAILY_HISTORY
        WHERE usage_date >= DATEADD('day', -30, CURRENT_DATE())
        GROUP BY 1
        ORDER BY 2 DESC
        """
    )
    write_csv("../cost/metering_totals_by_service.csv", rows, cols)
    print("TOTALS_BY_SERVICE:", rows)
except Exception as e:
    write_text("../cost/metering_totals_by_service.ERROR.txt", str(e))

try:
    rows, cols = q("SHOW COMPUTE POOLS")
    write_csv("../cost/compute_pools.csv", rows, cols)
except Exception as e:
    write_text("../cost/compute_pools.ERROR.txt", str(e))

# ---------- Warehouse metering (KAVACH_WH specifically) ----------
try:
    rows, cols = q(
        """
        SELECT warehouse_name, DATE_TRUNC('day', start_time) AS day, SUM(credits_used) AS credits_used
        FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY
        WHERE start_time >= DATEADD('day', -30, CURRENT_DATE())
        GROUP BY 1, 2
        ORDER BY 2
        """
    )
    write_csv("../cost/warehouse_metering_daily.csv", rows, cols)
except Exception as e:
    write_text("../cost/warehouse_metering_daily.ERROR.txt", str(e))

con.close()
print("DONE: data + cost export")

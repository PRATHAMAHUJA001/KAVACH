"""
One-off, read-only export of everything in KAVACH_DB that can't be cheaply
regenerated. Run before migrating off account IBRLZHM-TK33637.

No DDL, no writes, no AI calls issued from this script — SELECT / SHOW /
DESCRIBE / GET_DDL only.
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
    return cur.fetchall()


def write_text(relpath, text):
    path = os.path.join(EXPORT, relpath)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text if text is not None else "")
    print(f"wrote {relpath} ({len(text or '')} bytes)")


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


# ---------- 1. Schema DDL ----------
SCHEMAS = ["REF", "RAW", "CORE", "RULES", "ML", "AI", "APP", "AUDIT"]
for s in SCHEMAS:
    ddl = q(f"SELECT GET_DDL('SCHEMA','KAVACH_DB.{s}', TRUE)")[0][0]
    write_text(f"ddl/{s}.sql", ddl)

# Warehouse DDL
wh_ddl = q("SELECT GET_DDL('WAREHOUSE','KAVACH_WH')")[0][0]
write_text("ddl/warehouse_kavach_wh.sql", wh_ddl)

# ---------- Agent ----------
try:
    rows = q("DESCRIBE AGENT KAVACH_DB.AI.KAVACH_AGENT")
    cols = [d[0] for d in cur.description]
    agent_dict = {}
    for r in rows:
        for c, v in zip(cols, r):
            agent_dict[c] = v
    write_text("agent/agent.json", json.dumps(agent_dict, indent=2, default=str))
except Exception as e:
    write_text("agent/agent.ERROR.txt", str(e))

# ---------- Semantic view YAML ----------
try:
    yaml_text = q("SELECT SYSTEM$READ_YAML_FROM_SEMANTIC_VIEW('KAVACH_DB.AI.KAVACH_SV')")[0][0]
    write_text("semantic/kavach_sv.export.yaml", yaml_text)
except Exception as e:
    write_text("semantic/kavach_sv.export.ERROR.txt", str(e))

# ---------- Cortex Search Service ----------
try:
    rows = q("DESCRIBE CORTEX SEARCH SERVICE KAVACH_DB.AI.KAVACH_REG_SEARCH")
    cols = [d[0] for d in cur.description]
    search_dict = {}
    for r in rows:
        for c, v in zip(cols, r):
            search_dict[c] = v
    write_text("search/search.json", json.dumps(search_dict, indent=2, default=str))
except Exception as e:
    write_text("search/search.ERROR.txt", str(e))

# ---------- Grants ----------
grant_rows = []
grant_cols = None
for role in ["KAVACH_ADMIN", "KAVACH_ANALYST", "KAVACH_ANALYST_NORTH", "KAVACH_AUDITOR", "KAVACH_REVIEWER"]:
    cur.execute(f"SHOW GRANTS TO ROLE {role}")
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]
    grant_cols = ["QUERIED_ROLE"] + cols
    for r in rows:
        grant_rows.append([role] + list(r))
write_csv("ddl/grants.csv", grant_rows, grant_cols)

# ---------- Role hierarchy (SHOW ROLES) ----------
role_rows = q("SHOW ROLES LIKE 'KAVACH%'")
role_cols = [d[0] for d in cur.description]
write_csv("ddl/roles.csv", role_rows, role_cols)

# ---------- Users ----------
try:
    user_rows = q("SHOW USERS LIKE 'KAVACH%'")
    user_cols = [d[0] for d in cur.description]
    write_csv("ddl/users.csv", user_rows, user_cols)
except Exception as e:
    write_text("ddl/users.ERROR.txt", str(e))

# ---------- Resource monitors ----------
rm_rows = q("SHOW RESOURCE MONITORS")
rm_cols = [d[0] for d in cur.description]
write_csv("ddl/resource_monitors.csv", rm_rows, rm_cols)

con.close()
print("DONE: metadata export")

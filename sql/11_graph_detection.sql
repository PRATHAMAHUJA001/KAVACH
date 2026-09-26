-- ============================================================================
-- Phase 11 (drift fix): Graph-based mule-ring / round-trip detection tables
-- Exported verbatim (GET_DDL) from the live account on 2026-09-25.
-- ============================================================================

USE DATABASE KAVACH_DB;
USE WAREHOUSE KAVACH_WH;

create or replace TABLE KAVACH_DB.CORE.ACCOUNT_EDGES (
	ACCOUNT_A VARCHAR(16777216),
	ACCOUNT_B VARCHAR(16777216),
	EDGE_TYPE VARCHAR(17),
	EDGE_KEY VARCHAR(16777216)
);

create or replace TABLE KAVACH_DB.CORE.RINGS (
	RING_ID VARCHAR(16777216),
	RING_SIZE NUMBER(18,0),
	ALERTED_MEMBERS NUMBER(18,0),
	SHARED_DEVICES NUMBER(18,0),
	RING_SCORE FLOAT,
	CONFIDENCE_LABEL VARCHAR(6),
	DETECTED_AT TIMESTAMP_LTZ(9)
);

create or replace TABLE KAVACH_DB.CORE.RING_MEMBERS (
	RING_ID VARCHAR(16777216),
	ACCOUNT_ID VARCHAR(16777216)
);

create or replace TABLE KAVACH_DB.CORE.ROUND_TRIP_CYCLES (
	CYCLE_KEY VARCHAR(16777216),
	A VARCHAR(16777216),
	B VARCHAR(16777216),
	C VARCHAR(16777216),
	D VARCHAR(16777216),
	E VARCHAR(16777216),
	CYCLE_LENGTH NUMBER(1,0),
	STARTING_AMOUNT NUMBER(18,2),
	CYCLE_START TIMESTAMP_NTZ(9),
	CYCLE_END TIMESTAMP_NTZ(9),
	DAYS_SPAN NUMBER(9,0)
);

create or replace TABLE KAVACH_DB.CORE.ANALYST_FEEDBACK (
	FEEDBACK_ID VARCHAR(16777216) DEFAULT UUID_STRING(),
	ALERT_ID VARCHAR(16777216),
	ACCOUNT_ID VARCHAR(16777216),
	VERDICT VARCHAR(16777216),
	NOTES VARCHAR(16777216),
	ANALYST VARCHAR(16777216),
	FEEDBACK_TS TIMESTAMP_NTZ(9),
	SOURCE VARCHAR(16777216)
);


-- =========================================================================
-- Mule-ring detection (phase 4 §C). Populates ACCOUNT_EDGES, RINGS,
-- RING_MEMBERS and ROUND_TRIP_CYCLES. Idempotent: each run replaces them.
--
-- Why money links first: in this data every device and IP is used by dozens
-- of unrelated accounts, so device/IP sharing alone joins the whole bank into
-- one cluster. Account-to-account transfers (COUNTERPARTY is an account id)
-- are rare, so rings are the connected components of those transfers; shared
-- devices/IPs are then recorded only between members of the same ring.
-- =========================================================================
CREATE OR REPLACE PROCEDURE KAVACH_DB.CORE.DETECT_MULE_RINGS(MIN_SIZE INT DEFAULT 3, RAPID_MINUTES INT DEFAULT 60)
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS
$$
from collections import defaultdict
from datetime import datetime

def run(session, min_size, rapid_minutes):
    money = session.sql("""
        SELECT t.account_id AS a, t.counterparty AS b, SUM(t.amount_inr) AS amt, COUNT(*) AS n
        FROM KAVACH_DB.CORE.TRANSACTIONS t
        JOIN KAVACH_DB.CORE.ACCOUNTS acc ON acc.account_id = t.counterparty
        WHERE t.direction = 'DEBIT' AND t.counterparty <> t.account_id
        GROUP BY 1, 2
    """).collect()

    # Union-find over transfer links.
    parent = {}
    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for r in money:
        ra, rb = find(r['A']), find(r['B'])
        if ra != rb:
            parent[ra] = rb
    groups = defaultdict(set)
    for x in list(parent):
        groups[find(x)].add(x)
    rings = sorted((sorted(g) for g in groups.values() if len(g) >= min_size), key=lambda g: (-len(g), g[0]))
    member_of = {a: i for i, g in enumerate(rings) for a in g}

    session.sql("TRUNCATE TABLE KAVACH_DB.CORE.ACCOUNT_EDGES").collect()
    session.sql("TRUNCATE TABLE KAVACH_DB.CORE.RING_MEMBERS").collect()
    session.sql("TRUNCATE TABLE KAVACH_DB.CORE.RINGS").collect()
    session.sql("TRUNCATE TABLE KAVACH_DB.CORE.ROUND_TRIP_CYCLES").collect()
    if not rings:
        return {"rings": 0}

    members = sorted(member_of)
    session.create_dataframe([[f"RING-{i+1:04d}", a] for a in members for i in [member_of[a]]], schema=["RING_ID", "ACCOUNT_ID"]) \
        .write.mode("append").save_as_table("KAVACH_DB.CORE.RING_MEMBERS")
    session.create_dataframe(
        [[r['A'], r['B'], 'SENT_MONEY', f"{float(r['AMT']):.2f}|{int(r['N'])}"] for r in money if r['A'] in member_of],
        schema=["ACCOUNT_A", "ACCOUNT_B", "EDGE_TYPE", "EDGE_KEY"],
    ).write.mode("append").save_as_table("KAVACH_DB.CORE.ACCOUNT_EDGES")

    # Shared devices / IPs between members of the same ring (only on their transfers to each other).
    session.sql("""
        INSERT INTO KAVACH_DB.CORE.ACCOUNT_EDGES (ACCOUNT_A, ACCOUNT_B, EDGE_TYPE, EDGE_KEY)
        WITH ring_txn AS (
            SELECT DISTINCT rm.ring_id, t.account_id, t.device_id, t.ip_address
            FROM KAVACH_DB.CORE.TRANSACTIONS t
            JOIN KAVACH_DB.CORE.RING_MEMBERS rm ON rm.account_id = t.account_id
            JOIN KAVACH_DB.CORE.RING_MEMBERS rc ON rc.account_id = t.counterparty AND rc.ring_id = rm.ring_id
        )
        SELECT DISTINCT x.account_id, y.account_id, 'SHARED_DEVICE', x.device_id
        FROM ring_txn x JOIN ring_txn y ON x.ring_id = y.ring_id AND x.device_id = y.device_id AND x.account_id < y.account_id
        WHERE x.device_id IS NOT NULL
        UNION
        SELECT DISTINCT x.account_id, y.account_id, 'SHARED_IP', x.ip_address
        FROM ring_txn x JOIN ring_txn y ON x.ring_id = y.ring_id AND x.ip_address = y.ip_address AND x.account_id < y.account_id
        WHERE x.ip_address IS NOT NULL
    """).collect()

    # Score: size, how fast money passes through (credit → debit), shared devices.
    stats = {r['RING_ID']: dict(r.as_dict()) for r in session.sql(f"""
        WITH t AS (
            SELECT m.ring_id, t.direction, t.txn_ts,
                   MIN(IFF(t.direction = 'DEBIT', t.txn_ts, NULL)) OVER (
                       PARTITION BY t.account_id ORDER BY t.txn_ts ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING) AS next_debit
            FROM KAVACH_DB.CORE.TRANSACTIONS t
            JOIN KAVACH_DB.CORE.RING_MEMBERS m ON m.account_id = t.account_id
            -- only money moving between members of the same ring
            JOIN KAVACH_DB.CORE.RING_MEMBERS c ON c.account_id = t.counterparty AND c.ring_id = m.ring_id
        )
        SELECT ring_id, COUNT_IF(direction = 'CREDIT') AS credits,
               COUNT_IF(direction = 'CREDIT' AND DATEDIFF('minute', txn_ts, next_debit) <= {int(rapid_minutes)}) AS rapid
        FROM t GROUP BY ring_id
    """).collect()}
    for r in session.sql("""
        SELECT m.ring_id, COUNT(DISTINCT e.edge_key) AS n
        FROM KAVACH_DB.CORE.ACCOUNT_EDGES e JOIN KAVACH_DB.CORE.RING_MEMBERS m ON m.account_id = e.account_a
        WHERE e.edge_type = 'SHARED_DEVICE' GROUP BY 1
    """).collect():
        stats.setdefault(r['RING_ID'], {})['SHARED_DEVICES'] = r['N']
    for r in session.sql("""
        SELECT m.ring_id, COUNT(DISTINCT a.account_id) AS n
        FROM KAVACH_DB.CORE.ALERTS a JOIN KAVACH_DB.CORE.RING_MEMBERS m ON m.account_id = a.account_id GROUP BY 1
    """).collect():
        stats.setdefault(r['RING_ID'], {})['ALERTED'] = r['N']
    rows = []
    for i, g in enumerate(rings):
        rid = f"RING-{i+1:04d}"
        s = stats.get(rid, {})
        rapid = (s['RAPID'] / s['CREDITS']) if s.get('CREDITS') else 0.0
        shared = int(s.get('SHARED_DEVICES') or 0)
        score = round(0.35 * min(len(g) / 10, 1) + 0.4 * rapid + 0.25 * min(shared / 2, 1), 3)
        label = 'HIGH' if score >= 0.7 else 'MEDIUM' if score >= 0.45 else 'LOW'
        rows.append([rid, len(g), int(s.get('ALERTED') or 0), shared, score, label])
    session.create_dataframe(rows, schema=["RING_ID", "RING_SIZE", "ALERTED_MEMBERS", "SHARED_DEVICES", "RING_SCORE", "CONFIDENCE_LABEL"]) \
        .write.mode("append").save_as_table("KAVACH_DB.CORE.RINGS", column_order="name")
    session.sql("UPDATE KAVACH_DB.CORE.RINGS SET DETECTED_AT = CURRENT_TIMESTAMP() WHERE DETECTED_AT IS NULL").collect()

    # Round trips: money that comes back to where it started in 3 or 4 hops.
    out = defaultdict(set)
    for r in money:
        if r['A'] in member_of:
            out[r['A']].add(r['B'])
    cycles = set()
    for a in out:
        for b in out[a]:
            for c in out.get(b, ()):
                if c in (a, b):
                    continue
                if a in out.get(c, ()):
                    cycles.add(tuple(sorted((a, b, c))) + (None,))
                for d in out.get(c, ()):
                    if d not in (a, b, c) and a in out.get(d, ()):
                        cycles.add(tuple(sorted((a, b, c, d))))
    if cycles:
        session.create_dataframe(
            [["-".join(x for x in c if x), c[0], c[1], c[2], c[3], None, 3 if c[3] is None else 4] for c in sorted(cycles, key=lambda c: tuple(x or "" for x in c))],
            schema=["CYCLE_KEY", "A", "B", "C", "D", "E", "CYCLE_LENGTH"],
        ).write.mode("append").save_as_table("KAVACH_DB.CORE.ROUND_TRIP_CYCLES", column_order="name")

    return {"rings": len(rings), "members": len(members), "money_links": len(money), "round_trips": len(cycles),
            "high": sum(1 for r in rows if r[5] == 'HIGH')}
$$;

-- CALL KAVACH_DB.CORE.DETECT_MULE_RINGS();

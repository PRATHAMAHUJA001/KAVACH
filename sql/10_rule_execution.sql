-- ============================================================================
-- Phase 10 (drift fix): CORE.ALERTS + rule execution engine
-- Exported verbatim (GET_DDL) from the live account on 2026-09-25. RULE_LIBRARY /
-- RULE_CANDIDATES / RULE_CONFLICTS are already created in 07_regulation_compiler.sql;
-- this script adds the missing piece that actually turns rules into alerts.
-- ============================================================================

USE DATABASE KAVACH_DB;
USE WAREHOUSE KAVACH_WH;

create or replace TABLE KAVACH_DB.CORE.ALERTS (
	ALERT_ID VARCHAR(16777216) DEFAULT 'ALT-' || UUID_STRING(),
	ACCOUNT_ID VARCHAR(16777216),
	TXN_ID VARCHAR(16777216),
	CUSTOMER_ID VARCHAR(16777216),
	RULE_ID VARCHAR(16777216),
	RULE_NAME VARCHAR(16777216),
	RULE_VERSION NUMBER(38,0) DEFAULT 1,
	TYPOLOGY VARCHAR(16777216),
	SCORE FLOAT,
	REASONS VARIANT,
	CITATION VARCHAR(16777216),
	SEVERITY VARCHAR(16777216),
	ACTION_REQUIRED VARCHAR(16777216),
	CREATED_AT TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP(),
	STATUS VARCHAR(16777216) DEFAULT 'NEW',
	ASSIGNED_TO VARCHAR(16777216),
	RESOLVED_AT TIMESTAMP_NTZ(9),
	RESOLUTION VARCHAR(16777216)
);

create or replace stream KAVACH_DB.CORE.TXN_STREAM on table KAVACH_DB.CORE.TRANSACTIONS append_only = true;

CREATE OR REPLACE PROCEDURE KAVACH_DB.RULES.EXECUTE_ALL_RULES()
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
ARTIFACT_REPOSITORY = snowflake.snowpark.pypi_shared_repository
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS '
import json


def run(session):
    rules = session.sql("""
        SELECT RULE_ID, RULE_NAME, TYPOLOGY, ENTITY, SQL_TEXT, SOURCE_CITATION, VERSION
        FROM KAVACH_DB.RULES.RULE_LIBRARY
        WHERE STATUS IN (''ACTIVE'', ''PENDING_APPROVAL'') AND EFFECTIVE_TO = ''9999-12-31''::DATE
    """).collect()

    total_alerts = 0
    errors = []
    severity_map = {''STRUCTURING'':''HIGH'',''CASH_REPORTING'':''HIGH'',''MULE_RING'':''HIGH'',
                    ''DORMANT_REACTIVATION'':''HIGH'',''RAPID_PASSTHROUGH'':''HIGH'',
                    ''INCOME_MISMATCH'':''HIGH'',''ROUND_TRIPPING'':''HIGH'',
                    ''HIGH_RISK_SWIFT'':''HIGH'',''ACCOUNT_TAKEOVER'':''HIGH'',
                    ''PEP_UNUSUAL_CASH'':''HIGH'',''KYC_CDD'':''MEDIUM'',
                    ''SANCTIONS_SCREENING'':''HIGH'',''WIRE_TRANSFER'':''MEDIUM'',''GENERAL_AML'':''MEDIUM''}
    action_map = {''STRUCTURING'':''STR'',''CASH_REPORTING'':''CTR'',''MULE_RING'':''STR'',
                  ''DORMANT_REACTIVATION'':''ALERT'',''RAPID_PASSTHROUGH'':''STR'',
                  ''INCOME_MISMATCH'':''EDD'',''ROUND_TRIPPING'':''STR'',
                  ''HIGH_RISK_SWIFT'':''STR'',''ACCOUNT_TAKEOVER'':''BLOCK'',
                  ''PEP_UNUSUAL_CASH'':''EDD'',''KYC_CDD'':''EDD'',
                  ''SANCTIONS_SCREENING'':''BLOCK'',''WIRE_TRANSFER'':''ALERT'',''GENERAL_AML'':''ALERT''}

    for rule in rules:
        rid = rule[''RULE_ID'']
        rname = rule[''RULE_NAME''] or ''''
        typ = rule[''TYPOLOGY''] or ''''
        sql = rule[''SQL_TEXT'']
        citation = rule[''SOURCE_CITATION''] or ''''
        ver = rule[''VERSION''] or 1
        sev = severity_map.get(typ, ''MEDIUM'')
        act = action_map.get(typ, ''ALERT'')

        if not sql or sql.strip().startswith(''SELECT 1''):
            continue
        try:
            results = session.sql(sql).collect()
            if not results:
                continue
            # Get the first column name as the account identifier
            cols = [c.name for c in session.sql(sql).schema.fields]
            acct_col = ''ACCOUNT_ID'' if ''ACCOUNT_ID'' in cols else (cols[0] if cols else ''UNKNOWN'')

            for row in results[:500]:  # cap at 500 alerts per rule
                row_dict = row.as_dict()
                acct_id = str(row_dict[acct_col]) if acct_col in row_dict else str(list(row_dict.values())[0])
                txn_id = str(row_dict.get(''TXN_ID'') or '''')

                # REASONS is built by the JSON serialiser and passed as a bind, so no
                # amount of punctuation in the data can break it. The previous version
                # pasted str(row_dict) into a SQL literal and then truncated the
                # already-escaped text at 200 chars -- that cut landed inside an escaped
                # quote pair, ended the literal early and left the JSON unterminated, so
                # every KYC_CDD rule aborted partway through its rows (7 of 2,407
                # customers were enough to lose the rest of the run).
                details = {}
                for key, value in row_dict.items():
                    details[key] = value if isinstance(value, (int, float, bool)) or value is None else str(value)[:120]
                reasons = json.dumps({''rule_hit'': typ, ''details'': details}, default=str)[:2000]

                try:
                    session.sql("""
                        INSERT INTO KAVACH_DB.CORE.ALERTS
                            (ACCOUNT_ID, TXN_ID, RULE_ID, RULE_NAME, RULE_VERSION, TYPOLOGY,
                             SCORE, REASONS, CITATION, SEVERITY, ACTION_REQUIRED, CREATED_AT)
                        SELECT ?, NULLIF(?, ''''), ?, ?, ?, ?,
                               1.0, PARSE_JSON(?), ?, ?, ?,
                               -- Stamp the alert at its evidence, not at the wall clock. The column
                               -- default is CURRENT_TIMESTAMP(), which put every alert two years
                               -- after the transaction it described and collapsed the 30-day trend
                               -- onto one day. Prefer the triggering transaction, then the account''''s
                               -- most recent transaction, and only fall back to now if neither exists.
                               COALESCE(
                                 (SELECT t.TXN_TS FROM KAVACH_DB.RAW.TRANSACTIONS t
                                   WHERE t.TXN_ID = NULLIF(?, '''')),
                                 (SELECT MAX(t2.TXN_TS) FROM KAVACH_DB.RAW.TRANSACTIONS t2
                                   WHERE t2.ACCOUNT_ID = ?),
                                 -- Customer-entity rules (KYC_CDD, PEP_UNUSUAL_CASH) key on a
                                 -- CUSTOMER_ID, so the account lookup above finds nothing. Reach the
                                 -- transactions through that customer''''s accounts before giving up.
                                 (SELECT MAX(t3.TXN_TS) FROM KAVACH_DB.RAW.TRANSACTIONS t3
                                    JOIN KAVACH_DB.CORE.ACCOUNTS ac ON ac.ACCOUNT_ID = t3.ACCOUNT_ID
                                   WHERE ac.CUSTOMER_ID = ?),
                                 -- A KYC-expiry alert has no triggering transaction at all, and some
                                 -- flagged customers hold no account with any history. The alert is
                                 -- still raised as of the data''''s own as-of date, so use that rather
                                 -- than the wall clock, which would land two years in the future.
                                 (SELECT MAX(TXN_TS) FROM KAVACH_DB.CORE.TRANSACTIONS),
                                 CURRENT_TIMESTAMP()
                               )
                        WHERE NOT EXISTS (
                          -- One alert per (account, rule, transaction). Re-running a rule
                          -- must be idempotent, otherwise every scheduled execution
                          -- re-inserts the same findings.
                          SELECT 1 FROM KAVACH_DB.CORE.ALERTS a
                           WHERE a.ACCOUNT_ID = ?
                             AND a.RULE_ID = ?
                             AND COALESCE(a.TXN_ID, ''~'') = COALESCE(NULLIF(?, ''''), ''~'')
                        )
                    """, params=[acct_id, txn_id, rid, rname, ver, typ,
                                 reasons, citation, sev, act,
                                 txn_id, acct_id, acct_id,
                                 acct_id, rid, txn_id]).collect()
                    total_alerts += 1
                except Exception as row_err:
                    # One unwritable row must not cost us the rest of the rule''''s findings.
                    errors.append(f"{rname}/{acct_id}: {str(row_err)[:60]}")

        except Exception as e:
            errors.append(f"{rname}: {str(e)[:80]}")

    err_msg = f" Errors({len(errors)}): {''; ''.join(errors[:3])}" if errors else ""
    return f"OK: {len(rules)} rules executed, {total_alerts} alerts generated.{err_msg}"
';

CREATE OR REPLACE PROCEDURE KAVACH_DB.RULES.TEST_EXTRACT_ONE()
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
ARTIFACT_REPOSITORY = snowflake.snowpark.pypi_shared_repository
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS '
import json
import traceback

def run(session):
    try:
        chunks = session.sql("""
            SELECT CIRCULAR_NO, PARA_NO, TEXT
            FROM KAVACH_DB.AI.REG_CHUNKS
            WHERE TEXT ILIKE ''%shall%''
               OR TEXT ILIKE ''%must%''
        """).collect()

        if not chunks:
            return "NO CHUNKS FOUND"

        c = chunks[0]
        circ = c[''CIRCULAR_NO'']
        para = c[''PARA_NO'']
        text = c[''TEXT''][:500]

        prompt = f"""
Return ONLY a JSON object:
{{"typology":"CASH_REPORTING",
"entity":"TXN",
"severity":"HIGH",
"action_required":"CTR",
"obligation_summary":"test"}}

Paragraph from {circ} para {para}:
{text}
"""

        esc = prompt.replace("''", "''''")

        r = session.sql(
            f"SELECT AI_COMPLETE(''claude-haiku-4-5'', ''{esc}'') AS R"
        ).collect()

        raw = str(r[0][''R'']).strip()

        return f"RAW RESPONSE: {raw[:3000]}"

    except Exception as e:
        return f"ERROR: {traceback.format_exc()[:5000]}"
';

CREATE OR REPLACE PROCEDURE KAVACH_DB.RULES.TEST_EXTRACT_REAL()
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
ARTIFACT_REPOSITORY = snowflake.snowpark.pypi_shared_repository
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS '
import json
import traceback

def run(session):
    try:
        chunks = session.sql("""
            SELECT CIRCULAR_NO, PARA_NO, TEXT
            FROM KAVACH_DB.AI.REG_CHUNKS
            WHERE TEXT ILIKE ''%shall%''
            LIMIT 1
        """).collect()

        c = chunks[0]
        text = c[''TEXT''][:800]
        circ = c[''CIRCULAR_NO'']
        para = c[''PARA_NO'']

        prompt = f"""
Analyze this regulation and return ONLY a JSON object with fields:
obligation_summary,
typology (STRUCTURING/CASH_REPORTING/KYC_CDD/GENERAL_AML/INFORMATIONAL),
entity (TXN/ACCOUNT/CUSTOMER),
severity (HIGH/MEDIUM/LOW),
action_required (ALERT/STR/CTR/EDD/BLOCK/MONITOR).

Paragraph:
{text}
"""

        esc = prompt.replace("''", "''''")

        sql = f"""
            SELECT AI_COMPLETE(''claude-haiku-4-5'', ''{esc}'') AS R
        """

        r = session.sql(sql).collect()
        raw = str(r[0][''R'']).strip()

        # Parse JSON from response
        s = raw.find(''{'')
        e = raw.rfind(''}'')

        if s >= 0 and e > s:
            j = json.loads(raw[s:e+1])

            return (
                f"SUCCESS: "
                f"typology={j.get(''typology'')}, "
                f"severity={j.get(''severity'')}, "
                f"summary={str(j.get(''obligation_summary''))[:100]}"
            )

        return f"NO_JSON: {raw[:2000]}"

    except Exception as ex:
        return f"ERROR: {traceback.format_exc()[:5000]}"
';

create or replace task KAVACH_DB.RULES.RULE_EXECUTOR_TASK
	warehouse=KAVACH_WH
	schedule='1 MINUTE'
	when SYSTEM$STREAM_HAS_DATA('KAVACH_DB.CORE.TXN_STREAM')
	as CALL KAVACH_DB.RULES.EXECUTE_ALL_RULES();

-- Task created SUSPENDED; enable explicitly once EXECUTE_ALL_RULES is validated.
ALTER TASK KAVACH_DB.RULES.RULE_EXECUTOR_TASK SUSPEND;

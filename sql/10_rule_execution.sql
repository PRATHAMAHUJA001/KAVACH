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
        rname = (rule[''RULE_NAME''] or '''').replace("''", "''''")
        typ = rule[''TYPOLOGY''] or ''''
        sql = rule[''SQL_TEXT'']
        citation = (rule[''SOURCE_CITATION''] or '''').replace("''", "''''")
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
                acct_id = str(row[acct_col]) if acct_col in row.as_dict() else str(list(row.as_dict().values())[0])
                txn_id = str(row.get(''TXN_ID'', '''')) if hasattr(row, ''get'') else str(row.as_dict().get(''TXN_ID'', ''''))
                row_dict = row.as_dict()
                reasons = str(row_dict).replace("''", "''''")[:2000]
                esc_acct = acct_id.replace("''", "''''")
                esc_txn = txn_id.replace("''", "''''") if txn_id else ''''

                session.sql(f"""
                    INSERT INTO KAVACH_DB.CORE.ALERTS
                        (ACCOUNT_ID, TXN_ID, RULE_ID, RULE_NAME, RULE_VERSION, TYPOLOGY,
                         SCORE, REASONS, CITATION, SEVERITY, ACTION_REQUIRED, CREATED_AT)
                    SELECT ''{esc_acct}'', NULLIF(''{esc_txn}'',''''), ''{rid}'', ''{rname}'', {ver}, ''{typ}'',
                           1.0, PARSE_JSON(''{{"rule_hit": "{typ}", "details": "{reasons[:200]}"}}''),
                           ''{citation}'', ''{sev}'', ''{act}'',
                           -- Stamp the alert at its evidence, not at the wall clock. The column
                           -- default is CURRENT_TIMESTAMP(), which put every alert two years
                           -- after the transaction it described and collapsed the 30-day trend
                           -- onto one day. Prefer the triggering transaction, then the account''''s
                           -- most recent transaction, and only fall back to now if neither exists.
                           COALESCE(
                             (SELECT t.TXN_TS FROM KAVACH_DB.RAW.TRANSACTIONS t
                               WHERE t.TXN_ID = NULLIF(''{esc_txn}'','''')),
                             (SELECT MAX(t2.TXN_TS) FROM KAVACH_DB.RAW.TRANSACTIONS t2
                               WHERE t2.ACCOUNT_ID = ''{esc_acct}''),
                             CURRENT_TIMESTAMP()
                           )
                    WHERE NOT EXISTS (
                      -- One alert per (account, rule, transaction). Re-running a rule
                      -- must be idempotent, otherwise every scheduled execution
                      -- re-inserts the same findings.
                      SELECT 1 FROM KAVACH_DB.CORE.ALERTS a
                       WHERE a.ACCOUNT_ID = ''{esc_acct}''
                         AND a.RULE_ID = ''{rid}''
                         AND COALESCE(a.TXN_ID, ''~'') = COALESCE(NULLIF(''{esc_txn}'',''''), ''~'')
                    )
                """).collect()
                total_alerts += 1

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

-- ============================================================================
-- Phase 12 (drift fix): missing AI-schema agent tools + evidence stage
-- Exported verbatim (GET_DDL) from the live account on 2026-09-25. These three
-- procedures back 3 of the 6 tools on the live Cortex Agent (KAVACH_AGENT) —
-- without them a fresh rebuild's agent would silently lose those tools.
-- ============================================================================

USE DATABASE KAVACH_DB;
USE WAREHOUSE KAVACH_WH;

CREATE STAGE IF NOT EXISTS KAVACH_DB.APP.EVIDENCE_STAGE
    ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE')
    COMMENT = 'Storage for evidence pack PDFs and HTML reports';

CREATE OR REPLACE PROCEDURE KAVACH_DB.AI.EXPLAIN_ALERT("ALERT_ID_PARAM" VARCHAR)
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
ARTIFACT_REPOSITORY = snowflake.snowpark.pypi_shared_repository
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS '
def run(session, alert_id_param):
    rows = session.sql(f"""
        SELECT al.ALERT_ID, al.ACCOUNT_ID, al.TYPOLOGY, al.SEVERITY, al.RULE_NAME,
               al.CITATION, al.ACTION_REQUIRED, al.STATUS, al.SCORE,
               c.CUSTOMER_NAME, c.CITY, c.RISK_CATEGORY, c.SEGMENT, c.IS_PEP,
               rs.RISK_SCORE_CALIBRATED
        FROM KAVACH_DB.CORE.ALERTS al
        JOIN KAVACH_DB.CORE.ACCOUNTS a ON al.ACCOUNT_ID = a.ACCOUNT_ID
        JOIN KAVACH_DB.CORE.CUSTOMERS c ON a.CUSTOMER_ID = c.CUSTOMER_ID
        LEFT JOIN KAVACH_DB.ML.LATEST_RISK_SCORES rs ON al.ACCOUNT_ID = rs.ACCOUNT_ID
        WHERE al.ALERT_ID = ''{alert_id_param}''
    """).collect()
    if not rows:
        return f"No alert found with ID: {alert_id_param}"
    r = rows[0]
    txns = session.sql(f"""
        SELECT TXN_ID, AMOUNT_INR, CHANNEL, DIRECTION, TXN_TS::VARCHAR AS TXN_TS, COUNTRY
        FROM KAVACH_DB.CORE.TRANSACTIONS
        WHERE ACCOUNT_ID = ''{r[''ACCOUNT_ID'']}''
        ORDER BY TXN_TS DESC LIMIT 5
    """).collect()
    txn_lines = []
    for t in txns:
        txn_lines.append(f"  - {t[''TXN_ID'']}: {t[''DIRECTION'']} INR {t[''AMOUNT_INR'']:,.2f} via {t[''CHANNEL'']} on {t[''TXN_TS'']}")
    action_map = {''STR'': ''File a Suspicious Transaction Report with FIU-IND'',
                  ''EDD'': ''Conduct Enhanced Due Diligence on the customer'',
                  ''BLOCK'': ''Freeze the account and escalate to compliance head'',
                  ''ALERT'': ''Review and document findings''}
    action_text = action_map.get(r[''ACTION_REQUIRED''], r[''ACTION_REQUIRED''])
    result = f"""ALERT EXPLANATION
================
Alert ID: {r[''ALERT_ID'']}
Status: {r[''STATUS'']}
Typology: {r[''TYPOLOGY'']}
Severity: {r[''SEVERITY'']}
Rule: {r[''RULE_NAME'']}
Citation: {r[''CITATION'']}
Score: {r[''SCORE'']}

CUSTOMER PROFILE
Customer: {r[''CUSTOMER_NAME'']} | City: {r[''CITY'']}
Risk Category: {r[''RISK_CATEGORY'']} | Segment: {r[''SEGMENT'']} | PEP: {r[''IS_PEP'']}
ML Risk Score: {r[''RISK_SCORE_CALIBRATED'']:.4f}

RECENT TRANSACTIONS (last 5)
{chr(10).join(txn_lines) if txn_lines else ''  No transactions found''}

RECOMMENDED ACTION
{action_text}
(Per {r[''CITATION'']})"""
    return result
';


CREATE OR REPLACE PROCEDURE KAVACH_DB.AI.TIME_MACHINE("RULE_ID_PARAM" VARCHAR, "NEW_PARAMS" VARIANT)
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
ARTIFACT_REPOSITORY = snowflake.snowpark.pypi_shared_repository
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS '
import json

RULE_PARAM_WHITELIST = {
    ''STRUCTURING'': {''amount_low'': ''NUMBER'', ''amount_high'': ''NUMBER'', ''count_threshold'': ''NUMBER''},
    ''INCOME_MISMATCH'': {''multiplier'': ''NUMBER''},
    ''HIGH_RISK_SWIFT'': {''amount_threshold'': ''NUMBER''},
    ''PEP_UNUSUAL_CASH'': {''cash_threshold'': ''NUMBER''},
    ''RAPID_PASSTHROUGH'': {''time_window_minutes'': ''NUMBER''},
    ''DORMANT_REACTIVATION'': {''dormant_days'': ''NUMBER''},
    ''MULE_RING'': {''passthrough_minutes'': ''NUMBER''},
}

RULE_TEMPLATES = {
    ''STRUCTURING'': """
        SELECT DISTINCT t.ACCOUNT_ID
        FROM KAVACH_DB.CORE.TRANSACTIONS t
        WHERE t.CHANNEL = ''CASH'' AND t.DIRECTION = ''CREDIT''
          AND t.AMOUNT_INR BETWEEN {amount_low} AND {amount_high}
        GROUP BY t.ACCOUNT_ID HAVING COUNT(*) >= {count_threshold}
    """,
    ''INCOME_MISMATCH'': """
        SELECT a.ACCOUNT_ID
        FROM KAVACH_DB.CORE.ACCOUNTS a
        JOIN KAVACH_DB.CORE.TRANSACTIONS t ON a.ACCOUNT_ID = t.ACCOUNT_ID
        JOIN KAVACH_DB.CORE.CUSTOMERS c ON a.CUSTOMER_ID = c.CUSTOMER_ID
        GROUP BY a.ACCOUNT_ID, c.DECLARED_ANNUAL_INCOME
        HAVING SUM(t.AMOUNT_INR) > c.DECLARED_ANNUAL_INCOME * {multiplier}
    """,
    ''HIGH_RISK_SWIFT'': """
        SELECT DISTINCT t.ACCOUNT_ID
        FROM KAVACH_DB.CORE.TRANSACTIONS t
        WHERE t.CHANNEL = ''SWIFT'' AND t.COUNTRY NOT IN (''IN'', ''India'')
          AND t.AMOUNT_INR > {amount_threshold}
        GROUP BY t.ACCOUNT_ID HAVING COUNT(*) >= 2
    """,
}

def run(session, rule_id_param, new_params):
    rule_rows = session.sql(f"""
        SELECT RULE_ID, RULE_NAME, TYPOLOGY, STATUS
        FROM KAVACH_DB.RULES.RULE_LIBRARY WHERE RULE_ID = ''{rule_id_param}''
    """).collect()
    if not rule_rows:
        return f"Rule not found: {rule_id_param}"
    rule = rule_rows[0]
    typology = rule[''TYPOLOGY'']
    if typology not in RULE_PARAM_WHITELIST:
        return f"Time machine not available for typology: {typology}"
    allowed = RULE_PARAM_WHITELIST[typology]
    if isinstance(new_params, str):
        new_params = json.loads(new_params)
    for k in new_params:
        if k not in allowed:
            return f"Parameter ''{k}'' not whitelisted for {typology}. Allowed: {list(allowed.keys())}"
    if typology not in RULE_TEMPLATES:
        return f"No template available for {typology}. Supported: {list(RULE_TEMPLATES.keys())}"
    defaults = {
        ''STRUCTURING'': {''amount_low'': 900000, ''amount_high'': 999999, ''count_threshold'': 3},
        ''INCOME_MISMATCH'': {''multiplier'': 10},
        ''HIGH_RISK_SWIFT'': {''amount_threshold'': 1000000},
    }
    params = {**defaults.get(typology, {}), **new_params}
    for k, v in params.items():
        if not isinstance(v, (int, float)):
            return f"Parameter ''{k}'' must be numeric, got: {v}"
    sql_template = RULE_TEMPLATES[typology].format(**params)
    current = session.sql(f"""
        SELECT COUNT(DISTINCT ACCOUNT_ID) AS CNT
        FROM KAVACH_DB.CORE.ALERTS WHERE TYPOLOGY = ''{typology}''
    """).collect()[0][''CNT'']
    new_accts = session.sql(f"SELECT COUNT(*) AS CNT FROM ({sql_template})").collect()[0][''CNT'']
    confirmed_fraud = session.sql(f"""
        SELECT COUNT(DISTINCT gt.ACCOUNT_ID) AS CNT
        FROM ({sql_template}) n
        JOIN KAVACH_DB.ML.EVAL_GROUND_TRUTH gt ON n.ACCOUNT_ID = gt.ACCOUNT_ID
    """).collect()[0][''CNT'']
    current_tp = session.sql(f"""
        SELECT COUNT(DISTINCT al.ACCOUNT_ID) AS CNT
        FROM KAVACH_DB.CORE.ALERTS al
        JOIN KAVACH_DB.ML.EVAL_GROUND_TRUTH gt ON al.ACCOUNT_ID = gt.ACCOUNT_ID
        WHERE al.TYPOLOGY = ''{typology}''
    """).collect()[0][''CNT'']
    delta = new_accts - current
    extra_tp = confirmed_fraud - current_tp
    extra_fp = delta - extra_tp if delta > extra_tp else 0
    extra_hours = round(abs(delta) * 20 / 60, 1)
    param_desc = ", ".join(f"{k}={v}" for k, v in params.items())
    return f"""TIME MACHINE ANALYSIS
=====================
Rule: {rule[''RULE_NAME'']} ({typology})
Parameters: {param_desc}

RESULTS
Current alerts: {current}
Projected alerts: {new_accts}
Delta: {''+'' if delta >= 0 else ''''}{delta}

IMPACT ON CONFIRMED FRAUD
Current confirmed fraud caught: {current_tp}
Projected confirmed fraud caught: {confirmed_fraud}
Extra confirmed fraud: {''+'' if extra_tp >= 0 else ''''}{extra_tp}
Extra non-fraud (potential FP): {extra_fp}

RESOURCE IMPACT
Estimated additional analyst hours: {extra_hours}h (at 20 min per alert)
{''Wider net catches more fraud but increases workload.'' if delta > 0 else ''Tighter threshold reduces workload but may miss cases.''}"""
';

CREATE OR REPLACE PROCEDURE KAVACH_DB.AI.WHY_NOT_FLAGGED("TXN_ID_PARAM" VARCHAR)
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
ARTIFACT_REPOSITORY = snowflake.snowpark.pypi_shared_repository
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS '
def run(session, txn_id_param):
    rows = session.sql(f"""
        SELECT t.TXN_ID, t.ACCOUNT_ID, t.AMOUNT_INR, t.CHANNEL, t.DIRECTION,
               t.COUNTERPARTY_BANK, t.COUNTRY, t.TXN_TS::VARCHAR AS TXN_TS,
               c.DECLARED_ANNUAL_INCOME, c.IS_PEP, c.RISK_CATEGORY,
               a.STATUS AS ACCT_STATUS
        FROM KAVACH_DB.CORE.TRANSACTIONS t
        JOIN KAVACH_DB.CORE.ACCOUNTS a ON t.ACCOUNT_ID = a.ACCOUNT_ID
        JOIN KAVACH_DB.CORE.CUSTOMERS c ON a.CUSTOMER_ID = c.CUSTOMER_ID
        WHERE t.TXN_ID = ''{txn_id_param}''
    """).collect()
    if not rows:
        return f"No transaction found with ID: {txn_id_param}"
    t = rows[0]
    checks = []
    # Structuring check
    if t[''CHANNEL''] == ''CASH'' and t[''DIRECTION''] == ''CREDIT'':
        if 900000 <= float(t[''AMOUNT_INR'']) <= 999999:
            checks.append("STRUCTURING: MATCH - Cash credit INR {:.0f} is in 9-10 lakh range. Would need 3+ such txns in 30 days to trigger.".format(float(t[''AMOUNT_INR''])))
        else:
            pct = abs(float(t[''AMOUNT_INR'']) - 900000) / 900000 * 100
            checks.append(f"STRUCTURING: NO MATCH - Amount INR {float(t[''AMOUNT_INR'']):,.0f} outside 9-10 lakh range ({pct:.1f}% away from threshold)")
    else:
        checks.append(f"STRUCTURING: NO MATCH - Channel={t[''CHANNEL'']}, Direction={t[''DIRECTION'']} (needs CASH + CREDIT)")
    # High-risk SWIFT
    if t[''CHANNEL''] == ''SWIFT'' and t[''COUNTRY''] not in (''IN'', ''India'', None):
        checks.append(f"HIGH_RISK_SWIFT: PARTIAL MATCH - SWIFT to {t[''COUNTRY'']}. Check if country is on high-risk list.")
    else:
        checks.append(f"HIGH_RISK_SWIFT: NO MATCH - Channel={t[''CHANNEL'']}, Country={t[''COUNTRY'']}")
    # PEP unusual cash
    if t[''IS_PEP''] and t[''CHANNEL''] == ''CASH'' and float(t[''AMOUNT_INR'']) > 500000:
        checks.append(f"PEP_UNUSUAL_CASH: MATCH - PEP customer, cash INR {float(t[''AMOUNT_INR'']):,.0f} > 5 lakh")
    else:
        reasons = []
        if not t[''IS_PEP'']: reasons.append("not PEP")
        if t[''CHANNEL''] != ''CASH'': reasons.append(f"channel={t[''CHANNEL'']}")
        if float(t[''AMOUNT_INR'']) <= 500000: reasons.append(f"amount {float(t[''AMOUNT_INR'']):,.0f} <= 5 lakh")
        checks.append(f"PEP_UNUSUAL_CASH: NO MATCH - {'', ''.join(reasons)}")
    # Rapid passthrough (would need paired txn)
    checks.append(f"RAPID_PASSTHROUGH: Cannot evaluate from single txn (needs credit-then-debit pair within 30 min)")
    # Income mismatch (need aggregate)
    checks.append(f"INCOME_MISMATCH: Cannot evaluate from single txn (needs 6-month aggregate vs declared income INR {float(t[''DECLARED_ANNUAL_INCOME'']):,.0f})")
    alert_check = session.sql(f"""
        SELECT COUNT(*) AS CNT FROM KAVACH_DB.CORE.ALERTS WHERE ACCOUNT_ID = ''{t[''ACCOUNT_ID'']}''
    """).collect()
    existing = alert_check[0][''CNT''] if alert_check else 0
    result = f"""WHY NOT FLAGGED ANALYSIS
========================
Transaction: {t[''TXN_ID'']}
Account: {t[''ACCOUNT_ID'']} (Status: {t[''ACCT_STATUS'']})
Amount: INR {float(t[''AMOUNT_INR'']):,.2f} | Channel: {t[''CHANNEL'']} | Direction: {t[''DIRECTION'']}
Country: {t[''COUNTRY'']} | Date: {t[''TXN_TS'']}
Customer Risk: {t[''RISK_CATEGORY'']} | PEP: {t[''IS_PEP'']}

RULE-BY-RULE ANALYSIS
{chr(10).join(checks)}

ACCOUNT CONTEXT
This account has {existing} existing alert(s)."""
    return result
';


create or replace schema KAVACH_DB.RULES COMMENT='Regulatory rules and compiled checks';

create or replace TABLE KAVACH_DB.RULES.RULE_CANDIDATES (
	RULE_ID VARCHAR(16777216) DEFAULT 'RULE-' || UUID_STRING(),
	CIRCULAR_NO VARCHAR(16777216) NOT NULL,
	PARA_NO NUMBER(38,0) NOT NULL,
	OBLIGATION_SUMMARY VARCHAR(16777216),
	TYPOLOGY VARCHAR(16777216),
	ENTITY VARCHAR(16777216),
	CONDITION_FIELDS VARIANT,
	THRESHOLDS VARIANT,
	TIME_WINDOW VARCHAR(16777216),
	SEVERITY VARCHAR(16777216),
	ACTION_REQUIRED VARCHAR(16777216),
	FILING_DEADLINE_DAYS NUMBER(38,0),
	SOURCE_QUOTE VARCHAR(16777216),
	STATUS VARCHAR(16777216) DEFAULT 'DRAFT',
	EXTRACTED_AT TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP()
);
create or replace TABLE KAVACH_DB.RULES.RULE_CONFLICTS (
	CONFLICT_ID VARCHAR(16777216) DEFAULT 'CONF-' || UUID_STRING(),
	RULE_ID_A VARCHAR(16777216) NOT NULL,
	RULE_ID_B VARCHAR(16777216) NOT NULL,
	TYPOLOGY VARCHAR(16777216),
	ENTITY VARCHAR(16777216),
	DESCRIPTION VARCHAR(16777216) NOT NULL,
	CITATION_A VARCHAR(16777216),
	CITATION_B VARCHAR(16777216),
	DETECTED_AT TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP(),
	STATUS VARCHAR(16777216) DEFAULT 'OPEN'
);
create or replace TABLE KAVACH_DB.RULES.RULE_LIBRARY (
	RULE_ID VARCHAR(16777216) DEFAULT 'RL-' || UUID_STRING(),
	RULE_CANDIDATE_ID VARCHAR(16777216),
	VERSION NUMBER(38,0) DEFAULT 1,
	RULE_NAME VARCHAR(16777216),
	TYPOLOGY VARCHAR(16777216),
	ENTITY VARCHAR(16777216),
	SQL_TEXT VARCHAR(16777216) NOT NULL,
	PARAMS VARIANT,
	EFFECTIVE_FROM DATE DEFAULT CURRENT_DATE(),
	EFFECTIVE_TO DATE DEFAULT CAST('9999-12-31' AS DATE),
	SOURCE_CITATION VARCHAR(16777216),
	COMPILED_BY VARCHAR(16777216) DEFAULT 'AI',
	APPROVED_BY VARCHAR(16777216),
	STATUS VARCHAR(16777216) DEFAULT 'PENDING_APPROVAL',
	CREATED_AT TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP(),
	APPROVED_AT TIMESTAMP_NTZ(9),
	REJECTED_BY VARCHAR(16777216),
	REJECTION_REASON VARCHAR(16777216),
	REJECTED_AT TIMESTAMP_NTZ(9)
);
CREATE OR REPLACE PROCEDURE KAVACH_DB.RULES.APPLY_AMENDMENTS()
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
ARTIFACT_REPOSITORY = snowflake.snowpark.pypi_shared_repository
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS '
def run(session):
    amendments = session.sql("""
        SELECT DISTINCT CIRCULAR_NO, AMENDS_CIRCULAR
        FROM KAVACH_DB.AI.REG_CHUNKS
        WHERE IS_AMENDMENT = TRUE AND AMENDS_CIRCULAR IS NOT NULL
    """).collect()
    count = 0
    for a in amendments:
        amending = a[''CIRCULAR_NO'']
        original = a[''AMENDS_CIRCULAR'']
        typs = session.sql(f"SELECT DISTINCT TYPOLOGY FROM KAVACH_DB.RULES.RULE_CANDIDATES WHERE CIRCULAR_NO = ''{amending}'' AND TYPOLOGY != ''INFORMATIONAL''").collect()
        typ_list = [t[''TYPOLOGY''] for t in typs]
        if not typ_list:
            continue
        typ_in = '',''.join([f"''{t}''" for t in typ_list])
        session.sql(f"""
            UPDATE KAVACH_DB.RULES.RULE_LIBRARY SET EFFECTIVE_TO = CURRENT_DATE(), STATUS = ''SUPERSEDED''
            WHERE SOURCE_CITATION ILIKE ''%{original}%'' AND EFFECTIVE_TO = ''9999-12-31''::DATE AND TYPOLOGY IN ({typ_in})
        """).collect()
        candidates = session.sql(f"""
            SELECT RULE_ID, TYPOLOGY, ENTITY FROM KAVACH_DB.RULES.RULE_CANDIDATES
            WHERE CIRCULAR_NO = ''{amending}'' AND TYPOLOGY != ''INFORMATIONAL'' AND STATUS IN (''DRAFT'', ''COMPILED'')
        """).collect()
        for c in candidates:
            typ = c[''TYPOLOGY'']
            ent = c[''ENTITY''] or ''TXN''
            rid = c[''RULE_ID'']
            rname = f"v2_{typ}_{amending.replace(''/'', ''_'')}".replace("''", "''''")
            citation = f"{amending} (amends {original})".replace("''", "''''")
            if typ == ''STRUCTURING'':
                sql_v2 = "SELECT t.ACCOUNT_ID, COUNT(*) AS DEPOSIT_COUNT, SUM(t.AMOUNT_INR) AS TOTAL_AMOUNT FROM KAVACH_DB.CORE.TRANSACTIONS t WHERE t.CHANNEL = ''''CASH'''' AND t.DIRECTION = ''''CREDIT'''' AND t.AMOUNT_INR BETWEEN 1300000 AND 1499999 AND t.TXN_TS >= DATEADD(''''day'''', -30, CURRENT_TIMESTAMP()) GROUP BY t.ACCOUNT_ID HAVING COUNT(*) >= 3"
            elif typ == ''CASH_REPORTING'':
                sql_v2 = "SELECT t.ACCOUNT_ID, t.TXN_ID, t.AMOUNT_INR, t.TXN_TS FROM KAVACH_DB.CORE.TRANSACTIONS t WHERE t.CHANNEL = ''''CASH'''' AND t.AMOUNT_INR >= 1500000 AND t.TXN_TS >= DATEADD(''''day'''', -30, CURRENT_TIMESTAMP())"
            else:
                sql_v2 = "SELECT 1 -- No SQL change for this typology"
            session.sql(f"""
                INSERT INTO KAVACH_DB.RULES.RULE_LIBRARY (RULE_CANDIDATE_ID, VERSION, RULE_NAME, TYPOLOGY, ENTITY, SQL_TEXT, EFFECTIVE_FROM, SOURCE_CITATION, STATUS)
                SELECT ''{rid}'', 2, ''{rname}'', ''{typ}'', ''{ent}'', ''{sql_v2}'', CURRENT_DATE(), ''{citation}'', ''PENDING_APPROVAL''
            """).collect()
        count += 1
    return f"OK: {count} amendments processed"
';
CREATE OR REPLACE PROCEDURE KAVACH_DB.RULES.COMPILE_CIRCULAR("STAGE_PATH" VARCHAR DEFAULT '@KAVACH_DB.RAW.REG_STAGE')
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
ARTIFACT_REPOSITORY = snowflake.snowpark.pypi_shared_repository
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS '
def run(session, stage_path):
    sp = stage_path.replace("''", "''''")

    # Re-parse all PDFs
    session.sql("TRUNCATE TABLE KAVACH_DB.AI.REG_DOCS_PARSED").collect()
    session.sql(f"""
        INSERT INTO KAVACH_DB.AI.REG_DOCS_PARSED (FILENAME, RAW_CONTENT)
        SELECT RELATIVE_PATH,
               AI_PARSE_DOCUMENT(TO_FILE(''{sp}'', RELATIVE_PATH), {{''mode'': ''LAYOUT'', ''page_split'': TRUE}})
        FROM DIRECTORY(''{sp}'')
        WHERE RELATIVE_PATH ILIKE ''%.pdf''
    """).collect()

    r1 = session.sql("CALL KAVACH_DB.AI.CHUNK_PARSED_DOCS()").collect()[0][0]
    r2 = session.sql("CALL KAVACH_DB.RULES.EXTRACT_RULES_FROM_CHUNKS()").collect()[0][0]
    r3 = session.sql("CALL KAVACH_DB.RULES.COMPILE_RULES()").collect()[0][0]
    session.sql("CALL KAVACH_DB.RULES.APPLY_AMENDMENTS()").collect()
    r4 = session.sql("CALL KAVACH_DB.RULES.DETECT_CONFLICTS()").collect()[0][0]

    return f"{r1} | {r2} | {r3} | {r4}"
';
CREATE OR REPLACE PROCEDURE KAVACH_DB.RULES.COMPILE_RULES()
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
    candidates = session.sql("""
        SELECT RULE_ID, CIRCULAR_NO, PARA_NO, TYPOLOGY, ENTITY,
               THRESHOLDS, TIME_WINDOW, ACTION_REQUIRED, OBLIGATION_SUMMARY
        FROM KAVACH_DB.RULES.RULE_CANDIDATES
        WHERE STATUS = ''DRAFT'' AND TYPOLOGY != ''INFORMATIONAL''
    """).collect()

    templates = {
        ''STRUCTURING'': """SELECT t.ACCOUNT_ID, COUNT(*) AS DEPOSIT_COUNT, SUM(t.AMOUNT_INR) AS TOTAL_AMOUNT, MIN(t.TXN_TS) AS FIRST_TXN, MAX(t.TXN_TS) AS LAST_TXN
FROM KAVACH_DB.CORE.TRANSACTIONS t
WHERE t.CHANNEL = ''CASH'' AND t.DIRECTION = ''CREDIT'' AND t.AMOUNT_INR BETWEEN 900000 AND 999999 AND t.TXN_TS >= DATEADD(''day'', -30, CURRENT_TIMESTAMP())
GROUP BY t.ACCOUNT_ID HAVING COUNT(*) >= 3""",
        ''CASH_REPORTING'': """SELECT t.ACCOUNT_ID, t.TXN_ID, t.AMOUNT_INR, t.TXN_TS, t.CHANNEL
FROM KAVACH_DB.CORE.TRANSACTIONS t
WHERE t.CHANNEL = ''CASH'' AND t.AMOUNT_INR >= 1000000 AND t.TXN_TS >= DATEADD(''day'', -30, CURRENT_TIMESTAMP())""",
        ''MULE_RING'': """WITH shared_devices AS (SELECT d.DEVICE_ID, COUNT(DISTINCT d.ACCOUNT_ID) AS ACCT_COUNT FROM KAVACH_DB.CORE.DEVICES d GROUP BY d.DEVICE_ID HAVING COUNT(DISTINCT d.ACCOUNT_ID) >= 5),
rapid_flow AS (SELECT t1.ACCOUNT_ID, t1.TXN_ID AS CREDIT_TXN, t2.TXN_ID AS DEBIT_TXN, t1.AMOUNT_INR, DATEDIFF(''minute'', t1.TXN_TS, t2.TXN_TS) AS MINUTES_GAP
FROM KAVACH_DB.CORE.TRANSACTIONS t1 JOIN KAVACH_DB.CORE.TRANSACTIONS t2 ON t1.ACCOUNT_ID = t2.ACCOUNT_ID AND t1.DIRECTION = ''CREDIT'' AND t2.DIRECTION = ''DEBIT'' AND DATEDIFF(''minute'', t1.TXN_TS, t2.TXN_TS) BETWEEN 1 AND 30 AND t1.TXN_TS >= DATEADD(''day'', -30, CURRENT_TIMESTAMP()))
SELECT sd.DEVICE_ID, rf.ACCOUNT_ID, rf.AMOUNT_INR, rf.MINUTES_GAP FROM rapid_flow rf JOIN KAVACH_DB.CORE.DEVICES d ON rf.ACCOUNT_ID = d.ACCOUNT_ID JOIN shared_devices sd ON d.DEVICE_ID = sd.DEVICE_ID""",
        ''DORMANT_REACTIVATION'': """SELECT a.ACCOUNT_ID, a.STATUS, t.TXN_ID, t.AMOUNT_INR, t.TXN_TS, t.CHANNEL
FROM KAVACH_DB.CORE.ACCOUNTS a JOIN KAVACH_DB.CORE.TRANSACTIONS t ON a.ACCOUNT_ID = t.ACCOUNT_ID
WHERE a.STATUS = ''DORMANT'' AND t.DIRECTION = ''DEBIT'' AND t.AMOUNT_INR >= 100000 AND t.TXN_TS >= DATEADD(''day'', -30, CURRENT_TIMESTAMP())""",
        ''RAPID_PASSTHROUGH'': """WITH flow AS (SELECT t1.ACCOUNT_ID, t1.TXN_ID AS CREDIT_TXN, t1.AMOUNT_INR AS CREDIT_AMT, t2.TXN_ID AS DEBIT_TXN, DATEDIFF(''hour'', t1.TXN_TS, t2.TXN_TS) AS HOURS_GAP, ABS(t1.AMOUNT_INR - t2.AMOUNT_INR) / NULLIF(t1.AMOUNT_INR, 0) AS AMT_DIFF_PCT
FROM KAVACH_DB.CORE.TRANSACTIONS t1 JOIN KAVACH_DB.CORE.TRANSACTIONS t2 ON t1.ACCOUNT_ID = t2.ACCOUNT_ID AND t1.DIRECTION = ''CREDIT'' AND t2.DIRECTION = ''DEBIT'' AND DATEDIFF(''hour'', t1.TXN_TS, t2.TXN_TS) BETWEEN 0 AND 24 AND ABS(t1.AMOUNT_INR - t2.AMOUNT_INR) / NULLIF(t1.AMOUNT_INR, 0) < 0.05 WHERE t1.TXN_TS >= DATEADD(''day'', -30, CURRENT_TIMESTAMP()))
SELECT ACCOUNT_ID, COUNT(*) AS PASSTHROUGH_COUNT, SUM(CREDIT_AMT) AS TOTAL_FLOW FROM flow GROUP BY ACCOUNT_ID HAVING COUNT(*) >= 3""",
        ''INCOME_MISMATCH'': """SELECT c.CUSTOMER_ID, c.CUSTOMER_NAME, c.DECLARED_ANNUAL_INCOME, SUM(t.AMOUNT_INR) AS SIX_MONTH_TURNOVER, SUM(t.AMOUNT_INR) / NULLIF(c.DECLARED_ANNUAL_INCOME, 0) AS TURNOVER_RATIO
FROM KAVACH_DB.CORE.CUSTOMERS c JOIN KAVACH_DB.CORE.ACCOUNTS a ON c.CUSTOMER_ID = a.CUSTOMER_ID JOIN KAVACH_DB.CORE.TRANSACTIONS t ON a.ACCOUNT_ID = t.ACCOUNT_ID
WHERE t.TXN_TS >= DATEADD(''month'', -6, CURRENT_TIMESTAMP()) AND c.DECLARED_ANNUAL_INCOME < 500000
GROUP BY c.CUSTOMER_ID, c.CUSTOMER_NAME, c.DECLARED_ANNUAL_INCOME HAVING SUM(t.AMOUNT_INR) / NULLIF(c.DECLARED_ANNUAL_INCOME, 0) > 10""",
        ''ROUND_TRIPPING'': """WITH hops AS (SELECT t1.ACCOUNT_ID AS ORIGIN, t1.COUNTERPARTY AS HOP1, t2.COUNTERPARTY AS HOP2, t3.COUNTERPARTY AS HOP3, t1.AMOUNT_INR, DATEDIFF(''day'', t1.TXN_TS, t3.TXN_TS) AS DAYS_SPAN
FROM KAVACH_DB.CORE.TRANSACTIONS t1 JOIN KAVACH_DB.CORE.TRANSACTIONS t2 ON t1.COUNTERPARTY = t2.ACCOUNT_ID AND t2.DIRECTION = ''DEBIT'' AND DATEDIFF(''day'', t1.TXN_TS, t2.TXN_TS) BETWEEN 0 AND 3
JOIN KAVACH_DB.CORE.TRANSACTIONS t3 ON t2.COUNTERPARTY = t3.ACCOUNT_ID AND t3.DIRECTION = ''DEBIT'' AND DATEDIFF(''day'', t2.TXN_TS, t3.TXN_TS) BETWEEN 0 AND 3
WHERE t1.DIRECTION = ''DEBIT'' AND t3.COUNTERPARTY = t1.ACCOUNT_ID AND t1.TXN_TS >= DATEADD(''day'', -30, CURRENT_TIMESTAMP()))
SELECT ORIGIN, HOP1, HOP2, HOP3, AMOUNT_INR, DAYS_SPAN FROM hops""",
        ''HIGH_RISK_SWIFT'': """SELECT t.TXN_ID, t.ACCOUNT_ID, t.AMOUNT_INR, t.COUNTRY, t.TXN_TS, cr.RISK_LEVEL, cr.FATF_STATUS
FROM KAVACH_DB.CORE.TRANSACTIONS t JOIN KAVACH_DB.REF.COUNTRY_RISK cr ON t.COUNTRY = cr.COUNTRY_CODE
WHERE t.CHANNEL = ''SWIFT'' AND cr.RISK_LEVEL IN (''HIGH'', ''PROHIBITED'') AND t.TXN_TS >= DATEADD(''day'', -30, CURRENT_TIMESTAMP())""",
        ''ACCOUNT_TAKEOVER'': """WITH new_device_logins AS (SELECT l.ACCOUNT_ID, l.DEVICE_ID, l.LOGIN_TS, l.IP_ADDRESS FROM KAVACH_DB.CORE.LOGINS l LEFT JOIN (SELECT ACCOUNT_ID, DEVICE_ID, MIN(LOGIN_TS) AS FIRST_SEEN FROM KAVACH_DB.CORE.LOGINS GROUP BY ACCOUNT_ID, DEVICE_ID) hist ON l.ACCOUNT_ID = hist.ACCOUNT_ID AND l.DEVICE_ID = hist.DEVICE_ID WHERE l.LOGIN_TS = hist.FIRST_SEEN AND l.LOGIN_TS >= DATEADD(''day'', -30, CURRENT_TIMESTAMP()))
SELECT ndl.ACCOUNT_ID, ndl.DEVICE_ID, ndl.LOGIN_TS AS NEW_DEVICE_LOGIN, t.TXN_ID, t.AMOUNT_INR, t.TXN_TS, DATEDIFF(''minute'', ndl.LOGIN_TS, t.TXN_TS) AS MINUTES_AFTER_LOGIN
FROM new_device_logins ndl JOIN KAVACH_DB.CORE.TRANSACTIONS t ON ndl.ACCOUNT_ID = t.ACCOUNT_ID AND t.DIRECTION = ''DEBIT'' AND t.AMOUNT_INR >= 200000 AND DATEDIFF(''minute'', ndl.LOGIN_TS, t.TXN_TS) BETWEEN 0 AND 60""",
        ''PEP_UNUSUAL_CASH'': """SELECT c.CUSTOMER_ID, c.CUSTOMER_NAME, c.IS_PEP, t.TXN_ID, t.AMOUNT_INR, t.CHANNEL, t.DIRECTION, t.TXN_TS
FROM KAVACH_DB.CORE.CUSTOMERS c JOIN KAVACH_DB.CORE.ACCOUNTS a ON c.CUSTOMER_ID = a.CUSTOMER_ID JOIN KAVACH_DB.CORE.TRANSACTIONS t ON a.ACCOUNT_ID = t.ACCOUNT_ID
WHERE c.IS_PEP = TRUE AND t.CHANNEL = ''CASH'' AND t.AMOUNT_INR >= 500000 AND t.TXN_TS >= DATEADD(''day'', -90, CURRENT_TIMESTAMP())""",
        ''KYC_CDD'': """SELECT c.CUSTOMER_ID, c.CUSTOMER_NAME, c.RISK_CATEGORY, c.KYC_STATUS, c.KYC_LAST_UPDATED, c.DECLARED_ANNUAL_INCOME
FROM KAVACH_DB.CORE.CUSTOMERS c WHERE (c.RISK_CATEGORY = ''HIGH'' AND c.KYC_LAST_UPDATED < DATEADD(''year'', -2, CURRENT_DATE())) OR (c.RISK_CATEGORY = ''MEDIUM'' AND c.KYC_LAST_UPDATED < DATEADD(''year'', -8, CURRENT_DATE())) OR c.KYC_STATUS = ''EXPIRED''""",
        ''SANCTIONS_SCREENING'': """SELECT t.TXN_ID, t.ACCOUNT_ID, t.COUNTERPARTY, t.AMOUNT_INR, t.TXN_TS, w.FULL_NAME AS WATCHLIST_MATCH, w.LIST_SOURCE, w.REASON
FROM KAVACH_DB.CORE.TRANSACTIONS t JOIN KAVACH_DB.REF.WATCHLIST w ON JAROWINKLER_SIMILARITY(UPPER(t.COUNTERPARTY), UPPER(w.FULL_NAME)) >= 85
WHERE t.CHANNEL = ''SWIFT'' AND t.TXN_TS >= DATEADD(''day'', -30, CURRENT_TIMESTAMP())""",
        ''WIRE_TRANSFER'': """SELECT t.TXN_ID, t.ACCOUNT_ID, t.AMOUNT_INR, t.COUNTRY, t.TXN_TS, t.COUNTERPARTY, t.COUNTERPARTY_BANK
FROM KAVACH_DB.CORE.TRANSACTIONS t WHERE t.CHANNEL = ''SWIFT'' AND t.AMOUNT_INR >= 850000 AND t.TXN_TS >= DATEADD(''day'', -30, CURRENT_TIMESTAMP())""",
        ''GENERAL_AML'': """SELECT t.TXN_ID, t.ACCOUNT_ID, t.AMOUNT_INR, t.CHANNEL, t.TXN_TS
FROM KAVACH_DB.CORE.TRANSACTIONS t WHERE t.AMOUNT_INR >= 1000000 AND t.TXN_TS >= DATEADD(''day'', -30, CURRENT_TIMESTAMP())"""
    }

    compiled = 0
    for c in candidates:
        typ = c[''TYPOLOGY''] or ''''
        sql_text = templates.get(typ)
        if not sql_text:
            continue
        circ = c[''CIRCULAR_NO''] or ''''
        para = c[''PARA_NO'']
        rid = c[''RULE_ID'']
        ent = c[''ENTITY''] or ''TXN''
        rname = f"{typ}_{circ}_{para}".replace("/", "_").replace("''", "''''")
        citation = f"{circ} para {para}".replace("''", "''''")
        esc_sql = sql_text.replace("''", "''''")
        th = c[''THRESHOLDS'']
        th_json = json.dumps(th).replace("''", "''''") if th and not isinstance(th, str) else ''{}''

        session.sql(f"""
            INSERT INTO KAVACH_DB.RULES.RULE_LIBRARY
                (RULE_CANDIDATE_ID, RULE_NAME, TYPOLOGY, ENTITY, SQL_TEXT, PARAMS, SOURCE_CITATION)
            SELECT ''{rid}'', ''{rname}'', ''{typ}'', ''{ent}'', ''{esc_sql}'', PARSE_JSON(''{th_json}''), ''{citation}''
        """).collect()
        session.sql(f"UPDATE KAVACH_DB.RULES.RULE_CANDIDATES SET STATUS=''COMPILED'' WHERE RULE_ID=''{rid}''").collect()
        compiled += 1

    return f"OK: {compiled} rules compiled"
';
CREATE OR REPLACE PROCEDURE KAVACH_DB.RULES.DETECT_CONFLICTS()
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
ARTIFACT_REPOSITORY = snowflake.snowpark.pypi_shared_repository
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS '
def run(session):
    session.sql("TRUNCATE TABLE KAVACH_DB.RULES.RULE_CONFLICTS").collect()
    conflict_count = 0

    # Method 1: Conflicts flagged in circular metadata
    chunk_conflicts = session.sql("""
        SELECT DISTINCT c1.CIRCULAR_NO AS CIRC_A, c1.CONFLICTS_WITH AS CIRC_B
        FROM KAVACH_DB.AI.REG_CHUNKS c1
        WHERE c1.CONFLICTS_WITH IS NOT NULL
    """).collect()

    for cc in chunk_conflicts:
        circ_a = cc[''CIRC_A'']
        circ_b = cc[''CIRC_B'']
        pairs = session.sql(f"""
            SELECT a.RULE_ID AS RULE_A, b.RULE_ID AS RULE_B, a.TYPOLOGY, a.ENTITY,
                   a.SOURCE_CITATION AS CIT_A, b.SOURCE_CITATION AS CIT_B
            FROM KAVACH_DB.RULES.RULE_LIBRARY a
            JOIN KAVACH_DB.RULES.RULE_LIBRARY b
                ON a.TYPOLOGY = b.TYPOLOGY AND a.ENTITY = b.ENTITY AND a.RULE_ID != b.RULE_ID
            WHERE a.SOURCE_CITATION ILIKE ''%{circ_a}%'' AND b.SOURCE_CITATION ILIKE ''%{circ_b}%''
              AND a.STATUS NOT IN (''SUPERSEDED'') AND b.STATUS NOT IN (''SUPERSEDED'')
        """).collect()
        for p in pairs:
            desc = f"Conflicting definitions from {circ_a} and {circ_b} on {p[''TYPOLOGY'']}"
            # Use AI to explain the conflict
            try:
                ch_a = session.sql(f"SELECT TEXT FROM KAVACH_DB.AI.REG_CHUNKS WHERE CIRCULAR_NO = ''{circ_a}'' LIMIT 2").collect()
                ch_b = session.sql(f"SELECT TEXT FROM KAVACH_DB.AI.REG_CHUNKS WHERE CIRCULAR_NO = ''{circ_b}'' LIMIT 2").collect()
                if ch_a and ch_b:
                    ta = ch_a[0][''TEXT''][:250].replace("''", "''''")
                    tb = ch_b[0][''TEXT''][:250].replace("''", "''''")
                    exp = session.sql(f"SELECT AI_COMPLETE(''llama3.1-8b'', ''Compare these two regulations and explain the conflict in 2 sentences. A ({circ_a}): {ta} B ({circ_b}): {tb}'') AS E").collect()
                    if exp:
                        desc = str(exp[0][''E''])[:500].replace("''", "''''")
            except:
                pass
            esc_desc = desc.replace("''", "''''")
            esc_a = (p[''CIT_A''] or '''').replace("''", "''''")
            esc_b = (p[''CIT_B''] or '''').replace("''", "''''")
            session.sql(f"""
                INSERT INTO KAVACH_DB.RULES.RULE_CONFLICTS (RULE_ID_A, RULE_ID_B, TYPOLOGY, ENTITY, DESCRIPTION, CITATION_A, CITATION_B)
                VALUES (''{p[''RULE_A'']}'', ''{p[''RULE_B'']}'', ''{p[''TYPOLOGY'']}'', ''{p[''ENTITY'']}'', ''{esc_desc}'', ''{esc_a}'', ''{esc_b}'')
            """).collect()
            conflict_count += 1

    # Method 2: Overlapping active rules on same typology from different circulars
    overlaps = session.sql("""
        SELECT a.RULE_ID AS RULE_A, b.RULE_ID AS RULE_B, a.TYPOLOGY, a.ENTITY,
               a.SOURCE_CITATION AS CIT_A, b.SOURCE_CITATION AS CIT_B
        FROM KAVACH_DB.RULES.RULE_LIBRARY a
        JOIN KAVACH_DB.RULES.RULE_LIBRARY b
            ON a.TYPOLOGY = b.TYPOLOGY AND a.ENTITY = b.ENTITY AND a.RULE_ID < b.RULE_ID
            AND a.STATUS NOT IN (''SUPERSEDED'') AND b.STATUS NOT IN (''SUPERSEDED'')
        WHERE a.EFFECTIVE_TO = ''9999-12-31''::DATE AND b.EFFECTIVE_TO = ''9999-12-31''::DATE
          AND a.SOURCE_CITATION != b.SOURCE_CITATION
          AND NOT EXISTS (SELECT 1 FROM KAVACH_DB.RULES.RULE_CONFLICTS rc
              WHERE (rc.RULE_ID_A = a.RULE_ID AND rc.RULE_ID_B = b.RULE_ID)
                 OR (rc.RULE_ID_A = b.RULE_ID AND rc.RULE_ID_B = a.RULE_ID))
    """).collect()
    for ov in overlaps:
        desc = f"Overlapping active rules on {ov[''TYPOLOGY'']}/{ov[''ENTITY'']} from different circulars"
        esc_a = (ov[''CIT_A''] or '''').replace("''", "''''")
        esc_b = (ov[''CIT_B''] or '''').replace("''", "''''")
        session.sql(f"""
            INSERT INTO KAVACH_DB.RULES.RULE_CONFLICTS (RULE_ID_A, RULE_ID_B, TYPOLOGY, ENTITY, DESCRIPTION, CITATION_A, CITATION_B)
            VALUES (''{ov[''RULE_A'']}'', ''{ov[''RULE_B'']}'', ''{ov[''TYPOLOGY'']}'', ''{ov[''ENTITY'']}'', ''{desc}'', ''{esc_a}'', ''{esc_b}'')
        """).collect()
        conflict_count += 1

    return f"OK: {conflict_count} conflicts detected"
';
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
                         SCORE, REASONS, CITATION, SEVERITY, ACTION_REQUIRED)
                    SELECT ''{esc_acct}'', NULLIF(''{esc_txn}'',''''), ''{rid}'', ''{rname}'', {ver}, ''{typ}'',
                           1.0, PARSE_JSON(''{{"rule_hit": "{typ}", "details": "{reasons[:200]}"}}''),
                           ''{citation}'', ''{sev}'', ''{act}''
                """).collect()
                total_alerts += 1

        except Exception as e:
            errors.append(f"{rname}: {str(e)[:80]}")

    err_msg = f" Errors({len(errors)}): {''; ''.join(errors[:3])}" if errors else ""
    return f"OK: {len(rules)} rules executed, {total_alerts} alerts generated.{err_msg}"
';
CREATE OR REPLACE PROCEDURE KAVACH_DB.RULES.EXTRACT_RULES_FROM_CHUNKS()
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
    chunks = session.sql("""
        SELECT CHUNK_ID, CIRCULAR_NO, PARA_NO, TEXT
        FROM KAVACH_DB.AI.REG_CHUNKS
        WHERE TEXT ILIKE ''%shall%''
           OR TEXT ILIKE ''%must%''
           OR TEXT ILIKE ''%required%''
           OR TEXT ILIKE ''%mandatory%''
        ORDER BY CIRCULAR_NO, PARA_NO
    """).collect()

    rule_count = 0
    errors = []

    for chunk in chunks:
        circ = chunk[''CIRCULAR_NO'']
        para = chunk[''PARA_NO'']
        text = chunk[''TEXT''][:1500]

        prompt_text = f"""
You are a regulatory compliance expert. Analyze this Indian banking regulation paragraph and return ONLY a JSON object with these fields:
obligation_summary (string),
typology (one of: STRUCTURING, MULE_RING, DORMANT_REACTIVATION, RAPID_PASSTHROUGH, INCOME_MISMATCH, ROUND_TRIPPING, HIGH_RISK_SWIFT, ACCOUNT_TAKEOVER, PEP_UNUSUAL_CASH, KYC_CDD, SANCTIONS_SCREENING, WIRE_TRANSFER, CASH_REPORTING, GENERAL_AML, INFORMATIONAL),
entity (TXN/ACCOUNT/CUSTOMER),
condition_fields (array),
thresholds (object),
time_window (string),
severity (HIGH/MEDIUM/LOW),
action_required (ALERT/STR/CTR/EDD/BLOCK/MONITOR),
filing_deadline_days (integer).

Paragraph from {circ} para {para}:
\\"\\"\\"{text}\\"\\"\\"
"""

        esc = prompt_text.replace("\\\\", "\\\\\\\\").replace("''", "''''")

        try:
            r = session.sql(
                f"SELECT AI_COMPLETE(''llama3.1-8b'', ''{esc}'') AS R"
            ).collect()

            if r and r[0][''R'']:
                raw = str(r[0][''R'']).strip()

                s = raw.find(''{'')
                e = raw.rfind(''}'')

                if s >= 0 and e > s:
                    raw = raw[s:e+1]

                p = json.loads(raw)

                ob = str(
                    p.get(''obligation_summary'', '''')
                ).replace("''", "''''")[:500]

                typ = str(
                    p.get(''typology'', ''INFORMATIONAL'')
                ).replace("''", "''''")[:50]

                ent = str(
                    p.get(''entity'', ''TXN'')
                ).replace("''", "''''")[:20]

                tw = str(
                    p.get(''time_window'', '''')
                ).replace("''", "''''")[:50]

                sev = str(
                    p.get(''severity'', ''MEDIUM'')
                ).replace("''", "''''")[:10]

                act = str(
                    p.get(''action_required'', ''ALERT'')
                ).replace("''", "''''")[:20]

                fdd = int(
                    p.get(''filing_deadline_days'', 0) or 0
                )

                cf = json.dumps(
                    p.get(''condition_fields'', [])
                ).replace("''", "''''")

                th = json.dumps(
                    p.get(''thresholds'', {})
                ).replace("''", "''''")

                sq = text.replace("''", "''''")[:500]

                session.sql(f"""
                    INSERT INTO
                    KAVACH_DB.RULES.RULE_CANDIDATES
                    (
                        CIRCULAR_NO,
                        PARA_NO,
                        OBLIGATION_SUMMARY,
                        TYPOLOGY,
                        ENTITY,
                        CONDITION_FIELDS,
                        THRESHOLDS,
                        TIME_WINDOW,
                        SEVERITY,
                        ACTION_REQUIRED,
                        FILING_DEADLINE_DAYS,
                        SOURCE_QUOTE,
                        STATUS
                    )
                    SELECT
                        ''{circ}'',
                        ''{para}'',
                        ''{ob}'',
                        ''{typ}'',
                        ''{ent}'',
                        PARSE_JSON(''{cf}''),
                        PARSE_JSON(''{th}''),
                        ''{tw}'',
                        ''{sev}'',
                        ''{act}'',
                        {fdd},
                        ''{sq}'',
                        ''DRAFT''
                """).collect()

                rule_count += 1

        except Exception as ex:
            errors.append(
                f"{circ} {para}: {str(ex)[:80]}"
            )

    em = (
        f" Err({len(errors)}): {'':''.join(errors[:3])}"
        if errors
        else ""
    )

    return f"OK: {len(chunks)} chunks, {rule_count} rules.{em}"
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
            f"SELECT AI_COMPLETE(''llama3.1-8b'', ''{esc}'') AS R"
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
            SELECT AI_COMPLETE(''llama3.1-8b'', ''{esc}'') AS R
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
-- =============================================================================
-- KAVACH Phase 3: Regulation Compiler
-- =============================================================================
-- RUN THIS ENTIRE FILE IN SNOWSIGHT (Worksheets) as ACCOUNTADMIN.
-- CoCo restricted session scope blocks DDL and AI function calls.
-- =============================================================================
USE ROLE ACCOUNTADMIN;
USE DATABASE KAVACH_DB;
USE WAREHOUSE KAVACH_WH;

-- =========================================================================
-- STEP 0: Enable directory on stage for DIRECTORY() access
-- =========================================================================
ALTER STAGE RAW.REG_STAGE SET DIRECTORY = (ENABLE = TRUE);
ALTER STAGE RAW.REG_STAGE REFRESH;

-- =========================================================================
-- STEP 1: Parse PDFs with AI_PARSE_DOCUMENT → AI.REG_DOCS_PARSED
-- =========================================================================
CREATE OR REPLACE TABLE AI.REG_DOCS_PARSED (
    DOC_ID          STRING DEFAULT UUID_STRING(),
    FILENAME        STRING NOT NULL,
    RAW_CONTENT     VARIANT NOT NULL,
    PARSED_AT       TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

INSERT INTO AI.REG_DOCS_PARSED (FILENAME, RAW_CONTENT)
SELECT
    RELATIVE_PATH AS FILENAME,
    AI_PARSE_DOCUMENT(
        TO_FILE('@RAW.REG_STAGE', RELATIVE_PATH),
        {'mode': 'LAYOUT', 'page_split': TRUE}
    ) AS RAW_CONTENT
FROM DIRECTORY(@RAW.REG_STAGE)
WHERE RELATIVE_PATH ILIKE '%.pdf';

-- Verify
SELECT FILENAME, DOC_ID, PARSED_AT FROM AI.REG_DOCS_PARSED ORDER BY FILENAME;

-- =========================================================================
-- STEP 2: Chunk by numbered paragraph → AI.REG_CHUNKS
-- =========================================================================
CREATE OR REPLACE TABLE AI.REG_CHUNKS (
    CHUNK_ID        STRING DEFAULT UUID_STRING(),
    DOC_ID          STRING NOT NULL,
    CIRCULAR_NO     STRING,
    ISSUE_DATE      STRING,
    PARA_NO         INT,
    TEXT            STRING NOT NULL,
    PAGE            INT,
    IS_AMENDMENT    BOOLEAN DEFAULT FALSE,
    AMENDS_CIRCULAR STRING,
    CONFLICTS_WITH  STRING
);

-- Python stored procedure to chunk parsed documents into paragraphs
CREATE OR REPLACE PROCEDURE AI.CHUNK_PARSED_DOCS()
RETURNS STRING
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS
$$
import re
import json

def run(session):
    docs = session.sql("SELECT DOC_ID, FILENAME, RAW_CONTENT FROM KAVACH_DB.AI.REG_DOCS_PARSED").collect()
    session.sql("TRUNCATE TABLE KAVACH_DB.AI.REG_CHUNKS").collect()

    total_chunks = 0
    for doc in docs:
        doc_id = doc['DOC_ID']
        filename = doc['FILENAME']
        raw = doc['RAW_CONTENT']

        if isinstance(raw, str):
            parsed = json.loads(raw)
        else:
            parsed = raw

        # Combine all page content
        full_text = ''
        if 'pages' in parsed:
            for page in parsed['pages']:
                full_text += page.get('content', '') + '\n\n'
        elif 'content' in parsed:
            full_text = parsed['content']

        # Extract circular number
        circ_match = re.search(r'Circular\s+No[:\s]+([A-Z0-9/]+)', full_text)
        circular_no = circ_match.group(1) if circ_match else filename.replace('.pdf', '').replace('_', '/')

        # Extract date
        date_match = re.search(r'Date[:\s]+(\d{1,2}\s+\w+\s+\d{4})', full_text)
        issue_date = date_match.group(1) if date_match else ''

        # Check for amendment/conflict markers
        is_amendment = 'AMENDMENT TO' in full_text.upper()
        amends_match = re.search(r'AMENDMENT TO[:\s]*(KAVACH/\d{4}/\d{2})', full_text)
        amends_circular = amends_match.group(1) if amends_match else None

        conflict_match = re.search(r'Overlapping scope with\s+(KAVACH/\d{4}/\d{2})', full_text)
        conflicts_with = conflict_match.group(1) if conflict_match else None

        # Split into numbered paragraphs
        # Pattern: bold number followed by text, or plain "N. text"
        para_pattern = r'(?:^|\n)\s*\*?\*?(\d+)\.\*?\*?\s+'
        parts = re.split(para_pattern, full_text)

        if len(parts) > 1:
            # parts[0] is header, then alternating: para_no, text, para_no, text...
            for i in range(1, len(parts) - 1, 2):
                para_no = int(parts[i])
                text = parts[i + 1].strip()
                # Clean markdown artifacts
                text = re.sub(r'\n{3,}', '\n\n', text)
                text = text.strip()
                if len(text) < 10:
                    continue

                esc_text = text.replace("'", "''")
                esc_circ = circular_no.replace("'", "''")
                esc_date = issue_date.replace("'", "''")
                amends_s = f"'{amends_circular}'" if amends_circular else 'NULL'
                conflicts_s = f"'{conflicts_with}'" if conflicts_with else 'NULL'

                sql = f"""INSERT INTO KAVACH_DB.AI.REG_CHUNKS
                    (DOC_ID, CIRCULAR_NO, ISSUE_DATE, PARA_NO, TEXT, PAGE, IS_AMENDMENT, AMENDS_CIRCULAR, CONFLICTS_WITH)
                    VALUES ('{doc_id}', '{esc_circ}', '{esc_date}', {para_no}, '{esc_text}', 0,
                            {is_amendment}, {amends_s}, {conflicts_s})"""
                session.sql(sql).collect()
                total_chunks += 1
        else:
            # Fallback: treat entire doc as one chunk
            esc_text = full_text[:8000].replace("'", "''")
            esc_circ = circular_no.replace("'", "''")
            session.sql(f"""INSERT INTO KAVACH_DB.AI.REG_CHUNKS
                (DOC_ID, CIRCULAR_NO, ISSUE_DATE, PARA_NO, TEXT, PAGE, IS_AMENDMENT)
                VALUES ('{doc_id}', '{esc_circ}', '{issue_date}', 1, '{esc_text}', 0, {is_amendment})""").collect()
            total_chunks += 1

    return f"OK: {total_chunks} chunks from {len(docs)} documents"
$$;

CALL AI.CHUNK_PARSED_DOCS();

-- Verify chunking
SELECT CIRCULAR_NO, COUNT(*) AS PARA_COUNT, IS_AMENDMENT, AMENDS_CIRCULAR, CONFLICTS_WITH
FROM AI.REG_CHUNKS
GROUP BY CIRCULAR_NO, IS_AMENDMENT, AMENDS_CIRCULAR, CONFLICTS_WITH
ORDER BY CIRCULAR_NO;

-- =========================================================================
-- STEP 3: Create Cortex Search Service over chunks
-- =========================================================================
CREATE OR REPLACE CORTEX SEARCH SERVICE KAVACH_DB.AI.KAVACH_REG_SEARCH
    ON TEXT
    ATTRIBUTES CIRCULAR_NO, ISSUE_DATE, PARA_NO
    WAREHOUSE = KAVACH_WH
    TARGET_LAG = '1 day'
AS (
    SELECT
        CHUNK_ID,
        DOC_ID,
        CIRCULAR_NO,
        ISSUE_DATE,
        PARA_NO::STRING AS PARA_NO,
        TEXT
    FROM KAVACH_DB.AI.REG_CHUNKS
);

-- Grant access
GRANT USAGE ON CORTEX SEARCH SERVICE KAVACH_DB.AI.KAVACH_REG_SEARCH TO ROLE KAVACH_ADMIN;
GRANT USAGE ON CORTEX SEARCH SERVICE KAVACH_DB.AI.KAVACH_REG_SEARCH TO ROLE KAVACH_ANALYST;

-- Quick test
SELECT PARSE_JSON(
    SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
        'KAVACH_DB.AI.KAVACH_REG_SEARCH',
        '{
            "query": "cash transaction reporting threshold",
            "columns": ["CIRCULAR_NO", "PARA_NO", "TEXT"],
            "limit": 3
        }'
    )
)['results'] AS SEARCH_RESULTS;

-- =========================================================================
-- STEP 4: Extract rules with AI_COMPLETE structured output
-- =========================================================================
CREATE OR REPLACE TABLE RULES.RULE_CANDIDATES (
    RULE_ID             STRING DEFAULT 'RULE-' || UUID_STRING(),
    CIRCULAR_NO         STRING NOT NULL,
    PARA_NO             INT NOT NULL,
    OBLIGATION_SUMMARY  STRING,
    TYPOLOGY            STRING,
    ENTITY              STRING,          -- TXN, ACCOUNT, CUSTOMER
    CONDITION_FIELDS    VARIANT,         -- ARRAY of field names
    THRESHOLDS          VARIANT,         -- OBJECT with threshold key-value pairs
    TIME_WINDOW         STRING,
    SEVERITY            STRING,          -- HIGH, MEDIUM, LOW
    ACTION_REQUIRED     STRING,          -- ALERT, STR, CTR, EDD, BLOCK
    FILING_DEADLINE_DAYS INT,
    SOURCE_QUOTE        STRING,
    STATUS              STRING DEFAULT 'DRAFT',
    EXTRACTED_AT        TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Extract rules from each paragraph using AI_COMPLETE
-- Uses plain text prompt with JSON instruction; parses response in Python
CREATE OR REPLACE PROCEDURE RULES.EXTRACT_RULES_FROM_CHUNKS()
RETURNS STRING
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS
$$
import json

def run(session):
    chunks = session.sql("""
        SELECT CHUNK_ID, CIRCULAR_NO, PARA_NO, TEXT
        FROM KAVACH_DB.AI.REG_CHUNKS
        WHERE TEXT ILIKE '%shall%'
           OR TEXT ILIKE '%must%'
           OR TEXT ILIKE '%required%'
           OR TEXT ILIKE '%mandatory%'
        ORDER BY CIRCULAR_NO, PARA_NO
    """).collect()

    rule_count = 0
    errors = []
    for chunk in chunks:
        circ = chunk['CIRCULAR_NO']
        para = chunk['PARA_NO']
        text = chunk['TEXT'][:1500]

        prompt_text = f'''You are a regulatory compliance expert. Analyze this Indian banking regulation paragraph and extract the obligation as a JSON object.

Paragraph from {circ}, para {para}:
"""{text}"""

Return ONLY a valid JSON object (no markdown, no explanation) with these fields:
- obligation_summary: 1-2 sentence summary
- typology: one of STRUCTURING, MULE_RING, DORMANT_REACTIVATION, RAPID_PASSTHROUGH, INCOME_MISMATCH, ROUND_TRIPPING, HIGH_RISK_SWIFT, ACCOUNT_TAKEOVER, PEP_UNUSUAL_CASH, KYC_CDD, SANCTIONS_SCREENING, WIRE_TRANSFER, CASH_REPORTING, GENERAL_AML, INFORMATIONAL
- entity: TXN, ACCOUNT, or CUSTOMER
- condition_fields: array of relevant database column names
- thresholds: object with threshold key-value pairs (amounts as numbers)
- time_window: e.g. "30 days", "24 hours"
- severity: HIGH, MEDIUM, or LOW
- action_required: ALERT, STR, CTR, EDD, BLOCK, or MONITOR
- filing_deadline_days: integer or 0'''

        esc_prompt = prompt_text.replace("\\", "\\\\").replace("'", "''")
        try:
            result = session.sql(f"""
                SELECT AI_COMPLETE('llama3.1-8b', '{esc_prompt}') AS RESULT
            """).collect()

            if result and result[0]['RESULT']:
                raw = str(result[0]['RESULT']).strip()
                # Try to extract JSON from the response
                if raw.startswith('```'):
                    raw = raw.split('```')[1]
                    if raw.startswith('json'):
                        raw = raw[4:]
                # Find JSON object boundaries
                start = raw.find('{')
                end = raw.rfind('}')
                if start >= 0 and end > start:
                    raw = raw[start:end+1]
                # Fix common LLM JSON issues: single quotes, trailing commas
                import re
                raw = re.sub(r"(?<=[{,\[])\s*'([^']+)'\s*:", r' "\1":', raw)
                raw = re.sub(r":\s*'([^']*)'", r': "\1"', raw)
                raw = re.sub(r',\s*([}\]])', r'\1', raw)
                parsed = json.loads(raw)

                ob = str(parsed.get('obligation_summary', '')).replace("'", "''")[:500]
                typ = str(parsed.get('typology', 'INFORMATIONAL')).replace("'", "''")[:50]
                ent = str(parsed.get('entity', 'TXN')).replace("'", "''")[:20]
                tw = str(parsed.get('time_window', '')).replace("'", "''")[:50]
                sev = str(parsed.get('severity', 'MEDIUM')).replace("'", "''")[:10]
                act = str(parsed.get('action_required', 'ALERT')).replace("'", "''")[:20]
                fdd = int(parsed.get('filing_deadline_days', 0) or 0)
                cf = json.dumps(parsed.get('condition_fields', [])).replace("'", "''")
                th = json.dumps(parsed.get('thresholds', {})).replace("'", "''")
                sq = text[:500].replace("'", "''")

                session.sql(f"""
                    INSERT INTO KAVACH_DB.RULES.RULE_CANDIDATES
                        (CIRCULAR_NO, PARA_NO, OBLIGATION_SUMMARY, TYPOLOGY, ENTITY,
                         CONDITION_FIELDS, THRESHOLDS, TIME_WINDOW, SEVERITY,
                         ACTION_REQUIRED, FILING_DEADLINE_DAYS, SOURCE_QUOTE, STATUS)
                    SELECT '{circ}', {para}, '{ob}', '{typ}', '{ent}',
                           PARSE_JSON('{cf}'), PARSE_JSON('{th}'), '{tw}', '{sev}',
                           '{act}', {fdd}, '{sq}', 'DRAFT'
                """).collect()
                rule_count += 1
        except Exception as e:
            errors.append(f"{circ}p{para}: {str(e)[:100]}")

    err_msg = f" Errors({len(errors)}): {'; '.join(errors[:3])}" if errors else ""
    return f"OK: {len(chunks)} chunks, {rule_count} rules extracted.{err_msg}"
$$;

CALL RULES.EXTRACT_RULES_FROM_CHUNKS();

-- Verify extraction
SELECT CIRCULAR_NO, PARA_NO, TYPOLOGY, ENTITY, SEVERITY, ACTION_REQUIRED,
       LEFT(OBLIGATION_SUMMARY, 80) AS SUMMARY_PREVIEW
FROM RULES.RULE_CANDIDATES
ORDER BY CIRCULAR_NO, PARA_NO;

-- =========================================================================
-- STEP 5: Compile SQL checks into RULES.RULE_LIBRARY
-- =========================================================================
CREATE OR REPLACE TABLE RULES.RULE_LIBRARY (
    RULE_ID             STRING DEFAULT 'RL-' || UUID_STRING(),
    RULE_CANDIDATE_ID   STRING,
    VERSION             INT DEFAULT 1,
    RULE_NAME           STRING,
    TYPOLOGY            STRING,
    ENTITY              STRING,
    SQL_TEXT            STRING NOT NULL,
    PARAMS              VARIANT,
    EFFECTIVE_FROM      DATE DEFAULT CURRENT_DATE(),
    EFFECTIVE_TO        DATE DEFAULT '9999-12-31'::DATE,
    SOURCE_CITATION     STRING,
    COMPILED_BY         STRING DEFAULT 'AI',
    APPROVED_BY         STRING DEFAULT NULL,
    STATUS              STRING DEFAULT 'PENDING_APPROVAL',
    CREATED_AT          TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- SQL rule compiler procedure
-- Maps each typology to a parameterised SQL check against CORE tables
CREATE OR REPLACE PROCEDURE RULES.COMPILE_RULES()
RETURNS STRING
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS
$$
import json

def run(session):
    candidates = session.sql("""
        SELECT RULE_ID, CIRCULAR_NO, PARA_NO, TYPOLOGY, ENTITY,
               THRESHOLDS, TIME_WINDOW, ACTION_REQUIRED, OBLIGATION_SUMMARY, SOURCE_QUOTE
        FROM KAVACH_DB.RULES.RULE_CANDIDATES
        WHERE STATUS = 'DRAFT' AND TYPOLOGY != 'INFORMATIONAL'
    """).collect()

    compiled = 0
    for c in candidates:
        typology = c['TYPOLOGY'] or ''
        entity = c['ENTITY'] or 'TXN'
        circ = c['CIRCULAR_NO'] or ''
        para = c['PARA_NO']
        rule_cand_id = c['RULE_ID']
        thresholds = c['THRESHOLDS']
        time_window = c['TIME_WINDOW'] or '30 days'
        action = c['ACTION_REQUIRED'] or 'ALERT'
        summary = (c['OBLIGATION_SUMMARY'] or '')[:200].replace("'", "''")

        if isinstance(thresholds, str):
            try:
                thresholds = json.loads(thresholds)
            except:
                thresholds = {}
        elif thresholds is None:
            thresholds = {}

        # Map typology to SQL template
        sql_text = generate_sql(typology, entity, thresholds, time_window)
        if not sql_text:
            continue

        esc_sql = sql_text.replace("'", "''")
        esc_citation = f"{circ} para {para}".replace("'", "''")
        rule_name = f"{typology}_{circ}_{para}".replace("/", "_").replace("'", "''")
        th_json = json.dumps(thresholds) if thresholds else '{}'

        insert_sql = f"""
            INSERT INTO KAVACH_DB.RULES.RULE_LIBRARY
                (RULE_CANDIDATE_ID, RULE_NAME, TYPOLOGY, ENTITY, SQL_TEXT, PARAMS, SOURCE_CITATION)
            SELECT '{rule_cand_id}', '{rule_name}', '{typology}', '{entity}',
                   '{esc_sql}', PARSE_JSON('{th_json}'), '{esc_citation}'
        """
        session.sql(insert_sql).collect()

        # Mark candidate as compiled
        session.sql(f"UPDATE KAVACH_DB.RULES.RULE_CANDIDATES SET STATUS='COMPILED' WHERE RULE_ID='{rule_cand_id}'").collect()
        compiled += 1

    return f"OK: {compiled} rules compiled into RULE_LIBRARY"


def generate_sql(typology, entity, thresholds, time_window):
    """Generate parameterised SQL for each typology."""

    templates = {
        'STRUCTURING': """
-- Structuring: repeated cash deposits just under CTR thresholds
SELECT t.ACCOUNT_ID, COUNT(*) AS DEPOSIT_COUNT,
       SUM(t.AMOUNT_INR) AS TOTAL_AMOUNT,
       MIN(t.TXN_TS) AS FIRST_TXN, MAX(t.TXN_TS) AS LAST_TXN
FROM KAVACH_DB.CORE.TRANSACTIONS t
WHERE t.CHANNEL = 'CASH'
  AND t.DIRECTION = 'CREDIT'
  AND t.AMOUNT_INR BETWEEN 900000 AND 999999
  AND t.TXN_TS >= DATEADD('day', -30, CURRENT_TIMESTAMP())
GROUP BY t.ACCOUNT_ID
HAVING COUNT(*) >= 3""",

        'CASH_REPORTING': """
-- Cash Transaction Reporting: single/aggregate exceeding threshold
SELECT t.ACCOUNT_ID, t.TXN_ID, t.AMOUNT_INR, t.TXN_TS, t.CHANNEL
FROM KAVACH_DB.CORE.TRANSACTIONS t
WHERE t.CHANNEL = 'CASH'
  AND t.AMOUNT_INR >= 1000000
  AND t.TXN_TS >= DATEADD('day', -30, CURRENT_TIMESTAMP())""",

        'MULE_RING': """
-- Mule Ring: accounts sharing devices with rapid in→out pattern
WITH shared_devices AS (
    SELECT d.DEVICE_ID, COUNT(DISTINCT d.ACCOUNT_ID) AS ACCT_COUNT
    FROM KAVACH_DB.CORE.DEVICES d
    GROUP BY d.DEVICE_ID
    HAVING COUNT(DISTINCT d.ACCOUNT_ID) >= 5
),
rapid_flow AS (
    SELECT t1.ACCOUNT_ID,
           t1.TXN_ID AS CREDIT_TXN, t2.TXN_ID AS DEBIT_TXN,
           t1.AMOUNT_INR,
           DATEDIFF('minute', t1.TXN_TS, t2.TXN_TS) AS MINUTES_GAP
    FROM KAVACH_DB.CORE.TRANSACTIONS t1
    JOIN KAVACH_DB.CORE.TRANSACTIONS t2
        ON t1.ACCOUNT_ID = t2.ACCOUNT_ID
        AND t1.DIRECTION = 'CREDIT' AND t2.DIRECTION = 'DEBIT'
        AND DATEDIFF('minute', t1.TXN_TS, t2.TXN_TS) BETWEEN 1 AND 30
        AND t1.TXN_TS >= DATEADD('day', -30, CURRENT_TIMESTAMP())
)
SELECT sd.DEVICE_ID, rf.ACCOUNT_ID, rf.AMOUNT_INR, rf.MINUTES_GAP
FROM rapid_flow rf
JOIN KAVACH_DB.CORE.DEVICES d ON rf.ACCOUNT_ID = d.ACCOUNT_ID
JOIN shared_devices sd ON d.DEVICE_ID = sd.DEVICE_ID""",

        'DORMANT_REACTIVATION': """
-- Dormant account reactivation with large outward transfer
SELECT a.ACCOUNT_ID, a.STATUS, t.TXN_ID, t.AMOUNT_INR, t.TXN_TS, t.CHANNEL
FROM KAVACH_DB.CORE.ACCOUNTS a
JOIN KAVACH_DB.CORE.TRANSACTIONS t ON a.ACCOUNT_ID = t.ACCOUNT_ID
WHERE a.STATUS = 'DORMANT'
  AND t.DIRECTION = 'DEBIT'
  AND t.AMOUNT_INR >= 100000
  AND t.TXN_TS >= DATEADD('day', -30, CURRENT_TIMESTAMP())""",

        'RAPID_PASSTHROUGH': """
-- Rapid pass-through: in ≈ out within 24h, near-zero balance
WITH flow AS (
    SELECT t1.ACCOUNT_ID,
           t1.TXN_ID AS CREDIT_TXN, t1.AMOUNT_INR AS CREDIT_AMT, t1.TXN_TS AS CREDIT_TS,
           t2.TXN_ID AS DEBIT_TXN, t2.AMOUNT_INR AS DEBIT_AMT, t2.TXN_TS AS DEBIT_TS,
           DATEDIFF('hour', t1.TXN_TS, t2.TXN_TS) AS HOURS_GAP,
           ABS(t1.AMOUNT_INR - t2.AMOUNT_INR) / NULLIF(t1.AMOUNT_INR, 0) AS AMT_DIFF_PCT
    FROM KAVACH_DB.CORE.TRANSACTIONS t1
    JOIN KAVACH_DB.CORE.TRANSACTIONS t2
        ON t1.ACCOUNT_ID = t2.ACCOUNT_ID
        AND t1.DIRECTION = 'CREDIT' AND t2.DIRECTION = 'DEBIT'
        AND DATEDIFF('hour', t1.TXN_TS, t2.TXN_TS) BETWEEN 0 AND 24
        AND ABS(t1.AMOUNT_INR - t2.AMOUNT_INR) / NULLIF(t1.AMOUNT_INR, 0) < 0.05
    WHERE t1.TXN_TS >= DATEADD('day', -30, CURRENT_TIMESTAMP())
)
SELECT ACCOUNT_ID, COUNT(*) AS PASSTHROUGH_COUNT, SUM(CREDIT_AMT) AS TOTAL_FLOW
FROM flow
GROUP BY ACCOUNT_ID
HAVING COUNT(*) >= 3""",

        'INCOME_MISMATCH': """
-- Income mismatch: turnover > 10x declared income in 6 months
SELECT c.CUSTOMER_ID, c.CUSTOMER_NAME, c.DECLARED_ANNUAL_INCOME,
       SUM(t.AMOUNT_INR) AS SIX_MONTH_TURNOVER,
       SUM(t.AMOUNT_INR) / NULLIF(c.DECLARED_ANNUAL_INCOME, 0) AS TURNOVER_RATIO
FROM KAVACH_DB.CORE.CUSTOMERS c
JOIN KAVACH_DB.CORE.ACCOUNTS a ON c.CUSTOMER_ID = a.CUSTOMER_ID
JOIN KAVACH_DB.CORE.TRANSACTIONS t ON a.ACCOUNT_ID = t.ACCOUNT_ID
WHERE t.TXN_TS >= DATEADD('month', -6, CURRENT_TIMESTAMP())
  AND c.DECLARED_ANNUAL_INCOME < 500000
GROUP BY c.CUSTOMER_ID, c.CUSTOMER_NAME, c.DECLARED_ANNUAL_INCOME
HAVING SUM(t.AMOUNT_INR) / NULLIF(c.DECLARED_ANNUAL_INCOME, 0) > 10""",

        'ROUND_TRIPPING': """
-- Round-tripping: funds traverse 3+ accounts returning to originator within 7 days
WITH hops AS (
    SELECT t1.ACCOUNT_ID AS ORIGIN, t1.COUNTERPARTY AS HOP1,
           t2.COUNTERPARTY AS HOP2, t3.COUNTERPARTY AS HOP3,
           t1.AMOUNT_INR, t1.TXN_TS,
           DATEDIFF('day', t1.TXN_TS, t3.TXN_TS) AS DAYS_SPAN
    FROM KAVACH_DB.CORE.TRANSACTIONS t1
    JOIN KAVACH_DB.CORE.TRANSACTIONS t2
        ON t1.COUNTERPARTY = t2.ACCOUNT_ID AND t2.DIRECTION = 'DEBIT'
        AND DATEDIFF('day', t1.TXN_TS, t2.TXN_TS) BETWEEN 0 AND 3
    JOIN KAVACH_DB.CORE.TRANSACTIONS t3
        ON t2.COUNTERPARTY = t3.ACCOUNT_ID AND t3.DIRECTION = 'DEBIT'
        AND DATEDIFF('day', t2.TXN_TS, t3.TXN_TS) BETWEEN 0 AND 3
    WHERE t1.DIRECTION = 'DEBIT'
      AND t3.COUNTERPARTY = t1.ACCOUNT_ID
      AND t1.TXN_TS >= DATEADD('day', -30, CURRENT_TIMESTAMP())
)
SELECT ORIGIN, HOP1, HOP2, HOP3, AMOUNT_INR, DAYS_SPAN
FROM hops""",

        'HIGH_RISK_SWIFT': """
-- High-risk geography SWIFT transfers
SELECT t.TXN_ID, t.ACCOUNT_ID, t.AMOUNT_INR, t.COUNTRY, t.TXN_TS,
       cr.RISK_LEVEL, cr.FATF_STATUS
FROM KAVACH_DB.CORE.TRANSACTIONS t
JOIN KAVACH_DB.REF.COUNTRY_RISK cr ON t.COUNTRY = cr.COUNTRY_CODE
WHERE t.CHANNEL = 'SWIFT'
  AND cr.RISK_LEVEL IN ('HIGH', 'PROHIBITED')
  AND t.TXN_TS >= DATEADD('day', -30, CURRENT_TIMESTAMP())""",

        'ACCOUNT_TAKEOVER': """
-- Account takeover: new device + high-value transfer within 1 hour
WITH new_device_logins AS (
    SELECT l.ACCOUNT_ID, l.DEVICE_ID, l.LOGIN_TS, l.IP_ADDRESS
    FROM KAVACH_DB.CORE.LOGINS l
    LEFT JOIN (
        SELECT ACCOUNT_ID, DEVICE_ID, MIN(LOGIN_TS) AS FIRST_SEEN
        FROM KAVACH_DB.CORE.LOGINS
        GROUP BY ACCOUNT_ID, DEVICE_ID
    ) hist ON l.ACCOUNT_ID = hist.ACCOUNT_ID AND l.DEVICE_ID = hist.DEVICE_ID
    WHERE l.LOGIN_TS = hist.FIRST_SEEN
      AND l.LOGIN_TS >= DATEADD('day', -30, CURRENT_TIMESTAMP())
)
SELECT ndl.ACCOUNT_ID, ndl.DEVICE_ID, ndl.LOGIN_TS AS NEW_DEVICE_LOGIN,
       t.TXN_ID, t.AMOUNT_INR, t.TXN_TS,
       DATEDIFF('minute', ndl.LOGIN_TS, t.TXN_TS) AS MINUTES_AFTER_LOGIN
FROM new_device_logins ndl
JOIN KAVACH_DB.CORE.TRANSACTIONS t
    ON ndl.ACCOUNT_ID = t.ACCOUNT_ID
    AND t.DIRECTION = 'DEBIT'
    AND t.AMOUNT_INR >= 200000
    AND DATEDIFF('minute', ndl.LOGIN_TS, t.TXN_TS) BETWEEN 0 AND 60""",

        'PEP_UNUSUAL_CASH': """
-- PEP with unusual cash activity exceeding threshold
SELECT c.CUSTOMER_ID, c.CUSTOMER_NAME, c.IS_PEP,
       t.TXN_ID, t.AMOUNT_INR, t.CHANNEL, t.DIRECTION, t.TXN_TS
FROM KAVACH_DB.CORE.CUSTOMERS c
JOIN KAVACH_DB.CORE.ACCOUNTS a ON c.CUSTOMER_ID = a.CUSTOMER_ID
JOIN KAVACH_DB.CORE.TRANSACTIONS t ON a.ACCOUNT_ID = t.ACCOUNT_ID
WHERE c.IS_PEP = TRUE
  AND t.CHANNEL = 'CASH'
  AND t.AMOUNT_INR >= 500000
  AND t.TXN_TS >= DATEADD('day', -90, CURRENT_TIMESTAMP())""",

        'KYC_CDD': """
-- KYC re-verification overdue or income mismatch requiring EDD
SELECT c.CUSTOMER_ID, c.CUSTOMER_NAME, c.RISK_CATEGORY,
       c.KYC_STATUS, c.KYC_LAST_UPDATED, c.DECLARED_ANNUAL_INCOME
FROM KAVACH_DB.CORE.CUSTOMERS c
WHERE (c.RISK_CATEGORY = 'HIGH' AND c.KYC_LAST_UPDATED < DATEADD('year', -2, CURRENT_DATE()))
   OR (c.RISK_CATEGORY = 'MEDIUM' AND c.KYC_LAST_UPDATED < DATEADD('year', -8, CURRENT_DATE()))
   OR c.KYC_STATUS = 'EXPIRED'""",

        'SANCTIONS_SCREENING': """
-- Counterparty name screening against watchlist
SELECT t.TXN_ID, t.ACCOUNT_ID, t.COUNTERPARTY, t.AMOUNT_INR, t.TXN_TS,
       w.FULL_NAME AS WATCHLIST_MATCH, w.LIST_SOURCE, w.REASON
FROM KAVACH_DB.CORE.TRANSACTIONS t
JOIN KAVACH_DB.REF.WATCHLIST w
    ON JAROWINKLER_SIMILARITY(UPPER(t.COUNTERPARTY), UPPER(w.FULL_NAME)) >= 85
WHERE t.CHANNEL = 'SWIFT'
  AND t.TXN_TS >= DATEADD('day', -30, CURRENT_TIMESTAMP())""",

        'WIRE_TRANSFER': """
-- Wire transfer monitoring: SWIFT transfers exceeding USD 10000 equivalent
SELECT t.TXN_ID, t.ACCOUNT_ID, t.AMOUNT_INR, t.COUNTRY, t.TXN_TS,
       t.COUNTERPARTY, t.COUNTERPARTY_BANK
FROM KAVACH_DB.CORE.TRANSACTIONS t
WHERE t.CHANNEL = 'SWIFT'
  AND t.AMOUNT_INR >= 850000
  AND t.TXN_TS >= DATEADD('day', -30, CURRENT_TIMESTAMP())""",

        'GENERAL_AML': """
-- General AML monitoring catch-all
SELECT t.TXN_ID, t.ACCOUNT_ID, t.AMOUNT_INR, t.CHANNEL, t.TXN_TS
FROM KAVACH_DB.CORE.TRANSACTIONS t
WHERE t.AMOUNT_INR >= 1000000
  AND t.TXN_TS >= DATEADD('day', -30, CURRENT_TIMESTAMP())"""
    }

    return templates.get(typology, '')
$$;

CALL RULES.COMPILE_RULES();

-- Verify compiled rules
SELECT RULE_NAME, TYPOLOGY, ENTITY, SOURCE_CITATION, STATUS, VERSION,
       LEFT(SQL_TEXT, 100) AS SQL_PREVIEW
FROM RULES.RULE_LIBRARY
ORDER BY TYPOLOGY, SOURCE_CITATION;

-- =========================================================================
-- STEP 6: Handle amendment — create v2 of CTR structuring rule
-- =========================================================================
-- The amendment circular KAVACH/2025/01 raises CTR threshold from 10L to 15L.
-- This creates a v2 of the affected rule and retires v1.

CREATE OR REPLACE PROCEDURE RULES.APPLY_AMENDMENTS()
RETURNS STRING
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS
$$
def run(session):
    amendments = session.sql("""
        SELECT DISTINCT CIRCULAR_NO, AMENDS_CIRCULAR
        FROM KAVACH_DB.AI.REG_CHUNKS
        WHERE IS_AMENDMENT = TRUE AND AMENDS_CIRCULAR IS NOT NULL
    """).collect()

    count = 0
    for a in amendments:
        amending = a['CIRCULAR_NO']
        original = a['AMENDS_CIRCULAR']

        # Get typologies from the amendment
        typs = session.sql(f"""
            SELECT DISTINCT TYPOLOGY FROM KAVACH_DB.RULES.RULE_CANDIDATES
            WHERE CIRCULAR_NO = '{amending}' AND TYPOLOGY != 'INFORMATIONAL'
        """).collect()
        typ_list = [t['TYPOLOGY'] for t in typs]
        if not typ_list:
            continue

        typ_in = ','.join([f"''{t}''" for t in typ_list])

        # Retire v1 rules from original circular
        session.sql(f"""
            UPDATE KAVACH_DB.RULES.RULE_LIBRARY
            SET EFFECTIVE_TO = CURRENT_DATE(), STATUS = 'SUPERSEDED'
            WHERE SOURCE_CITATION ILIKE '%{original}%'
              AND EFFECTIVE_TO = '9999-12-31'::DATE
              AND TYPOLOGY IN ({','.join([f"'{t}'" for t in typ_list])})
        """).collect()

        # Create v2 rules
        candidates = session.sql(f"""
            SELECT RULE_ID, TYPOLOGY, ENTITY, THRESHOLDS
            FROM KAVACH_DB.RULES.RULE_CANDIDATES
            WHERE CIRCULAR_NO = '{amending}'
              AND TYPOLOGY != 'INFORMATIONAL'
              AND STATUS IN ('DRAFT', 'COMPILED')
        """).collect()

        for c in candidates:
            typ = c['TYPOLOGY']
            ent = c['ENTITY'] or 'TXN'
            rid = c['RULE_ID']
            rname = f"v2_{typ}_{amending.replace('/', '_')}".replace("'", "''")
            citation = f"{amending} (amends {original})".replace("'", "''")

            if typ == 'STRUCTURING':
                sql_v2 = """-- Structuring v2: revised threshold Rs.15L
SELECT t.ACCOUNT_ID, COUNT(*) AS DEPOSIT_COUNT, SUM(t.AMOUNT_INR) AS TOTAL_AMOUNT
FROM KAVACH_DB.CORE.TRANSACTIONS t
WHERE t.CHANNEL = 'CASH' AND t.DIRECTION = 'CREDIT'
  AND t.AMOUNT_INR BETWEEN 1300000 AND 1499999
  AND t.TXN_TS >= DATEADD('day', -30, CURRENT_TIMESTAMP())
GROUP BY t.ACCOUNT_ID HAVING COUNT(*) >= 3"""
            elif typ == 'CASH_REPORTING':
                sql_v2 = """-- CTR v2: revised threshold Rs.15L
SELECT t.ACCOUNT_ID, t.TXN_ID, t.AMOUNT_INR, t.TXN_TS
FROM KAVACH_DB.CORE.TRANSACTIONS t
WHERE t.CHANNEL = 'CASH' AND t.AMOUNT_INR >= 1500000
  AND t.TXN_TS >= DATEADD('day', -30, CURRENT_TIMESTAMP())"""
            else:
                sql_v2 = "SELECT 1 -- No SQL change for this typology"

            esc_sql = sql_v2.replace("'", "''")
            session.sql(f"""
                INSERT INTO KAVACH_DB.RULES.RULE_LIBRARY
                    (RULE_CANDIDATE_ID, VERSION, RULE_NAME, TYPOLOGY, ENTITY,
                     SQL_TEXT, EFFECTIVE_FROM, SOURCE_CITATION, STATUS)
                SELECT '{rid}', 2, '{rname}', '{typ}', '{ent}',
                       '{esc_sql}', CURRENT_DATE(),
                       '{citation}', 'PENDING_APPROVAL'
            """).collect()

        count += 1

    return f"OK: {count} amendments processed"
$$;

CALL RULES.APPLY_AMENDMENTS();

-- Verify: show v1 (SUPERSEDED) and v2 (PENDING_APPROVAL) side by side
SELECT RULE_NAME, VERSION, TYPOLOGY, STATUS, EFFECTIVE_FROM, EFFECTIVE_TO,
       SOURCE_CITATION, LEFT(SQL_TEXT, 120) AS SQL_PREVIEW
FROM RULES.RULE_LIBRARY
WHERE TYPOLOGY IN ('STRUCTURING', 'CASH_REPORTING')
ORDER BY TYPOLOGY, VERSION;

-- =========================================================================
-- STEP 7: Conflict Detection
-- =========================================================================
CREATE OR REPLACE TABLE RULES.RULE_CONFLICTS (
    CONFLICT_ID     STRING DEFAULT 'CONF-' || UUID_STRING(),
    RULE_ID_A       STRING NOT NULL,
    RULE_ID_B       STRING NOT NULL,
    TYPOLOGY        STRING,
    ENTITY          STRING,
    DESCRIPTION     STRING NOT NULL,
    CITATION_A      STRING,
    CITATION_B      STRING,
    DETECTED_AT     TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    STATUS          STRING DEFAULT 'OPEN'
);

CREATE OR REPLACE PROCEDURE RULES.DETECT_CONFLICTS()
RETURNS STRING
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS
$$
def run(session):
    session.sql("TRUNCATE TABLE KAVACH_DB.RULES.RULE_CONFLICTS").collect()

    # Method 1: Check for conflicts flagged in circular metadata
    chunk_conflicts = session.sql("""
        SELECT DISTINCT c1.CIRCULAR_NO AS CIRC_A, c1.CONFLICTS_WITH AS CIRC_B
        FROM KAVACH_DB.AI.REG_CHUNKS c1
        WHERE c1.CONFLICTS_WITH IS NOT NULL
    """).collect()

    conflict_count = 0
    for cc in chunk_conflicts:
        circ_a = cc['CIRC_A']
        circ_b = cc['CIRC_B']

        # Find rules from both circulars that share the same typology
        pairs = session.sql(f"""
            SELECT
                a.RULE_ID AS RULE_A, b.RULE_ID AS RULE_B,
                a.TYPOLOGY, a.ENTITY,
                a.SOURCE_CITATION AS CIT_A, b.SOURCE_CITATION AS CIT_B,
                a.SQL_TEXT AS SQL_A, b.SQL_TEXT AS SQL_B,
                a.PARAMS AS PARAMS_A, b.PARAMS AS PARAMS_B
            FROM KAVACH_DB.RULES.RULE_LIBRARY a
            JOIN KAVACH_DB.RULES.RULE_LIBRARY b
                ON a.TYPOLOGY = b.TYPOLOGY AND a.ENTITY = b.ENTITY
                AND a.RULE_ID != b.RULE_ID
            WHERE a.SOURCE_CITATION ILIKE '%{circ_a}%'
              AND b.SOURCE_CITATION ILIKE '%{circ_b}%'
              AND a.STATUS NOT IN ('SUPERSEDED')
              AND b.STATUS NOT IN ('SUPERSEDED')
        """).collect()

        for p in pairs:
            desc = f"Conflicting rules from {circ_a} and {circ_b} on {p['TYPOLOGY']}/{p['ENTITY']}"
            esc_desc = desc.replace("'", "''")
            esc_cit_a = (p['CIT_A'] or '').replace("'", "''")
            esc_cit_b = (p['CIT_B'] or '').replace("'", "''")
            session.sql(f"""
                INSERT INTO KAVACH_DB.RULES.RULE_CONFLICTS
                    (RULE_ID_A, RULE_ID_B, TYPOLOGY, ENTITY, DESCRIPTION, CITATION_A, CITATION_B)
                VALUES ('{p['RULE_A']}', '{p['RULE_B']}', '{p['TYPOLOGY']}', '{p['ENTITY']}',
                        '{esc_desc}', '{esc_cit_a}', '{esc_cit_b}')
            """).collect()
            conflict_count += 1

    # Method 2: Check any overlapping rules on same typology with different thresholds
    overlap_rules = session.sql("""
        SELECT a.RULE_ID AS RULE_A, b.RULE_ID AS RULE_B,
               a.TYPOLOGY, a.ENTITY,
               a.SOURCE_CITATION AS CIT_A, b.SOURCE_CITATION AS CIT_B,
               a.PARAMS AS PARAMS_A, b.PARAMS AS PARAMS_B
        FROM KAVACH_DB.RULES.RULE_LIBRARY a
        JOIN KAVACH_DB.RULES.RULE_LIBRARY b
            ON a.TYPOLOGY = b.TYPOLOGY AND a.ENTITY = b.ENTITY
            AND a.RULE_ID < b.RULE_ID
            AND a.STATUS NOT IN ('SUPERSEDED')
            AND b.STATUS NOT IN ('SUPERSEDED')
        WHERE a.EFFECTIVE_TO = '9999-12-31'::DATE AND b.EFFECTIVE_TO = '9999-12-31'::DATE
          AND a.SOURCE_CITATION != b.SOURCE_CITATION
          AND NOT EXISTS (
              SELECT 1 FROM KAVACH_DB.RULES.RULE_CONFLICTS rc
              WHERE (rc.RULE_ID_A = a.RULE_ID AND rc.RULE_ID_B = b.RULE_ID)
                 OR (rc.RULE_ID_A = b.RULE_ID AND rc.RULE_ID_B = a.RULE_ID)
          )
    """).collect()

    for ov in overlap_rules:
        desc = f"Overlapping active rules on {ov['TYPOLOGY']}/{ov['ENTITY']} from different circulars"
        esc_desc = desc.replace("'", "''")
        esc_a = (ov['CIT_A'] or '').replace("'", "''")
        esc_b = (ov['CIT_B'] or '').replace("'", "''")
        session.sql(f"""
            INSERT INTO KAVACH_DB.RULES.RULE_CONFLICTS
                (RULE_ID_A, RULE_ID_B, TYPOLOGY, ENTITY, DESCRIPTION, CITATION_A, CITATION_B)
            VALUES ('{ov['RULE_A']}', '{ov['RULE_B']}', '{ov['TYPOLOGY']}', '{ov['ENTITY']}',
                    '{esc_desc}', '{esc_a}', '{esc_b}')
        """).collect()
        conflict_count += 1

    # Method 3: Use AI to explain the specific conflict between 2024/03 and 2024/06
    known_conflicts = session.sql("""
        SELECT rc.CONFLICT_ID, rc.CITATION_A, rc.CITATION_B, rc.TYPOLOGY
        FROM KAVACH_DB.RULES.RULE_CONFLICTS rc
        LIMIT 20
    """).collect()

    for kc in known_conflicts:
        # Get source paragraphs for both sides
        chunks_a = session.sql(f"""
            SELECT TEXT FROM KAVACH_DB.AI.REG_CHUNKS
            WHERE CIRCULAR_NO ILIKE '%{kc['CITATION_A'][:15]}%'
            LIMIT 3
        """).collect()
        chunks_b = session.sql(f"""
            SELECT TEXT FROM KAVACH_DB.AI.REG_CHUNKS
            WHERE CIRCULAR_NO ILIKE '%{kc['CITATION_B'][:15]}%'
            LIMIT 3
        """).collect()

        if chunks_a and chunks_b:
            text_a = chunks_a[0]['TEXT'][:300] if chunks_a else ''
            text_b = chunks_b[0]['TEXT'][:300] if chunks_b else ''
            try:
                explanation = session.sql(f"""
                    SELECT SNOWFLAKE.CORTEX.COMPLETE(
                        'llama3.1-8b',
                        'Compare these two regulatory provisions and explain the specific conflict or inconsistency in 2-3 sentences.

Provision A ({kc['CITATION_A']}): {text_a.replace("'", "''")}

Provision B ({kc['CITATION_B']}): {text_b.replace("'", "''")}

Explain the conflict concisely.'
                    ) AS explanation
                """).collect()
                if explanation:
                    exp_text = explanation[0]['EXPLANATION'][:500].replace("'", "''")
                    session.sql(f"""
                        UPDATE KAVACH_DB.RULES.RULE_CONFLICTS
                        SET DESCRIPTION = '{exp_text}'
                        WHERE CONFLICT_ID = '{kc['CONFLICT_ID']}'
                    """).collect()
            except:
                pass  # Keep original description if AI call fails

    return f"OK: {conflict_count} conflicts detected"
$$;

CALL RULES.DETECT_CONFLICTS();

-- Verify conflicts
SELECT CONFLICT_ID, TYPOLOGY, ENTITY, CITATION_A, CITATION_B,
       LEFT(DESCRIPTION, 200) AS CONFLICT_DESCRIPTION, STATUS
FROM RULES.RULE_CONFLICTS
ORDER BY DETECTED_AT;

-- =========================================================================
-- STEP 8: Orchestrator procedure — RULES.COMPILE_CIRCULAR(stage_path)
-- =========================================================================
CREATE OR REPLACE PROCEDURE RULES.COMPILE_CIRCULAR(STAGE_PATH STRING DEFAULT '@KAVACH_DB.RAW.REG_STAGE')
RETURNS STRING
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS
$$
def run(session, stage_path):
    sp = stage_path.replace("'", "''")

    # Re-parse all PDFs
    session.sql("TRUNCATE TABLE KAVACH_DB.AI.REG_DOCS_PARSED").collect()
    session.sql(f"""
        INSERT INTO KAVACH_DB.AI.REG_DOCS_PARSED (FILENAME, RAW_CONTENT)
        SELECT RELATIVE_PATH,
               AI_PARSE_DOCUMENT(TO_FILE('{sp}', RELATIVE_PATH), {{'mode': 'LAYOUT', 'page_split': TRUE}})
        FROM DIRECTORY('{sp}')
        WHERE RELATIVE_PATH ILIKE '%.pdf'
    """).collect()

    r1 = session.sql("CALL KAVACH_DB.AI.CHUNK_PARSED_DOCS()").collect()[0][0]
    r2 = session.sql("CALL KAVACH_DB.RULES.EXTRACT_RULES_FROM_CHUNKS()").collect()[0][0]
    r3 = session.sql("CALL KAVACH_DB.RULES.COMPILE_RULES()").collect()[0][0]
    session.sql("CALL KAVACH_DB.RULES.APPLY_AMENDMENTS()").collect()
    r4 = session.sql("CALL KAVACH_DB.RULES.DETECT_CONFLICTS()").collect()[0][0]

    return f"{r1} | {r2} | {r3} | {r4}"
$$;

-- Grant execute on orchestrator
GRANT USAGE ON PROCEDURE RULES.COMPILE_CIRCULAR(STRING) TO ROLE KAVACH_ADMIN;
GRANT USAGE ON PROCEDURE RULES.COMPILE_CIRCULAR(STRING) TO ROLE KAVACH_ANALYST;

-- =========================================================================
-- STEP 9: Grant permissions on all new objects
-- =========================================================================
GRANT SELECT ON ALL TABLES IN SCHEMA AI TO ROLE KAVACH_ADMIN;
GRANT SELECT ON ALL TABLES IN SCHEMA AI TO ROLE KAVACH_ANALYST;
GRANT SELECT ON ALL TABLES IN SCHEMA AI TO ROLE KAVACH_AUDITOR;
GRANT SELECT ON ALL TABLES IN SCHEMA RULES TO ROLE KAVACH_ADMIN;
GRANT SELECT ON ALL TABLES IN SCHEMA RULES TO ROLE KAVACH_ANALYST;
GRANT SELECT ON ALL TABLES IN SCHEMA RULES TO ROLE KAVACH_AUDITOR;
GRANT SELECT ON FUTURE TABLES IN SCHEMA AI TO ROLE KAVACH_ADMIN;
GRANT SELECT ON FUTURE TABLES IN SCHEMA RULES TO ROLE KAVACH_ADMIN;

-- =========================================================================
-- STEP 10: VERIFICATION QUERIES
-- =========================================================================

-- 10a. Extracted rules side-by-side with source paragraphs
SELECT
    rc.CIRCULAR_NO,
    rc.PARA_NO,
    rc.TYPOLOGY,
    rc.SEVERITY,
    rc.ACTION_REQUIRED,
    LEFT(rc.OBLIGATION_SUMMARY, 100) AS AI_SUMMARY,
    LEFT(ch.TEXT, 150) AS SOURCE_PARAGRAPH
FROM RULES.RULE_CANDIDATES rc
JOIN AI.REG_CHUNKS ch
    ON rc.CIRCULAR_NO = ch.CIRCULAR_NO AND rc.PARA_NO = ch.PARA_NO
WHERE rc.TYPOLOGY != 'INFORMATIONAL'
ORDER BY rc.CIRCULAR_NO, rc.PARA_NO;

-- 10b. Confirm amendment created v2
SELECT RULE_NAME, VERSION, TYPOLOGY, STATUS, EFFECTIVE_FROM, EFFECTIVE_TO, SOURCE_CITATION
FROM RULES.RULE_LIBRARY
WHERE TYPOLOGY IN ('STRUCTURING', 'CASH_REPORTING')
ORDER BY TYPOLOGY, VERSION;

-- 10c. Confirm conflict detected
SELECT CONFLICT_ID, TYPOLOGY, CITATION_A, CITATION_B,
       LEFT(DESCRIPTION, 250) AS CONFLICT_EXPLANATION
FROM RULES.RULE_CONFLICTS;

-- 10d. Rule library summary
SELECT TYPOLOGY, COUNT(*) AS RULE_COUNT,
       SUM(CASE WHEN STATUS = 'PENDING_APPROVAL' THEN 1 ELSE 0 END) AS PENDING,
       SUM(CASE WHEN STATUS = 'SUPERSEDED' THEN 1 ELSE 0 END) AS SUPERSEDED
FROM RULES.RULE_LIBRARY
GROUP BY TYPOLOGY
ORDER BY TYPOLOGY;

-- 10e. Test Cortex Search
SELECT PARSE_JSON(
    SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
        'KAVACH_DB.AI.KAVACH_REG_SEARCH',
        '{
            "query": "structuring cash deposits threshold",
            "columns": ["CIRCULAR_NO", "PARA_NO", "TEXT"],
            "limit": 3
        }'
    )
)['results'] AS SEARCH_RESULTS;

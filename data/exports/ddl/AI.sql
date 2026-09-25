create or replace schema KAVACH_DB.AI COMMENT='Cortex AI artefacts — search, agents, semantic views';

create or replace TABLE KAVACH_DB.AI.AGENT_EVAL_DATA (
	EVAL_ID VARCHAR(16777216),
	QUESTION_CATEGORY VARCHAR(16777216),
	INPUT_QUERY VARCHAR(16777216),
	GROUND_TRUTH VARIANT
);
create or replace TABLE KAVACH_DB.AI.ALERT_STORIES (
	ALERT_ID VARCHAR(16777216) NOT NULL,
	STORY_EN VARCHAR(16777216),
	STORY_HI VARCHAR(16777216),
	GENERATED_AT TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP(),
	MODEL_USED VARCHAR(16777216),
	primary key (ALERT_ID)
);
create or replace TABLE KAVACH_DB.AI.REG_CHUNKS (
	CHUNK_ID VARCHAR(16777216) DEFAULT UUID_STRING(),
	DOC_ID VARCHAR(16777216) NOT NULL,
	CIRCULAR_NO VARCHAR(16777216),
	ISSUE_DATE VARCHAR(16777216),
	PARA_NO NUMBER(38,0),
	TEXT VARCHAR(16777216) NOT NULL,
	PAGE NUMBER(38,0),
	IS_AMENDMENT BOOLEAN DEFAULT FALSE,
	AMENDS_CIRCULAR VARCHAR(16777216),
	CONFLICTS_WITH VARCHAR(16777216)
);
create or replace TABLE KAVACH_DB.AI.REG_DOCS_PARSED (
	DOC_ID VARCHAR(16777216) DEFAULT UUID_STRING(),
	FILENAME VARCHAR(16777216) NOT NULL,
	RAW_CONTENT VARIANT NOT NULL,
	PARSED_AT TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP()
);
create or replace view KAVACH_DB.AI.DEADLINE_CLOCK(
	ALERT_ID,
	ACCOUNT_ID,
	TYPOLOGY,
	CREATED_AT,
	DUE_DATE,
	HOURS_REMAINING,
	STATUS
) as
SELECT 
    a.alert_id,
    a.account_id,
    a.typology,
    a.created_at,
    DATEADD('day', 30, a.created_at) AS due_date,
    DATEDIFF('hour', CURRENT_TIMESTAMP(), DATEADD('day', 30, a.created_at)) AS hours_remaining,
    CASE 
        WHEN DATEDIFF('hour', CURRENT_TIMESTAMP(), DATEADD('day', 30, a.created_at)) < 0 THEN 'RED'
        WHEN DATEDIFF('hour', CURRENT_TIMESTAMP(), DATEADD('day', 30, a.created_at)) <= 48 THEN 'AMBER'
        ELSE 'GREEN'
    END AS status
FROM CORE.ALERTS a
WHERE a.status NOT LIKE 'CLOSED_%'
ORDER BY hours_remaining ASC;
create or replace view KAVACH_DB.AI.READINESS_SCORE(
	READINESS_SCORE,
	REASON
) as
WITH metrics AS (
    SELECT 
        COUNT(DISTINCT CASE WHEN r.status = 'APPROVED' THEN r.rule_id END) * 100.0 / NULLIF(COUNT(DISTINCT r.rule_id), 0) AS coverage_pct,
        COUNT(DISTINCT CASE WHEN d.status = 'GREEN' THEN d.alert_id END) * 100.0 / NULLIF(COUNT(DISTINCT d.alert_id), 0) AS deadline_pct,
        COUNT(DISTINCT e.alert_id) * 100.0 / NULLIF(COUNT(DISTINCT CASE WHEN a.status LIKE 'CLOSED_%' THEN a.alert_id END), 0) AS evidence_pct
    FROM RULES.RULE_LIBRARY r
    CROSS JOIN AI.DEADLINE_CLOCK d
    CROSS JOIN CORE.ALERTS a
    LEFT JOIN AUDIT.EVIDENCE_REGISTRY e ON a.alert_id = e.alert_id
)
SELECT 
    ROUND((COALESCE(coverage_pct, 0) * 0.25 + COALESCE(deadline_pct, 0) * 0.30 + COALESCE(evidence_pct, 0) * 0.30), 0) AS readiness_score,
    CASE 
        WHEN (COALESCE(coverage_pct, 0) * 0.25 + COALESCE(deadline_pct, 0) * 0.30 + COALESCE(evidence_pct, 0) * 0.30) >= 80 THEN 'Strong compliance posture'
        WHEN (COALESCE(coverage_pct, 0) * 0.25 + COALESCE(deadline_pct, 0) * 0.30 + COALESCE(coverage_pct, 0) * 0.30) >= 60 THEN 'Moderate gaps'
        ELSE 'Critical gaps in coverage or timeliness'
    END AS reason
FROM metrics;
create or replace view KAVACH_DB.AI.RULE_HEALTH(
	RULE_ID,
	RULE_NAME,
	SOURCE_CITATION,
	ALERT_COUNT,
	TRUE_POSITIVES,
	PRECISION
) as
SELECT 
    r.rule_id,
    r.rule_name,
    r.source_citation,
    COUNT(DISTINCT a.alert_id) AS alert_count,
    COUNT(DISTINCT CASE WHEN f.verdict = 'FRAUD' THEN f.alert_id END) AS true_positives,
    DIV0NULL(
        COUNT(DISTINCT CASE WHEN f.verdict = 'FRAUD' THEN f.alert_id END),
        COUNT(DISTINCT a.alert_id)
    ) AS precision
FROM RULES.RULE_LIBRARY r
LEFT JOIN CORE.ALERTS a ON r.rule_id = a.rule_id
LEFT JOIN CORE.ANALYST_FEEDBACK f ON a.alert_id = f.alert_id
GROUP BY r.rule_id, r.rule_name, r.source_citation;
CREATE OR REPLACE PROCEDURE KAVACH_DB.AI.BUILD_EVIDENCE_PACK("P_ALERT_ID" VARCHAR)
RETURNS VARIANT
LANGUAGE SQL
EXECUTE AS CALLER
AS '
DECLARE
    evidence VARIANT;
    evidence_str VARCHAR;
    hash_val VARCHAR;
    file_rel_path VARCHAR;
    ref_date TIMESTAMP_NTZ;
BEGIN
    ref_date := (SELECT MAX(created_at) FROM KAVACH_DB.CORE.ALERTS);

    WITH timeline_agg AS (
        SELECT account_id,
            ARRAY_AGG(OBJECT_CONSTRUCT(
                ''txn_ts'', txn_ts,
                ''amount_inr'', amount_inr,
                ''channel'', channel,
                ''direction'', direction,
                ''counterparty'', counterparty
            )) WITHIN GROUP (ORDER BY txn_ts DESC) AS timeline
        FROM KAVACH_DB.CORE.TRANSACTIONS
        WHERE txn_ts >= DATEADD(''day'', -30, :ref_date)
        GROUP BY account_id
    ),
    ml_agg AS (
        SELECT account_id,
            ARRAY_CONSTRUCT_COMPACT(
                IFF(driver_1_feature IS NOT NULL, OBJECT_CONSTRUCT(''feature'', driver_1_feature, ''shap_value'', driver_1_shap), NULL),
                IFF(driver_2_feature IS NOT NULL, OBJECT_CONSTRUCT(''feature'', driver_2_feature, ''shap_value'', driver_2_shap), NULL),
                IFF(driver_3_feature IS NOT NULL, OBJECT_CONSTRUCT(''feature'', driver_3_feature, ''shap_value'', driver_3_shap), NULL)
            ) AS ml_drivers
        FROM KAVACH_DB.ML.RISK_SCORE_EXPLANATIONS
    ),
    notes_agg AS (
        SELECT account_id,
            ARRAY_AGG(OBJECT_CONSTRUCT(
                ''analyst'', analyst,
                ''feedback'', notes,
                ''is_fraud'', IFF(verdict = ''TRUE_POSITIVE'', TRUE, FALSE),
                ''commented_at'', feedback_ts
            )) AS analyst_notes
        FROM KAVACH_DB.CORE.ANALYST_FEEDBACK
        GROUP BY account_id
    )
    SELECT OBJECT_CONSTRUCT(
        ''alert_id'', a.alert_id,
        ''case_summary'', OBJECT_CONSTRUCT(
            ''account_id'', a.account_id,
            ''customer_id'', a.customer_id,
            ''typology'', a.typology,
            ''severity'', a.severity,
            ''score'', a.score,
            ''status'', a.status,
            ''created_at'', a.created_at
        ),
        ''rule'', OBJECT_CONSTRUCT(
            ''rule_id'', r.rule_id,
            ''rule_name'', r.rule_name,
            ''version'', r.version,
            ''source_citation'', r.source_citation,
            ''status'', r.status
        ),
        ''timeline'', tx.timeline,
        ''ml_drivers'', ml.ml_drivers,
        ''analyst_notes'', n.analyst_notes,
        ''generated_at'', CURRENT_TIMESTAMP()
    ) INTO evidence
    FROM KAVACH_DB.CORE.ALERTS a
    LEFT JOIN KAVACH_DB.RULES.RULE_LIBRARY r ON a.rule_id = r.rule_id
    LEFT JOIN timeline_agg tx ON tx.account_id = a.account_id
    LEFT JOIN ml_agg ml ON ml.account_id = a.account_id
    LEFT JOIN notes_agg n ON n.account_id = a.account_id
    WHERE a.alert_id = :p_alert_id;

    evidence_str := TO_JSON(evidence);
    hash_val := SHA2(evidence_str, 256);
    file_rel_path := ''evidence_'' || :p_alert_id || ''.json'';

    EXECUTE IMMEDIATE ''COPY INTO @KAVACH_DB.APP.EVIDENCE_STAGE/'' || file_rel_path ||
        '' FROM (SELECT ?) FILE_FORMAT = (TYPE = CSV FIELD_DELIMITER = NONE RECORD_DELIMITER = NONE FIELD_OPTIONALLY_ENCLOSED_BY = NONE ESCAPE_UNENCLOSED_FIELD = NONE COMPRESSION = NONE) SINGLE = TRUE OVERWRITE = TRUE HEADER = FALSE''
        USING (evidence_str);

    DELETE FROM KAVACH_DB.AUDIT.EVIDENCE_REGISTRY WHERE alert_id = :p_alert_id;
    INSERT INTO KAVACH_DB.AUDIT.EVIDENCE_REGISTRY (alert_id, evidence_json, file_path, sha256_hash, created_by)
    SELECT :p_alert_id, :evidence, :file_rel_path, :hash_val, CURRENT_USER();

    RETURN evidence;
END;
';
CREATE OR REPLACE PROCEDURE KAVACH_DB.AI.CHUNK_PARSED_DOCS()
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
ARTIFACT_REPOSITORY = snowflake.snowpark.pypi_shared_repository
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS '
import re
import json

def run(session):
    docs = session.sql("SELECT DOC_ID, FILENAME, RAW_CONTENT FROM KAVACH_DB.AI.REG_DOCS_PARSED").collect()
    session.sql("TRUNCATE TABLE KAVACH_DB.AI.REG_CHUNKS").collect()

    total_chunks = 0
    for doc in docs:
        doc_id = doc[''DOC_ID'']
        filename = doc[''FILENAME'']
        raw = doc[''RAW_CONTENT'']

        if isinstance(raw, str):
            parsed = json.loads(raw)
        else:
            parsed = raw

        # Combine all page content
        full_text = ''''
        if ''pages'' in parsed:
            for page in parsed[''pages'']:
                full_text += page.get(''content'', '''') + ''\\n\\n''
        elif ''content'' in parsed:
            full_text = parsed[''content'']

        # Extract circular number
        circ_match = re.search(r''Circular\\s+No[:\\s]+([A-Z0-9/]+)'', full_text)
        circular_no = circ_match.group(1) if circ_match else filename.replace(''.pdf'', '''').replace(''_'', ''/'')

        # Extract date
        date_match = re.search(r''Date[:\\s]+(\\d{1,2}\\s+\\w+\\s+\\d{4})'', full_text)
        issue_date = date_match.group(1) if date_match else ''''

        # Check for amendment/conflict markers
        is_amendment = ''AMENDMENT TO'' in full_text.upper()
        amends_match = re.search(r''AMENDMENT TO[:\\s]*(KAVACH/\\d{4}/\\d{2})'', full_text)
        amends_circular = amends_match.group(1) if amends_match else None

        conflict_match = re.search(r''Overlapping scope with\\s+(KAVACH/\\d{4}/\\d{2})'', full_text)
        conflicts_with = conflict_match.group(1) if conflict_match else None

        # Split into numbered paragraphs
        # Pattern: bold number followed by text, or plain "N. text"
        para_pattern = r''(?:^|\\n)\\s*\\*?\\*?(\\d+)\\.\\*?\\*?\\s+''
        parts = re.split(para_pattern, full_text)

        if len(parts) > 1:
            # parts[0] is header, then alternating: para_no, text, para_no, text...
            for i in range(1, len(parts) - 1, 2):
                para_no = int(parts[i])
                text = parts[i + 1].strip()
                # Clean markdown artifacts
                text = re.sub(r''\\n{3,}'', ''\\n\\n'', text)
                text = text.strip()
                if len(text) < 10:
                    continue

                esc_text = text.replace("''", "''''")
                esc_circ = circular_no.replace("''", "''''")
                esc_date = issue_date.replace("''", "''''")
                amends_s = f"''{amends_circular}''" if amends_circular else ''NULL''
                conflicts_s = f"''{conflicts_with}''" if conflicts_with else ''NULL''

                sql = f"""INSERT INTO KAVACH_DB.AI.REG_CHUNKS
                    (DOC_ID, CIRCULAR_NO, ISSUE_DATE, PARA_NO, TEXT, PAGE, IS_AMENDMENT, AMENDS_CIRCULAR, CONFLICTS_WITH)
                    VALUES (''{doc_id}'', ''{esc_circ}'', ''{esc_date}'', {para_no}, ''{esc_text}'', 0,
                            {is_amendment}, {amends_s}, {conflicts_s})"""
                session.sql(sql).collect()
                total_chunks += 1
        else:
            # Fallback: treat entire doc as one chunk
            esc_text = full_text[:8000].replace("''", "''''")
            esc_circ = circular_no.replace("''", "''''")
            session.sql(f"""INSERT INTO KAVACH_DB.AI.REG_CHUNKS
                (DOC_ID, CIRCULAR_NO, ISSUE_DATE, PARA_NO, TEXT, PAGE, IS_AMENDMENT)
                VALUES (''{doc_id}'', ''{esc_circ}'', ''{issue_date}'', 1, ''{esc_text}'', 0, {is_amendment})""").collect()
            total_chunks += 1

    return f"OK: {total_chunks} chunks from {len(docs)} documents"
';
CREATE OR REPLACE FUNCTION KAVACH_DB.AI.DRAFT_STR("P_ALERT_ID" VARCHAR)
RETURNS VARCHAR
LANGUAGE SQL
AS '
    SELECT 
        ''=== DRAFT SUSPICIOUS TRANSACTION REPORT ===\\n'' ||
        ''WATERMARK: DRAFT — REQUIRES MLRO REVIEW — SYNTHETIC DATA\\n\\n'' ||
        ''1. GROUNDS OF SUSPICION\\n'' ||
        ''Account '' || a.account_id || COALESCE('' (Customer: '' || a.customer_id || '')'', '''') || '' flagged for '' || a.typology || ''.\\n'' ||
        ''Regulatory basis: '' || COALESCE(r.source_citation, a.citation, ''N/A'') || ''.\\n'' ||
        ''Rule: '' || COALESCE(a.rule_name, ''N/A'') || '' (version '' || COALESCE(a.rule_version, 1) || '').\\n'' ||
        ''Risk score: '' || ROUND(a.score, 3) || ''\\n\\n'' ||
        ''2. TRANSACTION SUMMARY\\n'' ||
        ''Period: Last 30 days\\n'' ||
        ''Transaction count: '' || COALESCE(tx.txn_count, 0) || ''\\n'' ||
        ''Total value: ₹'' || ROUND(COALESCE(tx.total_inr, 0)/100000, 2) || '' lakh\\n'' ||
        ''Channels: '' || COALESCE(tx.channels, ''N/A'') || ''\\n\\n'' ||
        ''3. PARTIES INVOLVED\\n'' ||
        ''Primary account holder: '' || COALESCE(c.customer_name, ''Unknown'') || '' (PAN: '' || COALESCE(c.pan, ''N/A'') || '')\\n'' ||
        ''Risk category: '' || COALESCE(c.risk_category, ''N/A'') || ''\\n'' ||
        ''PEP status: '' || COALESCE(IFF(c.is_pep, ''Yes'', ''No''), ''N/A'') || ''\\n\\n'' ||
        ''4. RECOMMENDATION\\n'' ||
        ''Further investigation required. Evidence pack reference: '' || a.alert_id || ''\\n'' ||
        ''Generated on: '' || CURRENT_TIMESTAMP() || '' by KAVACH system.\\n''
    FROM KAVACH_DB.CORE.ALERTS a
    LEFT JOIN KAVACH_DB.RULES.RULE_LIBRARY r ON a.rule_id = r.rule_id
    LEFT JOIN KAVACH_DB.CORE.CUSTOMERS c ON a.customer_id = c.customer_id
    LEFT JOIN (
        SELECT 
            account_id,
            COUNT(*) AS txn_count,
            SUM(amount_inr) AS total_inr,
            LISTAGG(DISTINCT channel, '', '') AS channels
        FROM KAVACH_DB.CORE.TRANSACTIONS
        WHERE txn_ts >= DATEADD(''day'', -30, (SELECT MAX(created_at) FROM KAVACH_DB.CORE.ALERTS))
        GROUP BY account_id
    ) tx ON a.account_id = tx.account_id
    WHERE a.alert_id = p_alert_id
';
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
CREATE OR REPLACE FUNCTION KAVACH_DB.AI.EXPLAIN_ALERT("P_ALERT_ID" VARCHAR, "P_LANG" VARCHAR DEFAULT 'EN')
RETURNS VARCHAR
LANGUAGE SQL
AS '
    SELECT 
        CASE 
            WHEN p_lang = ''HI'' THEN COALESCE(
                s.story_hi,
                ''यह अलर्ट '' || a.typology || '' के लिए फ्लैग किया गया था (नियम: '' || a.rule_name || '')''
            )
            ELSE COALESCE(
                s.story_en,
                ''Alert flagged for '' || a.typology || '' under rule "'' || a.rule_name || ''" '' ||
                ''(source: '' || a.citation || ''). '' ||
                ''Risk score: '' || ROUND(a.score, 2) || ''.''
            )
        END
    FROM CORE.ALERTS a
    LEFT JOIN AI.ALERT_STORIES s ON a.alert_id = s.alert_id
    WHERE a.alert_id = p_alert_id
';
CREATE OR REPLACE PROCEDURE KAVACH_DB.AI.GENERATE_ALERT_STORIES()
RETURNS VARCHAR
LANGUAGE SQL
EXECUTE AS CALLER
AS '
DECLARE
    rows_generated INT DEFAULT 0;
BEGIN
    TRUNCATE TABLE AI.ALERT_STORIES;
    
    CREATE OR REPLACE TEMP TABLE story_prompts AS
    WITH top_alerts AS (
        SELECT 
            a.alert_id,
            a.account_id,
            a.customer_id,
            a.typology,
            a.score,
            a.rule_name,
            a.citation,
            a.severity,
            t.txn_count,
            t.total_amount_inr,
            t.date_range
        FROM CORE.ALERTS a
        LEFT JOIN (
            SELECT 
                account_id,
                COUNT(*) AS txn_count,
                SUM(amount_inr) AS total_amount_inr,
                MIN(txn_ts)::DATE || '' to '' || MAX(txn_ts)::DATE AS date_range
            FROM CORE.TRANSACTIONS
            WHERE txn_ts >= DATEADD(''day'', -30, CURRENT_DATE())
            GROUP BY account_id
        ) t ON a.account_id = t.account_id
        WHERE a.severity IN (''HIGH'', ''CRITICAL'')
        ORDER BY a.score DESC
        LIMIT 200
    )
    SELECT 
        alert_id,
        ''You are a compliance analyst. Rephrase this alert into a clear 3-5 sentence story in simple English. '' ||
        ''Use EXACTLY the numbers provided; do not invent any data. '' ||
        ''Alert ID: '' || alert_id || ''. '' ||
        ''Account '' || account_id || COALESCE('' (Customer '' || customer_id || '')'', '''') || '' was flagged for '' || typology || ''. '' ||
        ''The account had '' || COALESCE(txn_count, 0) || '' transactions totaling ₹'' || 
        COALESCE(ROUND(total_amount_inr/100000, 2), 0) || '' lakh '' ||
        ''from '' || COALESCE(date_range, ''unknown period'') || ''. '' ||
        ''This triggered rule "'' || rule_name || ''" (source: '' || citation || ''). '' ||
        ''Risk score: '' || ROUND(score, 2) || ''.'' AS prompt_en
    FROM top_alerts;
    
    INSERT INTO AI.ALERT_STORIES (alert_id, story_en, model_used)
    SELECT 
        alert_id,
        AI_COMPLETE(''llama3.1-8b'', prompt_en) AS story_en,
        ''llama3.1-8b''
    FROM story_prompts;
    
    UPDATE AI.ALERT_STORIES
    SET story_hi = AI_TRANSLATE(story_en, ''en'', ''hi'')
    WHERE story_hi IS NULL;
    
    SELECT COUNT(*) INTO rows_generated FROM AI.ALERT_STORIES;
    
    RETURN ''Generated '' || rows_generated || '' alert stories (EN + HI) for top 200 high-priority alerts'';
END;
';
CREATE OR REPLACE PROCEDURE KAVACH_DB.AI.RESET_TOUR_DATA()
RETURNS VARCHAR
LANGUAGE SQL
EXECUTE AS CALLER
AS '
BEGIN
    TRUNCATE TABLE AI.ALERT_STORIES;
    TRUNCATE TABLE AUDIT.EVIDENCE_REGISTRY;
    RETURN ''Tour data reset successfully'';
END;
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
CREATE OR REPLACE FUNCTION KAVACH_DB.AI.TUNING_PROPOSALS()
RETURNS TABLE ("RULE_ID" VARCHAR, "RULE_NAME" VARCHAR, "CURRENT_THRESHOLD" FLOAT, "SUGGESTED_THRESHOLD" FLOAT, "REASON" VARCHAR)
LANGUAGE SQL
AS '
    WITH noisy_rules AS (
        SELECT 
            r.rule_id,
            r.rule_name,
            COALESCE(TRY_TO_DOUBLE(r.params:threshold::VARCHAR), 1.0) AS current_threshold,
            COUNT(DISTINCT a.alert_id) AS total_alerts,
            COUNT(DISTINCT CASE WHEN a.resolution = ''FALSE_POSITIVE'' THEN a.alert_id END) AS false_positives,
            DIV0NULL(
                COUNT(DISTINCT CASE WHEN a.resolution = ''FALSE_POSITIVE'' THEN a.alert_id END),
                NULLIF(COUNT(DISTINCT CASE WHEN a.resolution IN (''TRUE_POSITIVE'', ''FALSE_POSITIVE'') THEN a.alert_id END), 0)
            ) AS false_positive_rate
        FROM RULES.RULE_LIBRARY r
        LEFT JOIN CORE.ALERTS a ON r.rule_id = a.rule_id
        WHERE r.status = ''APPROVED''
        GROUP BY r.rule_id, r.rule_name, r.params
        HAVING false_positive_rate > 0.50
    )
    SELECT 
        rule_id,
        rule_name,
        current_threshold,
        ROUND(current_threshold * 1.2, 2) AS suggested_threshold,
        ''High false positive rate ('' || ROUND(false_positive_rate * 100, 0) || ''%). '' ||
        ''Consider increasing threshold from '' || current_threshold || '' to '' || ROUND(current_threshold * 1.2, 2) ||
        '' to reduce noise.'' AS reason
    FROM noisy_rules
    ORDER BY false_positive_rate DESC
';
CREATE OR REPLACE FUNCTION KAVACH_DB.AI.VERIFY_EVIDENCE("P_ALERT_ID" VARCHAR)
RETURNS OBJECT
LANGUAGE SQL
AS '
    SELECT OBJECT_CONSTRUCT(
        ''alert_id'', e.alert_id,
        ''has_evidence'', IFF(e.evidence_json IS NOT NULL, TRUE, FALSE),
        ''has_file'', IFF(e.file_path IS NOT NULL, TRUE, FALSE),
        ''file_path'', e.file_path,
        ''stored_hash'', e.sha256_hash,
        ''computed_hash'', SHA2(TO_JSON(e.evidence_json), 256),
        ''integrity_status'', IFF(e.sha256_hash = SHA2(TO_JSON(e.evidence_json), 256), ''MATCH'', ''TAMPERED''),
        ''created_by'', e.created_by,
        ''created_at'', e.created_at,
        ''evidence_keys'', ARRAY_AGG(DISTINCT key) WITHIN GROUP (ORDER BY key)
    )
    FROM KAVACH_DB.AUDIT.EVIDENCE_REGISTRY e,
    LATERAL FLATTEN(INPUT => e.evidence_json) f(key)
    WHERE e.alert_id = p_alert_id
    GROUP BY e.alert_id, e.evidence_json, e.file_path, e.sha256_hash, e.created_by, e.created_at
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
create or replace cortex search service KAVACH_DB.AI.KAVACH_REG_SEARCH
	ON TEXT
	attributes CIRCULAR_NO,ISSUE_DATE,PARA_NO
	warehouse='KAVACH_WH'
	target_lag='1 day'
	refresh_mode=INCREMENTAL
	as (
    SELECT
        CHUNK_ID,
        DOC_ID,
        CIRCULAR_NO,
        ISSUE_DATE,
        PARA_NO::STRING AS PARA_NO,
        TEXT
    FROM KAVACH_DB.AI.REG_CHUNKS
);
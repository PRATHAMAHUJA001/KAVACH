-- =============================================================================
-- KAVACH Phase 1B: Governance — Roles, Tags, Masking, Row Access, Audit
-- =============================================================================
USE ROLE ACCOUNTADMIN;
USE DATABASE KAVACH_DB;
USE WAREHOUSE KAVACH_WH;

-- =========================================================================
-- 1. CUSTOM ROLES (least-privilege hierarchy)
-- =========================================================================
CREATE ROLE IF NOT EXISTS KAVACH_ADMIN
    COMMENT = 'Full DDL/DML on KAVACH_DB, owns pipelines and deployment';
CREATE ROLE IF NOT EXISTS KAVACH_ANALYST
    COMMENT = 'Read CORE/RULES/ML/AI, write RAW, run app procs';
CREATE ROLE IF NOT EXISTS KAVACH_AUDITOR
    COMMENT = 'Read-only across all schemas, sees unmasked PII for investigations';
CREATE ROLE IF NOT EXISTS KAVACH_REVIEWER
    COMMENT = 'Read-only on APP and AUDIT, partially masked PII';

-- Role hierarchy: all roll up to SYSADMIN so ACCOUNTADMIN can manage
GRANT ROLE KAVACH_ADMIN    TO ROLE SYSADMIN;
GRANT ROLE KAVACH_ANALYST  TO ROLE KAVACH_ADMIN;
GRANT ROLE KAVACH_AUDITOR  TO ROLE KAVACH_ADMIN;
GRANT ROLE KAVACH_REVIEWER TO ROLE KAVACH_ADMIN;

-- -------------------------------------------------------------------------
-- 1a. Warehouse grants
-- -------------------------------------------------------------------------
GRANT USAGE ON WAREHOUSE KAVACH_WH TO ROLE KAVACH_ADMIN;
GRANT USAGE ON WAREHOUSE KAVACH_WH TO ROLE KAVACH_ANALYST;
GRANT USAGE ON WAREHOUSE KAVACH_WH TO ROLE KAVACH_AUDITOR;
GRANT USAGE ON WAREHOUSE KAVACH_WH TO ROLE KAVACH_REVIEWER;

-- -------------------------------------------------------------------------
-- 1b. Database-level grants
-- -------------------------------------------------------------------------
GRANT USAGE ON DATABASE KAVACH_DB TO ROLE KAVACH_ADMIN;
GRANT USAGE ON DATABASE KAVACH_DB TO ROLE KAVACH_ANALYST;
GRANT USAGE ON DATABASE KAVACH_DB TO ROLE KAVACH_AUDITOR;
GRANT USAGE ON DATABASE KAVACH_DB TO ROLE KAVACH_REVIEWER;

-- -------------------------------------------------------------------------
-- 1c. Schema-level grants — KAVACH_ADMIN (all privileges on all schemas)
-- -------------------------------------------------------------------------
GRANT ALL PRIVILEGES ON SCHEMA RAW     TO ROLE KAVACH_ADMIN;
GRANT ALL PRIVILEGES ON SCHEMA CORE    TO ROLE KAVACH_ADMIN;
GRANT ALL PRIVILEGES ON SCHEMA RULES   TO ROLE KAVACH_ADMIN;
GRANT ALL PRIVILEGES ON SCHEMA ML      TO ROLE KAVACH_ADMIN;
GRANT ALL PRIVILEGES ON SCHEMA AI      TO ROLE KAVACH_ADMIN;
GRANT ALL PRIVILEGES ON SCHEMA APP     TO ROLE KAVACH_ADMIN;
GRANT ALL PRIVILEGES ON SCHEMA AUDIT   TO ROLE KAVACH_ADMIN;

-- Future grants for ADMIN on all schemas
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA RAW   TO ROLE KAVACH_ADMIN;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA CORE  TO ROLE KAVACH_ADMIN;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA RULES TO ROLE KAVACH_ADMIN;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ML    TO ROLE KAVACH_ADMIN;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA AI    TO ROLE KAVACH_ADMIN;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA APP   TO ROLE KAVACH_ADMIN;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA AUDIT TO ROLE KAVACH_ADMIN;

GRANT ALL PRIVILEGES ON FUTURE TABLES IN SCHEMA RAW   TO ROLE KAVACH_ADMIN;
GRANT ALL PRIVILEGES ON FUTURE TABLES IN SCHEMA CORE  TO ROLE KAVACH_ADMIN;
GRANT ALL PRIVILEGES ON FUTURE TABLES IN SCHEMA RULES TO ROLE KAVACH_ADMIN;
GRANT ALL PRIVILEGES ON FUTURE TABLES IN SCHEMA ML    TO ROLE KAVACH_ADMIN;
GRANT ALL PRIVILEGES ON FUTURE TABLES IN SCHEMA AI    TO ROLE KAVACH_ADMIN;
GRANT ALL PRIVILEGES ON FUTURE TABLES IN SCHEMA APP   TO ROLE KAVACH_ADMIN;
GRANT ALL PRIVILEGES ON FUTURE TABLES IN SCHEMA AUDIT TO ROLE KAVACH_ADMIN;

-- -------------------------------------------------------------------------
-- 1d. KAVACH_ANALYST: read CORE/RULES/ML/AI, write RAW, read APP
-- -------------------------------------------------------------------------
GRANT USAGE ON SCHEMA RAW   TO ROLE KAVACH_ANALYST;
GRANT USAGE ON SCHEMA CORE  TO ROLE KAVACH_ANALYST;
GRANT USAGE ON SCHEMA RULES TO ROLE KAVACH_ANALYST;
GRANT USAGE ON SCHEMA ML    TO ROLE KAVACH_ANALYST;
GRANT USAGE ON SCHEMA AI    TO ROLE KAVACH_ANALYST;
GRANT USAGE ON SCHEMA APP   TO ROLE KAVACH_ANALYST;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA RAW TO ROLE KAVACH_ANALYST;
GRANT SELECT, INSERT, UPDATE, DELETE ON FUTURE TABLES IN SCHEMA RAW TO ROLE KAVACH_ANALYST;

GRANT SELECT ON ALL TABLES IN SCHEMA CORE  TO ROLE KAVACH_ANALYST;
GRANT SELECT ON ALL TABLES IN SCHEMA RULES TO ROLE KAVACH_ANALYST;
GRANT SELECT ON ALL TABLES IN SCHEMA ML    TO ROLE KAVACH_ANALYST;
GRANT SELECT ON ALL TABLES IN SCHEMA AI    TO ROLE KAVACH_ANALYST;
GRANT SELECT ON ALL TABLES IN SCHEMA APP   TO ROLE KAVACH_ANALYST;

GRANT SELECT ON FUTURE TABLES IN SCHEMA CORE  TO ROLE KAVACH_ANALYST;
GRANT SELECT ON FUTURE TABLES IN SCHEMA RULES TO ROLE KAVACH_ANALYST;
GRANT SELECT ON FUTURE TABLES IN SCHEMA ML    TO ROLE KAVACH_ANALYST;
GRANT SELECT ON FUTURE TABLES IN SCHEMA AI    TO ROLE KAVACH_ANALYST;
GRANT SELECT ON FUTURE TABLES IN SCHEMA APP   TO ROLE KAVACH_ANALYST;

-- -------------------------------------------------------------------------
-- 1e. KAVACH_AUDITOR: read-only on ALL schemas (sees unmasked PII)
-- -------------------------------------------------------------------------
GRANT USAGE ON SCHEMA RAW   TO ROLE KAVACH_AUDITOR;
GRANT USAGE ON SCHEMA CORE  TO ROLE KAVACH_AUDITOR;
GRANT USAGE ON SCHEMA RULES TO ROLE KAVACH_AUDITOR;
GRANT USAGE ON SCHEMA ML    TO ROLE KAVACH_AUDITOR;
GRANT USAGE ON SCHEMA AI    TO ROLE KAVACH_AUDITOR;
GRANT USAGE ON SCHEMA APP   TO ROLE KAVACH_AUDITOR;
GRANT USAGE ON SCHEMA AUDIT TO ROLE KAVACH_AUDITOR;

GRANT SELECT ON ALL TABLES IN SCHEMA RAW   TO ROLE KAVACH_AUDITOR;
GRANT SELECT ON ALL TABLES IN SCHEMA CORE  TO ROLE KAVACH_AUDITOR;
GRANT SELECT ON ALL TABLES IN SCHEMA RULES TO ROLE KAVACH_AUDITOR;
GRANT SELECT ON ALL TABLES IN SCHEMA ML    TO ROLE KAVACH_AUDITOR;
GRANT SELECT ON ALL TABLES IN SCHEMA AI    TO ROLE KAVACH_AUDITOR;
GRANT SELECT ON ALL TABLES IN SCHEMA APP   TO ROLE KAVACH_AUDITOR;
GRANT SELECT ON ALL TABLES IN SCHEMA AUDIT TO ROLE KAVACH_AUDITOR;

GRANT SELECT ON FUTURE TABLES IN SCHEMA RAW   TO ROLE KAVACH_AUDITOR;
GRANT SELECT ON FUTURE TABLES IN SCHEMA CORE  TO ROLE KAVACH_AUDITOR;
GRANT SELECT ON FUTURE TABLES IN SCHEMA RULES TO ROLE KAVACH_AUDITOR;
GRANT SELECT ON FUTURE TABLES IN SCHEMA ML    TO ROLE KAVACH_AUDITOR;
GRANT SELECT ON FUTURE TABLES IN SCHEMA AI    TO ROLE KAVACH_AUDITOR;
GRANT SELECT ON FUTURE TABLES IN SCHEMA APP   TO ROLE KAVACH_AUDITOR;
GRANT SELECT ON FUTURE TABLES IN SCHEMA AUDIT TO ROLE KAVACH_AUDITOR;

-- -------------------------------------------------------------------------
-- 1f. KAVACH_REVIEWER: read-only on APP and AUDIT only
-- -------------------------------------------------------------------------
GRANT USAGE ON SCHEMA APP   TO ROLE KAVACH_REVIEWER;
GRANT USAGE ON SCHEMA AUDIT TO ROLE KAVACH_REVIEWER;

GRANT SELECT ON ALL TABLES IN SCHEMA APP   TO ROLE KAVACH_REVIEWER;
GRANT SELECT ON ALL TABLES IN SCHEMA AUDIT TO ROLE KAVACH_REVIEWER;

GRANT SELECT ON FUTURE TABLES IN SCHEMA APP   TO ROLE KAVACH_REVIEWER;
GRANT SELECT ON FUTURE TABLES IN SCHEMA AUDIT TO ROLE KAVACH_REVIEWER;

-- Grant roles to the current user for testing
-- NOTE: Replace PRATHAMAHUJA with your username when running in a different account
GRANT ROLE KAVACH_ADMIN    TO USER PRATHAMAHUJA;
GRANT ROLE KAVACH_ANALYST  TO USER PRATHAMAHUJA;
GRANT ROLE KAVACH_AUDITOR  TO USER PRATHAMAHUJA;
GRANT ROLE KAVACH_REVIEWER TO USER PRATHAMAHUJA;


-- =========================================================================
-- 2. TAGS
-- =========================================================================
USE SCHEMA KAVACH_DB.CORE;

CREATE OR REPLACE TAG PII_LEVEL
    ALLOWED_VALUES 'HIGH', 'MEDIUM', 'LOW'
    COMMENT = 'Classifies PII sensitivity: HIGH=PAN/Aadhaar, MEDIUM=account/mobile, LOW=city/pincode';

CREATE OR REPLACE TAG DATA_DOMAIN
    COMMENT = 'Business domain: CUSTOMER, TRANSACTION, ACCOUNT, RULE, ALERT';


-- =========================================================================
-- 3. MASKING POLICIES
-- =========================================================================
USE SCHEMA KAVACH_DB.CORE;

-- 3a. PAN masking — analysts see "XXXXX1234F", reviewer sees "XXXXX1234F", auditor/admin see full
CREATE OR REPLACE MASKING POLICY mask_pan AS (val STRING) RETURNS STRING ->
    CASE
        WHEN CURRENT_ROLE() IN ('KAVACH_ADMIN', 'KAVACH_AUDITOR', 'ACCOUNTADMIN') THEN val
        ELSE 'XXXXX' || SUBSTR(val, 6, 5)   -- shows last 5 chars e.g. "XXXXX1234F"
    END;

-- 3b. Account number — last 4 digits for analyst/reviewer
CREATE OR REPLACE MASKING POLICY mask_account_number AS (val STRING) RETURNS STRING ->
    CASE
        WHEN CURRENT_ROLE() IN ('KAVACH_ADMIN', 'KAVACH_AUDITOR', 'ACCOUNTADMIN') THEN val
        ELSE CONCAT(REPEAT('X', LENGTH(val) - 4), RIGHT(val, 4))
    END;

-- 3c. Mobile number — partial mask for reviewer, full for analyst investigative work
CREATE OR REPLACE MASKING POLICY mask_mobile AS (val STRING) RETURNS STRING ->
    CASE
        WHEN CURRENT_ROLE() IN ('KAVACH_ADMIN', 'KAVACH_AUDITOR', 'ACCOUNTADMIN') THEN val
        WHEN CURRENT_ROLE() = 'KAVACH_ANALYST' THEN val  -- analysts need mobile for investigation
        ELSE CONCAT(LEFT(val, 3), '****', RIGHT(val, 3))  -- reviewer sees "+91****789"
    END;

-- 3d. Customer name — partial mask for reviewer
CREATE OR REPLACE MASKING POLICY mask_customer_name AS (val STRING) RETURNS STRING ->
    CASE
        WHEN CURRENT_ROLE() IN ('KAVACH_ADMIN', 'KAVACH_AUDITOR', 'ACCOUNTADMIN') THEN val
        WHEN CURRENT_ROLE() = 'KAVACH_ANALYST' THEN val
        ELSE CONCAT(LEFT(val, 2), REPEAT('*', GREATEST(LENGTH(val) - 2, 0)))
    END;


-- =========================================================================
-- 4. TAG-BASED MASKING (attach policy to tag so it auto-applies)
-- =========================================================================
-- PII_LEVEL = HIGH  → PAN masking by default (can override per-column)
-- We attach the PAN mask as the default for HIGH; individual columns that
-- are account numbers or mobile numbers will get their specific policy
-- via direct column assignment after tagging.
ALTER TAG KAVACH_DB.CORE.PII_LEVEL SET
    MASKING POLICY KAVACH_DB.CORE.mask_pan;


-- =========================================================================
-- 5. ROW ACCESS POLICY — region-scoped analysts
-- =========================================================================
-- Mapping table: which role sees which regions
CREATE OR REPLACE TABLE KAVACH_DB.CORE.REGION_ACCESS_MAP (
    ROLE_NAME   STRING NOT NULL,
    REGION      STRING NOT NULL
);

-- Demo: KAVACH_ANALYST can see all regions; we'll create a scoped analyst below
INSERT INTO KAVACH_DB.CORE.REGION_ACCESS_MAP VALUES
    ('KAVACH_ADMIN',    'ALL'),
    ('KAVACH_AUDITOR',  'ALL'),
    ('KAVACH_ANALYST',  'ALL'),
    ('KAVACH_REVIEWER', 'ALL');

-- Create a demo region-scoped analyst
CREATE ROLE IF NOT EXISTS KAVACH_ANALYST_NORTH
    COMMENT = 'Region-scoped analyst — can only see NORTH transactions';
GRANT ROLE KAVACH_ANALYST_NORTH TO ROLE KAVACH_ADMIN;
-- NOTE: Replace PRATHAMAHUJA with your username when running in a different account
GRANT ROLE KAVACH_ANALYST_NORTH TO USER PRATHAMAHUJA;

-- Grant same base privileges as KAVACH_ANALYST
GRANT USAGE ON WAREHOUSE KAVACH_WH TO ROLE KAVACH_ANALYST_NORTH;
GRANT USAGE ON DATABASE KAVACH_DB  TO ROLE KAVACH_ANALYST_NORTH;
GRANT USAGE ON SCHEMA KAVACH_DB.CORE TO ROLE KAVACH_ANALYST_NORTH;
GRANT SELECT ON ALL TABLES IN SCHEMA KAVACH_DB.CORE TO ROLE KAVACH_ANALYST_NORTH;
GRANT SELECT ON FUTURE TABLES IN SCHEMA KAVACH_DB.CORE TO ROLE KAVACH_ANALYST_NORTH;

INSERT INTO KAVACH_DB.CORE.REGION_ACCESS_MAP VALUES
    ('KAVACH_ANALYST_NORTH', 'NORTH');

-- Row access policy
CREATE OR REPLACE ROW ACCESS POLICY KAVACH_DB.CORE.rap_region_filter
    AS (region_val STRING) RETURNS BOOLEAN ->
    CURRENT_ROLE() IN ('ACCOUNTADMIN', 'KAVACH_ADMIN', 'KAVACH_AUDITOR')
    OR EXISTS (
        SELECT 1 FROM KAVACH_DB.CORE.REGION_ACCESS_MAP
        WHERE ROLE_NAME = CURRENT_ROLE()
          AND (REGION = 'ALL' OR REGION = region_val)
    );


-- =========================================================================
-- 6. AUDIT.ACTIVITY_LOG table
-- =========================================================================
USE SCHEMA KAVACH_DB.AUDIT;

CREATE OR REPLACE TABLE ACTIVITY_LOG (
    LOG_ID          STRING      DEFAULT UUID_STRING(),
    LOGGED_AT       TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    USER_NAME       STRING      NOT NULL,
    ROLE_NAME       STRING      NOT NULL,
    ACTION          STRING      NOT NULL   COMMENT 'e.g. QUERY, VIEW_ALERT, ASK, EXPORT',
    OBJECT_NAME     STRING                 COMMENT 'Table/view/entity acted upon',
    QUESTION_ASKED  STRING                 COMMENT 'Natural-language question (for ASK actions)',
    ANSWER_ID       STRING                 COMMENT 'ID linking to the AI-generated answer',
    DETAILS         VARIANT                COMMENT 'JSON payload with extra context',
    PRIMARY KEY (LOG_ID)
);

GRANT INSERT ON TABLE KAVACH_DB.AUDIT.ACTIVITY_LOG TO ROLE KAVACH_ADMIN;
GRANT INSERT ON TABLE KAVACH_DB.AUDIT.ACTIVITY_LOG TO ROLE KAVACH_ANALYST;
GRANT INSERT ON TABLE KAVACH_DB.AUDIT.ACTIVITY_LOG TO ROLE KAVACH_AUDITOR;
GRANT INSERT ON TABLE KAVACH_DB.AUDIT.ACTIVITY_LOG TO ROLE KAVACH_REVIEWER;
GRANT SELECT ON TABLE KAVACH_DB.AUDIT.ACTIVITY_LOG TO ROLE KAVACH_AUDITOR;
GRANT SELECT ON TABLE KAVACH_DB.AUDIT.ACTIVITY_LOG TO ROLE KAVACH_REVIEWER;


-- =========================================================================
-- 7. Python helper — audit logger stored procedure
-- =========================================================================
USE SCHEMA KAVACH_DB.AUDIT;

CREATE OR REPLACE PROCEDURE log_activity(
    p_action        STRING,
    p_object_name   STRING,
    p_question      STRING,
    p_answer_id     STRING,
    p_details       VARIANT
)
RETURNS STRING
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS
$$
def run(session, p_action, p_object_name, p_question, p_answer_id, p_details):
    import json

    def esc(v):
        if v is None:
            return 'NULL'
        return "'" + str(v).replace("'", "''") + "'"

    if p_details is not None and not isinstance(p_details, str):
        try:
            details_str = f"PARSE_JSON('{json.dumps(p_details)}')"
        except Exception:
            details_str = "NULL"
    elif p_details is not None and isinstance(p_details, str):
        details_str = f"PARSE_JSON('{p_details}')"
    else:
        details_str = "NULL"

    sql = f"""
        INSERT INTO KAVACH_DB.AUDIT.ACTIVITY_LOG
            (USER_NAME, ROLE_NAME, ACTION, OBJECT_NAME, QUESTION_ASKED, ANSWER_ID, DETAILS)
        VALUES (
            CURRENT_USER(),
            CURRENT_ROLE(),
            {esc(p_action)},
            {esc(p_object_name)},
            {esc(p_question)},
            {esc(p_answer_id)},
            {details_str}
        )
    """
    session.sql(sql).collect()
    return "OK"
$$;

GRANT USAGE ON PROCEDURE KAVACH_DB.AUDIT.log_activity(STRING, STRING, STRING, STRING, VARIANT)
    TO ROLE KAVACH_ADMIN;
GRANT USAGE ON PROCEDURE KAVACH_DB.AUDIT.log_activity(STRING, STRING, STRING, STRING, VARIANT)
    TO ROLE KAVACH_ANALYST;
GRANT USAGE ON PROCEDURE KAVACH_DB.AUDIT.log_activity(STRING, STRING, STRING, STRING, VARIANT)
    TO ROLE KAVACH_AUDITOR;
GRANT USAGE ON PROCEDURE KAVACH_DB.AUDIT.log_activity(STRING, STRING, STRING, STRING, VARIANT)
    TO ROLE KAVACH_ANALYST_NORTH;


-- =========================================================================
-- 8. DEMO TABLE for masking + RAP verification
-- =========================================================================
USE SCHEMA KAVACH_DB.CORE;

CREATE OR REPLACE TABLE DEMO_CUSTOMERS (
    CUSTOMER_ID     STRING,
    CUSTOMER_NAME   STRING,
    PAN             STRING,
    ACCOUNT_NUMBER  STRING,
    MOBILE          STRING,
    REGION          STRING
);

-- Tag columns for PII
ALTER TABLE DEMO_CUSTOMERS ALTER COLUMN PAN
    SET TAG KAVACH_DB.CORE.PII_LEVEL = 'HIGH';

-- Account number and mobile need their own masking policies (override tag-based)
ALTER TABLE DEMO_CUSTOMERS ALTER COLUMN ACCOUNT_NUMBER
    SET MASKING POLICY KAVACH_DB.CORE.mask_account_number;

ALTER TABLE DEMO_CUSTOMERS ALTER COLUMN MOBILE
    SET MASKING POLICY KAVACH_DB.CORE.mask_mobile;

ALTER TABLE DEMO_CUSTOMERS ALTER COLUMN CUSTOMER_NAME
    SET MASKING POLICY KAVACH_DB.CORE.mask_customer_name;

-- Attach row access policy on REGION column
ALTER TABLE DEMO_CUSTOMERS
    ADD ROW ACCESS POLICY KAVACH_DB.CORE.rap_region_filter ON (REGION);

-- Insert synthetic demo data
INSERT INTO DEMO_CUSTOMERS VALUES
    ('CUST001', 'Rajesh Kumar',    'ABCDE1234F', '10012345678', '+919876543210', 'NORTH'),
    ('CUST002', 'Priya Sharma',    'FGHIJ5678K', '20098765432', '+918765432109', 'SOUTH'),
    ('CUST003', 'Amit Patel',      'KLMNO9012L', '30045678901', '+917654321098', 'WEST'),
    ('CUST004', 'Sunita Reddy',    'PQRST3456M', '40056789012', '+916543210987', 'EAST'),
    ('CUST005', 'Vikram Singh',    'UVWXY7890N', '50067890123', '+915432109876', 'NORTH');


-- =========================================================================
-- 9. VERIFICATION QUERIES
-- =========================================================================

-- 9a. Show roles
SHOW ROLES LIKE 'KAVACH%';

-- 9b. Show masking policies
SHOW MASKING POLICIES IN SCHEMA KAVACH_DB.CORE;

-- 9c. Show row access policies
SHOW ROW ACCESS POLICIES IN SCHEMA KAVACH_DB.CORE;

create or replace schema KAVACH_DB.AUDIT COMMENT='Activity log, evidence packs, compliance trail';

create or replace TABLE KAVACH_DB.AUDIT.ACTIVITY_LOG (
	LOG_ID VARCHAR(16777216) NOT NULL DEFAULT UUID_STRING(),
	LOGGED_AT TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP(),
	USER_NAME VARCHAR(16777216) NOT NULL,
	ROLE_NAME VARCHAR(16777216) NOT NULL,
	ACTION VARCHAR(16777216) NOT NULL,
	OBJECT_NAME VARCHAR(16777216),
	QUESTION_ASKED VARCHAR(16777216),
	ANSWER_ID VARCHAR(16777216),
	DETAILS VARIANT,
	primary key (LOG_ID)
);
create or replace TABLE KAVACH_DB.AUDIT.ALERT_FEEDBACK (
	FEEDBACK_ID NUMBER(38,0) autoincrement start 1 increment 1 noorder,
	ALERT_ID VARCHAR(16777216) NOT NULL,
	RATING NUMBER(38,0) NOT NULL,
	COMMENT VARCHAR(16777216),
	SUBMITTED_AT TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP()
);
create or replace TABLE KAVACH_DB.AUDIT.EVIDENCE_REGISTRY (
	ALERT_ID VARCHAR(16777216) NOT NULL,
	EVIDENCE_JSON VARIANT,
	FILE_PATH VARCHAR(16777216),
	SHA256_HASH VARCHAR(16777216),
	CREATED_BY VARCHAR(16777216),
	CREATED_AT TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP(),
	HTML_FILE_PATH VARCHAR(16777216),
	HTML_SHA256_HASH VARCHAR(16777216),
	PDF_FILE_PATH VARCHAR(16777216),
	PDF_SHA256_HASH VARCHAR(16777216),
	primary key (ALERT_ID)
);
CREATE OR REPLACE PROCEDURE KAVACH_DB.AUDIT.LOG_ACTIVITY("P_ACTION" VARCHAR, "P_OBJECT_NAME" VARCHAR, "P_QUESTION" VARCHAR, "P_ANSWER_ID" VARCHAR, "P_DETAILS" VARIANT)
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
ARTIFACT_REPOSITORY = snowflake.snowpark.pypi_shared_repository
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS '
def run(session, p_action, p_object_name, p_question, p_answer_id, p_details):
    import json

    def esc(v):
        if v is None:
            return ''NULL''
        return "''" + str(v).replace("''", "''''") + "''"

    if p_details is not None and not isinstance(p_details, str):
        try:
            details_str = f"PARSE_JSON(''{json.dumps(p_details)}'')"
        except Exception:
            details_str = "NULL"
    elif p_details is not None and isinstance(p_details, str):
        details_str = f"PARSE_JSON(''{p_details}'')"
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
';
-- =============================================================================
-- KAVACH: APP.SETTINGS — app-level configuration the backend and tour read
-- =============================================================================
-- This table was live on the original account but never checked into sql/; it
-- only survived in data/exports/ddl/APP.sql. Without it,
-- AI.GENERATE_ALERT_STORIES, AI.RESET_TOUR_DATA and the dashboard's as-of-date
-- lookup all fail with "Object 'KAVACH_DB.APP.SETTINGS' does not exist".
--
-- ORDERING: run this AFTER CORE.ALERTS and CORE.RINGS are populated (i.e. after
-- RULES.EXECUTE_ALL_RULES() and CORE.DETECT_MULE_RINGS()), because the tour keys
-- and AS_OF_DATE are seeded from real rows rather than hardcoded ids.
--
-- Idempotent: MERGE refreshes values in place on re-run.
-- =============================================================================
USE ROLE ACCOUNTADMIN;
USE DATABASE KAVACH_DB;
USE WAREHOUSE KAVACH_WH;

CREATE TABLE IF NOT EXISTS KAVACH_DB.APP.SETTINGS (
    KEY        VARCHAR NOT NULL,
    VALUE      VARCHAR,
    UPDATED_AT TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP(),
    PRIMARY KEY (KEY)
);

-- AS_OF_DATE must track the DATA's reference date, not wall-clock. The backend
-- takes max(AS_OF_DATE + 18h, max(alert.created_at)) as "now"; seeding a real
-- calendar date here would push every "last N days" window past the synthetic
-- 2024 data and silently return nothing.
--
-- The tour keys are pinned to a concrete high-severity alert so the product tour
-- always walks the same alert -> rule -> circular -> ring path.
MERGE INTO KAVACH_DB.APP.SETTINGS AS tgt
USING (
    WITH tour_alert AS (
        SELECT ALERT_ID, RULE_ID, CITATION
        FROM KAVACH_DB.CORE.ALERTS
        WHERE SEVERITY = 'HIGH'
          AND CITATION IS NOT NULL
          AND RULE_ID  IS NOT NULL
        ORDER BY CREATED_AT DESC, ALERT_ID
        LIMIT 1
    )
    SELECT 'AS_OF_DATE' AS KEY,
           TO_VARCHAR((SELECT MAX(CREATED_AT)::DATE FROM KAVACH_DB.CORE.ALERTS),
                      'YYYY-MM-DD') AS VALUE
    UNION ALL SELECT 'TOUR_ALERT_ID',   (SELECT ALERT_ID FROM tour_alert)
    UNION ALL SELECT 'TOUR_RULE_ID',    (SELECT RULE_ID  FROM tour_alert)
    UNION ALL SELECT 'TOUR_CIRCULAR_NO',(SELECT SPLIT_PART(CITATION, ' ', 1) FROM tour_alert)
    UNION ALL SELECT 'TOUR_RING_ID',    (SELECT MIN(RING_ID) FROM KAVACH_DB.CORE.RINGS)
) AS src
ON tgt.KEY = src.KEY
WHEN MATCHED THEN UPDATE SET tgt.VALUE = src.VALUE, tgt.UPDATED_AT = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (KEY, VALUE, UPDATED_AT)
                      VALUES (src.KEY, src.VALUE, CURRENT_TIMESTAMP());

GRANT SELECT ON TABLE KAVACH_DB.APP.SETTINGS TO ROLE KAVACH_ADMIN;
GRANT SELECT ON TABLE KAVACH_DB.APP.SETTINGS TO ROLE KAVACH_ANALYST;
GRANT SELECT ON TABLE KAVACH_DB.APP.SETTINGS TO ROLE KAVACH_AUDITOR;
GRANT SELECT ON TABLE KAVACH_DB.APP.SETTINGS TO ROLE KAVACH_REVIEWER;
-- The backend writes AS_OF_DATE / tour pins back through KAVACH_ADMIN.
GRANT INSERT, UPDATE ON TABLE KAVACH_DB.APP.SETTINGS TO ROLE KAVACH_ADMIN;

SELECT KEY, VALUE FROM KAVACH_DB.APP.SETTINGS ORDER BY KEY;

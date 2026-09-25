-- ============================================================================
-- Phase 6: Explainability & Evidence
-- All procedures in AI schema, EXECUTE AS CALLER for row-level security
-- ============================================================================

USE DATABASE KAVACH_DB;
USE WAREHOUSE KAVACH_WH;

-- ----------------------------------------------------------------------------
-- 1. ALERT_STORIES: Precompute plain-English + Hindi explanations
-- ----------------------------------------------------------------------------
CREATE OR REPLACE TABLE AI.ALERT_STORIES (
    alert_id VARCHAR PRIMARY KEY,
    story_en TEXT,
    story_hi TEXT,
    generated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    model_used VARCHAR
);

CREATE OR REPLACE PROCEDURE AI.GENERATE_ALERT_STORIES()
RETURNS STRING
LANGUAGE SQL
EXECUTE AS CALLER
AS
$$
DECLARE
    rows_generated INT DEFAULT 0;
BEGIN
    -- Generate stories for top 200 HIGH priority alerts only (credit discipline)
    -- Use batched AI_COMPLETE to avoid per-row calls
    
    TRUNCATE TABLE AI.ALERT_STORIES;
    
    -- Step 1: Build structured prompts with REAL data from SQL
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
            -- Get transaction summary
            t.txn_count,
            t.total_amount_inr,
            t.date_range
        FROM CORE.ALERTS a
        LEFT JOIN (
            SELECT 
                account_id,
                COUNT(*) AS txn_count,
                SUM(amount_inr) AS total_amount_inr,
                MIN(txn_ts)::DATE || ' to ' || MAX(txn_ts)::DATE AS date_range
            FROM CORE.TRANSACTIONS
            WHERE txn_ts >= DATEADD('day', -30, CURRENT_DATE())
            GROUP BY account_id
        ) t ON a.account_id = t.account_id
        WHERE a.severity IN ('HIGH', 'CRITICAL')
        ORDER BY a.score DESC
        LIMIT 200
    )
    SELECT 
        alert_id,
        -- Template: LLM only rephrases, never invents numbers
        'You are a compliance analyst. Rephrase this alert into a clear 3-5 sentence story in simple English. ' ||
        'Use EXACTLY the numbers provided; do not invent any data. ' ||
        'Alert ID: ' || alert_id || '. ' ||
        'Account ' || account_id || COALESCE(' (Customer ' || customer_id || ')', '') || ' was flagged for ' || typology || '. ' ||
        'The account had ' || COALESCE(txn_count, 0) || ' transactions totaling ₹' || 
        COALESCE(ROUND(total_amount_inr/100000, 2), 0) || ' lakh ' ||
        'from ' || COALESCE(date_range, 'unknown period') || '. ' ||
        'This triggered rule "' || rule_name || '" (source: ' || citation || '). ' ||
        'Risk score: ' || ROUND(score, 2) || '.' AS prompt_en
    FROM top_alerts;
    
    -- Step 2: Batch call AI_COMPLETE (one call for all 200, not 200 calls)
    INSERT INTO AI.ALERT_STORIES (alert_id, story_en, model_used)
    SELECT 
        alert_id,
        SNOWFLAKE.CORTEX.AI_COMPLETE(
            'llama3.1-8b',  -- efficient open-source model for rephrasing
            prompt_en
        ) AS story_en,
        'llama3.1-8b'
    FROM story_prompts;
    
    -- Step 3: Translate to Hindi (batched)
    UPDATE AI.ALERT_STORIES
    SET story_hi = SNOWFLAKE.CORTEX.AI_TRANSLATE(
        story_en,
        'en',
        'hi'
    )
    WHERE story_hi IS NULL;
    
    SELECT COUNT(*) INTO rows_generated FROM AI.ALERT_STORIES;
    
    RETURN 'Generated ' || rows_generated || ' alert stories (EN + HI) for top 200 high-priority alerts';
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. EXPLAIN_ALERT: Return story if precomputed, else structured fallback
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION AI.EXPLAIN_ALERT(p_alert_id VARCHAR, p_lang VARCHAR DEFAULT 'EN')
RETURNS VARCHAR
LANGUAGE SQL
AS
$$
    SELECT 
        CASE 
            WHEN p_lang = 'HI' THEN COALESCE(
                s.story_hi,
                'यह अलर्ट ' || a.typology || ' के लिए फ्लैग किया गया था (नियम: ' || a.rule_name || ')'
            )
            ELSE COALESCE(
                s.story_en,
                'Alert flagged for ' || a.typology || ' under rule "' || a.rule_name || '" ' ||
                '(source: ' || a.citation || '). ' ||
                'Risk score: ' || ROUND(a.score, 2) || '.'
            )
        END
    FROM CORE.ALERTS a
    LEFT JOIN AI.ALERT_STORIES s ON a.alert_id = s.alert_id
    WHERE a.alert_id = p_alert_id
$$;

-- ----------------------------------------------------------------------------
-- 3. BUILD_EVIDENCE_PACK: Generate JSON evidence for an alert
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS AUDIT.EVIDENCE_REGISTRY (
    alert_id VARCHAR PRIMARY KEY,
    evidence_json VARIANT,
    file_path VARCHAR,
    sha256_hash VARCHAR,
    -- Human-readable evidence pack (rendered by the backend from evidence_json,
    -- not by this procedure). PDF is best-effort and may be NULL.
    html_file_path VARCHAR,
    html_sha256_hash VARCHAR,
    pdf_file_path VARCHAR,
    pdf_sha256_hash VARCHAR,
    created_by VARCHAR,
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE OR REPLACE PROCEDURE AI.BUILD_EVIDENCE_PACK(p_alert_id VARCHAR)
RETURNS VARIANT
LANGUAGE SQL
EXECUTE AS CALLER
AS
$$
DECLARE
    evidence VARIANT;
    evidence_str VARCHAR;
    hash_val VARCHAR;
    file_rel_path VARCHAR;
    ref_date TIMESTAMP_NTZ;
BEGIN
    ref_date := (SELECT MAX(created_at) FROM CORE.ALERTS);

    -- Build structured evidence JSON. Note: correlated subqueries inside a
    -- SELECT ... INTO block are not allowed in Snowflake Scripting, so the
    -- per-account aggregates are computed as CTEs joined on account_id instead.
    WITH timeline_agg AS (
        SELECT account_id,
            ARRAY_AGG(OBJECT_CONSTRUCT(
                'txn_ts', txn_ts,
                'amount_inr', amount_inr,
                'channel', channel,
                'direction', direction,
                'counterparty', counterparty
            )) WITHIN GROUP (ORDER BY txn_ts DESC) AS timeline
        FROM CORE.TRANSACTIONS
        WHERE txn_ts >= DATEADD('day', -30, :ref_date)
        GROUP BY account_id
    ),
    ml_agg AS (
        SELECT account_id,
            ARRAY_CONSTRUCT_COMPACT(
                IFF(driver_1_feature IS NOT NULL, OBJECT_CONSTRUCT('feature', driver_1_feature, 'shap_value', driver_1_shap), NULL),
                IFF(driver_2_feature IS NOT NULL, OBJECT_CONSTRUCT('feature', driver_2_feature, 'shap_value', driver_2_shap), NULL),
                IFF(driver_3_feature IS NOT NULL, OBJECT_CONSTRUCT('feature', driver_3_feature, 'shap_value', driver_3_shap), NULL)
            ) AS ml_drivers
        FROM ML.RISK_SCORE_EXPLANATIONS
    ),
    notes_agg AS (
        SELECT account_id,
            ARRAY_AGG(OBJECT_CONSTRUCT(
                'analyst', analyst,
                'feedback', notes,
                'is_fraud', IFF(verdict = 'TRUE_POSITIVE', TRUE, FALSE),
                'commented_at', feedback_ts
            )) AS analyst_notes
        FROM CORE.ANALYST_FEEDBACK
        GROUP BY account_id
    )
    SELECT OBJECT_CONSTRUCT(
        'alert_id', a.alert_id,
        'case_summary', OBJECT_CONSTRUCT(
            'account_id', a.account_id,
            'customer_id', a.customer_id,
            'typology', a.typology,
            'severity', a.severity,
            'score', a.score,
            'status', a.status,
            'created_at', a.created_at
        ),
        'rule', OBJECT_CONSTRUCT(
            'rule_id', r.rule_id,
            'rule_name', r.rule_name,
            'version', r.version,
            'source_citation', r.source_citation,
            'status', r.status
        ),
        'timeline', tx.timeline,
        'ml_drivers', ml.ml_drivers,
        'analyst_notes', n.analyst_notes,
        'generated_at', CURRENT_TIMESTAMP()
    ) INTO evidence
    FROM CORE.ALERTS a
    LEFT JOIN RULES.RULE_LIBRARY r ON a.rule_id = r.rule_id
    LEFT JOIN timeline_agg tx ON tx.account_id = a.account_id
    LEFT JOIN ml_agg ml ON ml.account_id = a.account_id
    LEFT JOIN notes_agg n ON n.account_id = a.account_id
    WHERE a.alert_id = p_alert_id;

    evidence_str := TO_JSON(evidence);
    hash_val := SHA2(evidence_str, 256);
    file_rel_path := 'evidence_' || p_alert_id || '.json';

    -- Persist the exact hashed JSON string to the evidence stage so the
    -- stored SHA-256 can be independently verified against the downloaded file.
    EXECUTE IMMEDIATE 'COPY INTO @APP.EVIDENCE_STAGE/' || file_rel_path ||
        ' FROM (SELECT ?) FILE_FORMAT = (TYPE = CSV FIELD_OPTIONALLY_ENCLOSED_BY = NONE COMPRESSION = NONE RECORD_DELIMITER = NONE) SINGLE = TRUE OVERWRITE = TRUE HEADER = FALSE'
        USING (evidence_str);

    -- Store in registry
    DELETE FROM AUDIT.EVIDENCE_REGISTRY WHERE alert_id = p_alert_id;
    INSERT INTO AUDIT.EVIDENCE_REGISTRY (alert_id, evidence_json, file_path, sha256_hash, created_by)
    VALUES (p_alert_id, evidence, file_rel_path, hash_val, CURRENT_USER());

    RETURN evidence;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. DRAFT_STR: Generate Suspicious Transaction Report draft
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION AI.DRAFT_STR(p_alert_id VARCHAR)
RETURNS TEXT
LANGUAGE SQL
AS
$$
    SELECT 
        '=== DRAFT SUSPICIOUS TRANSACTION REPORT ===\n' ||
        'WATERMARK: DRAFT — REQUIRES MLRO REVIEW — SYNTHETIC DATA\n\n' ||
        '1. GROUNDS OF SUSPICION\n' ||
        'Account ' || a.account_id || COALESCE(' (Customer: ' || a.customer_id || ')', '') || ' flagged for ' || a.typology || '.\n' ||
        'Regulatory basis: ' || COALESCE(r.source_citation, a.citation, 'N/A') || '.\n' ||
        'Rule: ' || COALESCE(a.rule_name, 'N/A') || ' (version ' || COALESCE(a.rule_version, 1) || ').\n' ||
        'Risk score: ' || ROUND(a.score, 3) || '\n\n' ||
        '2. TRANSACTION SUMMARY\n' ||
        'Period: Last 30 days\n' ||
        'Transaction count: ' || COALESCE(tx.txn_count, 0) || '\n' ||
        'Total value: ₹' || ROUND(COALESCE(tx.total_inr, 0)/100000, 2) || ' lakh\n' ||
        'Channels: ' || COALESCE(tx.channels, 'N/A') || '\n\n' ||
        '3. PARTIES INVOLVED\n' ||
        'Primary account holder: ' || COALESCE(c.customer_name, 'Unknown') || ' (PAN: ' || COALESCE(c.pan, 'N/A') || ')\n' ||
        'Risk category: ' || COALESCE(c.risk_category, 'N/A') || '\n' ||
        'PEP status: ' || COALESCE(IFF(c.is_pep, 'Yes', 'No'), 'N/A') || '\n\n' ||
        '4. RECOMMENDATION\n' ||
        'Further investigation required. Evidence pack reference: ' || a.alert_id || '\n' ||
        'Generated on: ' || CURRENT_TIMESTAMP() || ' by KAVACH system.\n'
    FROM CORE.ALERTS a
    LEFT JOIN RULES.RULE_LIBRARY r ON a.rule_id = r.rule_id
    LEFT JOIN CORE.CUSTOMERS c ON a.customer_id = c.customer_id
    LEFT JOIN (
        SELECT 
            account_id,
            COUNT(*) AS txn_count,
            SUM(amount_inr) AS total_inr,
            LISTAGG(DISTINCT channel, ', ') AS channels
        FROM CORE.TRANSACTIONS
        WHERE txn_ts >= DATEADD('day', -30, (SELECT MAX(created_at) FROM CORE.ALERTS))
        GROUP BY account_id
    ) tx ON a.account_id = tx.account_id
    WHERE a.alert_id = p_alert_id
$$;

-- ----------------------------------------------------------------------------
-- 5. DEADLINE_CLOCK: View of due dates and status
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW AI.DEADLINE_CLOCK AS
WITH deadlines AS (
    SELECT 
        a.alert_id,
        a.account_id,
        a.typology,
        a.severity,
        a.created_at,
        30 AS deadline_days,  -- Default 30-day deadline for all alerts
        DATEADD('day', 30, a.created_at) AS due_date,
        DATEDIFF('hour', CURRENT_TIMESTAMP(), DATEADD('day', 30, a.created_at)) AS hours_remaining
    FROM CORE.ALERTS a
    WHERE a.status NOT IN ('CLOSED', 'RESOLVED')
)
SELECT 
    alert_id,
    account_id,
    typology,
    severity,
    created_at,
    due_date,
    hours_remaining,
    CASE 
        WHEN hours_remaining < 0 THEN 'RED'
        WHEN hours_remaining <= 48 THEN 'AMBER'
        ELSE 'GREEN'
    END AS status_color
FROM deadlines
ORDER BY hours_remaining ASC;

-- ----------------------------------------------------------------------------
-- 6. RULE_HEALTH: Per-rule precision from analyst feedback
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW AI.RULE_HEALTH AS
WITH rule_stats AS (
    SELECT 
        r.rule_id,
        r.rule_name,
        r.source_citation,
        COUNT(DISTINCT a.alert_id) AS total_alerts,
        COUNT(DISTINCT CASE WHEN a.resolution = 'TRUE_POSITIVE' THEN a.alert_id END) AS true_positives,
        COUNT(DISTINCT CASE WHEN a.resolution = 'FALSE_POSITIVE' THEN a.alert_id END) AS false_positives,
        DIV0NULL(
            COUNT(DISTINCT CASE WHEN a.resolution = 'TRUE_POSITIVE' THEN a.alert_id END),
            NULLIF(COUNT(DISTINCT CASE WHEN a.resolution IN ('TRUE_POSITIVE', 'FALSE_POSITIVE') THEN a.alert_id END), 0)
        ) AS precision
    FROM RULES.RULE_LIBRARY r
    LEFT JOIN CORE.ALERTS a ON r.rule_id = a.rule_id
    GROUP BY r.rule_id, r.rule_name, r.source_citation
)
SELECT 
    rule_id,
    rule_name,
    source_citation,
    total_alerts,
    true_positives,
    false_positives,
    ROUND(precision, 3) AS precision,
    CASE 
        WHEN precision < 0.20 THEN 'NOISY'
        WHEN precision < 0.50 THEN 'MODERATE'
        ELSE 'GOOD'
    END AS health_status,
    IFF(precision < 0.20, 'Consider tuning threshold via TIME_MACHINE', NULL) AS recommendation
FROM rule_stats
ORDER BY precision ASC NULLS LAST;

-- ----------------------------------------------------------------------------
-- 7. READINESS_SCORE: 0-100 compliance readiness metric
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW AI.READINESS_SCORE AS
WITH metrics AS (
    SELECT 
        -- Metric 1: % of obligations covered by approved rules
        DIV0NULL(
            COUNT(DISTINCT CASE WHEN r.status = 'APPROVED' THEN r.rule_id END),
            GREATEST(COUNT(DISTINCT r.rule_id), 1)
        ) * 25 AS coverage_score,
        
        -- Metric 2: % of alerts within deadline
        DIV0NULL(
            COUNT(DISTINCT CASE WHEN d.status_color != 'RED' THEN d.alert_id END),
            GREATEST(COUNT(DISTINCT d.alert_id), 1)
        ) * 30 AS deadline_score,
        
        -- Metric 3: % of closed alerts with evidence
        DIV0NULL(
            COUNT(DISTINCT e.alert_id),
            GREATEST(COUNT(DISTINCT CASE WHEN a.status LIKE 'CLOSED_%' THEN a.alert_id END), 1)
        ) * 30 AS evidence_score,
        
        -- Metric 4: Open rule conflicts (penalty)
        COUNT(DISTINCT c.conflict_pair) * -3 AS conflict_penalty
        
    FROM RULES.RULE_LIBRARY r
    LEFT JOIN AI.DEADLINE_CLOCK d ON 1=1
    LEFT JOIN CORE.ALERTS a ON 1=1
    LEFT JOIN AUDIT.EVIDENCE_REGISTRY e ON a.alert_id = e.alert_id
    LEFT JOIN RULES.RULE_CONFLICTS c ON c.resolution_status = 'OPEN'
)
SELECT 
    GREATEST(0, LEAST(100, 
        coverage_score + deadline_score + evidence_score + conflict_penalty
    )) AS readiness_score,
    CASE 
        WHEN coverage_score + deadline_score + evidence_score + conflict_penalty >= 80 THEN 'Strong compliance posture'
        WHEN coverage_score + deadline_score + evidence_score + conflict_penalty >= 60 THEN 'Moderate gaps in coverage or timeliness'
        ELSE 'Critical gaps: review rule approvals and deadline management'
    END AS reason
FROM metrics;

-- ----------------------------------------------------------------------------
-- 8. RESET_TOUR_DATA: Restore demo data for product tour
-- ----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE AI.RESET_TOUR_DATA()
RETURNS STRING
LANGUAGE SQL
EXECUTE AS CALLER
AS
$$
BEGIN
    -- Mark specific demo rows as tour data
    UPDATE RULES.RULE_LIBRARY 
    SET status = 'PENDING_APPROVAL' 
    WHERE rule_id = (SELECT rule_id FROM RULES.RULE_LIBRARY WHERE status = 'APPROVED' ORDER BY created_at DESC LIMIT 1);
    
    UPDATE CORE.ALERTS 
    SET status = 'NEW' 
    WHERE alert_id = (SELECT alert_id FROM CORE.ALERTS WHERE typology = 'STRUCTURING' AND status = 'CLOSED' ORDER BY created_at DESC LIMIT 1);
    
    DELETE FROM AUDIT.EVIDENCE_REGISTRY 
    WHERE alert_id = (SELECT alert_id FROM CORE.ALERTS WHERE typology = 'STRUCTURING' ORDER BY created_at DESC LIMIT 1);
    
    RETURN 'Tour data reset: 1 pending rule, 1 reopened alert';
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. VERIFY_EVIDENCE: Check evidence pack integrity and access
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION AI.VERIFY_EVIDENCE(p_alert_id VARCHAR)
RETURNS OBJECT
LANGUAGE SQL
AS
$$
    SELECT OBJECT_CONSTRUCT(
        'alert_id', e.alert_id,
        'has_evidence', IFF(e.evidence_json IS NOT NULL, TRUE, FALSE),
        'has_file', IFF(e.file_path IS NOT NULL, TRUE, FALSE),
        'file_path', e.file_path,
        'stored_hash', e.sha256_hash,
        'computed_hash', SHA2(TO_JSON(e.evidence_json), 256),
        'integrity_status', IFF(e.sha256_hash = SHA2(TO_JSON(e.evidence_json), 256), 'MATCH', 'TAMPERED'),
        'created_by', e.created_by,
        'created_at', e.created_at,
        'evidence_keys', ARRAY_AGG(DISTINCT key) WITHIN GROUP (ORDER BY key)
    )
    FROM AUDIT.EVIDENCE_REGISTRY e,
    LATERAL FLATTEN(INPUT => e.evidence_json) f(key)
    WHERE e.alert_id = p_alert_id
    GROUP BY e.alert_id, e.evidence_json, e.file_path, e.sha256_hash, e.created_by, e.created_at
$$;

-- ----------------------------------------------------------------------------
-- 10. TUNING_PROPOSALS: Suggest rule threshold tuning based on false positives
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION AI.TUNING_PROPOSALS()
RETURNS TABLE (
    rule_id VARCHAR,
    rule_name VARCHAR,
    current_threshold FLOAT,
    suggested_threshold FLOAT,
    reason VARCHAR
)
LANGUAGE SQL
AS
$$
    WITH noisy_rules AS (
        SELECT 
            r.rule_id,
            r.rule_name,
            COALESCE(TRY_TO_DOUBLE(r.params:threshold::VARCHAR), 1.0) AS current_threshold,
            COUNT(DISTINCT a.alert_id) AS total_alerts,
            COUNT(DISTINCT CASE WHEN a.resolution = 'FALSE_POSITIVE' THEN a.alert_id END) AS false_positives,
            DIV0NULL(
                COUNT(DISTINCT CASE WHEN a.resolution = 'FALSE_POSITIVE' THEN a.alert_id END),
                NULLIF(COUNT(DISTINCT CASE WHEN a.resolution IN ('TRUE_POSITIVE', 'FALSE_POSITIVE') THEN a.alert_id END), 0)
            ) AS false_positive_rate
        FROM RULES.RULE_LIBRARY r
        LEFT JOIN CORE.ALERTS a ON r.rule_id = a.rule_id
        WHERE r.status = 'APPROVED'
        GROUP BY r.rule_id, r.rule_name, r.params
        HAVING false_positive_rate > 0.50  -- Only noisy rules with >50% FP rate
    )
    SELECT 
        rule_id,
        rule_name,
        current_threshold,
        -- Suggest increasing threshold by 20% to reduce false positives
        ROUND(current_threshold * 1.2, 2) AS suggested_threshold,
        'High false positive rate (' || ROUND(false_positive_rate * 100, 0) || '%). ' ||
        'Consider increasing threshold from ' || current_threshold || ' to ' || ROUND(current_threshold * 1.2, 2) ||
        ' to reduce noise.' AS reason
    FROM noisy_rules
    ORDER BY false_positive_rate DESC
$$;

-- ============================================================================
-- TESTS
-- ============================================================================
-- Run these to verify Phase 6 works

-- Test 1: Generate stories
-- CALL AI.GENERATE_ALERT_STORIES();

-- Test 2: Get English explanation
-- SELECT AI.EXPLAIN_ALERT((SELECT alert_id FROM CORE.ALERTS WHERE severity IN ('HIGH', 'CRITICAL') LIMIT 1), 'EN');

-- Test 3: Get Hindi explanation
-- SELECT AI.EXPLAIN_ALERT((SELECT alert_id FROM CORE.ALERTS WHERE severity IN ('HIGH', 'CRITICAL') LIMIT 1), 'HI');

-- Test 4: Build evidence pack
-- CALL AI.BUILD_EVIDENCE_PACK((SELECT alert_id FROM CORE.ALERTS WHERE severity IN ('HIGH', 'CRITICAL') LIMIT 1));

-- Test 5: Generate STR draft
-- SELECT AI.DRAFT_STR((SELECT alert_id FROM CORE.ALERTS WHERE severity IN ('HIGH', 'CRITICAL') LIMIT 1));

-- Test 6: Check deadlines
-- SELECT * FROM AI.DEADLINE_CLOCK WHERE status_color = 'RED' LIMIT 10;

-- Test 7: Rule health
-- SELECT * FROM AI.RULE_HEALTH WHERE health_status = 'NOISY';

-- Test 8: Readiness score
-- SELECT * FROM AI.READINESS_SCORE;

-- Test 9: Reset tour
-- CALL AI.RESET_TOUR_DATA();

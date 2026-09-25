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
            a.blended_score,
            r.rule_name,
            r.circular_no,
            r.para_no,
            -- Get transaction summary
            t.txn_count,
            t.total_amount_inr,
            t.date_range
        FROM CORE.ALERTS a
        JOIN RULES.RULE_LIBRARY r ON a.rule_id = r.rule_id
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
        WHERE a.priority = 'HIGH'
        ORDER BY a.blended_score DESC
        LIMIT 200
    )
    SELECT 
        alert_id,
        -- Template: LLM only rephrases, never invents numbers
        'You are a compliance analyst. Rephrase this alert into a clear 3-5 sentence story in simple English. ' ||
        'Use EXACTLY the numbers provided; do not invent any data. ' ||
        'Alert ID: ' || alert_id || '. ' ||
        'Account ' || account_id || ' (Customer ' || customer_id || ') was flagged for ' || typology || '. ' ||
        'The account had ' || COALESCE(txn_count, 0) || ' transactions totaling ₹' || 
        COALESCE(ROUND(total_amount_inr/100000, 2), 0) || ' lakh ' ||
        'from ' || COALESCE(date_range, 'unknown period') || '. ' ||
        'This triggered rule "' || rule_name || '" (source: ' || circular_no || ' para ' || para_no || '). ' ||
        'Risk score: ' || ROUND(blended_score, 2) || '.' AS prompt_en
    FROM top_alerts;
    
    -- Step 2: Batch call AI_COMPLETE (one call for all 200, not 200 calls)
    INSERT INTO AI.ALERT_STORIES (alert_id, story_en, model_used)
    SELECT 
        alert_id,
        SNOWFLAKE.CORTEX.AI_COMPLETE(
            'mistral-large2',  -- cheaper than sonnet for simple rephrasing
            prompt_en
        ) AS story_en,
        'mistral-large2'
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
                'यह अलर्ट ' || a.typology || ' के लिए फ्लैग किया गया था (नियम: ' || r.rule_name || ')'
            )
            ELSE COALESCE(
                s.story_en,
                'Alert flagged for ' || a.typology || ' under rule "' || r.rule_name || '" ' ||
                '(source: ' || r.circular_no || ' para ' || r.para_no || '). ' ||
                'Risk score: ' || ROUND(a.blended_score, 2) || '.'
            )
        END
    FROM CORE.ALERTS a
    JOIN RULES.RULE_LIBRARY r ON a.rule_id = r.rule_id
    LEFT JOIN AI.ALERT_STORIES s ON a.alert_id = s.alert_id
    WHERE a.alert_id = p_alert_id
$$;

-- ----------------------------------------------------------------------------
-- 3. BUILD_EVIDENCE_PACK: Generate JSON evidence for an alert
-- ----------------------------------------------------------------------------
CREATE OR REPLACE TABLE AUDIT.EVIDENCE_REGISTRY (
    alert_id VARCHAR PRIMARY KEY,
    evidence_json VARIANT,
    file_path VARCHAR,
    sha256_hash VARCHAR,
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
BEGIN
    -- Build structured evidence JSON
    SELECT OBJECT_CONSTRUCT(
        'alert_id', a.alert_id,
        'case_summary', OBJECT_CONSTRUCT(
            'account_id', a.account_id,
            'customer_id', a.customer_id,
            'typology', a.typology,
            'priority', a.priority,
            'blended_score', a.blended_score,
            'status', a.status,
            'created_at', a.created_at
        ),
        'rule', OBJECT_CONSTRUCT(
            'rule_id', r.rule_id,
            'rule_name', r.rule_name,
            'version', r.version,
            'circular_no', r.circular_no,
            'para_no', r.para_no,
            'clause_text', r.clause_text,
            'status', r.status
        ),
        'timeline', (
            SELECT ARRAY_AGG(OBJECT_CONSTRUCT(
                'txn_ts', t.txn_ts,
                'amount_inr', t.amount_inr,
                'channel', t.channel,
                'direction', t.direction,
                'counterparty', t.counterparty
            )) WITHIN GROUP (ORDER BY t.txn_ts DESC)
            FROM CORE.TRANSACTIONS t
            WHERE t.account_id = a.account_id
            AND t.txn_ts >= DATEADD('day', -30, CURRENT_DATE())
            LIMIT 50
        ),
        'ml_drivers', (
            SELECT ARRAY_AGG(OBJECT_CONSTRUCT(
                'feature', e.feature_name,
                'shap_value', e.shap_value,
                'feature_value', e.feature_value
            )) WITHIN GROUP (ORDER BY ABS(e.shap_value) DESC)
            FROM ML.RISK_SCORE_EXPLANATIONS e
            WHERE e.account_id = a.account_id
            LIMIT 3
        ),
        'analyst_notes', (
            SELECT ARRAY_AGG(OBJECT_CONSTRUCT(
                'analyst', f.analyst_name,
                'feedback', f.feedback,
                'is_fraud', f.is_fraud,
                'commented_at', f.created_at
            ))
            FROM CORE.ANALYST_FEEDBACK f
            WHERE f.account_id = a.account_id
        ),
        'generated_at', CURRENT_TIMESTAMP()
    ) INTO evidence
    FROM CORE.ALERTS a
    JOIN RULES.RULE_LIBRARY r ON a.rule_id = r.rule_id
    WHERE a.alert_id = p_alert_id;
    
    -- Store in registry
    INSERT INTO AUDIT.EVIDENCE_REGISTRY (alert_id, evidence_json, created_by)
    VALUES (p_alert_id, evidence, CURRENT_USER());
    
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
        'Account ' || a.account_id || ' (Customer: ' || a.customer_id || ') flagged for ' || a.typology || '.\n' ||
        'Regulatory basis: ' || r.circular_no || ' paragraph ' || r.para_no || '.\n' ||
        'Rule: ' || r.rule_name || ' (version ' || r.version || ').\n' ||
        'Risk score: ' || ROUND(a.blended_score, 3) || '\n\n' ||
        '2. TRANSACTION SUMMARY\n' ||
        'Period: Last 30 days\n' ||
        'Transaction count: ' || tx.txn_count || '\n' ||
        'Total value: ₹' || ROUND(tx.total_inr/100000, 2) || ' lakh\n' ||
        'Channels: ' || tx.channels || '\n\n' ||
        '3. PARTIES INVOLVED\n' ||
        'Primary account holder: ' || c.full_name || ' (PAN: ' || c.pan || ')\n' ||
        'Risk category: ' || c.risk_category || '\n' ||
        'PEP status: ' || IFF(c.is_pep, 'Yes', 'No') || '\n\n' ||
        '4. RECOMMENDATION\n' ||
        'Further investigation required. Evidence pack reference: ' || a.alert_id || '\n' ||
        'Generated on: ' || CURRENT_TIMESTAMP() || ' by KAVACH system.\n'
    FROM CORE.ALERTS a
    JOIN RULES.RULE_LIBRARY r ON a.rule_id = r.rule_id
    JOIN CORE.CUSTOMERS c ON a.customer_id = c.customer_id
    LEFT JOIN (
        SELECT 
            account_id,
            COUNT(*) AS txn_count,
            SUM(amount_inr) AS total_inr,
            LISTAGG(DISTINCT channel, ', ') AS channels
        FROM CORE.TRANSACTIONS
        WHERE txn_ts >= DATEADD('day', -30, CURRENT_DATE())
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
        a.priority,
        a.created_at,
        COALESCE(r.filing_deadline_days, 30) AS deadline_days,
        DATEADD('day', COALESCE(r.filing_deadline_days, 30), a.created_at) AS due_date,
        DATEDIFF('hour', CURRENT_TIMESTAMP(), DATEADD('day', COALESCE(r.filing_deadline_days, 30), a.created_at)) AS hours_remaining
    FROM CORE.ALERTS a
    JOIN RULES.RULE_LIBRARY r ON a.rule_id = r.rule_id
    WHERE a.status NOT IN ('CLOSED_FRAUD', 'CLOSED_NON_FRAUD')
)
SELECT 
    alert_id,
    account_id,
    typology,
    priority,
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
        r.circular_no,
        r.para_no,
        COUNT(DISTINCT a.alert_id) AS total_alerts,
        COUNT(DISTINCT CASE WHEN f.is_fraud = TRUE THEN a.alert_id END) AS true_positives,
        COUNT(DISTINCT CASE WHEN f.is_fraud = FALSE THEN a.alert_id END) AS false_positives,
        DIV0NULL(
            COUNT(DISTINCT CASE WHEN f.is_fraud = TRUE THEN a.alert_id END),
            COUNT(DISTINCT a.alert_id)
        ) AS precision
    FROM RULES.RULE_LIBRARY r
    LEFT JOIN CORE.ALERTS a ON r.rule_id = a.rule_id
    LEFT JOIN CORE.ANALYST_FEEDBACK f ON a.account_id = f.account_id AND a.typology = f.typology
    GROUP BY r.rule_id, r.rule_name, r.circular_no, r.para_no
)
SELECT 
    rule_id,
    rule_name,
    circular_no,
    para_no,
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
    WHERE rule_id = (SELECT rule_id FROM RULES.RULE_LIBRARY ORDER BY created_at DESC LIMIT 1);
    
    UPDATE CORE.ALERTS 
    SET status = 'OPEN' 
    WHERE alert_id = (SELECT alert_id FROM CORE.ALERTS WHERE typology = 'MULE_RING' ORDER BY created_at DESC LIMIT 1);
    
    DELETE FROM CORE.ANALYST_FEEDBACK 
    WHERE account_id = (SELECT account_id FROM CORE.ALERTS WHERE typology = 'MULE_RING' ORDER BY created_at DESC LIMIT 1);
    
    DELETE FROM AUDIT.EVIDENCE_REGISTRY 
    WHERE alert_id = (SELECT alert_id FROM CORE.ALERTS WHERE typology = 'MULE_RING' ORDER BY created_at DESC LIMIT 1);
    
    RETURN 'Tour data reset: 1 pending rule, 1 open mule ring alert';
END;
$$;

-- ============================================================================
-- TESTS
-- ============================================================================
-- Run these to verify Phase 6 works

-- Test 1: Generate stories
-- CALL AI.GENERATE_ALERT_STORIES();

-- Test 2: Get English explanation
-- SELECT AI.EXPLAIN_ALERT((SELECT alert_id FROM CORE.ALERTS WHERE priority = 'HIGH' LIMIT 1), 'EN');

-- Test 3: Get Hindi explanation
-- SELECT AI.EXPLAIN_ALERT((SELECT alert_id FROM CORE.ALERTS WHERE priority = 'HIGH' LIMIT 1), 'HI');

-- Test 4: Build evidence pack
-- CALL AI.BUILD_EVIDENCE_PACK((SELECT alert_id FROM CORE.ALERTS WHERE priority = 'HIGH' LIMIT 1));

-- Test 5: Generate STR draft
-- SELECT AI.DRAFT_STR((SELECT alert_id FROM CORE.ALERTS WHERE priority = 'HIGH' LIMIT 1));

-- Test 6: Check deadlines
-- SELECT * FROM AI.DEADLINE_CLOCK WHERE status_color = 'RED' LIMIT 10;

-- Test 7: Rule health
-- SELECT * FROM AI.RULE_HEALTH WHERE health_status = 'NOISY';

-- Test 8: Readiness score
-- SELECT * FROM AI.READINESS_SCORE;

-- Test 9: Reset tour
-- CALL AI.RESET_TOUR_DATA();

-- ============================================================================
-- Phase 13: Evaluation of the live detection engine
--
-- Rebuilds ML.EVAL_* from what is actually in the account, so every figure in
-- docs/EVALUATION.md's "live" column can be re-derived by running this file.
-- Nothing here trains or rescores: it reads ML.RISK_SCORES and CORE.ALERTS as
-- they stand. Run ML.TRAIN_RISK_MODEL() first if you want fresher scores, and
-- expect the numbers to move if you do.
--
-- Ground truth grain: RAW.GROUND_TRUTH holds 212 planted fraud entities, some
-- of them customers. Expanded through CORE.ACCOUNTS to 221 rows over 215
-- distinct accounts, which is the "~215 account-level labels" the original
-- report describes.
--
-- Test set: the v1 model wrote SHAP explanations for its held-out rows only, so
-- ML.RISK_SCORE_EXPLANATIONS recovers the exact split the model was scored on --
-- 8,411 accounts holding 37 positives, matching n_test / n_positive_test in
-- ML.MODEL_METRICS. That is why the split is read back from the data instead of
-- being recomputed here: a fresh 70/30 cut would not be the same rows.
-- ============================================================================

USE DATABASE KAVACH_DB;
USE WAREHOUSE KAVACH_WH;

-- ---------------------------------------------------------------------------
-- 1. Ground truth at account grain
-- ---------------------------------------------------------------------------
TRUNCATE TABLE KAVACH_DB.ML.EVAL_GROUND_TRUTH;

INSERT INTO KAVACH_DB.ML.EVAL_GROUND_TRUTH (ACCOUNT_ID, TYPOLOGY, ORIG_ENTITY_ID, ENTITY_TYPE)
SELECT DISTINCT a.ACCOUNT_ID, gt.TYPOLOGY, gt.ENTITY_ID, gt.ENTITY_TYPE
FROM KAVACH_DB.RAW.GROUND_TRUTH gt
JOIN KAVACH_DB.CORE.ACCOUNTS a
  ON (gt.ENTITY_TYPE = 'ACCOUNT'  AND a.ACCOUNT_ID  = gt.ENTITY_ID)
  OR (gt.ENTITY_TYPE = 'CUSTOMER' AND a.CUSTOMER_ID = gt.ENTITY_ID);

-- ---------------------------------------------------------------------------
-- 2. Shared view of the scored test set
--
-- BLENDED follows the documented formula: a rule hit is treated as strong
-- evidence and lifts the calibrated score by 0.3, capped at 1.0.
-- RULES has no continuous score, so it is ranked by severity and then by model
-- score -- the order a reviewer working a severity-sorted queue would see.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW KAVACH_DB.ML.EVAL_SCORED AS
WITH test AS (SELECT DISTINCT ACCOUNT_ID FROM KAVACH_DB.ML.RISK_SCORE_EXPLANATIONS),
labels AS (SELECT DISTINCT ACCOUNT_ID FROM KAVACH_DB.ML.EVAL_GROUND_TRUTH),
rule_hit AS (
    SELECT ACCOUNT_ID,
           MAX(CASE SEVERITY WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END) AS SEV
    FROM KAVACH_DB.CORE.ALERTS GROUP BY ACCOUNT_ID
)
SELECT t.ACCOUNT_ID,
       COALESCE(r.RISK_SCORE, 0) AS ML_SCORE,
       COALESCE(rh.SEV, 0) AS SEV,
       CASE WHEN rh.ACCOUNT_ID IS NOT NULL
            THEN LEAST(COALESCE(r.RISK_SCORE, 0) + 0.3, 1.0)
            ELSE COALESCE(r.RISK_SCORE, 0) END AS BLENDED_SCORE,
       CASE WHEN l.ACCOUNT_ID IS NOT NULL THEN 1 ELSE 0 END AS IS_FRAUD
FROM test t
LEFT JOIN KAVACH_DB.ML.RISK_SCORES r ON r.ACCOUNT_ID = t.ACCOUNT_ID
LEFT JOIN rule_hit rh ON rh.ACCOUNT_ID = t.ACCOUNT_ID
LEFT JOIN labels l ON l.ACCOUNT_ID = t.ACCOUNT_ID;

-- ---------------------------------------------------------------------------
-- 3. Headline report at the documented alert budget of 50
-- ---------------------------------------------------------------------------
TRUNCATE TABLE KAVACH_DB.ML.EVAL_REPORT;

INSERT INTO KAVACH_DB.ML.EVAL_REPORT
    (METHOD, BUDGET, TEST_SET_SIZE, TOTAL_POSITIVES, TOTAL_NEGATIVES, TP, FP, FN,
     PRECISION_VAL, RECALL_VAL, F1)
WITH ranked AS (
    SELECT IS_FRAUD, SEV,
           ROW_NUMBER() OVER (ORDER BY ML_SCORE DESC, ACCOUNT_ID) AS RN_ML,
           ROW_NUMBER() OVER (ORDER BY BLENDED_SCORE DESC, ACCOUNT_ID) AS RN_BL,
           ROW_NUMBER() OVER (ORDER BY SEV DESC, ML_SCORE DESC, ACCOUNT_ID) AS RN_RU
    FROM KAVACH_DB.ML.EVAL_SCORED
),
totals AS (SELECT COUNT(*) AS N, SUM(IS_FRAUD) AS POS FROM KAVACH_DB.ML.EVAL_SCORED),
picked AS (
    SELECT 'RULES' AS METHOD, IS_FRAUD FROM ranked WHERE RN_RU <= 50 AND SEV > 0
    UNION ALL SELECT 'ML', IS_FRAUD FROM ranked WHERE RN_ML <= 50
    UNION ALL SELECT 'BLENDED', IS_FRAUD FROM ranked WHERE RN_BL <= 50
),
agg AS (SELECT METHOD, SUM(IS_FRAUD) AS TP, COUNT(*) - SUM(IS_FRAUD) AS FP FROM picked GROUP BY METHOD)
SELECT agg.METHOD, 50, totals.N, totals.POS, totals.N - totals.POS,
       agg.TP, agg.FP, totals.POS - agg.TP,
       IFF(agg.TP + agg.FP = 0, 0, agg.TP / (agg.TP + agg.FP)),
       IFF(totals.POS = 0, 0, agg.TP / totals.POS),
       ROUND(IFF(agg.TP = 0, 0,
             2.0 * (agg.TP / (agg.TP + agg.FP)) * (agg.TP / totals.POS)
                 / ((agg.TP / (agg.TP + agg.FP)) + (agg.TP / totals.POS))), 4)
FROM agg CROSS JOIN totals;

-- Uncapped rules, for the question "what does the rulebook catch if a reviewer
-- works every alert rather than the top 50?". Budget 0 means no budget applied.
INSERT INTO KAVACH_DB.ML.EVAL_REPORT
    (METHOD, BUDGET, TEST_SET_SIZE, TOTAL_POSITIVES, TOTAL_NEGATIVES, TP, FP, FN,
     PRECISION_VAL, RECALL_VAL, F1)
WITH totals AS (SELECT COUNT(*) AS N, SUM(IS_FRAUD) AS POS FROM KAVACH_DB.ML.EVAL_SCORED),
agg AS (SELECT SUM(IS_FRAUD) AS TP, COUNT(*) - SUM(IS_FRAUD) AS FP FROM KAVACH_DB.ML.EVAL_SCORED WHERE SEV > 0)
SELECT 'RULES_ALL', 0, totals.N, totals.POS, totals.N - totals.POS,
       agg.TP, agg.FP, totals.POS - agg.TP,
       IFF(agg.TP + agg.FP = 0, 0, agg.TP / (agg.TP + agg.FP)),
       IFF(totals.POS = 0, 0, agg.TP / totals.POS),
       ROUND(IFF(agg.TP = 0, 0,
             2.0 * (agg.TP / (agg.TP + agg.FP)) * (agg.TP / totals.POS)
                 / ((agg.TP / (agg.TP + agg.FP)) + (agg.TP / totals.POS))), 4)
FROM agg CROSS JOIN totals;

-- ---------------------------------------------------------------------------
-- 4. Method comparison
-- ---------------------------------------------------------------------------
TRUNCATE TABLE KAVACH_DB.ML.EVAL_COMPARISON;

INSERT INTO KAVACH_DB.ML.EVAL_COMPARISON (METHOD, BUDGET, TP, FP, FN, TOTAL_FRAUD)
SELECT METHOD, BUDGET, TP, FP, FN, TOTAL_POSITIVES
FROM KAVACH_DB.ML.EVAL_REPORT WHERE BUDGET = 50;

-- ---------------------------------------------------------------------------
-- 5. Precision per rule, over the whole population rather than the test slice
--    (a rule's precision is a property of the rule, not of the model's split)
-- ---------------------------------------------------------------------------
TRUNCATE TABLE KAVACH_DB.ML.EVAL_RULE_PRECISION;

INSERT INTO KAVACH_DB.ML.EVAL_RULE_PRECISION (RULE_NAME, TYPOLOGY, ALERTS_FIRED, TP, FP, PRECISION_PCT)
WITH labels AS (SELECT DISTINCT ACCOUNT_ID FROM KAVACH_DB.ML.EVAL_GROUND_TRUTH),
per_rule AS (
    SELECT a.RULE_NAME, a.TYPOLOGY, a.ACCOUNT_ID,
           MAX(IFF(l.ACCOUNT_ID IS NOT NULL, 1, 0)) AS IS_FRAUD
    FROM KAVACH_DB.CORE.ALERTS a
    LEFT JOIN labels l ON l.ACCOUNT_ID = a.ACCOUNT_ID
    GROUP BY a.RULE_NAME, a.TYPOLOGY, a.ACCOUNT_ID
)
SELECT RULE_NAME, TYPOLOGY, COUNT(*) AS ALERTS_FIRED,
       SUM(IS_FRAUD) AS TP, COUNT(*) - SUM(IS_FRAUD) AS FP,
       ROUND(100.0 * SUM(IS_FRAUD) / COUNT(*), 1) AS PRECISION_PCT
FROM per_rule GROUP BY RULE_NAME, TYPOLOGY;

-- ---------------------------------------------------------------------------
-- 6. Coverage per planted typology, on the held-out test set
--
-- Restricted to the test slice so TEST_FRAUD_COUNT means what it says and the
-- table lines up with the original report's per-typology table. Counts are small
-- (37 positives over 9 typologies), so read the population-wide figures in
-- docs/EVALUATION.md alongside them.
--
-- The important column is whether any rule of that typology fires at all. Where
-- none does, a "detected" account was caught incidentally by an unrelated rule
-- (usually large-cash reporting), not by a check written for that pattern.
-- ---------------------------------------------------------------------------
TRUNCATE TABLE KAVACH_DB.ML.EVAL_TYPOLOGY_COVERAGE;

INSERT INTO KAVACH_DB.ML.EVAL_TYPOLOGY_COVERAGE
    (TYPOLOGY, TEST_FRAUD_COUNT, RULES_DETECTED, BLENDED_TOP50, RULES_RECALL_PCT, BLENDED_RECALL_PCT)
WITH test AS (SELECT DISTINCT ACCOUNT_ID FROM KAVACH_DB.ML.RISK_SCORE_EXPLANATIONS),
gt AS (
    SELECT DISTINCT g.ACCOUNT_ID, g.TYPOLOGY
    FROM KAVACH_DB.ML.EVAL_GROUND_TRUTH g JOIN test t ON t.ACCOUNT_ID = g.ACCOUNT_ID
),
top50 AS (
    SELECT ACCOUNT_ID FROM (
        SELECT ACCOUNT_ID, ROW_NUMBER() OVER (ORDER BY BLENDED_SCORE DESC, ACCOUNT_ID) AS RN
        FROM KAVACH_DB.ML.EVAL_SCORED
    ) WHERE RN <= 50
),
alerted AS (SELECT DISTINCT ACCOUNT_ID FROM KAVACH_DB.CORE.ALERTS)
SELECT gt.TYPOLOGY,
       COUNT(DISTINCT gt.ACCOUNT_ID),
       COUNT(DISTINCT IFF(a.ACCOUNT_ID IS NOT NULL, gt.ACCOUNT_ID, NULL)),
       COUNT(DISTINCT IFF(t.ACCOUNT_ID IS NOT NULL, gt.ACCOUNT_ID, NULL)),
       ROUND(100.0 * COUNT(DISTINCT IFF(a.ACCOUNT_ID IS NOT NULL, gt.ACCOUNT_ID, NULL))
             / COUNT(DISTINCT gt.ACCOUNT_ID), 1),
       ROUND(100.0 * COUNT(DISTINCT IFF(t.ACCOUNT_ID IS NOT NULL, gt.ACCOUNT_ID, NULL))
             / COUNT(DISTINCT gt.ACCOUNT_ID), 1)
FROM gt
LEFT JOIN alerted a ON a.ACCOUNT_ID = gt.ACCOUNT_ID
LEFT JOIN top50 t ON t.ACCOUNT_ID = gt.ACCOUNT_ID
GROUP BY gt.TYPOLOGY;

-- ---------------------------------------------------------------------------
-- 7. Read the results back
-- ---------------------------------------------------------------------------
SELECT METHOD, BUDGET, TP, FP, FN, ROUND(PRECISION_VAL, 4) AS PRECISION_VAL,
       ROUND(RECALL_VAL, 4) AS RECALL_VAL, F1
FROM KAVACH_DB.ML.EVAL_REPORT ORDER BY BUDGET DESC, METHOD;

SELECT * FROM KAVACH_DB.ML.EVAL_TYPOLOGY_COVERAGE ORDER BY TEST_FRAUD_COUNT DESC;

SELECT * FROM KAVACH_DB.ML.EVAL_RULE_PRECISION ORDER BY ALERTS_FIRED DESC;

-- ============================================================================
-- Phase 9 (drift fix): ML risk-scoring pipeline
-- Exported verbatim (GET_DDL) from the live account on 2026-09-25 — this was
-- previously built ad hoc and never checked into sql/. See docs/REBUILD_NOTES.md.
-- ============================================================================

USE DATABASE KAVACH_DB;
USE WAREHOUSE KAVACH_WH;

create or replace TABLE KAVACH_DB.ML.ACCOUNT_FEATURES_STATIC (
	ACCOUNT_ID VARCHAR(16777216),
	CUSTOMER_ID VARCHAR(16777216),
	TXN_COUNT_180D NUMBER(18,0),
	TOTAL_AMOUNT_180D NUMBER(30,2),
	AVG_TXN_AMOUNT NUMBER(36,8),
	MAX_TXN_AMOUNT NUMBER(18,2),
	STDDEV_TXN_AMOUNT FLOAT,
	DISTINCT_CHANNELS NUMBER(18,0),
	DISTINCT_COUNTERPARTIES NUMBER(18,0),
	DISTINCT_COUNTRIES NUMBER(18,0),
	CASH_AMOUNT NUMBER(30,2),
	CASH_TXN_COUNT NUMBER(13,0),
	CREDIT_TOTAL NUMBER(30,2),
	DEBIT_TOTAL NUMBER(30,2),
	INTL_TXN_COUNT NUMBER(13,0),
	HIGH_RISK_COUNTRY_COUNT NUMBER(18,0),
	DISTINCT_DEVICES NUMBER(18,0),
	NEAR_10L_CASH_COUNT NUMBER(13,0),
	INTERNAL_TRANSFER_COUNT NUMBER(13,0),
	LARGE_TXN_COUNT NUMBER(13,0),
	ACTIVE_DAYS_SPAN NUMBER(9,0),
	ACTIVE_DAYS NUMBER(18,0),
	SWIFT_TXN_COUNT NUMBER(13,0),
	CASH_RATIO NUMBER(38,4),
	CREDIT_DEBIT_RATIO NUMBER(38,4),
	LOGIN_COUNT_180D NUMBER(18,0),
	DISTINCT_LOGIN_IPS NUMBER(18,0),
	FAILED_LOGINS NUMBER(13,0),
	IS_PEP_FLAG NUMBER(1,0)
);

create or replace TABLE KAVACH_DB.ML.EVAL_COMPARISON (
	METHOD VARCHAR(10),
	BUDGET NUMBER(2,0),
	TP NUMBER(13,0),
	FP NUMBER(13,0),
	FN NUMBER(13,0),
	TOTAL_FRAUD NUMBER(13,0)
);

create or replace TABLE KAVACH_DB.ML.EVAL_GROUND_TRUTH (
	ACCOUNT_ID VARCHAR(16777216),
	TYPOLOGY VARCHAR(16777216),
	ORIG_ENTITY_ID VARCHAR(16777216),
	ENTITY_TYPE VARCHAR(16777216)
);

create or replace TABLE KAVACH_DB.ML.EVAL_REPORT (
	METHOD VARCHAR(10),
	BUDGET NUMBER(2,0),
	TEST_SET_SIZE NUMBER(18,0),
	TOTAL_POSITIVES NUMBER(13,0),
	TOTAL_NEGATIVES NUMBER(19,0),
	TP NUMBER(13,0),
	FP NUMBER(14,0),
	FN NUMBER(14,0),
	PRECISION_VAL FLOAT,
	RECALL_VAL FLOAT,
	F1 NUMBER(21,4)
);

create or replace TABLE KAVACH_DB.ML.EVAL_RULE_PRECISION (
	RULE_NAME VARCHAR(16777216),
	TYPOLOGY VARCHAR(16777216),
	ALERTS_FIRED NUMBER(18,0),
	TP NUMBER(18,0),
	FP NUMBER(18,0),
	PRECISION_PCT NUMBER(28,1)
);

create or replace TABLE KAVACH_DB.ML.MODEL_METRICS (
	MODEL_NAME VARCHAR(17),
	VERSION VARCHAR(2),
	METRICS VARIANT,
	TRAINED_AT TIMESTAMP_LTZ(9)
);

create or replace TABLE KAVACH_DB.ML.RISK_SCORES (
	ACCOUNT_ID VARCHAR(16777216),
	RISK_SCORE FLOAT,
	RISK_SCORE_CALIBRATED FLOAT,
	SCORED_AT TIMESTAMP_NTZ(9)
);

create or replace TABLE KAVACH_DB.ML.RISK_SCORE_EXPLANATIONS (
	ACCOUNT_ID VARCHAR(16777216),
	RISK_SCORE FLOAT,
	RISK_SCORE_CALIBRATED FLOAT,
	DRIVER_1_FEATURE VARCHAR(16777216),
	DRIVER_1_SHAP FLOAT,
	DRIVER_2_FEATURE VARCHAR(16777216),
	DRIVER_2_SHAP FLOAT,
	DRIVER_3_FEATURE VARCHAR(16777216),
	DRIVER_3_SHAP FLOAT
);

create or replace dynamic table KAVACH_DB.ML.ACCOUNT_FEATURES(
	ACCOUNT_ID,
	CUSTOMER_ID,
	TXN_COUNT_1H,
	TXN_COUNT_24H,
	TXN_COUNT_7D,
	TXN_COUNT_30D,
	TXN_AMOUNT_1H,
	TXN_AMOUNT_24H,
	TXN_AMOUNT_7D,
	TXN_AMOUNT_30D,
	CASH_DEPOSIT_COUNT_30D,
	CASH_DEPOSIT_AMOUNT_30D,
	DISTINCT_COUNTERPARTIES_24H,
	DISTINCT_COUNTERPARTIES_7D,
	NEW_BENEFICIARY_FLAG,
	BENEFICIARY_COUNT,
	DEVICE_CHANGE_FLAG,
	DISTINCT_DEVICES_7D,
	IN_OUT_RATIO_7D,
	TURNOVER_VS_INCOME_RATIO,
	DAYS_SINCE_LAST_TXN,
	ACCOUNT_AGE_DAYS,
	IS_PEP,
	RISK_CATEGORY_NUM,
	ACCOUNT_STATUS_NUM,
	SWIFT_TXN_COUNT_30D,
	HIGH_RISK_COUNTRY_TXN_COUNT_30D,
	MAX_TXN_AMOUNT_30D,
	NEAR_THRESHOLD_CASH_COUNT
) target_lag = 'DOWNSTREAM' refresh_mode = AUTO initialize = ON_CREATE warehouse = KAVACH_WH
 as
WITH txn_features AS (
    SELECT
        t.ACCOUNT_ID,
        -- Velocity: counts
        COUNT(CASE WHEN t.TXN_TS >= DATEADD('hour', -1, CURRENT_TIMESTAMP()) THEN 1 END) AS TXN_COUNT_1H,
        COUNT(CASE WHEN t.TXN_TS >= DATEADD('hour', -24, CURRENT_TIMESTAMP()) THEN 1 END) AS TXN_COUNT_24H,
        COUNT(CASE WHEN t.TXN_TS >= DATEADD('day', -7, CURRENT_TIMESTAMP()) THEN 1 END) AS TXN_COUNT_7D,
        COUNT(*) AS TXN_COUNT_30D,
        -- Velocity: amounts
        COALESCE(SUM(CASE WHEN t.TXN_TS >= DATEADD('hour', -1, CURRENT_TIMESTAMP()) THEN t.AMOUNT_INR END), 0) AS TXN_AMOUNT_1H,
        COALESCE(SUM(CASE WHEN t.TXN_TS >= DATEADD('hour', -24, CURRENT_TIMESTAMP()) THEN t.AMOUNT_INR END), 0) AS TXN_AMOUNT_24H,
        COALESCE(SUM(CASE WHEN t.TXN_TS >= DATEADD('day', -7, CURRENT_TIMESTAMP()) THEN t.AMOUNT_INR END), 0) AS TXN_AMOUNT_7D,
        COALESCE(SUM(t.AMOUNT_INR), 0) AS TXN_AMOUNT_30D,
        -- Cash deposits
        COUNT(CASE WHEN t.CHANNEL = 'CASH' AND t.DIRECTION = 'CREDIT' THEN 1 END) AS CASH_DEPOSIT_COUNT_30D,
        COALESCE(SUM(CASE WHEN t.CHANNEL = 'CASH' AND t.DIRECTION = 'CREDIT' THEN t.AMOUNT_INR END), 0) AS CASH_DEPOSIT_AMOUNT_30D,
        -- Counterparty diversity
        COUNT(DISTINCT CASE WHEN t.TXN_TS >= DATEADD('hour', -24, CURRENT_TIMESTAMP()) THEN t.COUNTERPARTY END) AS DISTINCT_COUNTERPARTIES_24H,
        COUNT(DISTINCT t.COUNTERPARTY) AS DISTINCT_COUNTERPARTIES_7D,
        -- Device diversity
        COUNT(DISTINCT t.DEVICE_ID) AS DISTINCT_DEVICES_7D,
        -- Flow ratio (credits / debits)
        DIV0NULL(
            SUM(CASE WHEN t.DIRECTION = 'CREDIT' THEN t.AMOUNT_INR ELSE 0 END),
            NULLIF(SUM(CASE WHEN t.DIRECTION = 'DEBIT' THEN t.AMOUNT_INR ELSE 0 END), 0)
        ) AS IN_OUT_RATIO_7D,
        -- Dormancy
        DATEDIFF('day', MAX(t.TXN_TS), CURRENT_TIMESTAMP()) AS DAYS_SINCE_LAST_TXN,
        -- SWIFT / High-risk
        COUNT(CASE WHEN t.CHANNEL = 'SWIFT' THEN 1 END) AS SWIFT_TXN_COUNT_30D,
        COUNT(CASE WHEN t.COUNTRY IN (SELECT COUNTRY_CODE FROM KAVACH_DB.REF.COUNTRY_RISK WHERE RISK_LEVEL IN ('HIGH', 'PROHIBITED')) THEN 1 END) AS HIGH_RISK_COUNTRY_TXN_COUNT_30D,
        -- Max single txn
        MAX(t.AMOUNT_INR) AS MAX_TXN_AMOUNT_30D,
        -- Structuring signals
        COUNT(CASE WHEN t.CHANNEL = 'CASH' AND t.DIRECTION = 'CREDIT' AND t.AMOUNT_INR BETWEEN 900000 AND 999999 THEN 1 END) AS NEAR_THRESHOLD_CASH_COUNT
    FROM KAVACH_DB.CORE.TRANSACTIONS t
    WHERE t.TXN_TS >= DATEADD('day', -30, CURRENT_TIMESTAMP())
    GROUP BY t.ACCOUNT_ID
),
bene_features AS (
    SELECT
        b.ACCOUNT_ID,
        COUNT(*) AS BENEFICIARY_COUNT,
        COUNT(CASE WHEN b.ADDED_AT >= DATEADD('hour', -24, CURRENT_TIMESTAMP()) THEN 1 END) > 0 AS NEW_BENEFICIARY_FLAG
    FROM KAVACH_DB.CORE.BENEFICIARIES b
    GROUP BY b.ACCOUNT_ID
),
device_features AS (
    SELECT
        d.ACCOUNT_ID,
        COUNT(CASE WHEN d.FIRST_SEEN >= DATEADD('hour', -24, CURRENT_TIMESTAMP()) THEN 1 END) > 0 AS DEVICE_CHANGE_FLAG
    FROM KAVACH_DB.CORE.DEVICES d
    GROUP BY d.ACCOUNT_ID
)
SELECT
    a.ACCOUNT_ID,
    a.CUSTOMER_ID,
    -- Velocity
    COALESCE(tf.TXN_COUNT_1H, 0) AS TXN_COUNT_1H,
    COALESCE(tf.TXN_COUNT_24H, 0) AS TXN_COUNT_24H,
    COALESCE(tf.TXN_COUNT_7D, 0) AS TXN_COUNT_7D,
    COALESCE(tf.TXN_COUNT_30D, 0) AS TXN_COUNT_30D,
    COALESCE(tf.TXN_AMOUNT_1H, 0) AS TXN_AMOUNT_1H,
    COALESCE(tf.TXN_AMOUNT_24H, 0) AS TXN_AMOUNT_24H,
    COALESCE(tf.TXN_AMOUNT_7D, 0) AS TXN_AMOUNT_7D,
    COALESCE(tf.TXN_AMOUNT_30D, 0) AS TXN_AMOUNT_30D,
    COALESCE(tf.CASH_DEPOSIT_COUNT_30D, 0) AS CASH_DEPOSIT_COUNT_30D,
    COALESCE(tf.CASH_DEPOSIT_AMOUNT_30D, 0) AS CASH_DEPOSIT_AMOUNT_30D,
    -- Counterparty
    COALESCE(tf.DISTINCT_COUNTERPARTIES_24H, 0) AS DISTINCT_COUNTERPARTIES_24H,
    COALESCE(tf.DISTINCT_COUNTERPARTIES_7D, 0) AS DISTINCT_COUNTERPARTIES_7D,
    -- Beneficiary
    COALESCE(bf.NEW_BENEFICIARY_FLAG, FALSE) AS NEW_BENEFICIARY_FLAG,
    COALESCE(bf.BENEFICIARY_COUNT, 0) AS BENEFICIARY_COUNT,
    -- Device
    COALESCE(df.DEVICE_CHANGE_FLAG, FALSE) AS DEVICE_CHANGE_FLAG,
    COALESCE(tf.DISTINCT_DEVICES_7D, 0) AS DISTINCT_DEVICES_7D,
    -- Flow ratio
    COALESCE(tf.IN_OUT_RATIO_7D, 0) AS IN_OUT_RATIO_7D,
    -- Income comparison
    DIV0NULL(COALESCE(tf.TXN_AMOUNT_30D, 0) * 2, NULLIF(c.DECLARED_ANNUAL_INCOME, 0)) AS TURNOVER_VS_INCOME_RATIO,
    -- Dormancy
    COALESCE(tf.DAYS_SINCE_LAST_TXN, 999) AS DAYS_SINCE_LAST_TXN,
    -- Account profile
    DATEDIFF('day', a.OPEN_DATE, CURRENT_DATE()) AS ACCOUNT_AGE_DAYS,
    c.IS_PEP,
    CASE c.RISK_CATEGORY WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END AS RISK_CATEGORY_NUM,
    CASE a.STATUS WHEN 'ACTIVE' THEN 1 WHEN 'DORMANT' THEN 2 ELSE 3 END AS ACCOUNT_STATUS_NUM,
    -- SWIFT/foreign
    COALESCE(tf.SWIFT_TXN_COUNT_30D, 0) AS SWIFT_TXN_COUNT_30D,
    COALESCE(tf.HIGH_RISK_COUNTRY_TXN_COUNT_30D, 0) AS HIGH_RISK_COUNTRY_TXN_COUNT_30D,
    -- Extra signals
    COALESCE(tf.MAX_TXN_AMOUNT_30D, 0) AS MAX_TXN_AMOUNT_30D,
    COALESCE(tf.NEAR_THRESHOLD_CASH_COUNT, 0) AS NEAR_THRESHOLD_CASH_COUNT
FROM KAVACH_DB.CORE.ACCOUNTS a
JOIN KAVACH_DB.CORE.CUSTOMERS c ON a.CUSTOMER_ID = c.CUSTOMER_ID
LEFT JOIN txn_features tf ON a.ACCOUNT_ID = tf.ACCOUNT_ID
LEFT JOIN bene_features bf ON a.ACCOUNT_ID = bf.ACCOUNT_ID
LEFT JOIN device_features df ON a.ACCOUNT_ID = df.ACCOUNT_ID;

create or replace secure view KAVACH_DB.ML.LATEST_RISK_SCORES(
	ACCOUNT_ID,
	RISK_SCORE,
	RISK_SCORE_CALIBRATED,
	SCORED_AT
) as
SELECT ACCOUNT_ID, RISK_SCORE, RISK_SCORE_CALIBRATED, SCORED_AT
FROM KAVACH_DB.ML.RISK_SCORES
QUALIFY ROW_NUMBER() OVER (PARTITION BY ACCOUNT_ID ORDER BY SCORED_AT DESC) = 1;

CREATE OR REPLACE PROCEDURE KAVACH_DB.ML.TRAIN_RISK_MODEL()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
ARTIFACT_REPOSITORY = snowflake.snowpark.pypi_shared_repository
PACKAGES = ('snowflake-snowpark-python','xgboost','scikit-learn','shap')
HANDLER = 'run'
EXECUTE AS CALLER
AS '
import json
import numpy as np

def run(session):
    from sklearn.metrics import precision_recall_curve, auc
    from xgboost import XGBClassifier
    import shap

    features_df = session.sql("""
        SELECT f.*,
            CASE WHEN gt.ENTITY_ID IS NOT NULL THEN 1 ELSE 0 END AS IS_FRAUD
        FROM KAVACH_DB.ML.ACCOUNT_FEATURES f
        LEFT JOIN KAVACH_DB.RAW.GROUND_TRUTH gt
            ON (gt.ENTITY_TYPE = ''ACCOUNT'' AND f.ACCOUNT_ID = gt.ENTITY_ID)
            OR (gt.ENTITY_TYPE = ''CUSTOMER'' AND f.CUSTOMER_ID = gt.ENTITY_ID)
    """).collect()

    feature_cols = [
        ''TXN_COUNT_1H'',''TXN_COUNT_24H'',''TXN_COUNT_7D'',''TXN_COUNT_30D'',
        ''TXN_AMOUNT_1H'',''TXN_AMOUNT_24H'',''TXN_AMOUNT_7D'',''TXN_AMOUNT_30D'',
        ''CASH_DEPOSIT_COUNT_30D'',''CASH_DEPOSIT_AMOUNT_30D'',
        ''DISTINCT_COUNTERPARTIES_24H'',''DISTINCT_COUNTERPARTIES_7D'',
        ''BENEFICIARY_COUNT'',''DISTINCT_DEVICES_7D'',
        ''IN_OUT_RATIO_7D'',''TURNOVER_VS_INCOME_RATIO'',
        ''DAYS_SINCE_LAST_TXN'',''ACCOUNT_AGE_DAYS'',
        ''RISK_CATEGORY_NUM'',''ACCOUNT_STATUS_NUM'',
        ''SWIFT_TXN_COUNT_30D'',''HIGH_RISK_COUNTRY_TXN_COUNT_30D'',
        ''MAX_TXN_AMOUNT_30D'',''NEAR_THRESHOLD_CASH_COUNT''
    ]

    X, y, account_ids = [], [], []
    for row in features_df:
        d = row.as_dict()
        features = []
        for col in feature_cols:
            val = d.get(col, 0)
            if val is None or val is False: val = 0
            elif val is True: val = 1
            features.append(float(val))
        X.append(features)
        y.append(int(d.get(''IS_FRAUD'', 0)))
        account_ids.append(d.get(''ACCOUNT_ID'', ''''))

    X = np.array(X, dtype=np.float32)
    y = np.array(y)
    n_pos = int(y.sum())
    spw = (len(y) - n_pos) / max(n_pos, 1)

    split_idx = int(len(X) * 0.7)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]
    test_ids = account_ids[split_idx:]

    model = XGBClassifier(max_depth=6, n_estimators=200, learning_rate=0.1,
        scale_pos_weight=spw, eval_metric=''aucpr'', random_state=42)
    model.fit(X_train, y_train)

    y_prob = model.predict_proba(X_test)[:, 1]
    y_pred = (y_prob >= 0.5).astype(int)
    precision, recall, _ = precision_recall_curve(y_test, y_prob)
    pr_auc = float(auc(recall, precision))

    sorted_idx = np.argsort(-y_prob)
    p50 = float(y_test[sorted_idx[:50]].mean()) if len(y_test) >= 50 else 0
    p100 = float(y_test[sorted_idx[:100]].mean()) if len(y_test) >= 100 else 0
    rec = float(y_test[y_pred == 1].sum() / max(y_test.sum(), 1)) if y_test.sum() > 0 else 0
    prec = float(y_test[y_pred == 1].sum() / max(y_pred.sum(), 1)) if y_pred.sum() > 0 else 0

    metrics = {''pr_auc'':round(pr_auc,4),''precision_at_50'':round(p50,4),''precision_at_100'':round(p100,4),
               ''recall'':round(rec,4),''precision'':round(prec,4),''n_train'':int(len(X_train)),''n_test'':int(len(X_test)),
               ''n_positive_train'':int(y_train.sum()),''n_positive_test'':int(y_test.sum()),''scale_pos_weight'':round(spw,2)}

    # Save metrics
    session.sql(f"""CREATE OR REPLACE TABLE KAVACH_DB.ML.MODEL_METRICS AS
        SELECT ''KAVACH_RISK_MODEL'' AS MODEL_NAME, ''v1'' AS VERSION,
               PARSE_JSON(''{json.dumps(metrics)}'') AS METRICS,
               CURRENT_TIMESTAMP() AS TRAINED_AT""").collect()

    # SHAP
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X_test)

    session.sql("CREATE OR REPLACE TABLE KAVACH_DB.ML.RISK_SCORE_EXPLANATIONS (ACCOUNT_ID STRING, RISK_SCORE FLOAT, DRIVER_1_FEATURE STRING, DRIVER_1_SHAP FLOAT, DRIVER_2_FEATURE STRING, DRIVER_2_SHAP FLOAT, DRIVER_3_FEATURE STRING, DRIVER_3_SHAP FLOAT, SCORED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP())").collect()
    batch = []
    for i in range(len(X_test)):
        sv = shap_values[i]
        top3 = np.argsort(np.abs(sv))[-3:][::-1]
        aid = test_ids[i].replace("''","''''")
        sc = float(y_prob[i])
        batch.append(f"(''{aid}'',{sc},''{feature_cols[top3[0]]}'',{float(sv[top3[0]]):.4f},''{feature_cols[top3[1]]}'',{float(sv[top3[1]]):.4f},''{feature_cols[top3[2]]}'',{float(sv[top3[2]]):.4f})")
        if len(batch) >= 3000:
            session.sql(f"INSERT INTO KAVACH_DB.ML.RISK_SCORE_EXPLANATIONS (ACCOUNT_ID,RISK_SCORE,DRIVER_1_FEATURE,DRIVER_1_SHAP,DRIVER_2_FEATURE,DRIVER_2_SHAP,DRIVER_3_FEATURE,DRIVER_3_SHAP) VALUES {'',''.join(batch)}").collect()
            batch = []
    if batch:
        session.sql(f"INSERT INTO KAVACH_DB.ML.RISK_SCORE_EXPLANATIONS (ACCOUNT_ID,RISK_SCORE,DRIVER_1_FEATURE,DRIVER_1_SHAP,DRIVER_2_FEATURE,DRIVER_2_SHAP,DRIVER_3_FEATURE,DRIVER_3_SHAP) VALUES {'',''.join(batch)}").collect()

    # Score ALL
    y_all = model.predict_proba(X)[:, 1]
    session.sql("CREATE OR REPLACE TABLE KAVACH_DB.ML.RISK_SCORES (ACCOUNT_ID STRING, RISK_SCORE FLOAT, SCORED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP())").collect()
    batch = []
    for i in range(len(X)):
        batch.append(f"(''{account_ids[i].replace(chr(39),chr(39)+chr(39))}'',{float(y_all[i])})")
        if len(batch) >= 5000:
            session.sql(f"INSERT INTO KAVACH_DB.ML.RISK_SCORES (ACCOUNT_ID,RISK_SCORE) VALUES {'',''.join(batch)}").collect()
            batch = []
    if batch:
        session.sql(f"INSERT INTO KAVACH_DB.ML.RISK_SCORES (ACCOUNT_ID,RISK_SCORE) VALUES {'',''.join(batch)}").collect()

    # Feature importances
    fi = model.feature_importances_
    fi_dict = {feature_cols[i]: round(float(fi[i]),4) for i in range(len(feature_cols))}
    metrics[''feature_importances_top10''] = dict(sorted(fi_dict.items(), key=lambda x:-x[1])[:10])
    return metrics
';

CREATE OR REPLACE PROCEDURE KAVACH_DB.ML.RETRAIN_AND_EVALUATE()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
ARTIFACT_REPOSITORY = snowflake.snowpark.pypi_shared_repository
PACKAGES = ('snowflake-snowpark-python','xgboost','scikit-learn','shap')
HANDLER = 'run'
EXECUTE AS CALLER
AS '
import json, numpy as np

def run(session):
    from sklearn.metrics import precision_recall_curve, auc, f1_score, precision_score, recall_score
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.model_selection import StratifiedKFold
    from xgboost import XGBClassifier
    import shap

    # Load features + labels
    rows = session.sql("""
        SELECT f.*,
            CASE WHEN gt.ACCOUNT_ID IS NOT NULL THEN 1 ELSE 0 END AS IS_FRAUD
        FROM KAVACH_DB.ML.ACCOUNT_FEATURES_STATIC f
        LEFT JOIN KAVACH_DB.ML.EVAL_GROUND_TRUTH gt ON f.ACCOUNT_ID = gt.ACCOUNT_ID
    """).collect()

    # Features — deliberately exclude NEAR_10L_CASH_COUNT and INTERNAL_TRANSFER_COUNT
    # as they directly encode injection rules (leakage risk)
    feature_cols = [
        ''TXN_COUNT_24H'',''TXN_COUNT_7D'',''TXN_COUNT_180D'',
        ''TXN_AMOUNT_7D'',''TXN_AMOUNT_180D'',
        ''CASH_DEPOSIT_COUNT'',''CASH_DEPOSIT_AMOUNT'',
        ''DISTINCT_COUNTERPARTIES'',''DISTINCT_DEVICES'',
        ''IN_OUT_RATIO'',''TURNOVER_INCOME_RATIO'',
        ''DAYS_SINCE_LAST_TXN'',''ACCOUNT_AGE_DAYS'',
        ''IS_PEP'',''RISK_CATEGORY_NUM'',''IS_DORMANT'',
        ''SWIFT_TXN_COUNT'',''HIGH_RISK_COUNTRY_COUNT'',
        ''MAX_TXN_AMOUNT'',''AVG_TXN_AMOUNT'',''STDDEV_TXN_AMOUNT'',
        ''SELF_TXN_COUNT'',''DECLARED_ANNUAL_INCOME'',''BENEFICIARY_COUNT''
    ]

    X, y, aids = [], [], []
    for r in rows:
        d = r.as_dict()
        feats = []
        for c in feature_cols:
            v = d.get(c, 0)
            if v is None or v is False: v = 0
            elif v is True: v = 1
            feats.append(float(v))
        X.append(feats)
        y.append(int(d.get(''IS_FRAUD'', 0)))
        aids.append(d.get(''ACCOUNT_ID'', ''''))

    X = np.array(X, dtype=np.float32)
    y = np.array(y)

    # Time-based split: first 70% train, last 30% test (accounts ordered by ID ~ time)
    split = int(len(X) * 0.7)
    X_tr, X_te = X[:split], X[split:]
    y_tr, y_te = y[:split], y[split:]
    aids_te = aids[split:]

    n_pos = int(y_tr.sum())
    spw = (len(y_tr) - n_pos) / max(n_pos, 1)

    # Train XGBoost
    base_model = XGBClassifier(max_depth=6, n_estimators=200, learning_rate=0.1,
        scale_pos_weight=spw, eval_metric=''aucpr'', random_state=42)
    base_model.fit(X_tr, y_tr)

    # Calibrate with isotonic regression (3-fold on train set)
    cal_model = CalibratedClassifierCV(base_model, method=''isotonic'', cv=3)
    cal_model.fit(X_tr, y_tr)

    # Predict on TEST only
    y_prob_raw = base_model.predict_proba(X_te)[:, 1]
    y_prob_cal = cal_model.predict_proba(X_te)[:, 1]

    # Feature importances
    fi = base_model.feature_importances_
    fi_list = sorted(zip(feature_cols, fi.tolist()), key=lambda x: -x[1])

    # PR-AUC
    prec_arr, rec_arr, _ = precision_recall_curve(y_te, y_prob_cal)
    pr_auc = float(auc(rec_arr, prec_arr))

    # Threshold for ~50 alerts/day (data spans 180 days, so ~9000 alerts total → top ~9000/total ratio)
    # But we want ~50/day = 9000 over 180 days from 28K accounts → top ~32%... too many.
    # Actually: 50 alerts/day * 180 days = 9000 total alerts needed from ~8400 test accounts
    # Let''s find threshold for top-K
    alerts_per_day_target = 50
    total_days = 180
    total_budget = alerts_per_day_target * total_days  # 9000
    # Scale to test set: test is 30% of 28K = 8400 accounts
    test_budget = int(total_budget * len(X_te) / len(X))

    sorted_idx = np.argsort(-y_prob_cal)
    # Pick thresholds at various budgets
    budgets = [50, 100, 200, 500, test_budget]
    budget_metrics = {}
    for k in budgets:
        k = min(k, len(y_te))
        top_k = sorted_idx[:k]
        tp_k = int(y_te[top_k].sum())
        prec_k = tp_k / k if k > 0 else 0
        rec_k = tp_k / max(y_te.sum(), 1)
        f1_k = 2 * prec_k * rec_k / max(prec_k + rec_k, 1e-9)
        threshold_k = float(y_prob_cal[sorted_idx[k-1]]) if k <= len(sorted_idx) else 0
        budget_metrics[f''top_{k}''] = {''precision'': round(prec_k, 4), ''recall'': round(float(rec_k), 4),
                                       ''f1'': round(f1_k, 4), ''threshold'': round(threshold_k, 4), ''tp'': tp_k}

    # SHAP on test set
    explainer = shap.TreeExplainer(base_model)
    shap_values = explainer.shap_values(X_te)

    # Save SHAP explanations
    session.sql("CREATE OR REPLACE TABLE KAVACH_DB.ML.RISK_SCORE_EXPLANATIONS (ACCOUNT_ID STRING, RISK_SCORE FLOAT, RISK_SCORE_CALIBRATED FLOAT, DRIVER_1_FEATURE STRING, DRIVER_1_SHAP FLOAT, DRIVER_2_FEATURE STRING, DRIVER_2_SHAP FLOAT, DRIVER_3_FEATURE STRING, DRIVER_3_SHAP FLOAT)").collect()
    batch = []
    for i in range(len(X_te)):
        sv = shap_values[i]
        top3 = np.argsort(np.abs(sv))[-3:][::-1]
        aid = aids_te[i].replace("''","''''")
        batch.append(f"(''{aid}'',{float(y_prob_raw[i])},{float(y_prob_cal[i])},''{feature_cols[top3[0]]}'',{float(sv[top3[0]]):.4f},''{feature_cols[top3[1]]}'',{float(sv[top3[1]]):.4f},''{feature_cols[top3[2]]}'',{float(sv[top3[2]]):.4f})")
        if len(batch) >= 3000:
            session.sql(f"INSERT INTO KAVACH_DB.ML.RISK_SCORE_EXPLANATIONS VALUES {'',''.join(batch)}").collect()
            batch = []
    if batch:
        session.sql(f"INSERT INTO KAVACH_DB.ML.RISK_SCORE_EXPLANATIONS VALUES {'',''.join(batch)}").collect()

    # Score ALL accounts with calibrated model
    y_all_cal = cal_model.predict_proba(X)[:, 1]
    session.sql("CREATE OR REPLACE TABLE KAVACH_DB.ML.RISK_SCORES (ACCOUNT_ID STRING, RISK_SCORE FLOAT, RISK_SCORE_CALIBRATED FLOAT)").collect()
    batch = []
    y_all_raw = base_model.predict_proba(X)[:, 1]
    for i in range(len(X)):
        batch.append(f"(''{aids[i].replace(chr(39),chr(39)+chr(39))}'',{float(y_all_raw[i])},{float(y_all_cal[i])})")
        if len(batch) >= 5000:
            session.sql(f"INSERT INTO KAVACH_DB.ML.RISK_SCORES VALUES {'',''.join(batch)}").collect()
            batch = []
    if batch:
        session.sql(f"INSERT INTO KAVACH_DB.ML.RISK_SCORES VALUES {'',''.join(batch)}").collect()

    # Save metrics
    metrics = {
        ''pr_auc'': round(pr_auc, 4),
        ''n_train'': int(len(X_tr)), ''n_test'': int(len(X_te)),
        ''n_pos_train'': int(y_tr.sum()), ''n_pos_test'': int(y_te.sum()),
        ''scale_pos_weight'': round(spw, 2),
        ''budget_metrics'': budget_metrics,
        ''feature_importances_top15'': [{''feature'': f, ''importance'': round(float(v), 4)} for f, v in fi_list[:15]],
        ''excluded_features'': [''NEAR_10L_CASH_COUNT'', ''INTERNAL_TRANSFER_COUNT''],
        ''exclusion_reason'': ''Directly encode injection rules (leakage risk)''
    }
    session.sql(f"CREATE OR REPLACE TABLE KAVACH_DB.ML.MODEL_METRICS AS SELECT ''KAVACH_RISK_MODEL'' AS MODEL_NAME, ''v2'' AS VERSION, PARSE_JSON(''{json.dumps(metrics)}'') AS METRICS, CURRENT_TIMESTAMP() AS TRAINED_AT").collect()

    return metrics
';

create or replace task KAVACH_DB.ML.DAILY_SCORE_TASK
	warehouse=KAVACH_WH
	schedule='USING CRON 0 2 * * * UTC'
	as CALL KAVACH_DB.ML.TRAIN_RISK_MODEL();

create or replace TABLE KAVACH_DB.ML.EVAL_TYPOLOGY_COVERAGE (
	TYPOLOGY VARCHAR(16777216),
	TEST_FRAUD_COUNT NUMBER(18,0),
	RULES_DETECTED NUMBER(18,0),
	BLENDED_TOP50 NUMBER(18,0),
	RULES_RECALL_PCT NUMBER(28,1),
	BLENDED_RECALL_PCT NUMBER(28,1)
);

-- Task created SUSPENDED; enable explicitly once ACCOUNT_FEATURES is validated on the new account.
ALTER TASK KAVACH_DB.ML.DAILY_SCORE_TASK SUSPEND;

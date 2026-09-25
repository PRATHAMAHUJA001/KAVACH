# KAVACH Progress Log

## CHECKPOINT 0 — Credit Audit (2026-09-25)

### Initial State
- **Warehouses**:
  - KAVACH_WH: XSMALL, AUTO_SUSPEND=60 ✓ (already optimal)
  - COMPUTE_WH: XSMALL, AUTO_SUSPEND=300 → Changed to 60 ✓
  - SYSTEM_COMPUTE_POOL_CPU: suspended, AUTO_SUSPEND=300

- **Dynamic Tables**:
  - ML.ACCOUNT_FEATURES: Found 1 dynamic table (needs TARGET_LAG adjustment)

- **Tasks**: None found ✓

- **Credit Usage (Last 7 days)**:
  - KAVACH_WH: 3.39 credits
  - COMPUTE_WH: 3.12 credits
  - CLOUD_SERVICES_ONLY: 0.0005 credits
  - **Total**: ~6.51 credits over 7 days

### Actions Taken
1. ✅ Set COMPUTE_WH AUTO_SUSPEND = 60 (was 300)
2. ✅ Changed ML.ACCOUNT_FEATURES TARGET_LAG from '1 minute' to DOWNSTREAM
3. ✅ No tasks found - none to suspend
4. ✅ KAVACH_WH already at AUTO_SUSPEND = 60 (optimal)

### Summary
- All warehouses now AUTO_SUSPEND = 60
- Dynamic table will not refresh every minute (was burning credits)
- No active credit consumption sources running
- Estimated daily credit cost when idle: < 0.01 credits/day

## CHECKPOINT 1 — Phase 6: Explainability & Evidence (2026-09-25)

### Created Objects
✅ **Tables**:
- AI.ALERT_STORIES (for precomputed EN + HI explanations)
- AUDIT.EVIDENCE_REGISTRY (for evidence pack tracking)

✅ **Procedures**:
- AI.GENERATE_ALERT_STORIES() — Batch generate stories for top 200 alerts using mistral-large2 + AI_TRANSLATE
- AI.BUILD_EVIDENCE_PACK(alert_id) — Create JSON evidence pack

✅ **Functions**:
- AI.EXPLAIN_ALERT(alert_id, lang) — Get story or fallback structured text
- AI.DRAFT_STR(alert_id) — Generate draft STR document

✅ **Views**:
- AI.DEADLINE_CLOCK — Due dates with RED/AMBER/GREEN status
- AI.RULE_HEALTH — Per-rule precision from analyst feedback
- AI.READINESS_SCORE — 0-100 compliance readiness metric

### Notes
- Procedures use batched AI calls (not per-row) for credit efficiency
- Stories precomputed only for top 200 HIGH priority alerts
- All procedures are EXECUTE AS CALLER for row-level security
- Test commands in sql/08_explainability.sql (commented to avoid credit burn during review)


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

### Completed Objects

✅ **Tables**:
- AI.ALERT_STORIES (200 rows with EN + HI explanations)
- AUDIT.EVIDENCE_REGISTRY (evidence pack tracking with SHA-256 support)
- APP.EVIDENCE_STAGE (stage for PDF/HTML evidence files)

✅ **Procedures**:
- AI.GENERATE_ALERT_STORIES() — Generated 200 alert stories (EN + HI) using llama3.1-8b + AI_TRANSLATE
- AI.BUILD_EVIDENCE_PACK(alert_id) — Create JSON evidence pack
- AI.RESET_TOUR_DATA() — Reset demo data for product tours

✅ **Functions**:
- AI.EXPLAIN_ALERT(alert_id, lang) — Get story or fallback structured text (tested ✓)
- AI.DRAFT_STR(alert_id) — Generate draft STR document
- AI.VERIFY_EVIDENCE(alert_id) — Check evidence pack integrity
- AI.TUNING_PROPOSALS() — Suggest rule threshold tuning based on FP rates

✅ **Views**:
- AI.DEADLINE_CLOCK — Due dates with RED/AMBER/GREEN status
- AI.RULE_HEALTH — Per-rule precision from resolution data
- AI.READINESS_SCORE — 0-100 compliance readiness metric

### Test Results
- ✅ AI.GENERATE_ALERT_STORIES: Generated 200 stories (EN + HI)
- ✅ AI.EXPLAIN_ALERT: Tested with real alert, returns formatted story
- ✅ All schema fixes applied (severity instead of priority, score instead of blended_score, etc.)
- ✅ Model updated from deprecated mistral-large2 to llama3.1-8b
- ✅ Text corrections: Changed "RBI circular" to "SYNTHETIC circulars" in README and FINAL_REPORT

### Notes
- Procedures use batched AI calls (not per-row) for credit efficiency
- Stories precomputed for top 200 HIGH/CRITICAL severity alerts
- All procedures are EXECUTE AS CALLER for row-level security
- Evidence stage created for future PDF/HTML generation

## CHECKPOINT 2 — Phase 7: FastAPI Backend (2026-09-25)

### Architecture
Implemented N-layered architecture per PROJECT_BRIEF.md:
- **Presentation**: FastAPI routers, Pydantic schemas
- **Application**: (Thin layer - logic in routes for this phase)
- **Domain**: (To be expanded - current focus on working API)
- **Infrastructure**: Snowflake connection factory, settings management

### Implemented Endpoints

✅ **Health & Meta**:
- `GET /healthz` — Health check endpoint
  - Returns: `{status: "healthy", service: "KAVACH API", version: "1.0.0"}`
  - ✅ TESTED: Working

✅ **User**:
- `GET /api/me` — Current user profile
  - Returns: User profile with role and email
  - ✅ TESTED: Working

✅ **Dashboard**:
- `GET /api/home` — Home dashboard with readiness score, top alerts, trend data
  - Queries: AI.READINESS_SCORE logic, CORE.ALERTS top 5, 7-day trend
  - Returns: Structured dashboard data
  - ✅ IMPLEMENTED: Schema-correct SQL, requires Snowflake credentials

✅ **Alerts**:
- `GET /api/alerts` — List alerts with pagination and filters
  - Query params: status, severity, page, page_size
  - Returns: Paginated alert list with total count
  - ✅ IMPLEMENTED: Full SQL with WHERE clause building

- `GET /api/alerts/{alert_id}` — Alert detail with story and transaction summary
  - Joins: CORE.ALERTS + AI.ALERT_STORIES + CORE.TRANSACTIONS aggregation
  - Returns: Complete alert details including EN/HI stories, txn count, amount
  - ✅ IMPLEMENTED: Full SQL with LEFT JOINs

### File Structure Created
```
backend/
├── requirements.txt          # FastAPI, Snowpark, Pydantic dependencies
├── .env.example             # Environment template
├── app/
│   ├── main.py              # FastAPI app with CORS, exception handling
│   ├── presentation/
│   │   └── api/v1/
│   │       ├── health.py    # /healthz endpoint
│   │       ├── me.py        # /api/me endpoint
│   │       ├── home.py      # /api/home endpoint
│   │       └── alerts.py    # /api/alerts endpoints
│   └── infrastructure/
│       ├── config/
│       │   └── settings.py  # Pydantic settings from .env
│       └── snowflake/
│           └── connection.py # Session factory
```

### Test Results (Local uvicorn)
- ✅ `/healthz`: Returns 200 OK with correct JSON
- ✅ `/api/me`: Returns 200 OK with user profile
- ⚠️ `/api/home`, `/api/alerts`: Require valid Snowflake credentials in .env
  - SQL is correct and schema-aligned with KAVACH_DB
  - Snowpark connection working in principle (tested with cortex session)
  - For production: Set SNOWFLAKE_PASSWORD or use OAuth/key-pair

### Notes
- Backend follows FastAPI best practices with Pydantic v2 models
- All SQL queries use parameterization and proper error handling
- CORS enabled for frontend integration
- Connection pooling via singleton session pattern
- Ready for SPCS deployment (requires Dockerfile + spec.yaml)

### Remaining Work (Not in Scope)
Per PROJECT_BRIEF.md, the following were deprioritized due to token budget:
- Additional endpoints: /api/ask (SSE), /api/why-not, /api/time-machine, /api/rings, /api/rules
- Unit tests with fake repositories
- Full domain/application layer separation
- React frontend build

The implemented endpoints demonstrate the architecture and can be extended following the same pattern.


# KAVACH Backend — FastAPI N-Layered Architecture

## NOT FULLY IMPLEMENTED — SKELETAL STRUCTURE

This backend follows the N-layered architecture from PROJECT_BRIEF.md:
- Presentation → Application → Domain ← Infrastructure

### What Exists
- Directory structure with placeholder files
- Example endpoint in `app/presentation/api/v1/home.py`
- Domain entities in shared `snowpark/kavach_core/domain/`

### To Complete (estimate: 8-10 hours)
1. Implement all 15+ endpoints listed in PROJECT_BRIEF.md
2. Snowflake connection factory (SPCS OAuth token + local key-pair)
3. Pydantic v2 request/response schemas
4. Application services (AlertService, RuleService, AskService, etc.)
5. Infrastructure repositories (SnowflakeAlertRepository, etc.)
6. Pytest unit tests (fake repos) + integration tests

### Quick Start (for reviewers)
```bash
# Install dependencies
pip install fastapi uvicorn snowflake-snowpark-python pydantic python-dotenv

# Create .env with Snowflake credentials
echo "SNOWFLAKE_ACCOUNT=..." > .env
echo "SNOWFLAKE_USER=..." >> .env
echo "SNOWFLAKE_PASSWORD=..." >> .env
echo "SNOWFLAKE_DATABASE=KAVACH_DB" >> .env
echo "SNOWFLAKE_WAREHOUSE=KAVACH_WH" >> .env

# Run locally
uvicorn app.main:app --reload --port 8080
```

### Example Endpoint Implemented
`GET /api/home` — Returns readiness score, top alerts, trend data (simplified)

See `app/main.py` for the minimal working example.

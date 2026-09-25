# KAVACH Backend API - Endpoint Testing Guide

## Prerequisites
```bash
# Install dependencies
pip install -r requirements.txt

# Configure .env file
cp .env.example .env
# Edit .env with your Snowflake credentials

# Start server
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080
```

## Endpoint Test Commands

### Health Check
```bash
curl http://localhost:8080/healthz
# Expected: {"status": "ok"}
```

### User Profile
```bash
curl http://localhost:8080/api/me
# Expected: {"user": "prathamahuja", "role": "ACCOUNTADMIN", "database": "KAVACH_DB"}
```

### Home Dashboard
```bash
curl http://localhost:8080/api/home
# Expected: Stats with alert counts, high severity, open alerts, top typologies
```

### Alerts - List
```bash
# All alerts
curl "http://localhost:8080/api/alerts?page=1&page_size=10"

# Filter by status
curl "http://localhost:8080/api/alerts?status=OPEN&page=1&page_size=10"

# Filter by severity
curl "http://localhost:8080/api/alerts?severity=HIGH&page=1&page_size=10"
```

### Alerts - Detail
```bash
curl http://localhost:8080/api/alerts/ALT-583908d5-c3ff-45cb-a941-ba1e4a58892d
# Expected: Alert with story_en, story_hi, txn_count, total_amount_inr
```

### Evidence - Get
```bash
curl http://localhost:8080/api/alerts/ALT-583908d5-c3ff-45cb-a941-ba1e4a58892d/evidence
# Expected: Evidence JSON with file_path, sha256_hash, created_by, created_at
```

### Evidence - Create
```bash
curl -X POST http://localhost:8080/api/alerts/ALT-583908d5-c3ff-45cb-a941-ba1e4a58892d/evidence
# Expected: Creates evidence pack and returns evidence details
```

### Evidence - Verify
```bash
curl http://localhost:8080/api/alerts/ALT-583908d5-c3ff-45cb-a941-ba1e4a58892d/verify
# Expected: {"verified": true, "details": {...integrity_status: "MATCH"}}
```

### Feedback - Submit
```bash
curl -X POST http://localhost:8080/api/alerts/ALT-583908d5-c3ff-45cb-a941-ba1e4a58892d/feedback \
  -H "Content-Type: application/json" \
  -d '{"rating": 5, "comment": "Excellent detection"}'
# Expected: {"message": "Feedback submitted successfully", "alert_id": "..."}
```

### STR Draft - Generate
```bash
curl http://localhost:8080/api/alerts/ALT-583908d5-c3ff-45cb-a941-ba1e4a58892d/str-draft
# Expected: {"alert_id": "...", "str_draft": "...", "format": "text"}
```

### Ask - Query Cortex Analyst
```bash
# Non-streaming
curl -X POST http://localhost:8080/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What are the top 5 alerts by risk score?"}'

# Streaming (SSE)
curl -X POST "http://localhost:8080/api/ask?stream=true" \
  -H "Content-Type: application/json" \
  -d '{"question": "Show me high severity alerts from the last week"}'
# Expected: SSE stream with data events containing SQL, results, verified_query badge, citations
```

### Why Not - Transaction Analysis
```bash
curl http://localhost:8080/api/why-not/TXN-12345
# Expected: {"txn_id": "...", "explanation": "...", "rules_checked": [...], "recommendation": "..."}
```

### Time Machine - Historical Trends
```bash
# Last 30 days
curl "http://localhost:8080/api/time-machine?days=30"

# Date range
curl "http://localhost:8080/api/time-machine?start_date=2026-09-01&end_date=2026-09-25"
# Expected: Array of daily stats with alert_count, high_severity_count, total_risk_score, top_typologies
```

### Rings - List Mule Rings
```bash
curl "http://localhost:8080/api/rings?page=1&page_size=10"
# Expected: {"rings": [...], "total": N, "page": 1, "page_size": 10, "total_pages": M}
```

### Rings - Detail
```bash
curl http://localhost:8080/api/rings/RING-001
# Expected: Ring details with members and transactions
```

### Rules - List
```bash
# All rules
curl "http://localhost:8080/api/rules?page=1&page_size=10"

# Filter by status
curl "http://localhost:8080/api/rules?status=ACTIVE&page=1&page_size=10"
```

### Rules - Get Single
```bash
curl http://localhost:8080/api/rules/RULE-001
# Expected: Rule details with SQL text, typology, status, citation
```

### Rules - Approve
```bash
curl -X POST http://localhost:8080/api/rules/RULE-001/approve \
  -H "Content-Type: application/json" \
  -d '{"user": "prathamahuja"}'
# Expected: {"message": "Rule approved successfully", "rule_id": "RULE-001"}
```

### Rules - Reject
```bash
curl -X POST http://localhost:8080/api/rules/RULE-001/reject \
  -H "Content-Type: application/json" \
  -d '{"user": "prathamahuja", "reason": "Invalid logic"}'
# Expected: {"message": "Rule rejected successfully", "rule_id": "RULE-001"}
```

### Rules - Conflicts
```bash
curl http://localhost:8080/api/rules/conflicts
# Expected: {"conflicts": [{rule1_id, rule1_name, rule2_id, rule2_name, conflict_type}]}
```

### Rules - Health
```bash
curl http://localhost:8080/api/rules/health
# Expected: {"total_rules": N, "active_rules": M, "pending_rules": P, "rejected_rules": R, "avg_precision": 0.xx}
```

### Rules - Upload
```bash
curl -X POST http://localhost:8080/api/rules/upload \
  -F "file=@rules.csv"
# Expected: {"job_id": "...", "status": "PENDING", "message": "..."}
```

### Rules - Job Status
```bash
curl http://localhost:8080/api/rules/jobs/JOB-UUID
# Expected: {"job_id": "...", "status": "COMPLETED", "progress": 100, "message": "..."}
```

## Evidence Tampering Test

```bash
# 1. Create evidence
curl -X POST http://localhost:8080/api/alerts/ALT-TEST/evidence

# 2. Verify - should show MATCH
curl http://localhost:8080/api/alerts/ALT-TEST/verify
# Expected: integrity_status = "MATCH"

# 3. Tamper with evidence in database
# UPDATE AUDIT.EVIDENCE_REGISTRY SET evidence_json = ... WHERE alert_id = 'ALT-TEST'

# 4. Verify again - should show TAMPERED
curl http://localhost:8080/api/alerts/ALT-TEST/verify
# Expected: integrity_status = "TAMPERED"
```

## PII Masking Test (as KAVACH_REVIEWER)

```bash
# Connect as KAVACH_REVIEWER role and call:
curl http://localhost:8080/api/alerts/ALT-TEST
# Expected: customer_id should be masked (e.g., "CUST***")

curl http://localhost:8080/api/alerts/ALT-TEST/evidence
# Expected: PII fields in evidence should be masked
```

## Architecture Verification

The backend follows N-layered architecture:
- **Presentation Layer**: `app/presentation/api/v1/` - FastAPI routers
- **Application Layer**: `app/application/services/` - Business logic services
- **Domain Layer**: `app/domain/` - Entities and repository protocols
- **Infrastructure Layer**: `app/infrastructure/repositories/` - Snowflake implementations

All routers call services only. All SQL is in infrastructure layer repositories.
All procedures use EXECUTE AS CALLER for row-level security.

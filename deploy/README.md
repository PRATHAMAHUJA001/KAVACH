# KAVACH Deployment to Snowpark Container Services

> **Superseded.** This file is the original design sketch from before the service
> existed. The deployment is live now — see **[../DEPLOY.md](../DEPLOY.md)** for
> the real procedure and `redeploy.sh` for the script. Kept for the cost model
> and the SPCS notes at the bottom, which still hold.
>
> Two things below are wrong in practice: the `snow`/`snowsql` CLI is not
> installed (use `snowctl.py`), and the Dockerfile here drifted from the real
> one at the repo root.

## Historical design sketch

### What's Needed (estimate: 3-4 hours)

#### 1. Compute Pool
```sql
CREATE COMPUTE POOL KAVACH_POOL
  MIN_NODES = 1
  MAX_NODES = 1
  INSTANCE_FAMILY = CPU_X64_XS
  AUTO_RESUME = TRUE
  AUTO_SUSPEND_SECS = 600;
```

#### 2. Image Repository
```sql
CREATE IMAGE REPOSITORY KAVACH_DB.APP.KAVACH_REPO;
SHOW IMAGE REPOSITORIES;
-- Note the repository_url
```

#### 3. Dockerfile (multi-stage)
```dockerfile
# Stage 1: Build frontend
FROM node:18-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python app
FROM python:3.11-slim
WORKDIR /app
RUN useradd -m -u 1000 appuser
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
USER appuser
EXPOSE 8080
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

#### 4. spec.yaml
```yaml
spec:
  containers:
  - name: kavach-web
    image: /kavach_db/app/kavach_repo/kavach-web:latest
    env:
      SNOWFLAKE_HOST: <account>.snowflakecomputing.com
      SNOWFLAKE_ACCOUNT: <account>
    readinessProbe:
      port: 8080
      path: /healthz
    resources:
      requests:
        cpu: "0.5"
        memory: "512Mi"
      limits:
        cpu: "1"
        memory: "1Gi"
  endpoints:
  - name: ui
    port: 8080
    public: true
```

#### 5. Deploy Script
```bash
#!/bin/bash
# deploy/deploy.sh
set -e

# Build and push image
docker build -t kavach-web:$(git rev-parse --short HEAD) .
docker tag kavach-web:$(git rev-parse --short HEAD) <repo_url>/kavach-web:latest
docker push <repo_url>/kavach-web:latest

# Create or update service
snowsql -q "
  CREATE SERVICE IF NOT EXISTS KAVACH_DB.APP.KAVACH_WEB
    IN COMPUTE POOL KAVACH_POOL
    FROM SPECIFICATION '$(cat deploy/spec.yaml)'
    MIN_INSTANCES = 1
    MAX_INSTANCES = 1;

  ALTER SERVICE KAVACH_DB.APP.KAVACH_WEB FROM SPECIFICATION '$(cat deploy/spec.yaml)';
"

# Wait for ready
while [[ $(snowsql -q "SELECT system$get_service_status('KAVACH_DB.APP.KAVACH_WEB')" -o output_format=tsv) != *"READY"* ]]; do
  echo "Waiting for service..."
  sleep 5
done

# Get endpoint
snowsql -q "SHOW ENDPOINTS IN SERVICE KAVACH_DB.APP.KAVACH_WEB;"
```

#### 6. Grant Access
```sql
-- Grant endpoint access to roles
GRANT USAGE ON SERVICE KAVACH_DB.APP.KAVACH_WEB TO ROLE KAVACH_ANALYST;
GRANT USAGE ON SERVICE KAVACH_DB.APP.KAVACH_WEB TO ROLE KAVACH_REVIEWER;

-- Create reviewer user
CREATE USER IF NOT EXISTS KAVACH_REVIEWER_USER
  DEFAULT_ROLE = KAVACH_REVIEWER
  DEFAULT_WAREHOUSE = KAVACH_WH
  PASSWORD = '<strong-password>';

GRANT ROLE KAVACH_REVIEWER TO USER KAVACH_REVIEWER_USER;
```

#### 7. Cost Monitoring
```sql
-- Credit usage query
SELECT 
    service_name,
    start_time,
    end_time,
    credits_used
FROM SNOWFLAKE.ACCOUNT_USAGE.METERING_HISTORY
WHERE service_name = 'KAVACH_WEB'
ORDER BY start_time DESC;
```

### Auto-Suspend Configuration
The compute pool auto-suspends after 10 minutes of inactivity (AUTO_SUSPEND_SECS = 600).
The service auto-resumes on inbound requests.

### Estimated Costs
- **Idle**: ~0 credits/day (pool suspended)
- **Active**: ~0.5 credits/hour (XS instance)
- **Monthly (24/7)**: ~360 credits
- **Monthly (8 hours/day)**: ~120 credits

### SPCS-Specific Considerations
- OAuth token auth: Read from `/snowflake/session/token` in container
- Ingress user: Check `Sf-Context-Current-User` header for caller identity
- No external network access unless you create EXTERNAL_ACCESS_INTEGRATION

# KAVACH — Deployment & Handover

Everything the next operator needs to build, deploy, run and hand off KAVACH.
Written for someone who has **never** touched this project.

> **Credit warning.** The Snowflake trial account behind this deployment is
> nearly exhausted. Read [Cost control](#7-cost-control) before you run anything.
> `./deploy/redeploy.sh status` is cheap; a full redeploy is not.

---

## 1. What is deployed

| Thing | Value |
| --- | --- |
| Live URL | <https://eabuoc-zjxsmhi-bu67728.snowflakecomputing.app> |
| Snowflake account | `ZJXSMHI-BU67728` (org `ZJXSMHI`, locator `NV81968`, region `AWS_AP_SOUTHEAST_7`) |
| Service | `KAVACH_DB.APP.KAVACH_WEB` |
| Compute pool | `KAVACH_POOL` — `CPU_X64_XS`, 1 node, `AUTO_SUSPEND_SECS = 600` |
| Image | `zjxsmhi-bu67728.registry.snowflakecomputing.com/kavach_db/app/kavach_repo/kavach-web:latest` |
| Image repository | `KAVACH_DB.APP.KAVACH_REPO` |
| Warehouse | `KAVACH_WH` |
| Database | `KAVACH_DB` — schemas `RAW, CORE, RULES, ML, AI, APP, AUDIT, REF` |
| Password secret | `KAVACH_DB.APP.SVC_PASSWORD` (`GENERIC_STRING`, mounted via `secretKeyRef: secret_string`) |
| PAT secret | `KAVACH_DB.APP.SVC_PAT` — mounted as `SNOWFLAKE_TOKEN`; used by `/api/ask` only when running LOCALLY |
| Ask KAVACH auth | In SPCS, `/api/ask` calls the Agents REST API on `$SNOWFLAKE_HOST` with the container's mounted OAuth token — see below |
| Service owner role | `KAVACH_ADMIN` — the container runs as this role and `USE ROLE`s into each persona |
| Cortex agent | `KAVACH_DB.AI.KAVACH_AGENT` (orchestration `claude-sonnet-5`, 5 tools) |
| Semantic view | `KAVACH_DB.AI.KAVACH_SV` |


One container: a FastAPI backend on port 8080 that also serves the built React
SPA from `frontend_dist/`. There is no separate frontend service.

### Signing in

Two independent gates, and that is not a bug:

1. **Snowflake ingress auth.** SPCS public endpoints *always* require a
   Snowflake login, and only users in this same account can pass. This cannot be
   turned off — there is no anonymous public access to an SPCS endpoint.
2. **The app's own persona login**, which decides which role's masking and row
   access policies apply.

Demo users exist for both gates with the same credentials:

| Username | Password | Role |
| --- | --- | --- |
| `admin` | `Admin@123` | `KAVACH_ADMIN` |
| `analyst` | `Admin@123` | `KAVACH_ANALYST` |
| `auditor` | `Admin@123` | `KAVACH_AUDITOR` |
| `reviewer` | `Admin@123` | `KAVACH_REVIEWER` |

---

## 2. Prerequisites

| Requirement | Notes |
| --- | --- |
| Docker daemon | This machine uses **colima**, not Docker Desktop. `colima start` first. Homebrew is not on a non-interactive `PATH`; the script runs `eval "$(/opt/homebrew/bin/brew shellenv)"` for you. |
| Python 3.12 with Snowpark | `/Library/Frameworks/Python.framework/Versions/3.12/bin/python3` is the **only** interpreter here with `snowflake-snowpark-python`. Override with `export KAVACH_PY=...`. |
| Node 20 | Only for local frontend work. The Docker build compiles the SPA itself. |
| `backend/.env` | Gitignored. See below. |

### The `snow` CLI is not installed

Every Snowflake doc for SPCS tells you to run `snow spcs ...`. That binary does
not exist on this machine, and neither does a standalone `cortex` binary. All
Snowflake control-plane work goes through `deploy/snowctl.py`, a thin Snowpark
wrapper. If you install the `snow` CLI later, `snow spcs image-registry login`
replaces the `docker login` line in `redeploy.sh` — nothing else changes.

### Snowflake Marketplace listings — required before `sql/03_ref_views.sql`

Not all reference data is synthetic. `sql/03_ref_views.sql` builds secure views
straight on top of **free Marketplace shares**, so that script fails on a fresh
account until the listings below are mounted under **exactly these database
names** — the views reference them by name.

You only need this to rebuild the database. A redeploy of the container does not
touch it.

| Listing | Global name | Must mount as | Status here | Used by |
| --- | --- | --- | --- | --- |
| Snowflake Public Data (Free) | `GZTSZ290BV255` | `SNOWFLAKE_PUBLIC_DATA_FREE` | **mounted — required** | `REF.FX_RATES` (72,010 rows) ← `PUBLIC_DATA_FREE.FX_RATES_TIMESERIES` |
| IPinfo Lite | `GZSTZSHKQ55S` | `IPINFO_LITE` | **mounted — required** | `REF.IP_GEO_IPINFO` (911,429 rows) ← `IPINFO_LITE.PUBLIC.LITE` |
| IP2Location LITE IP-COUNTRY | `GZTSZ3VACRL` | `IP2LOCATION_LITE` | mounted, **optional** | fallback IP→country; nothing references it today |
| Country Dimension (native app) | `GZTSZ25YL0A` | `COUNTRY_DIMENSION` | **not installed** | `REF.COUNTRY_DIM` — which is why that view does not exist |

Acquire them with SQL:

```sql
USE ROLE ACCOUNTADMIN;
CREATE DATABASE IF NOT EXISTS SNOWFLAKE_PUBLIC_DATA_FREE FROM LISTING 'GZTSZ290BV255';
CREATE DATABASE IF NOT EXISTS IPINFO_LITE               FROM LISTING 'GZSTZSHKQ55S';
CREATE DATABASE IF NOT EXISTS IP2LOCATION_LITE          FROM LISTING 'GZTSZ3VACRL';   -- optional
-- Country Dimension is a native app, not a share:
CREATE APPLICATION COUNTRY_DIMENSION FROM LISTING 'GZTSZ25YL0A';                      -- optional

SHOW DATABASES;  -- confirm kind = IMPORTED DATABASE for the three shares
```

If `FROM LISTING` is rejected (listing not available in your region, or terms not
accepted), click **Get** on the listing in the Snowsight Marketplace UI instead
and set the database name in that dialog. There is no `snow` CLI here to do it.

Three things that will bite you:

- **The mounted name matters, not the listing title.** On this account IP2Location
  defaulted to `IP2LOCATION_LITE_IPCOUNTRY_DATABASE`, not the `IP2LOCATION_LITE`
  that `sql/03_ref_views.sql` documents. Rename at mount time or the view breaks.
- **Region availability differs.** This account is `AWS_AP_SOUTHEAST_7`. A listing
  present there may not exist in another region.
- **No free sanctions/PEP/watchlist listing exists in this region**, so
  `REF.WATCHLIST` (27 rows) and `REF.COUNTRY_RISK` (42 rows) are **synthetic** —
  OFAC/UN-style patterns with clearly fake names, and FATF grey/black-list plus
  Transparency International CPI *methodology* rather than their data. Do not
  present either as real sanctions data. `REF.GEO_INDIA` and `REF.IP_GEO` are
  synthetic too.

`docs/DATASETS.md` has the fuller inventory but is gitignored, so this table is
the version that travels with the repo.

### Credentials

`backend/.env` is required and is **not** in git. Recreate it as:

```dotenv
SNOWFLAKE_ACCOUNT=ZJXSMHI-BU67728
SNOWFLAKE_USER=KAVACH_SVC
SNOWFLAKE_PASSWORD=<KAVACH_SVC password — ask the project owner>
SNOWFLAKE_TOKEN=<PAT, see KAVACH_DB.APP.SVC_PAT>
DEMO_PASSWORD=Admin@123
SNOWFLAKE_DATABASE=KAVACH_DB
SNOWFLAKE_SCHEMA=CORE
SNOWFLAKE_WAREHOUSE=KAVACH_WH
SNOWFLAKE_ROLE=KAVACH_ADMIN
AGENT_DATABASE=KAVACH_DB
AGENT_SCHEMA=AI
AGENT_NAME=KAVACH_AGENT
```

`KAVACH_SVC` is a `LEGACY_SERVICE` user holding all four KAVACH roles. It is
deliberately NOT an account admin: `redeploy.sh` connects as `KAVACH_ADMIN`,
which owns the service and holds USAGE + MONITOR on the compute pool.

Keep the password free of shell metacharacters. `redeploy.sh` sources
`backend/.env` through the shell, so a `$` in the value is expanded away and
`docker login` then fails with a bare `unauthorized`.

If you rotate that password you must update **two** places or the deployed
container will start and then fail every query:

```sql
ALTER SECRET KAVACH_DB.APP.SVC_PASSWORD SET SECRET_STRING = '<new password>';
```

…and `backend/.env`. Then `./deploy/redeploy.sh spec` to restart the container
with the new secret value.

---

## 2a. Ask KAVACH (`/api/ask`) networking — do not "fix" this

`/api/ask` is the one feature that talks to Snowflake over HTTPS rather than
through Snowpark, and it is the easiest thing to break.

- **Locally** it calls `https://<account>.snowflakecomputing.com/...` with the PAT
  in `SNOWFLAKE_TOKEN`.
- **In SPCS** it must call `https://$SNOWFLAKE_HOST/...` with the OAuth token
  mounted at `/snowflake/session/token`, using header
  `X-Snowflake-Authorization-Token-Type: OAUTH`.

An SPCS container has **no route to the public account hostname**. The normal fix
is an external access integration, but **external access is not supported on
trial accounts** (`CREATE EXTERNAL ACCESS INTEGRATION` fails with error 509009).
So pointing this at the account URL from inside the container fails and the Ask
page shows "The assistant couldn't answer this time" while `POST /api/ask`
still logs `200` — the error travels inside the SSE stream, not the HTTP status,
so the container log looks healthy. Check the streamed `event: error` payload.

The OAuth-token path is verified working on this deployment. The service owner
role (`KAVACH_ADMIN`) holds `USAGE ON AGENT`, which is what authorizes the call.

Also note: `capabilities:` is a **top-level** key in a service spec, a sibling of
`spec:`, not a child of it. Nesting it under `spec:` makes `ALTER SERVICE` fail
with `unknown option 'capabilities' for 'spec'`.

---

## 3. Redeploy

```bash
./deploy/redeploy.sh              # build -> push -> ALTER SERVICE -> wait -> print URL
```

Subcommands, cheapest first:

| Command | Does | When |
| --- | --- | --- |
| `status` | service state, pool state, endpoint | Always start here |
| `url` | public ingress URL | Sharing the link |
| `logs [n]` | tail container log | Something is wrong |
| `spec` | `ALTER SERVICE` from `deploy/spec.yaml` + wait | Only env/secrets/resources changed |
| `build` | `docker build --platform linux/amd64` | Iterating locally |
| `push` | `docker login` + `docker push` | Image already built |
| *(no arg)* | all of the above in order | Code changed |
| `suspend` | suspend service **and** pool | Done for the day |
| `resume` | resume pool then service, then wait | Coming back |
| `create` | `CREATE SERVICE IF NOT EXISTS` | **First deploy only** |

### Two rules you must not break

**Always `ALTER SERVICE`. Never `DROP` + `CREATE`.** The ingress URL is allocated
when the service is created. Recreating it issues a *new* URL and silently
invalidates the live link published in `README.md` and in the hackathon
submission. `redeploy.sh` has no drop path for this reason.

**Always build `--platform linux/amd64`.** SPCS nodes are x86_64. On Apple
silicon an unqualified `docker build` produces an arm64 image that pushes
successfully and then crash-loops on the node with an exec-format error. The
script passes the flag; do not remove it.

### What a normal run looks like

`ALTER SERVICE` returns immediately — the rollout happens afterwards. The script
polls until the service reports `READY` **and** `is_upgrading = false`. Checking
only for `READY` is a trap: the *old* container still reports `READY` while the
new one is pulling, so you would declare success on the previous build. Expect
2–5 minutes.

---

## 4. Repository map

| Path | What |
| --- | --- |
| `Dockerfile` | Two stages: node 20 builds the SPA, python 3.11-slim runs uvicorn |
| `deploy/redeploy.sh` | The deploy entrypoint described above |
| `deploy/snowctl.py` | Snowpark wrapper: `sql`, `alter`, `create`, `wait`, `url`, `status`, `logs`, `suspend`, `resume` |
| `deploy/spec.yaml` | SPCS service spec — container, env, secret, probe, resources, public endpoint |
| `backend/app/` | FastAPI. `presentation/api/v1/*` routers, `infrastructure/repositories/*` SQL |
| `frontend/src/` | React + Vite + Tailwind. `features/<area>/` per screen |
| `sql/01..12_*.sql` | Ordered schema/data/rules/ML/AI build scripts. `03_ref_views.sql` depends on mounted Marketplace shares |
| `snowpark/` | Model training and scoring |
| `skills/*/SKILL.md` | CoCo skills shipped with the project |
| `ops_console/` | Streamlit ops console (built, **not** deployed) |
| `docs/` | `COCO_USAGE.md`, `EVALUATION.md`, `architecture.md` |
| `deploy/README.md` | Historical design sketch. Superseded by this file. |

### Rebuilding the whole database from scratch

Only if you have credits and a reason. **Mount the Marketplace listings first**
(see [§2](#snowflake-marketplace-listings--required-before-sql03_ref_viewssql)) or
`sql/03_ref_views.sql` fails on a fresh account. Then run `sql/01_*.sql` →
`sql/12_*.sql` in order, followed by the Snowpark training job. Budget several hours; the synthetic data
generation is the slow part. Do **not** do this to fix a small problem — clone
first (`CREATE DATABASE X CLONE KAVACH_DB`, zero-copy and instant) and mutate the
clone.

---

## 5. Local development

```bash
# backend on :8080 — reads backend/.env, talks to the real Snowflake account
/Library/Frameworks/Python.framework/Versions/3.12/bin/python3 -m uvicorn app.main:app \
  --host 0.0.0.0 --port 8080 --app-dir backend

# frontend dev server
cd frontend && npm install && npm run dev

# frontend against a built bundle
cd frontend && npm run build && npx vite preview --port 4173 --host 0.0.0.0
```

`VITE_USE_MOCKS=true` runs the frontend against MSW fixtures with no Snowflake
connection. Useful for UI work and for the Playwright visual suite — but
**screenshots taken in mock mode are fixture data, not live data**. MSW has no
`/api/auth/context` handler, so login screens must be shot against a real stack.

---

## 6. Health checks after a deploy

```bash
./deploy/redeploy.sh status     # expect: upgrading False, containers ['READY'], pool ACTIVE
./deploy/redeploy.sh logs 50    # expect: GET /healthz 200 OK
```

Then in a browser: open the URL, pass Snowflake auth, sign in as `admin`, and
confirm Today (KPIs + Risk panel), Alerts, Customers (row → detail → Ask
KAVACH), Ask, Rules and the logout menu all respond.

---

## 7. Cost control

The pool auto-suspends after 600s idle and auto-resumes on an inbound request,
so an untouched deployment is close to free. The expensive things are: keeping
the pool warm, rebuilding the ML model, and re-running the rule engine over 1.5M
transactions.

```bash
./deploy/redeploy.sh suspend    # pool to zero nodes — do this when you stop
./deploy/redeploy.sh resume     # back up, ~2-3 min
```

```sql
-- what has been spent
SELECT SERVICE_TYPE, SERVICE_NAME, SUM(CREDITS_USED) AS credits
FROM SNOWFLAKE.ACCOUNT_USAGE.METERING_HISTORY
WHERE START_TIME > DATEADD('day', -7, CURRENT_TIMESTAMP())
GROUP BY 1, 2 ORDER BY credits DESC;
```

### Scheduled tasks — both deliberately suspended

| Task | Schedule | State |
| --- | --- | --- |
| `KAVACH_DB.ML.DAILY_SCORE_TASK` | `CRON 0 2 * * * UTC` → `TRAIN_RISK_MODEL()` | **suspended** |
| `KAVACH_DB.RULES.RULE_EXECUTOR_TASK` | `60 MINUTE`, gated on `SYSTEM$STREAM_HAS_DATA('KAVACH_DB.CORE.TXN_STREAM')` → `EXECUTE_ALL_RULES()` | **suspended** |

Both have run successfully — `TASK_HISTORY` holds the evidence. They are
suspended to stop credit burn, and `RULE_EXECUTOR_TASK` has a second reason:
`EXECUTE_ALL_RULES` caps each rule at 500 rows and the slice is unordered, so
every run picks a different 500 and appends more alerts. The alert table has
grown 2,879 → 5,848 → 8,118 this way. Before resuming it, make the row selection
deterministic.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `docker daemon unreachable` | colima not running | `colima start` |
| `exec format error` in container log | arm64 image | rebuild with `--platform linux/amd64` |
| Container starts then every query fails | secret and `.env` password diverged | `ALTER SECRET ... SET SECRET_STRING`, then `redeploy.sh spec` |
| `wait` times out | image pull failure or crash loop | `redeploy.sh logs 200` |
| Endpoint stuck `provisioning` | first-ever endpoint creation | wait; can take ~10 min once |
| URL changed | someone dropped and recreated the service | update `README.md` — the old URL is gone for good |
| `Unsupported subquery type cannot be evaluated` | correlated subquery in `UPDATE` | rewrite as `MERGE INTO ... USING (...)` |
| `snow: command not found` | CLI genuinely absent | use `deploy/snowctl.py` |

---

## 9. Data gotchas — read before trusting a number

These are real and known. They are documented rather than hidden.

- **`CORE.ALERTS.CREATED_AT DEFAULT CURRENT_TIMESTAMP()`** was the root cause of
  a whole class of date bugs: any insert omitting the column got a wall-clock
  stamp, putting 2026 alerts on 2024 transactions. `EXECUTE_ALL_RULES` now
  derives `CREATED_AT` from the triggering transaction and dedupes on
  (account, rule, transaction). Any *new* insert path must do the same.
- **`CORE.ALERTS.CUSTOMER_ID` is NULL on every row.** Attribute alerts to
  customers through `CORE.ACCOUNTS`.
- **`ML.EVAL_GROUND_TRUTH`, `ML.EVAL_REPORT`, `ML.EVAL_COMPARISON` are empty.**
  The evaluation predates a migration. `RAW.GROUND_TRUTH` has 212 planted-fraud
  rows and is the viable label source for rebuilding it.
- **`CORE.CUSTOMERS.RISK_CATEGORY` is inverted noise** relative to the model
  (KYC `LOW` → 0.306 avg model score; KYC `HIGH` → 0.216). It is a KYC field, not
  a prediction. Do not present the two as the same measure.
- **`ML.RISK_SCORE_EXPLANATIONS` covers 8,411 of 28,000 accounts** with only 4
  distinct top drivers.
- **`RAW.REGENERATE_RING_TXNS(NUMBER)` is hardcoded to 3 rings**, so mule rings
  4–9 have 0 terminal receivers and 0 pure senders versus 1 each for rings 1–3.
- **6 of the 19 rules fail SQL compilation at runtime.** They were generated from
  template limits rather than recompiled from the actual circular text.
- Transaction data runs **2024-04-01 → 2024-09-27** by design — the demo shows
  KAVACH reasoning over prior-year data. Current volumes: 1,502,688 transactions,
  28,000 accounts, 20,000 customers, 4,528 alerts across 7 typologies, 20 rules
  (19 compiled + 1 amendment), 9 conflicts, 200 stories, 9 rings / 62 members,
  28,034 scored accounts, 8,411 SHAP explanations, 49 regulation chunks.

These are the counts for the ZJXSMHI-BU67728 rebuild (2026-09-29), produced by a
single clean run of the rule engine. Earlier figures in git history (2,879 /
8,118 / 8,407) came from repeated RULE_EXECUTOR_TASK runs on the previous
account and do not describe this deployment.

---

## 10. Open backlog

In the order I would do it:

1. Widen `RAW.REGENERATE_RING_TXNS` past its 3-ring scope and re-run, so rings
   4–9 get realistic directional flow.
2. Recompile the 19 rules from the actual circular text; 6 currently fail to
   compile.
3. Rebuild `ML.EVAL_*` from `RAW.GROUND_TRUTH`'s 212 rows so rule-health and
   model accuracy are the same measure, queryable live.
4. Make `EXECUTE_ALL_RULES` row selection deterministic, then resume
   `RULE_EXECUTOR_TASK`.
5. Refresh the stale alert counts in `README.md` and `docs/architecture.md`.
6. MCP connector for circular ingestion (a credential-free filesystem MCP server
   beats a mock).
7. Deploy or explicitly document the Streamlit ops console in `ops_console/`.

**Security note for the incoming operator:** a GitHub OAuth token (`gho_...`) was
printed into a development session transcript. Rotate it at
<https://github.com/settings/tokens> before doing anything with the remote.

---

*Built end to end with Snowflake CoCo CLI. See `docs/COCO_USAGE.md` for the
lifecycle evidence.*

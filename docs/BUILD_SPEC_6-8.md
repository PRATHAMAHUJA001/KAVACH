Read PROJECT_BRIEF.md and follow it (N-layered architecture, naming, security rules).
Phase 5 is complete. Now finish Phases 6, 7, 7B and 8 in ONE run, working through the
checkpoints below IN ORDER.

=====================================================================
OPERATING RULES FOR THIS RUN (credits are limited: ~40% of budget left,
and the app must stay online for reviewers for ~4 weeks after deploy)
=====================================================================
R1. Work autonomously. Don't ask me for approval between checkpoints. Only stop if a
    step needs a manual UI action from me (tell me exactly what to click) or a
    permission you don't have.
R2. If the same error happens twice, STOP retrying. Write it to docs/BLOCKERS.md with
    the error, what you tried, and your best fix, then move to the next checkpoint.
    Never loop.
R3. Token discipline: don't re-read large files you already know; read only the parts
    you need. Don't regenerate the synthetic data. Don't re-run the full Phase 4 or
    Phase 5 evaluations.
R4. Warehouse discipline: use KAVACH_WH (XSMALL) only. Batch AI calls. Never call an LLM
    per row for the whole dataset; precompute only for the TOP 200 alerts by priority.
    Use the smallest adequate model for runtime AI functions; the agent keeps
    claude-sonnet-4-6.
R5. After each checkpoint: run its tests, git commit with a clear message, and append a
    3-line summary to docs/PROGRESS.md.

=====================================================================
CHECKPOINT 0 — Credit audit (do this first, ~5 min)
=====================================================================
- List every DYNAMIC TABLE (with its TARGET_LAG), every TASK (schedule + state), every
  warehouse, and the last 7 days of credit usage from ACCOUNT_USAGE or
  INFORMATION_SCHEMA metering (by warehouse/service type).
- Change any dynamic table with TARGET_LAG under 1 hour to TARGET_LAG = DOWNSTREAM (or
  '12 hours'), and SUSPEND every task. Show before and after.
- Set AUTO_SUSPEND = 60 on all warehouses. Show a table of what was consuming credits.

=====================================================================
CHECKPOINT 1 — Phase 6: explainability & evidence (Snowpark, kavach_core)
=====================================================================
All logic lives in snowpark/kavach_core (domain + application layers). The procedures
are thin, EXECUTE AS CALLER.
1. AI.ALERT_STORIES: for the top 200 alerts, precompute a plain-English story (3–5
   sentences) with AI_COMPLETE, using a strict template filled with REAL numbers from
   SQL. The LLM only phrases; it never invents numbers. Add a Hindi version with
   AI_TRANSLATE. One batched statement, not a Python loop over rows. For other alerts,
   EXPLAIN_ALERT falls back to the existing structured text.
2. BUILD_EVIDENCE_PACK: extend the existing JSON version to also render an HTML/PDF file
   (reportlab or fpdf2) to @APP.EVIDENCE_STAGE containing: case summary, timeline, rules
   fired + version + circular/para + source quote, the SQL executed, the top-3 ML
   drivers, analyst notes, and the approval trail. Store its SHA-256 in
   AUDIT.EVIDENCE_REGISTRY (alert_id, file_path, sha256, created_by, created_at).
   Return a presigned URL. Add VERIFY_EVIDENCE(alert_id) that re-hashes the file and
   returns MATCH / TAMPERED.
3. DRAFT_STR(alert_id): a regulator-style draft (grounds of suspicion, transactions,
   parties), watermarked "DRAFT — REQUIRES MLRO REVIEW — SYNTHETIC DATA".
4. DEADLINE_CLOCK view: due date per open alert/STR from the rule's
   filing_deadline_days, plus a status of GREEN / AMBER (≤48h) / RED (overdue).
5. RULE_HEALTH view: per rule, precision from ANALYST_FEEDBACK. If precision < 20%,
   propose a new threshold by calling TIME_MACHINE for 3 candidate values and store the
   best trade-off in RULES.TUNING_PROPOSALS.
6. READINESS_SCORE view (0–100) = weighted mix of: % of obligations covered by an
   approved rule, % of STRs within deadline, % of closed alerts with an evidence pack,
   and open rule conflicts (penalty). Also return a one-line reason string.
7. RESET_TOUR_DATA procedure: restores the product-tour alert, rule and feedback rows
   to their seeded state.
Test: run each on one real alert; test BUILD_EVIDENCE_PACK as KAVACH_REVIEWER and show
PII masked; tamper with a file copy and show VERIFY_EVIDENCE = TAMPERED.

=====================================================================
CHECKPOINT 2 — Phase 7: backend (FastAPI, N-layered)
=====================================================================
Follow the backend/ layout in PROJECT_BRIEF.md exactly:
presentation → application → domain ← infrastructure. SQL only in infrastructure.
- Connection factory: inside SPCS, use the OAuth token at /snowflake/session/token plus
  the SNOWFLAKE_HOST/SNOWFLAKE_ACCOUNT env vars. Locally, use key-pair auth from .env
  (git-ignored). Use caller's rights if SPCS supports it (the ingress user header
  "Sf-Context-Current-User"), so masking follows the logged-in user.
- Endpoints (Pydantic v2 schemas):
  GET  /api/home  → readiness score + reason, 4 tiles (new alerts, money at risk ₹,
                    reports due 48h, active high-confidence rings), top-5 attention
                    items, 30-day alerts vs confirmed-fraud trend
  POST /api/ask   → Cortex Agent REST API (KAVACH_AGENT), streamed to the UI via SSE.
                    Parse the response trace: set badge = VERIFIED if the Analyst tool
                    used a verified query, else AI-GENERATED. Also return citations
                    (circular_no, para_no, text), the result table and the SQL.
  GET  /api/alerts (filters, sort, pagination) · GET /api/alerts/{id} (case file)
  POST /api/alerts/{id}/feedback · POST /api/alerts/{id}/evidence ·
  POST /api/alerts/{id}/str-draft · GET /api/why-not/{txn_id}
  GET  /api/rings · GET /api/rings/{id} (nodes + edges for the graph)
  GET  /api/rules · POST /api/rules/{id}/approve|reject · GET /api/rules/conflicts ·
  GET  /api/rules/health · POST /api/rules/upload (PUT to stage → COMPILE_CIRCULAR →
       job id) · GET /api/rules/jobs/{id}
  POST /api/time-machine · GET /api/me · GET /healthz
- Every mutating endpoint writes AUDIT.ACTIVITY_LOG. Parameterised SQL only.
  60-second in-memory TTL cache for read endpoints.
- FastAPI serves frontend/dist as static files, so it's one container on port 8080.
- Tests: pytest unit tests for domain + services using fake repositories (no Snowflake),
  plus 5 integration tests against Snowflake. ruff clean.

=====================================================================
CHECKPOINT 3 — Phase 7: frontend (React, for non-technical users)
=====================================================================
Stack: React + Vite + TypeScript + Tailwind + shadcn/ui, TanStack Query, Recharts,
React Flow (ring graph), react-i18next (EN/हिन्दी), react-joyride (tour).
Layers: pages → features → shared; ONLY src/services/api calls the backend.

Design rules: calm, bank-grade look, one indigo accent. Status colours green/amber/red
always paired with an icon + a word. Big numbers, each with a one-line plain sentence
under it. No jargon ("Suspicious activity", "Why was this flagged?"), with an ⓘ popover
for any unavoidable term. ₹ in lakh/crore (₹12.4 L, ₹3.1 Cr), dates as "12 Sep 2026".
Skeleton loaders, helpful empty and error states, WCAG AA contrast, keyboard
accessible, light + dark mode, works at 1280px and on tablet.

Pages (sidebar, max 6):
1. Today: readiness gauge + reason, 4 tiles, "Needs your attention" cards with one
   action each, the 30-day trend chart.
2. Ask Kavach: streaming chat, suggested-question chips (from the verified onboarding
   questions), a VERIFIED ✓ / AI-GENERATED badge, citation chips that open the clause
   in a drawer, "Show the data" (table + auto chart), "Show the SQL" (collapsed), and
   thumbs up/down.
3. Alerts: inbox list + filter chips. The case-file side panel shows the story (EN/HI
   toggle), timeline, top-3 reason bars, network mini-graph, rule + citation, deadline
   countdown, and buttons: Mark fraud / Not fraud, Download evidence pack, Verify
   evidence, Create draft STR. Plus a "Why wasn't this flagged?" search.
4. Mule Rings: ring cards → an interactive graph (nodes coloured by risk, edges
   labelled "shared device" / "sent money").
5. Rulebook: drag-drop a circular PDF → progress stepper → rule review next to the
   highlighted source paragraph (Approve / Edit / Reject). Tabs: Versions, Conflicts,
   Rule health (noisy rules + proposed fix).
6. Time Machine: pick a rule → threshold slider → "Replay last 90 days" → before/after
   bars (alerts, confirmed fraud caught, analyst hours) + a one-sentence verdict.

Product tour: a "▶ Take the 3-minute tour" button on Today. 6 spotlight steps: new
circular → compiled rules → approve → mule-ring alert → Hindi explanation → evidence
pack download + verify. It uses pre-seeded tour data (RESET_TOUR_DATA) so it works on a
cold start.
Roles: /api/me drives the UI. KAVACH_REVIEWER sees a "Read-only access" banner and
disabled write buttons with a tooltip explaining why.
Test: npm run build with no TypeScript errors; Playwright smoke test that opens every
page and completes the tour against the local backend.

=====================================================================
CHECKPOINT 4 — Phase 7B: deploy to SPCS with CoCo
=====================================================================
Show each command before running it.
1. Compute pool KAVACH_POOL: smallest CPU instance family, MIN_NODES=1, MAX_NODES=1,
   AUTO_RESUME=TRUE, AUTO_SUSPEND_SECS=600. Image repo KAVACH_DB.APP.KAVACH_REPO.
2. One multi-stage image (node build → python-slim, non-root user, port 8080). Use the
   SPCS deploy path that needs no local Docker if available; otherwise Docker build/push.
   Tag the image with the git SHA.
3. deploy/spec.yaml: readiness probe /healthz, small resource requests, a PUBLIC
   endpoint "ui", caller's rights if supported. Configure service auto-suspend with
   auto-resume on ingress if supported (check the docs), so an idle service costs
   nothing but wakes when a reviewer opens the URL.
4. CREATE SERVICE KAVACH_DB.APP.KAVACH_WEB. Grant the service role for endpoint "ui" to
   KAVACH_REVIEWER, KAVACH_ANALYST and KAVACH_AUDITOR. Create user
   KAVACH_REVIEWER_USER (default role KAVACH_REVIEWER, warehouse KAVACH_WH, strong
   generated password printed once).
5. Wait for READY, print the public URL, and check the logs with
   SYSTEM$GET_SERVICE_LOGS.
6. Smoke test as KAVACH_REVIEWER_USER: /healthz, /api/me, /api/home, one /api/ask, one
   evidence download. Confirm PII is masked.
7. deploy/deploy.sh (build → push → ALTER SERVICE … FROM SPECIFICATION → wait → smoke
   test) and skills/deploy_app.md.
8. deploy/COSTS.md: the exact credit cost per hour of the pool and service (from the
   consumption table), cold-start time measured, and suspend/resume commands.

=====================================================================
CHECKPOINT 5 — Phase 8: skills + tasks (created, left SUSPENDED)
=====================================================================
Write CoCo skills in skills/ (markdown procedures): compile_circular, triage_alerts,
deadline_watch, rule_health, deploy_app.
Create a Task DAG (root → triage → deadline → rule_health) on KAVACH_WH with
SCHEDULE = 'USING CRON 0 6 * * * Asia/Kolkata' (once a day, NOT every few minutes),
error logging to AUDIT.TASK_ERRORS, and a "Pipeline health" endpoint and card on Today
reading TASK_HISTORY. Run the DAG ONCE with EXECUTE TASK to prove it works, then leave
it SUSPENDED. Document in README how to resume it.
Minimal Streamlit in Snowflake Ops Console (ops_console/): task history, credit usage
by service type, a button to resume/suspend the DAG, and a RESET_TOUR_DATA button.

=====================================================================
FINAL REPORT
=====================================================================
Print: the public URL; the reviewer username (password shown once); a checklist of
checkpoints 0–5 marked done/blocked; the contents of docs/BLOCKERS.md; credits used in
this run; and the estimated daily credit cost with the service idle vs active.

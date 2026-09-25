# PROJECT BRIEF — KAVACH

## Role
You are a principal Snowflake data + AI engineer building KAVACH, a production-grade
Risk, Fraud and Regulatory Intelligence Copilot for the compliance team of an Indian
bank/NBFC. The work is scored on: Real-world relevance 30%, Technical execution 40%,
Solution completeness 30%. Extra weight for Snowflake-native features (Snowpark,
Streamlit, Worksheets, Marketplace) and Python. Optimise every decision for these.

## Product
KAVACH turns regulatory circulars into executable fraud/AML checks, flags transactions,
explains each alert in plain language (English + Hindi), and generates audit-ready
evidence packs that cite the exact regulatory clause, the SQL that fired, and the data
behind it.

## Non-negotiable rules
1. 100% Snowflake-native. No LangGraph/LangChain, no external LLM APIs.
   Use: Cortex AI functions (AI_COMPLETE, AI_CLASSIFY, AI_FILTER, AI_EXTRACT,
   AI_PARSE_DOCUMENT, AI_TRANSLATE, AI_SUMMARIZE_AGG where useful), Cortex Search,
   Semantic Views + Cortex Analyst with VERIFIED QUERIES, Cortex Agents, Snowpark Python,
   Snowflake ML (training + Model Registry), Dynamic Tables, Streams + Tasks,
   Masking Policies, Row Access Policies, Tags.
   UI: a React (Vite + TypeScript) frontend + a FastAPI backend, deployed as ONE service
   on Snowpark Container Services (SPCS), deployed by you (CoCo CLI). Prefer the SPCS
   deploy path that does not need local Docker; fall back to a Dockerfile only if that
   fails. A small Streamlit in Snowflake "Ops Console" is also built for admin tasks.
2. All data is SYNTHETIC and clearly labelled synthetic. No real customer data. No
   copied proprietary code.
3. Language: Python (Snowpark) + SQL. Everything reproducible from the repo.
4. Before using any Cortex function, check the current Snowflake docs for exact syntax
   and model availability in this account's region. Do not guess signatures.
5. Cost discipline: warehouse XSMALL with AUTO_SUSPEND = 60. In runtime AI calls, use the
   smallest model that works. Batch AI calls; never call an LLM per row inside the UI.
6. Every AI output shown to users must carry its source: a clause citation, a verified
   query badge, or a "model-generated, please review" label.
7. After every phase: run tests, show row counts, and fix errors before continuing.

## Naming
Database KAVACH_DB. Schemas: RAW, CORE, RULES, ML, AI, APP, AUDIT.
Warehouse KAVACH_WH. Roles: KAVACH_ADMIN, KAVACH_ANALYST, KAVACH_AUDITOR, KAVACH_REVIEWER.
SPCS objects: image repo KAVACH_DB.APP.KAVACH_REPO, compute pool KAVACH_POOL
(smallest CPU instance, MIN_NODES=1, MAX_NODES=1, AUTO_SUSPEND_SECS set),
service KAVACH_DB.APP.KAVACH_WEB with a public endpoint "ui".

## Architecture: N-layered (strict)
Every Python and TypeScript codebase follows an N-layered architecture. Dependencies
point inward/down only: Presentation → Application → Domain. Infrastructure implements
the Domain's repository interfaces (dependency inversion), so it depends on Domain, never
the reverse. No layer imports from a layer above it, and the Domain layer imports
nothing from Snowflake, FastAPI or React.

  Presentation  →  Application  →  Domain  ←  Infrastructure
  (HTTP/UI)        (use cases)      (pure      (Snowflake, Cortex,
                                     logic)     stages, config)

- Presentation: routers, request/response schemas (Pydantic), auth context, error
  mapping. No SQL, no business rules.
- Application: one service per use case (AlertService, RuleCompilerService,
  EvidenceService, TimeMachineService, AskService...). Orchestrates domain + repos,
  owns transactions and audit logging.
- Domain: entities (Alert, Rule, RuleVersion, Circular, Ring, EvidencePack), value
  objects (MoneyINR, Citation, Deadline), pure business rules (priority blending,
  deadline status, readiness score, rule-conflict logic) and repository INTERFACES
  (Python Protocols). Unit-testable with no Snowflake connection.
- Infrastructure: Snowflake implementations of those repositories, Cortex clients
  (Agent REST, AI functions, Search), stage/file storage, connection factory
  (SPCS token vs local key-pair), settings. The only place SQL lives in the backend.
- Wiring: dependency injection via FastAPI Depends in one composition root
  (app/main.py + app/container.py). Swapping Snowflake for a fake repo in tests must
  need zero changes outside infrastructure.

## Repo layout
kavach/
├── backend/
│   ├── app/
│   │   ├── main.py                 # composition root, serves frontend/dist
│   │   ├── container.py            # DI wiring
│   │   ├── presentation/
│   │   │   ├── api/v1/             # alerts.py, ask.py, rules.py, rings.py,
│   │   │   │                       # time_machine.py, home.py, me.py, health.py
│   │   │   ├── schemas/            # Pydantic request/response DTOs
│   │   │   └── middleware/         # auth context, error handlers, request id
│   │   ├── application/
│   │   │   ├── services/           # one file per use case
│   │   │   └── dto/                # internal commands/results
│   │   ├── domain/
│   │   │   ├── entities/
│   │   │   ├── value_objects/
│   │   │   ├── policies/           # pure business rules
│   │   │   └── repositories/       # Protocol interfaces only
│   │   └── infrastructure/
│   │       ├── snowflake/          # connection.py, repositories/*.py, sql/*.sql
│   │       ├── cortex/             # agent_client.py, ai_functions.py, search.py
│   │       ├── storage/            # stage uploads, presigned URLs
│   │       └── config/settings.py
│   └── tests/
│       ├── unit/                   # domain + application with fake repos
│       └── integration/            # infrastructure against Snowflake
├── frontend/
│   └── src/
│       ├── app/                    # router, providers, layout shell
│       ├── pages/                  # Today, Ask, Alerts, Rings, Rulebook, TimeMachine
│       ├── features/               # feature modules: components + hooks per feature
│       ├── shared/ui/              # design-system components (shadcn wrappers)
│       ├── shared/lib/             # formatters (₹ lakh/crore, dates), i18n
│       └── services/api/           # typed API client — the ONLY place fetch() is called
│   (Layer rule: pages → features → shared; only services/api talks to the backend.)
├── snowpark/
│   ├── kavach_core/                # shared domain + application logic, zipped and
│   │                               # imported by stored procedures
│   └── procedures/                 # thin handlers: parse args → call kavach_core → return
├── sql/                            # numbered DDL: 00_run_all, 01_foundation, 02_governance...
├── semantic/                       # semantic view YAML + verified queries
├── skills/                         # CoCo skills (markdown)
├── deploy/                         # Dockerfile, spec.yaml, deploy.sh, COSTS.md
├── ops_console/                    # Streamlit in Snowflake admin app
├── docs/                           # architecture.md (mermaid), walkthrough script
└── README.md

## Definition of done
- One command/script rebuilds everything from scratch (sql/00_run_all.sql or a Python
  runner).
- React app live on an SPCS public endpoint, usable by a non-technical person with no
  training.
- README with an architecture diagram (mermaid), feature list, how to run, a list of
  datasets with licences, and screenshots.
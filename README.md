<div align="center">

# 🛡️ KAVACH

### Risk, Fraud & Regulatory Intelligence Copilot for Indian Banking

**Turn regulatory circulars into checks that actually run.**

KAVACH reads RBI-style circulars and compiles them into monitoring rules your team approves,
finds mule rings and financial-crime typologies in 1.5M transactions, explains every alert in
English **और हिन्दी**, and hands you an audit-ready evidence pack for every case.

[![Snowflake](https://img.shields.io/badge/Built%20on-Snowflake-29B5E8?logo=snowflake&logoColor=white)](https://www.snowflake.com/)
[![Cortex AI](https://img.shields.io/badge/Cortex-Agent%20%2B%20Analyst%20%2B%20Search-29B5E8)](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents)
[![SPCS](https://img.shields.io/badge/Deployed-Snowpark%20Container%20Services-29B5E8)](https://docs.snowflake.com/en/developer-guide/snowpark-container-services/overview)
[![FastAPI](https://img.shields.io/badge/API-FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/UI-React%2018%20%2B%20TypeScript-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Bilingual](https://img.shields.io/badge/i18n-English%20%2B%20%E0%A4%B9%E0%A4%BF%E0%A4%A8%E0%A5%8D%E0%A4%A6%E0%A5%80-6C5CE7)](#bilingual-by-design)

<img src="docs/images/hero.jpg" alt="KAVACH case file with an AI-written Hindi explanation and ranked reasons the account was flagged" width="900">

</div>

---

<div align="center">

### 🏆 Snowflake CoCo CLI Hackathon 2026 — GCC Edition

</div>

| | |
|---|---|
| **Event** | [Snowflake CoCo CLI Hackathon 2026 — GCC Edition](https://hack2skill.com/event/cococlihack-gccedition/) |
| **Problem statement** | **#01 — Risk, Fraud and Regulatory Intelligence Copilot** |
| **Team** | **The Believer** — solo entry (1 member) |
| **Built by** | [Pratham Ahuja](https://github.com/PRATHAMAHUJA001) |
| **Built with** | **Snowflake CoCo CLI** — every object, model, agent and the deployment itself |

> **The brief:** *"Banking and NBFC teams manage real time fraud, liquidity and credit risk, and
> regulatory reporting (AML, Basel, and local regulations), largely manual today. Build a copilot
> that surfaces risk and fraud signals and produces audit ready regulatory outputs from natural
> language questions."*

KAVACH answers that brief end to end: it **surfaces risk and fraud signals** (9 typologies, graph
detection, calibrated ML), **produces audit-ready regulatory outputs** (hashed evidence packs and
draft suspicious transaction reports), and does it **from natural language questions** (a Cortex
Agent over a semantic view plus Cortex Search across the circulars) — with the regulations
themselves compiled into the checks that run.

<details>
<summary><b>How this maps to the evaluation rubric</b></summary>

| Criterion | Weight | Where to look |
|---|---|---|
| **Real-world relevance** | 30% | [The problem](#-the-problem) — four loops a compliance team actually lives with. Bilingual EN/हिन्दी for Indian bank floors, RBI-style circulars, PAN masking, STR drafting, deadline clocks. |
| **Technical execution** | 40% | [Snowflake features at every step](#-snowflake-features-at-every-step) and [how CoCo was used at every stage](#-how-coco-was-used-across-the-lifecycle) — 16 Snowflake capabilities across 12 SQL steps, 33 API endpoints in an N-layered backend, real per-user Snowflake sessions, database-enforced governance, deployed on SPCS. |
| **Solution completeness** | 30% | [Feature tour](#-feature-tour) — 8 working pages, not mockups: live deployment, explainable alerts, graph detection, 4 real personas, and evidence packs that verify. |

</details>

---

## 🧰 How CoCo Was Used Across the Lifecycle

The hackathon asks for evidence of CoCo CLI at every stage, so here is exactly what ran where —
and every row is **reproducible from artifacts committed to this repo**, not a story told
afterwards. Full detail in **[docs/COCO_USAGE.md](docs/COCO_USAGE.md)**.

| Phase | CoCo evidence |
|---|---|
| **Planning / design** | **7 CoCo plan-mode artifacts tracked in git**, written before any DDL ran — `phase-2-synthetic-data` (`2026-09-25T05:31:33Z`), `phase-3-regulation-compiler`, `phase-4-detection-engine` (`09:39:00Z`), `phase-5-conversational-intel` (`11:09:43Z`), `agent-identity-html-evidence` (`14:05:23Z`), `alerts-page-case-drawer` (`20:26:11Z`), `migrate-account-and-build-alerts-page`. CoCo's persistent project memory (`.snowflake/cortex/memory/projects/…/kavach-project.md`) is what let later sessions resume knowing the account topology, roles and cost constraints. |
| **Execution — building in Snowflake** | Every schema, masking policy, row access policy, procedure, dynamic table, stream, task, Cortex Search service, semantic view and agent in [`sql/`](sql/) was authored **and executed** through CoCo against a live Snowflake account. Sessions: `01fbfb1f` (*KAVACH Phase 1 Foundation Setup*), `04e512ea` (*Finish Checkpoint 1 Phase 6*), `2ec02ea4` (*Finish Phases 6 to 8*), `f780b911` (*Export Snowflake Metadata to Repo*). CoCo's **credit audit** changed the architecture — warehouses to `AUTO_SUSPEND=60` and the dynamic table to `TARGET_LAG = DOWNSTREAM` (commit `CHECKPOINT 0`). |
| **Development / debugging** | The largest session in the project is the application build: `71694ce4` (*Alerts Page and Case Drawer*) — alerts queue, case drawer, rings, rulebook, time machine, tour, landing + login, SPCS deploy; plus `98a5af70` (*Build Fintech App Demo UI*). Real bugs traced to root cause, each with a commit: the Mule Rings overscroll (grid `min-height: auto` beating a descendant `max-h`, fixed with `min-h-0`), mule-ring data where no account ever terminated the chain, the live-vs-local `401` (a container cannot make an outbound password connection — rewrote auth onto the mounted OAuth token), and the top bar showing the shared service identity instead of the signed-in persona. |
| **Testing / verification** | Run through CoCo, not by hand: session `c308d4af` (*Backend Endpoints Smoke Test*) → commit **`23/23 endpoints passing`** against live Snowflake. Also verified in CoCo: **per-persona masking** on one customer record across all four roles (`admin` → `Umesh Nair / TGDCT5500H`, `reviewer` → `An********* / XXXXX6428G`, writes `403` for read-only roles), the detection split arithmetic (`TP+FP = 50`, `TP+FN = 58`), ring regeneration leaving **0 orphaned alerts**, and the logout round-trip. CoCo also **disproved a documentation claim** — the old README asserted Time Travel usage; a grep across all twelve SQL files found nothing supporting it, so it was removed rather than shipped. |
| **Deployment** | Service spec authored, image built `linux/amd64`, pushed to the Snowflake image registry, service upgraded **in place** with `ALTER SERVICE … FROM SPECIFICATION`. CoCo discovered the two constraints that shaped the demo: a public SPCS endpoint **always** requires Snowflake auth (hence four real persona users, no anonymous link), and **EAI is unavailable on trial accounts**, so the container authenticates with the OAuth token at `/snowflake/session/token`. |
| **Reusable skills** | Four CoCo skills committed in [`skills/`](skills/) for recurring compliance work: `compile_circular`, `triage_alerts`, `rule_health`, `deadline_watch`. |

**Reproduce the evidence yourself** — 8 CoCo sessions (25-Sep → 27-Sep), 44 commits, 7 plan artifacts:

```bash
ls -la .snowflake/cortex/plans/                      # CoCo plan-mode artifacts
grep -H '^created:' .snowflake/cortex/plans/*.md     # with creation timestamps
cat .snowflake/cortex/memory/projects/*/kavach-project.md   # CoCo project memory
ls skills/                                           # CoCo skills
git log --format='%ad  %s' --date=format:'%d-%b %H:%M' --reverse   # 44 commits
git log --format='%B' | grep -c 'Co-authored-by: Snowflake CoCo'   # trailer on every commit
ls ~/.snowflake/cortex/conversations/*/              # CoCo session store
```

> Session transcripts are trimmed by CoCo once summarised, so session **titles, IDs and dates** are
> cited above rather than message counts, which are not recoverable from the saved files.

---

## 📺 Demo & Live Deployment

| | |
|---|---|
| 🎥 **Video walkthrough** | **[Watch the demo](https://drive.google.com/file/d/10kvSVKHjXcEucd8HBB1q1Q2N43T72NxH/view?usp=sharing)** |
| 🌐 **Live app (SPCS)** | **https://eabuoc-zjxsmhi-bu67728.snowflakecomputing.app** |

### Signing in

The deployment is **not open to the public** — Snowpark Container Services always puts a
Snowflake sign-in in front of a public endpoint, and only users in the account that created
the service can get through. So there are **two** gates, and both use the same credentials:

1. **Snowflake ingress** — the `snowflakecomputing.app` sign-in page
2. **KAVACH itself** — the app's own persona sign-in

| Username | Password | Role | What they see |
|---|---|---|---|
| `admin` | `Admin@123` | `KAVACH_ADMIN` | Full access — approve rules, act on cases, upload circulars. Unmasked customer name + PAN. |
| `analyst` | `Admin@123` | `KAVACH_ANALYST` | Investigate and act on cases. **PAN masked.** |
| `auditor` | `Admin@123` | `KAVACH_AUDITOR` | **Read-only.** Sees everything, changes nothing. |
| `reviewer` | `Admin@123` | `KAVACH_REVIEWER` | **Read-only** and **name + PAN both masked.** |

> [!NOTE]
> The personas are not a UI toggle. Signing in opens a **real Snowflake session** for that
> role, so the masking policies and row-access policies in the database are what redact the
> data — the same account viewed as `admin` vs `reviewer` returns genuinely different rows.
> See [Governance](#-governance-personas-are-real).

> [!IMPORTANT]
> Everything in this project is **synthetic**. The circulars are regulator-*style* documents
> written for this demo — they are **not** actual RBI circulars, and there are no real
> customers, accounts or transactions.

---

## 🧭 Table of Contents

- [Hackathon submission](#-snowflake-coco-cli-hackathon-2026--gcc-edition)
- [Demo & live deployment](#-demo--live-deployment)
- [How CoCo was used across the lifecycle](#-how-coco-was-used-across-the-lifecycle)
- [The problem](#-the-problem)
- [What KAVACH does](#-what-kavach-does)
- [Feature tour with screenshots](#-feature-tour)
  - [Landing & sign-in](#landing--sign-in) · [Today](#1-today--the-morning-briefing) · [Alerts & case file](#2-alerts--the-case-file) · [Why-not](#3-why-not-the-negative-explainer) · [Ask KAVACH](#4-ask-kavach--conversational-intelligence) · [Mule rings](#5-mule-rings--graph-detection) · [Rulebook](#6-rulebook--the-regulation-compiler) · [Time machine](#7-time-machine--threshold-replay) · [Shell](#8-shell-search-shortcuts-and-read-only-mode) · [Bilingual](#bilingual-by-design) · [Tour](#guided-product-tour)
- [Tech stack](#-tech-stack)
- [Architecture](#-architecture)
- [Snowflake features used](#-snowflake-features-used)
- [AI models](#-ai-models)
- [Data model](#-data-model)
- [Governance](#-governance-personas-are-real)
- [Compliance: obligations and controls](#-compliance-obligations-and-controls)
- [MCP: KAVACH as a tool for other agents](#-mcp-kavach-as-a-tool-for-other-agents)
- [Snowflake features at every step](#-snowflake-features-at-every-step)
- [Running it locally](#-running-it-locally)
- [Deploying to SPCS](#-deploying-to-spcs)
- [Repository layout](#-repository-layout)

---

## 🎯 The Problem

An Indian bank's compliance team lives with four permanent problems:

1. **Regulations arrive as prose.** A circular lands as a PDF. Somebody reads it, and months
   later an engineer hand-codes a threshold that may or may not match what it said.
2. **Alerts arrive without reasons.** A scoring model emits a risk number. The analyst cannot
   tell a regulator *why* an account was flagged.
3. **Evidence is assembled by hand.** When a report is due, someone screenshots dashboards
   into a document, and nothing is tamper-evident.
4. **Nobody can ask the data a question.** Wanting "which branches had the most high-risk
   alerts" means filing a ticket and waiting.

KAVACH closes all four loops inside Snowflake — the data never leaves the account.

---

## ⚡ What KAVACH Does

| | Capability | How |
|---|---|---|
| 📜 | **Compiles regulations into runnable checks** | `AI_PARSE_DOCUMENT` + `AI_COMPLETE` turn circular paragraphs into SQL rule definitions, each citing the paragraph it came from. A human approves before anything runs. |
| 🔍 | **Detects 9 financial-crime typologies** | Rule engine + calibrated XGBoost, blended into one ranked queue. |
| 🕸️ | **Finds mule rings and round-tripping** | Graph detection over shared phone/IP/device plus money flow, rendered as an interactive network. |
| 💬 | **Explains every alert in plain English and Hindi** | `AI_COMPLETE` writes the narrative, `AI_TRANSLATE` produces हिन्दी — with ranked, weighted reasons underneath. |
| 🙋 | **Answers "why was this *not* flagged?"** | The negative explainer replays every check against any transaction ID and shows how close each came. |
| 🤖 | **Answers questions in natural language** | Cortex Agent over a semantic view + Cortex Search across circular text, with citations. |
| 🔌 | **Plugs into other AI agents** | A Snowflake-managed MCP server exposes the compliance agent and circular search as tools, so Claude or Cursor can query the bank's posture without any infrastructure of ours. |
| 📦 | **Produces audit-ready evidence packs** | JSON + HTML/PDF pack, hashed and registered so it can be verified as untouched. |
| 📝 | **Drafts the suspicious transaction report** | One click from the case file. |
| ⏱️ | **Replays thresholds over history** | Move a threshold, see how alert volume and review hours would have changed over 90 days. |
| 🔐 | **Enforces who sees what in the database** | Dynamic masking + row access policies keyed to `CURRENT_ROLE()`. |

---

## 📸 Feature Tour

> [!NOTE]
> **How these screenshots were captured.** The landing and sign-in shots are taken against a
> running stack reading live Snowflake data. The in-app screenshots come from the repo's
> Playwright visual-QA suite (`npm run screens`), which runs against the deterministic **mock**
> dataset so the images are reproducible and stable. The layouts, components and copy are
> identical to live; the numbers in them are the fixture values rather than the current contents
> of the account — most visibly the 30-day trend chart, which is evenly distributed in the
> fixtures but concentrated on one date live.

### Landing & sign-in

The landing page reads live deployment counts straight from Snowflake, so the numbers on it
are the real contents of the database.

| Landing | Sign-in |
|---|---|
| <img src="docs/screens/landing-1440-dark.png" alt="KAVACH landing page"> | <img src="docs/screens/login-1440-dark.png" alt="KAVACH persona sign-in page"> |

### 1. Today — the morning briefing

A readiness score out of 100 with *what is pulling it down*, four KPIs written as sentences
rather than bare numbers, a ranked "needs your attention" list, an alerts-vs-confirmed-fraud
trend, and an AI-written paragraph summarising the week.

<img src="docs/screens/today-1920-light.png" alt="Today page: readiness score, KPIs, needs-your-attention list and trend chart" width="900">

### 2. Alerts — the case file

The queue, filterable by typology, due status and free text.

<img src="docs/screens/alerts-list-1920-light.png" alt="Alerts queue with filters" width="900">

Opening a case gives the story, the ranked reasons with signal strength, the connected
accounts, the evidence pack and the draft report — all in one drawer.

| The story + why it was flagged | Who is connected |
|---|---|
| <img src="docs/screens/alerts-case-1920-light.png" alt="Case file: AI-written story and ranked reasons"> | <img src="docs/screens/alerts-case-connected-1920-light.png" alt="Case file: connected accounts"> |
| **Evidence pack, verified as untouched** | **Draft suspicious transaction report** |
| <img src="docs/screens/alerts-case-verified-1920-light.png" alt="Evidence pack verified untouched"> | <img src="docs/screens/alerts-draft-1920-light.png" alt="Draft suspicious transaction report"> |

### 3. Why-not: the negative explainer

Paste any transaction ID and KAVACH replays every check against it, showing which checks
looked at it and how close each one came to firing. This is the question auditors actually
ask, and almost no system can answer it.

<img src="docs/screens/alerts-whynot-1920-light.png" alt="Why-not explainer showing every check that looked at a transaction and how close each came" width="900">

### 4. Ask KAVACH — conversational intelligence

A Cortex Agent with five tools: the semantic view for numeric questions, Cortex Search over
circular text, and helpers for alerts, rings and rules. Answers show their working.

| Ask anything | Show the data behind the answer | Cite the circular |
|---|---|---|
| <img src="docs/screens/ask-empty-1920-light.png" alt="Ask KAVACH empty state with suggested questions"> | <img src="docs/screens/ask-data-1920-light.png" alt="Answer with the underlying result set revealed"> | <img src="docs/screens/ask-circular-1920-light.png" alt="Answer citing the regulatory circular paragraph"> |

### 5. Mule rings — graph detection

Accounts that work together to move money, laid out as a network. Edges are shared phone,
shared device, shared IP, or money actually sent.

Two shapes are detected and the page names each for what it is, rather than describing both in
the language of one. A **collection ring** runs victims → collector → mules → exit: the
collector skims and fans out, each mule forwards on within minutes, and an exit account drains
the ring to cash, SWIFT or crypto. A **round trip** is a closed loop — the money leaves an
account, travels a chain shaving a little at each hop, and returns to where it started, so the
page shows the loop path (`A → B → C → A`) and labels every member a loop hop, because a cycle
has no collector and no exit to point at. Live: 3 collection rings, 6 round trips.

The classification is read from the direction of each ring's internal edges, not from a stored
label, so it stays correct if the data is regenerated.

| The ring | Hovering an account |
|---|---|
| <img src="docs/screens/rings-1920-light.png" alt="Mule ring network graph"> | <img src="docs/screens/rings-hover-1920-light.png" alt="Ring node tooltip"> |

### 6. Rulebook — the regulation compiler

Upload a circular and watch it become checks. Every compiled rule shows what it does in plain
language, the paragraph it came from, and waits for human approval. KAVACH also detects when
two rules **contradict or overlap**, and tracks each rule's precision over the last 30 days so
noisy rules can be retired.

| Review compiled rules | Upload → compile |
|---|---|
| <img src="docs/screens/rulebook-review-1920-light.png" alt="Rulebook: compiled rules awaiting approval"> | <img src="docs/screens/rulebook-upload-1920-light.png" alt="Turning a circular into checks"> |
| **Conflict detection** | **Rule health / precision** |
| <img src="docs/screens/rulebook-conflicts-1920-light.png" alt="Detected contradictions and overlaps between rules"> | <img src="docs/screens/rulebook-health-1920-light.png" alt="Per-rule precision over the last 30 days"> |

### 7. Time machine — threshold replay

Drag a threshold and replay the last 90 days: how many alerts would have fired, how many
review hours that costs, and what would have been missed.

| Set the threshold | Replayed result |
|---|---|
| <img src="docs/screens/timemachine-1920-light.png" alt="Time machine threshold slider"> | <img src="docs/screens/timemachine-result-1920-light.png" alt="Replayed alert volume and review hours"> |

### 8. Shell: search, shortcuts and read-only mode

Press <kbd>/</kbd> to search customers, accounts and alerts; <kbd>?</kbd> for shortcuts. A
read-only persona gets a banner and loses every write control — enforced by middleware, not
just hidden in the UI.

| Global search | Keyboard shortcuts | Read-only persona |
|---|---|---|
| <img src="docs/screens/shell-search-1920-light.png" alt="Global search"> | <img src="docs/screens/shell-shortcuts-1920-light.png" alt="Keyboard shortcuts dialog"> | <img src="docs/screens/shell-reviewer-1280-light.png" alt="Read-only access banner for the reviewer persona"> |

### Bilingual by design

Hindi is a first-class locale, not an afterthought: UI copy, the AI-written alert narratives,
and number/date formatting all switch together.

| Today in हिन्दी | Case file in हिन्दी |
|---|---|
| <img src="docs/screens/today-hindi-1280-light.png" alt="Today page in Hindi"> | <img src="docs/screens/alerts-hindi-1280-light.png" alt="Case file in Hindi"> |

### Guided product tour

A 12-step tour walks a first-time user across every page, navigating between routes as it
goes and skipping gracefully if a target is slow to render.

<img src="docs/screens/tour-1-1280-light.png" alt="Guided product tour, first step" width="760">

### Design system

Every colour, type ramp, and component is a semantic token with a light and dark value,
documented on a live `/styleguide` route.

<img src="docs/screens/styleguide-1920-light.png" alt="KAVACH design system styleguide" width="900">

---

## 🧱 Tech Stack

### Frontend — `frontend/`

| Concern | Choice |
|---|---|
| Framework | **React 18.3** + **TypeScript 5.9** (strict) |
| Build | **Vite 8** with `@vitejs/plugin-react` |
| Styling | **Tailwind CSS 4** — every colour and type step is a semantic token with a light and dark value |
| Components | **Radix UI** primitives (dialog, dropdown, popover, slider, switch, tabs, tooltip, collapsible) wrapped in a local design system |
| Charts | **Recharts 2** for trends and distributions |
| Graph | **React Flow (`@xyflow/react` 12)** for the mule-ring network |
| Data layer | **TanStack Query 5** + **openapi-fetch** against types generated from `docs/openapi.json` |
| Motion | **framer-motion 11**, reduced-motion aware |
| i18n | **i18next 26** / **react-i18next** — English + हिन्दी, with Noto Sans Devanagari |
| Tour | **react-joyride** — 12 steps, navigates across routes |
| Mocks | **MSW 2** — every endpoint served locally, so the UI runs with no Snowflake account |
| Testing | **Playwright** (e2e + the visual QA suite that produced the screenshots above), **Lighthouse** |

### Backend — `backend/`

| Concern | Choice |
|---|---|
| API | **FastAPI 0.115** on **Uvicorn**, 33 endpoints, N-layered (presentation → application → domain → infrastructure) |
| Snowflake | **snowflake-snowpark-python 1.55** — one session per signed-in user, bound per request via `contextvars` |
| Validation | **Pydantic 2.9** + `pydantic-settings` |
| PDF | **reportlab** for evidence packs |
| Tests | **pytest** + `pytest-asyncio` |

### Container — `Dockerfile`

One image, two stages, **one thing to deploy**: Node builds the React bundle, then the Python
runtime serves both the API **and** that built bundle from the same process — so there is no
separate static host, no CORS between UI and API, and the frontend is versioned with the backend
that serves it.

```dockerfile
# Stage 1 — build the frontend
FROM node:20-slim AS frontend-build
RUN npm ci && npm run build          # → /app/frontend/dist

# Stage 2 — Python serves API + the built SPA
FROM python:3.11-slim
COPY --from=frontend-build /app/frontend/dist ./frontend_dist
USER appuser                          # non-root
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

FastAPI mounts `frontend_dist` as static assets with an SPA fallback, so client-side routes like
`/alerts` and `/login` resolve on a hard refresh. See [Deploying to SPCS](#-deploying-to-spcs) for
how this image reaches the live URL.

---

## 🏗️ Architecture

```mermaid
graph TB
    subgraph SF["❄️ Snowflake — KAVACH_DB"]
        direction TB
        CIRC["Synthetic circulars<br/>(RAW stage)"] -->|AI_PARSE_DOCUMENT<br/>AI_COMPLETE| RULES["RULES.RULE_LIBRARY<br/>20 compiled rules · awaiting approval"]
        TXN["RAW.TRANSACTIONS<br/>1,502,688 rows"] --> FEAT["ML.ACCOUNT_FEATURES<br/>24 behavioural features"]
        FEAT --> XGB["XGBoost + isotonic<br/>calibration"]
        TXN --> ENGINE["Rule engine<br/>9 typologies"]
        RULES --> ENGINE
        XGB --> BLEND["Blended scoring"]
        ENGINE --> BLEND
        BLEND --> ALERTS["CORE.ALERTS<br/>4,528 alerts"]
        TXN --> GRAPH["Graph detection<br/>CORE.RING_MEMBERS"]
        ALERTS --> STORY["AI.ALERT_STORIES<br/>EN + HI narratives"]
        ALERTS --> EVID["AUDIT.EVIDENCE_REGISTRY<br/>hashed packs"]
        RULES --> SEARCH["Cortex Search<br/>circular text"]
        ALERTS --> SV["AI.KAVACH_SV<br/>semantic view"]
        SV --> AGENT["AI.KAVACH_AGENT<br/>Cortex Agent · 5 tools"]
        SEARCH --> AGENT
        MASK["Masking + row access policies<br/>keyed to CURRENT_ROLE()"]
    end

    subgraph SPCS["📦 Snowpark Container Services"]
        API["FastAPI · 33 endpoints<br/>N-layered"]
        UI["React 18 + TypeScript<br/>served by the same container"]
    end

    ALERTS --> API
    STORY --> API
    EVID --> API
    AGENT --> API
    GRAPH --> API
    MASK -.enforced on.-> API
    API --> UI
    UI --> USER(["Compliance team<br/>4 personas"])
```

**Request path.** The browser hits the container. A signed-in persona is bound to its own
Snowflake session for the life of the request via a `ContextVar`, so all 30-plus existing call
sites keep working unchanged while each request runs under the right role. Inside SPCS the
container authenticates with the OAuth token Snowflake mounts at `/snowflake/session/token`.

**Backend layering.** `presentation` (FastAPI routers) → `application` (use cases) →
`domain` (entities) → `infrastructure` (Snowflake repositories). Swapping a data source
touches one layer.

---

## ❄️ Snowflake Features Used

| Feature | Where it earns its place |
|---|---|
| **Cortex Agent** | `AI.KAVACH_AGENT` — orchestrates 5 tools to answer analyst questions |
| **Snowflake-managed MCP server** | `AI.KAVACH_MCP` — exposes the agent and circular search to any MCP client (Claude, Cursor) with no infrastructure of ours, behind a least-privileged role |
| **Cortex Analyst / semantic view** | `AI.KAVACH_SV` — natural-language → SQL over alerts, accounts, rings |
| **Cortex Search** | Retrieval over regulatory circular text so answers can cite a paragraph |
| **`AI_COMPLETE`** | Rule compilation, alert narratives, weekly brief, conflict detection, draft reports |
| **`AI_PARSE_DOCUMENT`** | Circular PDFs → structured paragraphs |
| **`AI_TRANSLATE`** | English narratives → हिन्दी |
| **Dynamic data masking** | `mask_customer_name`, PAN masking — different output per role |
| **Row access policies** | Row-level scoping on `CORE.CUSTOMERS` |
| **Snowpark ML** | XGBoost training, isotonic calibration, SHAP explanations |
| **Snowpark Python** | Stored procedures for data generation, scoring, evidence packs |
| **Snowpark Container Services** | Hosts the container serving both API and UI |
| **Image registry** | `kavach_repo` holds the deployed image |
| **Snowflake secrets** | Service credentials injected via `secretKeyRef`, never baked into the image |
| **Dynamic table, stream & tasks** | Incremental feature refresh (`TARGET_LAG = DOWNSTREAM`) and a rule-engine task gated on `SYSTEM$STREAM_HAS_DATA` |
| **Network policies** | Restrict which addresses the demo users can authenticate from |

A step-by-step map of which feature is used where is in
[Snowflake features at every step](#-snowflake-features-at-every-step).

---

## 🤖 AI Models

| Job | Model | Why |
|---|---|---|
| Agent orchestration (`AI.KAVACH_AGENT`) | `claude-sonnet-5` | Interactive; tool selection quality matters most |
| Bulk alert narratives (`AI.GENERATE_ALERT_STORIES`) | `claude-haiku-4-5` | 200 stories × 2 languages — throughput and cost matter |
| Rule extraction (`RULES.EXTRACT_RULES_FROM_CHUNKS`) | `claude-haiku-4-5` | Structured extraction over many chunks |
| Conflict detection (`RULES.DETECT_CONFLICTS`) | `claude-haiku-4-5` | Pairwise comparison across the rule library |

---

## 🗄️ Data Model

Eight schemas, each with one job:

| Schema | Holds |
|---|---|
| `RAW` | Landing zone — 1,502,688 transactions, 28,000 accounts, circular stage |
| `CORE` | Curated entities — 20,000 customers, 4,528 alerts, ring membership |
| `RULES` | Compiled rule library (20 rules: 19 compiled + 1 amendment, all `PENDING_APPROVAL`), approvals, detected conflicts |
| `ML` | Features, model artefacts, evaluation ground truth and reports |
| `AI` | Semantic view, agent, alert stories (200), explainability views |
| `APP` | Application-facing objects, image repository, secrets, the service |
| `AUDIT` | Evidence registry, action log — the tamper-evident trail |
| `REF` | Reference data: branches, typologies, country risk |

**Live contents right now:**

| Transactions | Accounts | Customers | Alerts | Rule approvals | AI narratives | Rings |
|---|---|---|---|---|---|---|
| 1,502,688 | 28,000 | 20,000 | 4,528 | 0 of 20 approved | 200 | 9 (3 collection · 6 round-trip) |

---

## 🔐 Governance: personas are real

Signing in as a persona opens a Snowflake session **as that role**. The redaction is done by
the database, not the UI — so it holds no matter how the data is reached. Verified on the same
customer record:

| Signed in as | Role | Customer name | PAN | Writes |
|---|---|---|---|---|
| `admin` | `KAVACH_ADMIN` | `Umesh Nair` | `TGDCT5500H` | ✅ allowed |
| `analyst` | `KAVACH_ANALYST` | `Asha Pillai` | `XXXXX8524N` 🔒 | ✅ allowed |
| `auditor` | `KAVACH_AUDITOR` | `Umesh Nair` | `TGDCT5500H` | ❌ `403` |
| `reviewer` | `KAVACH_REVIEWER` | `An*********` 🔒 | `XXXXX6428G` 🔒 | ❌ `403` |

Read-only enforcement is middleware-level: any non-`GET` to a write path from a read-only role
returns `403` before it reaches a handler. Hiding the button is not the control.

---

## 📋 Compliance: obligations and controls

Two questions a compliance officer asks about a system like this: *does it cover what the
regulation actually obliges us to do*, and *would its output survive a regulator asking how
you got there*. Both answered below, including where the answer is "not yet".

### Obligations the circulars impose

The eight synthetic circulars — generated to `@RAW.REG_STAGE` by
[`sql/06_reg_circulars.sql`](sql/06_reg_circulars.sql) — are parsed into 49 paragraphs and
compiled into 19 rules, every one carrying a `SOURCE_CITATION` back to the paragraph it came
from and every one `COMPILED_BY = 'AI'`, none hand-written. What each obligation maps to:

| Obligation | Implemented by | Live state |
|---|---|---|
| **CTR** — report cash transactions over ₹10,00,000 | 4 compiled `CASH_REPORTING` rules → `CORE.ALERTS`, `ACTION_REQUIRED = 'CTR'` | ✅ 2,000 alerts |
| **Threshold amendment** — `KAVACH/2025/01` raises the reporting threshold to ₹15,00,000 | `RULES.APPLY_AMENDMENTS()` supersedes v1 and issues a v2 rule; Time Machine replays either threshold | ✅ v2 rule in force, replay works |
| **STR** — file a suspicious transaction report | `AI.DRAFT_STR` function drafts from the alert's own evidence; the engine's action map assigns `STR` to the layering, structuring, mule and pass-through typologies | ✅ drafting works on any alert, one click from the case file; 3 alerts currently carry `ACTION_REQUIRED = 'STR'`. Filing itself is out of scope |
| **KYC / CDD** — re-verify customers whose KYC is stale or expired | `KYC_CDD` rule, anchored to the data's reference date | ✅ 1,000 alerts from 2 `KYC_CDD` rules |
| **Wire transfer reporting** | `WIRE_TRANSFER` rule | ✅ 500 alerts |
| **General AML monitoring** | 2 `GENERAL_AML` rules | ✅ 500 alerts |
| **Dormant account revival** | `DORMANT_REACTIVATION` rule | ✅ 25 alerts — and the only rule whose typology matches planted fraud, at 100% precision |
| **Layering / round-tripping** | 2 compiled `ROUND_TRIPPING` rules, plus graph cycle detection in `CORE.ROUND_TRIP_CYCLES` | ✅ graph detection finds 4 cycles (the compiled rules return no rows on this data; graph detection is the working path) |
| **Structuring / smurfing** | 2 compiled `STRUCTURING` rules | 🟡 rules compiled; they match no rows on this data yet, so the multi-condition joins are the next thing to tune |
| **Mule networks** | 1 compiled `MULE_RING` rule, plus graph detection in `CORE.RINGS` | ✅ graph detection finds all 3 planted rings (the compiled rule returns no rows; graph detection is the working path) |
| **Sanctions screening** | 1 compiled `SANCTIONS_SCREENING` rule against `REF.WATCHLIST` | 🟡 rule compiled; returns no rows on this data yet |
| **Conflicting guidance** — two circulars defining layering differently | `RULES.DETECT_CONFLICTS()` → `RULES.RULE_CONFLICTS`, surfaced on the Rulebook page | ✅ 9 conflicts detected, not auto-resolved |
| **Filing deadlines** | `AI.DEADLINE_CLOCK` view | ✅ |
| **Programme readiness** | `AI.READINESS_SCORE`, `AI.RULE_HEALTH` views | ✅ |

Five further fraud typologies in the ground truth are covered by the ML model and the
detection design; uploading a circular adds a corresponding rule through the same
Rulebook flow.

### Controls that make the output defensible

| Control | How it is enforced | Verify with |
|---|---|---|
| PII redaction | 4 masking policies in `CORE` — `MASK_PAN`, `MASK_CUSTOMER_NAME`, `MASK_ACCOUNT_NUMBER`, `MASK_MOBILE` — applied by the database, so they hold however the data is reached | `SHOW MASKING POLICIES IN DATABASE KAVACH_DB`; the persona table [above](#-governance-personas-are-real) |
| Regional data segregation | Row access policy `CORE.RAP_REGION_FILTER` driven by `REGION_ACCESS_MAP` | `SHOW ROW ACCESS POLICIES IN DATABASE KAVACH_DB` |
| Least privilege | Five application roles; the backend runs as `KAVACH_ADMIN`, never `ACCOUNTADMIN`. MCP clients get a sixth, separate `KAVACH_MCP_ROLE` | `SHOW ROLES LIKE 'KAVACH%'` |
| Read-only enforcement | Middleware rejects any non-`GET` to a write path from a read-only role with `403`, before a handler runs | `scripts/smoke_test.py` |
| Every alert traceable to a paragraph | `CITATION` populated on **all 4,528** alerts; `REASONS` holds the matched row that fired the rule | `SELECT CITATION, REASONS FROM CORE.ALERTS LIMIT 1` |
| Tamper-evident evidence | Evidence packs written to `APP.EVIDENCE_STAGE` and registered in `AUDIT.EVIDENCE_REGISTRY` with a SHA-256 taken over the bytes uploaded; re-verification re-hashes the stored file | the `/evidence` → presigned URL → re-hash path in `scripts/smoke_test.py` |
| Rule changes reversible | Any in-place rule regeneration writes the previous SQL to `RULES.RULE_SQL_HISTORY` | `SELECT * FROM RULES.RULE_SQL_HISTORY` |
| Rules never silently self-approve | Compiled rules land as `PENDING_APPROVAL`; approval and rejection are recorded with actor and reason | `SELECT STATUS, APPROVED_BY, REJECTED_BY, REJECTION_REASON FROM RULES.RULE_LIBRARY` |
| No data leaves the account | Cortex only — no external LLM API, no third-party cloud. The MCP server exposes the agent and circular search, and deliberately **not** `SYSTEM_EXECUTE_SQL`, which would bypass the semantic view and the masking policies | [`sql/14_mcp_server.sql`](sql/14_mcp_server.sql) |

> [!NOTE]
> `AUDIT.ACTIVITY_LOG` and its `log_activity()` procedure are wired up and fill as analysts
> act on cases; the table is currently empty on this account. `AUDIT.EVIDENCE_REGISTRY` holds
> 2 packs from verification runs, each re-verifiable by hash.

---

## 🔌 MCP: KAVACH as a tool for other agents

Everything above is KAVACH's own UI. A **Snowflake-managed MCP server** makes the same
capability available *to other AI agents* — Claude, Cursor, ChatGPT, or a custom client —
with no server, container or gateway of ours in the path. Snowflake hosts the endpoint.

```
https://<account>.snowflakecomputing.com/api/v2/databases/KAVACH_DB/schemas/AI/mcp-servers/KAVACH_MCP
```

Defined in [`sql/14_mcp_server.sql`](sql/14_mcp_server.sql), two tools:

| Tool | Type | What it is for |
|---|---|---|
| `kavach_agent` | `CORTEX_AGENT_RUN` | The governed entry point. The client asks a question; `AI.KAVACH_AGENT` decides whether to reach for the semantic view, circular search, or an explainability procedure, and answers with citations. |
| `kavach_reg_search` | `CORTEX_SEARCH_SERVICE_QUERY` | Direct paragraph lookup over the circulars. "What does the regulation say" needs no orchestration, and this answers in about a second rather than about a minute. |

Exposing the agent as the client-facing tool is
[Snowflake's own recommendation](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-mcp)
for governed business data: the client gets one interface and the agent picks the right
resource per request.

**What is deliberately *not* exposed.** `SYSTEM_EXECUTE_SQL` is available as an MCP tool
type and is left off. It would let a client write its own SQL and walk straight past the
semantic view, the verified queries and the masking policies the agent goes through. If raw
SQL is ever needed it belongs on a separate server with its own least-privileged role.
`time_machine` is also left off — it takes an `OBJECT` parameter, which the warehouse
execution environment does not support for tool calls.

**Masking still holds.** An MCP session runs as the connecting user's role, so a client
sees exactly what that role is granted and nothing more. Access is a dedicated
`KAVACH_MCP_ROLE`, because access to the server is *not* access to its tools — each tool
needs its own grant, and the agent additionally needs the objects it reads.

**It is verified, not just declared.** [`scripts/mcp_smoke_test.sh`](scripts/mcp_smoke_test.sh)
drives the live endpoint over JSON-RPC with a role-restricted token and no MCP SDK. Real
output, abridged only by trimming the long lines:

```
== tools/list
  kavach_agent       KAVACH compliance copilot
  kavach_reg_search  Regulatory circular search

== tools/call kavach_reg_search -- what the circulars say
  isError: False
  hit: All Regulated Entities (REs) shall report Cash Transaction Reports (CTRs) for all
       cash transactions of value exceeding Rs. 10,00,000 (Rupees Ten Lakhs) ...
  hit: This circular supersedes all previous circulars on cash transaction monitoring
       thresholds.

== tools/call kavach_agent -- a question about the bank's own data (~1 min)
  isError: False
  status: completed | blocks: 14
  answer: Key breakdown: - **CASH_REPORTING**: 4,319 alerts (~51%) - **GENERAL_AML**:
          2,500 (~30%) - **WIRE_TRANSFER**: 1,081 (~13%) - **KYC_CDD**: 500 (~6%)
          - **DORMANT_REACTIVATION**: 7 (<1%)
MCP smoke test: PASS
```

Every figure in that answer came out of `CORE.ALERTS` through the semantic view rather than anything hardcoded, so the whole path — MCP client → server → agent
→ semantic view → live data — is doing real work. In an earlier run the agent also corrected
itself mid-answer on finding that every alert carries status `NEW` rather than `OPEN`.

`tools/call` responses arrive as Server-Sent Events, so a client must send
`Accept: application/json, text/event-stream` and read the last `data:` frame. OAuth is the
route real clients use; the exact security-integration SQL is in `sql/14_mcp_server.sql`,
left uncreated because the redirect URI belongs to a specific client and the integration
holds a client secret.

---

---

## 🛠️ Snowflake Features at Every Step

This project was built **end to end with Snowflake CoCo CLI** — no external IDE, no third-party
cloud, and no data leaving the account. Every schema, policy, procedure, model, agent and the
container deployment itself was authored and executed through CoCo CLI driving SQL and Snowpark
straight against the account.

Below is exactly what each build step uses. The step numbers match the files in [`sql/`](sql/).

### Step-by-step

| Step | File | What it builds | Snowflake features used |
|---|---|---|---|
| **01** | `01_foundation.sql` | Database, warehouse, 8 schemas | `CREATE DATABASE` · `CREATE WAREHOUSE` (with `AUTO_SUSPEND=60` for cost control) · schema isolation |
| **02** | `02_governance.sql` | Roles and data protection | **4 dynamic masking policies** · **1 row access policy** · **5 custom roles** · RBAC grant hierarchy · policies keyed to `CURRENT_ROLE()` |
| **03** | `03_ref_views.sql` | Reference data | Reference tables for branches, typologies, country risk |
| **04** | `04_synthetic_data.sql` | 1.5M transactions, 28K accounts | **5 Snowpark Python stored procedures** · internal stage · deterministic seeded generation · realistic mule-ring flow (collector → mule → exit) |
| **05** | `05_core_tables.sql` | Curated entity layer | Customers, accounts, alerts, ring membership |
| **06** | `06_reg_circulars.sql` | Circular ingestion | Internal **stage** for PDFs · Snowpark procedure to register documents |
| **07** | `07_regulation_compiler.sql` | **The regulation compiler** | **`AI_PARSE_DOCUMENT`** (PDF → paragraphs) · **`AI_COMPLETE`** ×5 (paragraph → SQL rule, conflict detection) · **`CREATE CORTEX SEARCH SERVICE`** over circular text · `SNOWFLAKE.CORTEX.SEARCH_PREVIEW` · 6 Snowpark procedures |
| **08** | `08_explainability.sql` | Narratives and audit views | **`AI_COMPLETE`** (alert story) · **`AI_TRANSLATE`** (EN → हिन्दी) · 4 SQL UDFs (`EXPLAIN_ALERT`, `DRAFT_STR`) · 3 views (`DEADLINE_CLOCK`, `RULE_HEALTH`, `READINESS_SCORE`) · evidence-pack procedure |
| **09** | `09_ml_pipeline.sql` | Feature + model pipeline | **`CREATE DYNAMIC TABLE`** with **`TARGET_LAG = DOWNSTREAM`** · **`CREATE TASK`** for scheduled refresh · **Snowpark ML** (XGBoost, isotonic calibration, SHAP) · dedicated warehouse |
| **10** | `10_rule_execution.sql` | Incremental rule engine | **`CREATE STREAM`** for change capture · **`CREATE TASK`** gated on **`SYSTEM$STREAM_HAS_DATA`** · `AI_COMPLETE` ×2 · blended scoring procedure |
| **11** | `11_graph_detection.sql` | Mule rings and cycles | Recursive graph traversal in SQL · shared phone/IP/device edge building · round-trip cycle detection |
| **12** | `12_ai_agent_tools.sql` | Agent tooling | Tool procedures the Cortex Agent calls · result staging |
| **13** | `13_evaluation.sql` | **Reproducible evaluation** | Rebuilds every `ML.EVAL_*` table from ground truth, scores, and alerts · recovers the model's held-out split from its own SHAP coverage · idempotent |
| **14** | `14_mcp_server.sql` | **MCP server** | **`CREATE MCP SERVER`** exposing the Cortex Agent (`CORTEX_AGENT_RUN`) and circular search (`CORTEX_SEARCH_SERVICE_QUERY`) · least-privileged access role · OAuth setup documented |
| **—** | `semantic/kavach_sv.yaml` | **Semantic layer** | **`SEMANTIC VIEW` (`AI.KAVACH_SV`)** — Cortex Analyst model with verified queries |
| **—** | *(agent DDL)* | **Conversational layer** | **Cortex Agent (`AI.KAVACH_AGENT`)** — `claude-sonnet-5` orchestration across 5 tools |
| **—** | `backend/` | API | **OAuth token auth** from `/snowflake/session/token` · **Snowpark `Session`** per signed-in user · masking enforced by the database, not the app |
| **—** | `deploy/` + `Dockerfile` | Deployment | **Snowpark Container Services** · **image registry** · **compute pool** (`CPU_X64_XS`, auto-suspend) · **Snowflake secrets** via `secretKeyRef` · **network policy** on demo users · `ALTER SERVICE … FROM SPECIFICATION` for in-place upgrades |

### Feature checklist

| Category | Features used |
|---|---|
| **Cortex AI** | Cortex Agent · **Snowflake-managed MCP server** · Cortex Analyst (semantic view) · Cortex Search · `AI_COMPLETE` · `AI_PARSE_DOCUMENT` · `AI_TRANSLATE` |
| **ML** | Snowpark ML · XGBoost · isotonic calibration · SHAP explanations |
| **Pipelines** | Dynamic table (`TARGET_LAG = DOWNSTREAM`) · stream · 2 tasks · `SYSTEM$STREAM_HAS_DATA` |
| **Governance** | 4 masking policies · 1 row access policy · 6 roles · RBAC · network policy · PAT with `ROLE_RESTRICTION` |
| **Compute & code** | Snowpark Python procedures · SQL UDFs · multiple warehouses with auto-suspend |
| **Deployment** | SPCS service · compute pool · image registry · secrets · service spec upgrades |
| **Storage** | Internal stages for circulars and evidence packs |

Why it matters that this is all *inside* Snowflake: because the tooling and the data share an
address, the AI features are not bolted on through an external API. Rule compilation, narratives,
translation and the agent all execute as Snowflake functions — so the masking and row-access
policies that protect the tables apply to the AI layer automatically, with nothing extra to wire.

---

## 💻 Running It Locally

**Prerequisites:** Python 3.11+, Node 20+, and a Snowflake account with `KAVACH_DB` built from
`sql/` (run `01_foundation.sql` → `14_mcp_server.sql` in order).

```bash
# 1. Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # add your Snowflake account, user, password
uvicorn app.main:app --host 0.0.0.0 --port 8080

# 2. Frontend
cd frontend
npm install
npm run dev                   # talks to the backend on :8080 via the Vite proxy
```

**No Snowflake account? Run the whole UI on mocks:**

```bash
cd frontend && npm run dev:mock   # every endpoint served by MSW
```

### Frontend scripts

```bash
npm run dev:mock      # everything from mock data, no backend needed
npm run dev           # proxy /api to FastAPI on :8080
npm run build         # type-check + production build into frontend/dist
npm run e2e           # Playwright tests (mock mode)
npm run screens       # visual QA screenshots → docs/screens/
npm run gen:fixtures  # rebuild mock data from data/exports/tables
npm run gen:api       # regenerate API types from docs/openapi.json
```

### Useful switches

| Setting | Meaning |
|---|---|
| `VITE_USE_MOCKS=true` | Serve every endpoint from MSW; a "Demo data" chip appears in the top bar |
| `VITE_API_BASE` | Backend origin when it is not same-origin |
| `?role=reviewer\|analyst\|admin` | Mock mode only — sign in as that role |
| `?cold=1` | Mock mode only — simulate a sleeping server ("Waking up the secure server…") |
| <kbd>/</kbd> · <kbd>?</kbd> | Global search · keyboard shortcuts |

---

## 🚀 Deploying to SPCS

The whole app ships as **one container image**: the React frontend is compiled during the Docker
build and baked into the image, and the Python process serves both that bundle and the API. That
image is pushed to the **Snowflake image registry** inside the account, and a **Snowpark Container
Services** service runs it on a compute pool — so the UI, the API and the data all live in
Snowflake, and nothing is hosted outside it.

```
frontend/ ──npm run build──┐
                           ├──► docker build (linux/amd64) ──► Snowflake image registry
backend/app/ ──────────────┘                                    kavach_db/app/kavach_repo
                                                                          │
                                                                          ▼
                                                        SPCS service KAVACH_DB.APP.KAVACH_WEB
                                                        on compute pool KAVACH_POOL
                                                                          │
                                                                          ▼
                                    https://eabuoc-zjxsmhi-bu67728.snowflakecomputing.app
```

One script does all of it — build, push, in-place upgrade, wait for the rollout, print the URL:

```bash
./deploy/redeploy.sh            # full redeploy
./deploy/redeploy.sh status     # service + pool + endpoint (cheap)
./deploy/redeploy.sh spec       # ALTER SERVICE only, when just the spec changed
./deploy/redeploy.sh suspend    # take the compute pool to zero nodes
```

Full operator handover — prerequisites, credentials, cost control, troubleshooting, data gotchas and
the open backlog — is in **[DEPLOY.md](DEPLOY.md)**.

Under the hood it is these three steps:

```bash
# 1. Build for SPCS (linux/amd64 regardless of your host — required by SPCS)
docker build --platform linux/amd64 \
  -t <org>-<acct>.registry.snowflakecomputing.com/kavach_db/app/kavach_repo/kavach-web:latest .

# 2. Push to the Snowflake image registry
docker login <org>-<acct>.registry.snowflakecomputing.com -u <user>
docker push <org>-<acct>.registry.snowflakecomputing.com/kavach_db/app/kavach_repo/kavach-web:latest

# 3. Upgrade in place — never drop and recreate, the ingress URL changes if you do
ALTER SERVICE KAVACH_DB.APP.KAVACH_WEB FROM SPECIFICATION $$ ... $$;
```

Service spec lives in [`deploy/spec.yaml`](deploy/spec.yaml); compute pool `KAVACH_POOL`
(`CPU_X64_XS`, auto-suspend 600s). Service credentials are injected from a **Snowflake secret** via
`secretKeyRef` — never baked into the image. Inside the container the app authenticates to
Snowflake with the OAuth token Snowflake mounts at `/snowflake/session/token`.

**Two constraints worth knowing before you copy this setup:**

- **A public SPCS endpoint always requires Snowflake authentication**, and only users in the
  account that created the service can pass it. There is no anonymous mode.
- **External Access Integrations are not available on trial accounts**, so a container cannot
  make an outbound password connection back to Snowflake. The OAuth token mounted at
  `/snowflake/session/token` is the only path in — which is what `connection.py` uses.

---

## 📁 Repository Layout

```
KAVACH/
├── sql/                     # 01→12: schemas, data, rules, ML, graph, agent tools
├── backend/
│   └── app/
│       ├── presentation/    # FastAPI routers — 33 endpoints
│       ├── application/     # use cases
│       ├── domain/          # entities
│       └── infrastructure/  # Snowflake repositories, per-user sessions, config
├── frontend/
│   └── src/
│       ├── pages/           # Landing, Login, Today, Alerts, Ask, Rings, Rulebook, TimeMachine
│       ├── features/        # alerts, ask, rings, rulebook, time-machine, today, tour, session
│       ├── shared/          # design tokens, UI primitives, i18n (EN + HI)
│       ├── services/api/    # typed client + DTO→model adapters
│       └── mocks/           # MSW handlers + fixtures
├── snowpark/                # Snowpark procedures and ML jobs
├── semantic/                # semantic view definition
├── deploy/                  # SPCS service spec + deployment notes
├── ops_console/             # Streamlit ops console
├── docs/                    # architecture, design spec, screenshots
├── data/                    # exports used to build mock fixtures
└── Dockerfile               # multi-stage: Node build → Python runtime
```

---

<div align="center">

**Built by [Pratham Ahuja](https://github.com/PRATHAMAHUJA001)**

Snowflake · Cortex AI · Snowpark Container Services · FastAPI · React

*All data, customers, accounts and circulars in this project are synthetic.*

</div>

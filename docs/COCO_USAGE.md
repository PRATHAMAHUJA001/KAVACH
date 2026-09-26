# How CoCo was used across the lifecycle

The hackathon asks for evidence of Snowflake CoCo CLI at every stage of the build. This document
records exactly what ran where, and — importantly — every claim below is **reproducible from
artifacts committed to this repository**, not from a narrative. Run the commands in
[Reproduce this yourself](#reproduce-this-yourself) to check any row.

KAVACH was built between **25 September 2026** and **27 September 2026** across **26 commits** and
**8 CoCo sessions**, with **7 CoCo plan-mode artifacts** and **4 CoCo skills** checked into the
repo as a byproduct of the work.

---

## Phase by phase

### 1. Planning and design

CoCo's plan mode was used to design each phase before any DDL ran, and those plans are tracked in
git — they are not reconstructions written after the fact.

| Plan artifact | Created (from file frontmatter) | Designed |
|---|---|---|
| `phase-2-synthetic-data.plan.md` | `2026-09-25T05:31:33Z` | 1.5M transaction generator, 9 injected typologies, mule-ring topology |
| `phase-4-detection-engine.plan.md` | `2026-09-25T09:39:00Z` | Rule engine + XGBoost + blended scoring, leakage audit |
| `phase-5-conversational-intel.plan.md` | `2026-09-25T11:09:43Z` | Semantic view, Cortex Agent tools, Cortex Search |
| `agent-identity-html-evidence.plan.md` | `2026-09-25T14:05:23Z` | Agent identity enforcement, HTML/PDF evidence packs |
| `alerts-page-case-drawer.plan.md` | `2026-09-25T20:26:11Z` | Alerts queue and the case-file drawer |
| `phase-3-regulation-compiler.plan.md` | *(earlier plan format)* | Circular → executable rule compilation |
| `migrate-account-and-build-alerts-page.plan.md` | *(earlier plan format)* | Cross-account migration strategy |

The plans directory also carries CoCo's persistent project memory
(`.snowflake/cortex/memory/projects/…/kavach-project.md`), which is what let later sessions resume
with the account topology, role names and cost constraints already known.

```
.snowflake/cortex/
├── memory/projects/Users-pratham-Documents-SnowFlake-Project/kavach-project.md
└── plans/
    ├── phase-2-synthetic-data.plan.md
    ├── phase-3-regulation-compiler.plan.md
    ├── phase-4-detection-engine.plan.md
    ├── phase-5-conversational-intel.plan.md
    ├── agent-identity-html-evidence.plan.md
    ├── alerts-page-case-drawer.plan.md
    └── migrate-account-and-build-alerts-page.plan.md
```

### 2. Building in Snowflake

Every schema, masking policy, row access policy, stored procedure, dynamic table, stream, task,
Cortex Search service, semantic view and agent was authored **and executed** through CoCo against
account `ONFHCCI-TV84204`. The twelve files in [`sql/`](../sql/) are the record of that work, in
the order they were applied.

| CoCo session | ID | What it built |
|---|---|---|
| *KAVACH Phase 1 Foundation Setup* | `01fbfb1f` | Database, warehouse, 8 schemas, 5 roles, masking + row access policies |
| *Finish Checkpoint 1 Phase 6* | `04e512ea` | Explainability procedures, views, evidence registry |
| *Finish Phases 6 to 8* | `2ec02ea4` | Explainability → application layer |
| *Export Snowflake Metadata to Repo* | `f780b911` | Metadata export used to build frontend mock fixtures |

Representative commits from this phase:

```
25-Sep 17:56  CHECKPOINT 0: Credit audit complete — set warehouses AUTO_SUSPEND=60,
              changed DT target_lag to DOWNSTREAM
25-Sep 18:01  CHECKPOINT 1: Phase 6 explainability complete — procedures, views,
              and evidence packs
25-Sep 18:26  Phase 6 & 7 complete: Explainability + FastAPI backend
```

Note the first one: CoCo ran a **credit audit** on the account and the finding changed the design —
warehouses were set to `AUTO_SUSPEND=60` and the dynamic table moved to `TARGET_LAG = DOWNSTREAM` to
stop it refreshing on its own schedule. That is CoCo shaping an architectural decision, not just
typing DDL.

### 3. Development and debugging

The application layer was built and debugged in CoCo, page by page. The largest session in the
project is the frontend build.

| CoCo session | ID | Work |
|---|---|---|
| *Alerts Page and Case Drawer* | `71694ce4` | Largest session — alerts queue, case drawer, mule rings, rulebook, time machine, tour, landing + login, SPCS deploy |
| *Build Fintech App Demo UI* | `98a5af70` | UI iteration |

The commit sequence shows the incremental build:

```
25-Sep 21:59  Frontend step 1: design system, tokens and /styleguide
25-Sep 23:01  Frontend step 2: typed API layer, mock backend, app shell
25-Sep 23:16  Step 3: Today page + /api/home backend
26-Sep 12:09  Step 4: Alerts page + Case file
26-Sep 12:10  Step 5: Ask Kavach
26-Sep 12:10  Step 6: Mule Rings
26-Sep 12:12  Step 7: Rulebook
26-Sep 12:12  Step 8: Time Machine
26-Sep 12:13  Product tour
```

Real bugs found and fixed in CoCo, each traceable to a commit:

| Bug | Root cause | Commit |
|---|---|---|
| Mule Rings page scrolled into blank space | CSS grid item `min-height: auto` overrode the descendant `max-h` clamp; fixed with `min-h-0` | `Fix Mule Rings page allowing scroll into blank space below content` |
| Mule ring data was not credible — every account both sent and received | Ring generator had no collector/exit roles, so no account terminated the chain | `Make mule ring data realistic and upgrade the AI models` |
| Live SPCS sign-in returned 401 while local returned 200 | A container cannot make an outbound password connection; rewrote auth to use the OAuth token at `/snowflake/session/token` | `Add landing and login pages, real per-user sessions, and a full product tour` |
| Top bar showed the service identity instead of the signed-in persona | `/api/me` reported `CURRENT_USER()`, which is shared across personas | `Add sign-out control and show the signed-in persona in the top bar` |

### 4. Testing and verification

Verification was run through CoCo rather than by hand, and the results are recorded in commit
messages so they can be checked against the code.

| CoCo session | ID | Result |
|---|---|---|
| *Backend Endpoints Smoke Test* | `c308d4af` | All backend endpoints exercised against live Snowflake |

```
25-Sep 19:25  Fix backend against real Snowflake data: 23/23 endpoints passing
```

Verifications performed in CoCo during the build:

- **Per-persona masking** — the same customer record read as all four roles, confirming the
  database (not the UI) does the redaction: `admin` sees `Umesh Nair / TGDCT5500H`, `analyst` sees a
  masked PAN, `reviewer` sees `An********* / XXXXX6428G`, and writes return `403` for read-only roles.
- **Detection evaluation** — held-out split, top-50 alert budget, arithmetic checked
  (`TP+FP = 50`, `TP+FN = 58`); see [EVALUATION.md](EVALUATION.md).
- **Ring data integrity** — after regenerating ring transactions, confirmed 0 orphaned alerts and
  that ring identities were preserved.
- **Logout round-trip** — login `200` → `/api/me` `200` → logout `200` → session invalidated and
  cookie cleared.
- **Documentation claims** — the earlier README asserted Time Travel usage; CoCo grepped all twelve
  SQL files, found no supporting statement, and the claim was removed rather than shipped.

### 5. Deployment to Snowpark Container Services

The live deployment was carried out from CoCo: service specification authored, image built for
`linux/amd64`, pushed to the Snowflake image registry, and the service upgraded **in place** with
`ALTER SERVICE … FROM SPECIFICATION` (never dropped and recreated, which would change the ingress
URL).

Constraints CoCo discovered against the real account, each of which changed the implementation:

| Discovery | Consequence |
|---|---|
| A public SPCS endpoint **always** requires Snowflake authentication, and only users in the owning account can pass it | The demo ships with four real Snowflake persona users rather than anonymous access |
| **External Access Integrations are unavailable on trial accounts** | The container cannot make an outbound password connection to Snowflake, so `connection.py` authenticates with the mounted OAuth token |
| Service secrets use `secretKeyRef`, not `secretKeyPath` | Corrected in `deploy/spec.yaml` after the first spec was rejected |
| `ALTER USER … SET PASSWORD` fails with `PRIOR_USE` / `MIN_LENGTH` on recently-changed users | Demo users are dropped and recreated with the password set at creation time |

### 6. CoCo skills

Four reusable CoCo skills were written for recurring compliance operations and are committed in
[`skills/`](../skills/):

| Skill | Purpose |
|---|---|
| `compile_circular.md` | Turn a new circular into candidate rules for approval |
| `triage_alerts.md` | Work the alert queue in priority order |
| `rule_health.md` | Review per-rule precision and retire noisy rules |
| `deadline_watch.md` | Surface reports approaching or past their deadline |

---

## Reproduce this yourself

Every claim above can be checked from a clone of this repository:

```bash
# CoCo plan-mode artifacts, with their creation timestamps
ls -la .snowflake/cortex/plans/
grep -H '^created:' .snowflake/cortex/plans/*.md

# CoCo persistent project memory
cat .snowflake/cortex/memory/projects/*/kavach-project.md

# CoCo skills
ls skills/

# Full commit history with dates (26 commits, 25-Sep → 27-Sep)
git log --format='%ad  %s' --date=format:'%d-%b %H:%M' --reverse

# Every commit carries the CoCo trailer
git log --format='%B' | grep -c 'Co-authored-by: Snowflake CoCo'

# The SQL that CoCo applied to the account, in order
ls sql/
```

CoCo session titles and IDs are visible in the local CoCo conversation store:

```bash
ls ~/.snowflake/cortex/conversations/*/
```

> Session transcripts are trimmed by CoCo once summarised, so this document cites session
> **titles, IDs and dates** — which are present — rather than message counts, which are not
> recoverable from the saved files.

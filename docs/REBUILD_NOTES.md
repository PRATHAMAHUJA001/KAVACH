# REBUILD_NOTES.md — object drift found before account migration

Generated 2026-09-25 by diffing the live account's `GET_DDL` output
(`data/exports/ddl/*.sql`) against the numbered build scripts in `sql/`.
Full drift audit was run by a sub-agent; this file records what was found and
what was done about it. No live DDL was executed to produce this file —
only `SELECT`, `SHOW`, `DESCRIBE`, `GET_DDL`, and (for the new scripts below)
read-only `describe()`/compile-only validation.

## What was missing from `sql/01`–`08` and has now been added

| New script | Fixes |
|---|---|
| `sql/09_ml_pipeline.sql` | Entire `ML` schema: `ACCOUNT_FEATURES` (dynamic table), `ACCOUNT_FEATURES_STATIC`, `EVAL_COMPARISON`, `EVAL_GROUND_TRUTH`, `EVAL_REPORT`, `EVAL_RULE_PRECISION`, `EVAL_TYPOLOGY_COVERAGE`, `MODEL_METRICS`, `RISK_SCORES`, `RISK_SCORE_EXPLANATIONS`, view `LATEST_RISK_SCORES`, procs `TRAIN_RISK_MODEL()` / `RETRAIN_AND_EVALUATE()`, task `DAILY_SCORE_TASK`. Previously **the entire ML pipeline existed live but had zero SQL in the repo.** |
| `sql/10_rule_execution.sql` | `CORE.ALERTS` table, `CORE.TXN_STREAM`, `RULES.EXECUTE_ALL_RULES()` (turns compiled rules into alerts — this was the missing link between `07_regulation_compiler.sql` and `08_explainability.sql`), `RULES.TEST_EXTRACT_ONE()` / `TEST_EXTRACT_REAL()` (debug scaffolding, kept for parity), task `RULE_EXECUTOR_TASK`. |
| `sql/11_graph_detection.sql` | `CORE.ACCOUNT_EDGES`, `CORE.RINGS`, `CORE.RING_MEMBERS`, `CORE.ROUND_TRIP_CYCLES` (mule-ring/round-trip graph detection tables — referenced by `semantic/kavach_sv.yaml` and the backend's ring repository but never created anywhere), and `CORE.ANALYST_FEEDBACK` (distinct from `RAW.ANALYST_FEEDBACK`; different columns — `VERDICT`/`SOURCE` vs `DECISION`). |
| `sql/12_ai_agent_tools.sql` | `CREATE STAGE APP.EVIDENCE_STAGE` (was used by `AI.BUILD_EVIDENCE_PACK` via `COPY INTO` but never created by any script — a fresh rebuild's first evidence pack would have failed), plus the **procedure** overload of `AI.EXPLAIN_ALERT(ALERT_ID_PARAM)` (distinct from the SQL **function** overload `EXPLAIN_ALERT(P_ALERT_ID, P_LANG)` already in `sql/08`), `AI.TIME_MACHINE`, `AI.WHY_NOT_FLAGGED`. These three procedures back 3 of the live Cortex Agent's 6 tools — without them a rebuilt agent silently loses half its tools. |

All four new scripts were extracted **verbatim** from the live account's
`GET_DDL` output (guaranteed-valid syntax, since Snowflake produced it) and
validated with a read-only `cursor.describe()` compile-check against the live
account — 39/39 statements compiled with zero failures. No DDL was executed.
Tasks are added in a suspended state (`ALTER TASK ... SUSPEND` appended) since
they were already suspended live.

## Still not scripted anywhere — needs manual recreation on the new account

These require either the Snowsight UI (agent-studio flow) or hand-written
`CREATE AGENT`/`CREATE SEMANTIC VIEW` SQL that wasn't attempted here to avoid
guessing at unverified syntax on a near-empty credit balance:

1. **Cortex Agent `AI.KAVACH_AGENT`** — full spec exported to
   `data/exports/agent/agent.json` (models, instructions, orchestration, all
   6 tool specs). Recreate via the Snowsight Agent Studio UI (or `CREATE
   AGENT ... FROM SPECIFICATION` once the exact spec syntax is confirmed on
   the new account) using this JSON as the source of truth. Do this **after**
   `sql/12_ai_agent_tools.sql` and the semantic view below, since 3 of its 6
   tools point at `AI.EXPLAIN_ALERT`/`AI.TIME_MACHINE`/`AI.WHY_NOT_FLAGGED`
   and one points at the semantic view.
2. **Semantic view `AI.KAVACH_SV`** — source YAML lives at
   `semantic/kavach_sv.yaml` (repo) / `data/exports/semantic/kavach_sv.export.yaml`
   (live re-serialization, structurally identical). No `CREATE SEMANTIC VIEW`
   statement exists anywhere — it was deployed by hand. Recreate via `snow
   object create semantic-view` / Snowsight, pointed at `semantic/kavach_sv.yaml`.
3. **Grants tied to the above two objects** — `KAVACH_ANALYST` and
   `KAVACH_REVIEWER` both have live grants (`USAGE ON CORTEX_AGENT
   KAVACH_AGENT`, `USAGE ON CORTEX_SEARCH_SERVICE KAVACH_REG_SEARCH`,
   `SELECT`/`REFERENCES ON SEMANTIC_VIEW KAVACH_SV`, and for REVIEWER also
   `USAGE` on the three AI procedures above) that aren't in `sql/02_governance.sql`.
   Re-grant these once #1/#2 are recreated:
   ```sql
   GRANT USAGE ON CORTEX AGENT KAVACH_DB.AI.KAVACH_AGENT TO ROLE KAVACH_ANALYST;
   GRANT USAGE ON CORTEX AGENT KAVACH_DB.AI.KAVACH_AGENT TO ROLE KAVACH_REVIEWER;
   GRANT SELECT, REFERENCES ON SEMANTIC VIEW KAVACH_DB.AI.KAVACH_SV TO ROLE KAVACH_ANALYST;
   GRANT SELECT ON SEMANTIC VIEW KAVACH_DB.AI.KAVACH_SV TO ROLE KAVACH_REVIEWER;
   GRANT USAGE ON PROCEDURE KAVACH_DB.AI.EXPLAIN_ALERT(VARCHAR) TO ROLE KAVACH_REVIEWER;
   GRANT USAGE ON PROCEDURE KAVACH_DB.AI.TIME_MACHINE(VARCHAR, VARIANT) TO ROLE KAVACH_REVIEWER;
   GRANT USAGE ON PROCEDURE KAVACH_DB.AI.WHY_NOT_FLAGGED(VARCHAR) TO ROLE KAVACH_REVIEWER;
   ```

4. **`AUDIT.ALERT_FEEDBACK`** and **`APP.SETTINGS`** tables — small, no
   dependencies. DDL is in `data/exports/ddl/AUDIT.sql` and
   `data/exports/ddl/APP.sql` respectively; fold into `sql/01_foundation.sql`
   or `sql/02_governance.sql` when convenient. Not blocking.

## Grants — summary (no other drift found)

`KAVACH_ADMIN`'s 1067 grant rows are just Snowflake's decomposition of the
single `GRANT ALL PRIVILEGES ... TO ROLE KAVACH_ADMIN` already in
`sql/02_governance.sql` — no drift. `KAVACH_AUDITOR` (61 rows) matches
`sql/02` exactly. `KAVACH_ANALYST_NORTH` (18 rows, region-scoped) is
structurally covered by the `GRANT ... ON ALL/FUTURE TABLES IN SCHEMA CORE`
pattern in `sql/02`, but is fragile: it only works if `sql/02` runs *after*
all `CORE` tables exist, and it depends on `CORE.REGION_ACCESS_MAP` having no
row-access policy of its own (any `KAVACH_ANALYST_NORTH` session can read the
full role→region mapping table, not just its own row — a design detail worth
flagging on the new account but not something to change here).

## Objects confirmed to match cleanly (no action needed)

`REF`, `RAW`, `AUDIT.ACTIVITY_LOG`, `APP` base, warehouse `KAVACH_WH`,
resource monitor `KAVACH_MONITOR`, all 4 masking policies + the region
row-access policy + both tags on `CORE`, Cortex Search Service
`AI.KAVACH_REG_SEARCH` (matches `sql/07` field-for-field), and
`AUDIT.EVIDENCE_REGISTRY` (matches `sql/08` exactly, including the
HTML/PDF columns added during the 2026-09-25 hardening pass).

## Added 26 Sep 2026 (Steps 4–9)

Run these after the numbered scripts on a fresh account:

- `sql/11_graph_detection.sql` → `CORE.DETECT_MULE_RINGS()`, then `CALL KAVACH_DB.CORE.DETECT_MULE_RINGS();`
  (populates `ACCOUNT_EDGES`, `RINGS`, `RING_MEMBERS`, `ROUND_TRIP_CYCLES`).
- `sql/07_regulation_compiler.sql`: `EXTRACT_RULES_FROM_CHUNKS(CIRCULAR_FILTER STRING DEFAULT NULL)`
  replaces the zero-argument version (drop it first), `COMPILE_RULES` and `APPLY_AMENDMENTS`
  are idempotent, the chunker strips the circular footer, and `APP.UPLOAD_JOBS` is created.
  Do **not** change `COMPILE_RULES` to select `COMPILED` candidates to rebuild the library:
  that duplicates every rule on each later run.
- `sql/08_explainability.sql`: `RESET_TOUR_DATA()` needs `TOUR_ALERT_ID`, `TOUR_RING_ID`,
  `TOUR_RULE_ID`, `TOUR_CIRCULAR_NO` rows in `APP.SETTINGS`; `GENERATE_ALERT_STORIES()` writes
  stories with the `XCUSTX` token (the backend fills in the name).

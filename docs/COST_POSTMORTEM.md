# Cost Postmortem — where the credits went (last 30 days)

Source: `SNOWFLAKE.ACCOUNT_USAGE.METERING_DAILY_HISTORY` / `WAREHOUSE_METERING_HISTORY`,
queried read-only on 2026-09-25. Raw data in `data/cost/`.

## Credit usage by service_type (30 days)

| Service | Credits |
|---|---|
| SNOWFLAKE_COCO_DESKTOP | 172.76 |
| WAREHOUSE_METERING | 8.19 |
| CORTEX_AGENTS | 3.66 |
| AI_SERVICES | 0.54 |
| SNOWFLAKE_COCO_SNOWSIGHT | 0.26 |
| AI_FUNCTIONS | 0.21 |
| TELEMETRY_DATA_INGEST | 0.01 |
| COPY_FILES | 0.0002 |
| CORTEX_SEARCH | 0.00001 |

**Total: ~185.4 credits.**

## 5-line explanation

1. **The KAVACH pipeline itself is cheap.** `KAVACH_WH` (the project's XSMALL warehouse) only burned **8.19 credits** over 30 days — SQL, dynamic tables, and rule execution are not the problem, and `KAVACH_MONITOR`'s own tracker confirms just **4.60** warehouse credits used against its 300-credit quota.
2. **The account's credits are gone because of `SNOWFLAKE_COCO_DESKTOP` (this IDE/agent), not KAVACH.** It accounts for **172.76 credits — ~93% of all usage** — from running Cortex Code Desktop sessions (agentic tool calls, LLM orchestration) against this account over the build.
3. **Cortex Agents (`CORTEX_AGENTS`, 3.66 credits) and AI Services/Functions (~0.75 credits combined)** are the actual KAVACH-attributable AI spend (agent runs, `AI_COMPLETE`/`AI_CLASSIFY`, evidence-story generation) — small relative to CoCo Desktop.
4. **Cortex Search indexing/serving is negligible** (0.00001 credits) — the search service is tiny (49 chunks) and mostly idle.
5. **Takeaway for the next account:** budget for agentic-IDE usage (CoCo Desktop) as the dominant cost driver, not warehouse compute or AI functions — set a resource monitor / budget on Cortex Code Desktop usage specifically, or cap session length, rather than tightening `KAVACH_WH`'s sizing further (it's already XSMALL and mostly idle).

## Compute actively suspended during this export

| Object | State found | Action |
|---|---|---|
| `KAVACH_WH` | SUSPENDED | none needed |
| Task `ML.DAILY_SCORE_TASK` | suspended | none needed |
| Task `RULES.RULE_EXECUTOR_TASK` | suspended | none needed |
| Dynamic table `ML.ACCOUNT_FEATURES` | **ACTIVE** (auto-refreshing every `DOWNSTREAM` trigger via `FULL` refresh, warehouse `KAVACH_WH`) | **suspended** — `ALTER DYNAMIC TABLE KAVACH_DB.ML.ACCOUNT_FEATURES SUSPEND` |
| Compute pools | `SYSTEM_COMPUTE_POOL_CPU` (Snowflake-managed, 0 active/idle nodes, not KAVACH's) | none needed — no KAVACH-owned compute pool exists |
| SPCS services | none found (`SHOW SERVICES IN DATABASE KAVACH_DB` → 0 rows) | none needed |
| Registered ML models | none found (`SHOW MODELS IN SCHEMA KAVACH_DB.ML` → 0 rows) | none needed |

Only the `ACCOUNT_FEATURES` dynamic table was found actively scheduled; it has been suspended (see below).

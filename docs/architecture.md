# KAVACH — Backend Identity & Authentication Architecture

## 1. Principle

The backend must never run, or call Snowflake, as `ACCOUNTADMIN`. Every code path —
Snowpark session, Cortex Analyst REST calls, and Cortex Agent REST calls — runs under
a role scoped to exactly what KAVACH needs, and masking policies are relied upon to
protect PII rather than the backend attempting its own redaction.

## 2. Two connection paths, two credential types

KAVACH's backend talks to Snowflake over two distinct channels, because they use two
different Snowflake APIs:

| Channel | Used for | Auth mechanism |
|---|---|---|
| Snowpark `Session` (`connection.py`) | All `/api/*` REST endpoints backed by direct SQL (alerts, rings, rules, evidence, why-not, time-machine explorer UI, etc.) | Username + password (local dev), role = `KAVACH_ADMIN` |
| Cortex Agents Run API (`ask.py`) / Cortex Analyst legacy API | `/api/ask` — calls the `KAVACH_AGENT` Cortex Agent directly | Bearer **Programmatic Access Token (PAT)**, role-restricted to `KAVACH_ADMIN` |

The Agents Run API and the legacy Cortex Analyst REST endpoint are **not** part of the
Snowpark session — they are plain HTTPS calls made with `httpx`, so they need their own
bearer credential. A Snowpark session token was tested against the legacy Cortex
Analyst endpoint in this account and rejected with 401; a PAT works for both the
Analyst and the Agents Run API.

## 3. Local development identity

- `backend/.env`:
  - `SNOWFLAKE_ROLE=KAVACH_ADMIN` — the Snowpark session role. `KAVACH_ADMIN` has
    DDL/DML on `KAVACH_DB` and owns the pipelines, but is **not** exempt from every
    masking policy the way `ACCOUNTADMIN` is treated in some demos — it is exempt from
    `MASK_PAN` and `MASK_CUSTOMER_NAME` by explicit policy design (it's the
    operational owner role), not because it bypasses Snowflake's authorization model.
  - `SNOWFLAKE_TOKEN` — a PAT created with
    `ALTER USER ... ADD PROGRAMMATIC ACCESS TOKEN ... ROLE_RESTRICTION = 'KAVACH_ADMIN'`.
    The `ROLE_RESTRICTION` clause is what prevents this token from being replayed under
    a different (more privileged) role even if it leaks — Snowflake enforces the
    restriction at the token level, independent of application code.
  - PATs are minted with `DAYS_TO_EXPIRY = 30` and rotated manually today; the old
    `ACCOUNTADMIN`-restricted PAT (`KAVACH_BACKEND_PAT`) was removed when this model was
    introduced and replaced with `KAVACH_BACKEND_ADMIN_PAT`.
- Grants required for `KAVACH_ADMIN` to use the agent:
  ```sql
  GRANT USAGE ON AGENT KAVACH_DB.AI.KAVACH_AGENT TO ROLE KAVACH_ADMIN;
  GRANT SELECT ON SEMANTIC VIEW KAVACH_DB.AI.KAVACH_SV TO ROLE KAVACH_ADMIN;
  GRANT USAGE ON PROCEDURE KAVACH_DB.AI.EXPLAIN_ALERT(VARCHAR) TO ROLE KAVACH_ADMIN;
  GRANT USAGE ON PROCEDURE KAVACH_DB.AI.WHY_NOT_FLAGGED(VARCHAR) TO ROLE KAVACH_ADMIN;
  GRANT USAGE ON PROCEDURE KAVACH_DB.AI.BUILD_EVIDENCE_PACK(VARCHAR) TO ROLE KAVACH_ADMIN;
  GRANT USAGE ON PROCEDURE KAVACH_DB.AI.TIME_MACHINE(VARCHAR, VARIANT) TO ROLE KAVACH_ADMIN;
  ```

## 4. Why masking still works even though the agent uses one fixed role

The four generic tools the agent calls (`EXPLAIN_ALERT`, `WHY_NOT_FLAGGED`,
`BUILD_EVIDENCE_PACK`, `TIME_MACHINE`) are all declared `EXECUTE AS CALLER` (confirmed
via `GET_DDL`), **not** `EXECUTE AS OWNER`. This is the load-bearing property: it means
the procedure body runs with the privileges — and the masking-policy exemptions — of
whichever role actually invoked the agent, not the role that owns the procedure. So the
"identity that matters" for masking is the role behind the bearer token used to call
`agent:run`, not any role baked into the agent or its tool definitions.

This was proven empirically: calling `/api/ask` with `SNOWFLAKE_TOKEN`/`SNOWFLAKE_ROLE`
swapped to a PAT restricted to `KAVACH_REVIEWER` (which is *not* exempt from
`MASK_CUSTOMER_NAME`) and asking the agent to explain an alert returns
`Customer: La************` from the `EXPLAIN_ALERT` tool's raw output, versus
`Customer: Lakshmi Pillai` when the same question is asked as `KAVACH_ADMIN`. See
`docs/PROGRESS.md` "CHECKPOINT 4" for the full transcript.

## 5. Production (SPCS) identity — what will change

**A PAT must never be baked into the container image.** In Snowpark Container
Services, the running service authenticates using the ambient OAuth token Snowflake
injects into the container (`SNOWFLAKE_HOST` + the token at
`/snowflake/session/token`, refreshed automatically by the platform), not a
long-lived secret checked into an image layer or environment variable.

Concretely, moving to SPCS means:

- The Snowpark `Session` is built from `oauth` inside the container rather than
  username/password — `Session.builder.configs({"host": ..., "token": open(token_path).read(), "authenticator": "oauth"})`.
- For the Agents Run / Cortex Analyst REST calls, the same OAuth token (not a PAT) is
  sent as the bearer credential, with the caller's role passed through however the
  surrounding application authenticates end users (e.g. Snowflake's native app / SPCS
  ingress identity propagation, or an explicit `role` claim if the service impersonates
  the calling user).
- The role the container runs as should still be the least-privilege operational role
  (`KAVACH_ADMIN`-equivalent for backend-owned writes), and any user-facing masking
  guarantees continue to rely on `EXECUTE AS CALLER` + Snowflake's tag-based masking
  policies — the same mechanism verified in local testing — rather than on the
  container's own logic.
- No PAT should exist for the production service at all once this migration lands;
  PATs are appropriate for local development and CI, not for a long-running service
  identity.

This document exists so that this local-dev-only PAT usage is never mistaken for the
production design.

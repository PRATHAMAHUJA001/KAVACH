# API extensions the frontend needs

The FastAPI backend (`docs/openapi.json`, 23 endpoints) covers the core data, but
several screens in `docs/DESIGN_SPEC.md` need facts it doesn't return yet. The
frontend is built against **additive** extensions of that contract:

- Every item below is either a **new optional field** on an existing response or a
  **new endpoint**. Nothing existing changes shape.
- The MSW mocks (`frontend/src/mocks/`) serve all of them today, so the UI can be
  built and demoed while Snowflake is offline.
- Wire types live in `frontend/src/services/api/dto.ts` (fields marked `EXT`). The
  adapters in `services/api/adapters.ts` turn them into screen-ready view models.
- **Against today's backend the UI degrades gracefully.** A section whose data is
  missing is hidden. It is never filled with invented numbers. Each item says what
  the real backend currently shows.

Status legend:
- ⬜ not built in the backend yet
- 🟡 built in the backend and tested with fake repositories plus a frontend contract check (`npm run contract`), but not yet run against live Snowflake
- ✅ verified live

---

## 1. Identity & clock

| | |
|---|---|
| **`GET /api/me`** + `as_of: string` (ISO) ✅ | The dataset's "today" (`SETTINGS.AS_OF_DATE`). Deadlines are measured against it. |

**Why:** the synthetic data is frozen at 24 Sep 2026. Measured against the wall
clock, every report looks overdue within a week.
**Without it:** the UI uses the wall clock.

**Also 🟡:** `/api/me` now returns the session's `CURRENT_ROLE()` (it used to be a
hard-coded analyst). The read-only banner for `KAVACH_REVIEWER` depends on it.
`as_of` is the later of `APP.SETTINGS.AS_OF_DATE` (18:00) and the newest alert's
`CREATED_AT`. In the live database the alerts carry the time the rule executor
ran, not a synthetic date.

## 2. Today — `GET /api/home`

All of these are new optional fields ✅ (run live, 26 Sep 2026). They're built as
`HomeService` → `DashboardRepository` → `SnowflakeDashboardRepository`, and the SQL
moved out of the router. Report deadlines are 7 working days from identification
(domain policy).

| Field | Shape | Used for |
|---|---|---|
| `kpis` | `{ new_alerts, new_alerts_prev, serious_new_alerts, money_at_risk_inr, money_at_risk_prev_inr, reports_due_48h, reports_overdue, active_rings, active_rings_prev, ring_volume_30d_inr }` | The 4 KPI tiles and their trend chips |
| `attention[]` | `{ id, kind: report_overdue\|report_due\|rule_pending\|ring_new\|conflict_open, status: overdue\|act\|attention, entity_id, params: { name, name_hi, amount_inr, due_at, count, typology } }` | "Needs your attention" cards. The UI writes the sentence in EN or HI from these params. |
| `trend[].confirmed_fraud` | `int` | The rose "Confirmed fraud" line in the 30-day chart |
| `readiness_score.reason_hi` | `string` | Hindi reason under the gauge |
| `readiness_score.factors[]` | `{ key: overdue\|due_soon\|rules_pending\|conflicts, count, points }` | "What's pulling it down" under the gauge |
| `weekly_brief` | `{ text, text_hi, generated_at }` | "This week in one paragraph" card (AI-generated badge) |
| `as_of` | ISO string | As in §1 |

**Without them:** the gauge, the top alerts and the alert-count line still render.
The KPI tiles, attention cards and weekly brief are hidden.

## 3. Alerts

Built as `AlertService` → `AlertRepository` → `SnowflakeAlertRepository` (bound
parameters only; the old f-string SQL is gone). List + detail + evidence were run
against live Snowflake on 26 Sep 2026; feedback verdicts and the STR draft are tested
with fake repositories only (they write data / call an LLM).

**`GET /api/alerts`** ✅
- New item fields: `amount_inr`, `txn_count`, `window_start`, `window_end` (the
  account's last 30 days, anchored on the newest transaction), `due_at` (7 working
  days), `str_filed` (closed as `TRUE_POSITIVE` and the check asks for an STR/CTR),
  `risk_level` (1–5), `ring_id`, `branch`, `city`, `action_required`.
- Not sent: `city_hi`, `customer_name_hi` (no Hindi source in `CORE`; the UI falls
  back to English).
- New query parameters: `typology`, `due=overdue|48h|open`, `q` (alert id, account,
  customer name or city), `sort=priority|amount|newest`. Deadline filters and the
  priority order run in SQL, using the same as-of date as Today.
- Customer names: live alerts leave `CUSTOMER_ID` empty, so the customer comes from
  `CORE.ACCOUNTS`; KYC checks put the customer id in `ACCOUNT_ID`, which is handled too.

**`GET /api/alerts/{id}`** ✅ adds:
- `reasons[] {text, text_hi, weight}` — up to 3, only from recorded facts: the
  matched pattern, the triggering amount/channel or customer risk category parsed
  from `CORE.ALERTS.REASONS.details`, and the 30-day volume. Weights are a fixed
  ordering (0.6 / 0.45 / 0.35 / 0.3), not model output.
- `timeline[]` — the 15 most recent transactions, payees added in the window, and
  the alert itself. The alert's own `TXN_ID` is the one marked `suspicious`.
- `transactions[]` — up to 50 `CORE.TRANSACTIONS` rows, always including the alert's.
- `connections {nodes, edges}` — ring members and shared device/IP/phone edges;
  `null` when the account isn't in a ring (true for every live alert today).
- `citation_ref {circular_no, para_no, highlight}` — `highlight` is an approximation:
  the first sentence of the paragraph that carries a number (or the words around it).

**`POST /api/alerts/{id}/evidence`** + `generation_ms` ✅ (measured around the
build, e.g. 4430 ms live).

**`POST /api/alerts/{id}/feedback`** accepts `verdict: FRAUD|NOT_FRAUD` ✅ — closes
the alert as `TRUE_POSITIVE` / `FALSE_POSITIVE` and returns `status`, `resolution`.

**`GET /api/why-not/{txn_id}`** ✅: `rules_checked[] {rule_id, rule_name, typology,
result: passed|not_applicable|near_miss, reason}`, computed by comparing each active
rule's own limits (read from its SQL) with the transaction. The LLM call is gone, so the
explanation can't invent reasons. A flagged transaction returns `open_alert:<id>`.

## 4. Circular paragraphs (new) ✅

`GET /api/circulars/paragraph?circular_no=KAVACH/2024/01&para_no=2` →
`{ circular_no, para_no, text, issue_date, is_amendment, amends_circular, before, after }`
from `AI.REG_CHUNKS`. The bundled `static/reg_chunks.json` stays as the offline fallback.

## 5. Global search (new) ✅

`GET /api/search?q=` → alerts (id, account, customer name), transactions (`TXN…`
prefix), rings and rules; at most 15 results.

## 6. Mule rings ✅

Rings come from the new `CORE.DETECT_MULE_RINGS()` (`sql/11_graph_detection.sql`),
which did not exist before (the tables had only a smoke-test row). Device and IP sharing
alone is noise in this data (every device is used by 25–58 random accounts), so rings are
the connected components of account-to-account transfers, and shared devices/IPs are
recorded only between members. Live result: 9 rings; the 3 HIGH ones are exactly the 29
planted mule accounts; the 6 LOW ones are the planted round-tripping loops.

- **`GET /api/rings`** items add `confidence`, `speed_hours` (median hours from money in
  to money out, transfers between members only), `detected_at`, `alerted_members`,
  `shared_devices`, `city`, `ring_name_hi`. "Money moved" counts only transfers between
  members.
- **`GET /api/rings/{id}`**: typed `members[]` with `role` (collector = takes in the most,
  exit = sends out the most, others mules; a reading of the flows, not a stored label)
  and `money_in_inr`/`money_out_inr`; `edges[]` from `CORE.ACCOUNT_EDGES`.

## 7. Rulebook ✅

- **`GET /api/rules`** items add `plain_english`/`plain_hindi` (what the rule's **SQL**
  checks, parsed from it, so a reviewer can see when check and paragraph disagree),
  `circular_no`, `para_no`, `source_quote` (the paragraph), `highlight`, `severity`,
  `entity`, `params[]` (numeric limits with slider ranges), `approved_by`, `rejection_reason`.
- `GET /api/rules/{id}/versions`: the rule's amendment line (same typology, citing the
  circular or an amendment of it).
- `GET /api/rules/conflicts`: typed; `kind` is `contradiction` when both rules test
  different amount limits, else `overlap`. Each side carries the clause text.
- `GET /api/rules/health` + `rules[]`: alerts and confirmed fraud per rule over the last
  30 days, precision, and a verdict (quiet = never fired; noisy = 200+ alerts, or mostly
  wrong once 5+ were judged).
- `GET /api/rules/eval`: `ML.EVAL_*` when the ML pipeline has written it, otherwise
  measured against `RAW.GROUND_TRUTH`. Live today: 16 of 161 planted fraud accounts
  alerted (recall 9.9%, precision 1.1%).
- **Uploads are real now** (they used to return a made-up job): `POST /api/rules/upload`
  stores the PDF on `@RAW.REG_STAGE/uploads/`, then in the background parses it, re-chunks,
  extracts obligations **for that circular only**, compiles checks, applies amendments and
  re-detects conflicts. Progress is in `APP.UPLOAD_JOBS`; `GET /api/rules/jobs/{id}` returns
  `step` (0–4), `circular_no`, `rule_ids`. About 80 s for a 2-paragraph circular.

## 8. Time Machine ✅

- `GET /api/time-machine/rules`: active rules with one limit the slider can move (a
  BETWEEN band's lower bound, an `AMOUNT_INR >=` limit, or a `HAVING COUNT(*) >=` count).
- `POST /api/time-machine/replay` `{ rule_id, value, days }`: runs the rule's **own SQL**
  over the last `days` at today's limit and at `value`, counts results and how many are
  planted fraud accounts, and prices review at 45 minutes per alert. About 1.5 s live.
- `GET /api/time-machine` now binds its parameters and is anchored on the newest alert.

## 9. Ask Kavach — `POST /api/ask?stream=true` ✅

`result_set: { columns, rows }` is forwarded on `tool_result` and `done` (and the
non-streaming response) from the `system_execute_sql` result, numbers typed, at most 200
rows. The citation lookup no longer formats search text into SQL.

## 10. Product tour ✅

`POST /api/tour/reset` → `{ ok, alert_id, ring_id, rule_id, circular_no }`.
`AI.RESET_TOUR_DATA()` now resets exactly the records pinned in `APP.SETTINGS`
(`TOUR_ALERT_ID`, `TOUR_RING_ID`, `TOUR_RULE_ID`, `TOUR_CIRCULAR_NO`): the rule back to
waiting for review, the alert reopened with its evidence and feedback removed. The old
version flipped whichever rule was approved last.

---

## Data-quality issues found while building the fixtures

Status on the live account, 26 Sep 2026:

1. **Alert stories** ✅ regenerated (`AI.GENERATE_ALERT_STORIES`, llama3.1-70b; the 8B model
   added claims that weren't in the facts). 200 stories for the alerts an analyst meets
   first: no preamble, no refusals, no scores, rule codes or account numbers. The customer
   is stored as the token `XCUSTX` and filled in with `CUSTOMER_NAME` when read, so the
   masking policy still applies to names inside stories.
2. **Rule review history** ✅ smoke-test approvals/rejections and feedback removed; all 19
   rules are waiting for review. `scripts/smoke_test.py` now restores what it changes.
3. **Rule SQL vs. source paragraph** 🟡 the compiler now puts the extracted thresholds and
   time window into the SQL (e.g. a ₹5 L / 24 h paragraph compiles to `>= 500000`, 1 day).
   The 19 existing rules were compiled before this and still use template limits; they
   are all pending review, and the review screen shows the mismatch. Recompiling them is a
   decision for the rule owners. The LLM's typology choice also limits accuracy (a UPI
   paragraph was classed as cash reporting).
4. **Circular issue dates** ✅ now 2024–2025 on the live account; the "SYNTHETIC
   circular…" footer is stripped from paragraph text by the chunker.
5. **Evaluation numbers** ✅ `ML.EVAL_*` is empty on the live account; `/api/rules/eval`
   measures against `RAW.GROUND_TRUTH` instead (see §7). The README's F1 0.85 / precision
   0.92 / recall 0.79 are not supported by the data and should be removed.
6. **New: dates** ⬜ transactions are dated Apr–Sep 2024 while alerts carry the time the
   rule executor ran (25 Sep 2026), and `APP.SETTINGS.AS_OF_DATE` is missing on the live
   account. Deadlines follow the alerts (consistent), but timelines span two years.
7. **Fixed while testing uploads**: the deployed `RULES.COMPILE_RULES` selected `COMPILED`
   candidates (changed during the migration), so every run duplicated the whole library;
   and `RULES.APPLY_AMENDMENTS` retired its own v2 rule. Both are idempotent now; the 19
   duplicates one test run created were removed.

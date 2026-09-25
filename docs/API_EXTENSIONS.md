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
| **`GET /api/me`** + `as_of: string` (ISO) 🟡 | The dataset's "today" (`SETTINGS.AS_OF_DATE`). Deadlines are measured against it. |

**Why:** the synthetic data is frozen at 24 Sep 2026. Measured against the wall
clock, every report looks overdue within a week.
**Without it:** the UI uses the wall clock.

**Also 🟡:** `/api/me` now returns the session's `CURRENT_ROLE()` (it used to be a
hard-coded analyst). The read-only banner for `KAVACH_REVIEWER` depends on it.
`as_of` is the later of `APP.SETTINGS.AS_OF_DATE` (18:00) and the newest alert's
`CREATED_AT`. In the live database the alerts carry the time the rule executor
ran, not a synthetic date.

## 2. Today — `GET /api/home`

All of these are new optional fields 🟡. They're built as
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

**`GET /api/alerts`**
- New item fields ⬜: `amount_inr`, `txn_count`, `due_at` (report deadline: 7
  working days), `str_filed`, `risk_level` (1–5), `ring_id`, `window_start`,
  `window_end`, `branch`, `city`, `city_hi`, `customer_name_hi`, `action_required`.
- New query parameters ⬜: `typology`, `due=overdue|48h|open`, `q` (text search),
  `sort=priority|amount|newest`.
- **Without them:** the list shows name, pattern and risk (from `severity`).
  Amounts and deadline pills are hidden.

**`GET /api/alerts/{id}`** adds ⬜:
- `reasons[] {text, text_hi, weight}` — from `CORE.ALERTS.REASONS`, which the API
  doesn't expose yet.
- `timeline[] {id, at, type, title, title_hi, detail, amount_inr, suspicious}`.
- `transactions[]` — `CORE.TRANSACTIONS` rows.
- `connections {nodes, edges}` — the mini network graph.
- `citation_ref {circular_no, para_no, highlight}` — `highlight` is the exact
  substring of the paragraph to mark.

**`POST /api/alerts/{id}/evidence`** + `generation_ms` ⬜: the measured build time
for the "Generated in 3.2 s" badge. Until it exists, the UI shows its own measured
round-trip time. It never shows an invented number.

**`POST /api/alerts/{id}/feedback`** accepts `verdict: FRAUD|NOT_FRAUD` ⬜ alongside
`rating`, for the "Mark as fraud" / "Not fraud" buttons.

**`GET /api/why-not/{txn_id}`**: `rules_checked[]` should be
`{rule_id, rule_name, typology, result: passed|not_applicable|near_miss, reason}`.
Today it is untyped. The adapter also accepts a boolean `matched`.

## 4. Circular paragraphs (new) ⬜

`GET /api/circulars/paragraph?circular_no=KAVACH/2024/01&para_no=2` →
`{ circular_no, para_no, text, issue_date, is_amendment, amends_circular, before, after }`

Used by every citation chip's drawer.

**Without it:** the frontend falls back to a bundled copy of `AI.REG_CHUNKS`
(`services/api/static/reg_chunks.json`, 49 synthetic paragraphs), so citations work
against today's backend too.

## 5. Global search (new) ⬜

`GET /api/search?q=` → `{ results: [{ kind: alert|account|txn|ring|rule, id, title, title_hi, subtitle, alert_id }] }`

**Without it:** the search box still jumps between screens; record search shows
"Nothing matches".

## 6. Mule rings

**`GET /api/rings`** item fields ⬜: `confidence` (`CORE.RINGS.CONFIDENCE_LABEL`),
`speed_hours` (median hours money stays in a member account), `detected_at`,
`alerted_members`, `shared_devices`, `city`, `city_hi`, `ring_name_hi`.

**`GET /api/rings/{id}`**:
- `members[]` should be typed as
  `{id, label, label_hi, risk_level, kind, role: collector|mule|exit, city, alert_id, money_in_inr, money_out_inr}`.
- New `edges[] {source, target, kind: shared_phone|shared_ip|shared_device|sent_money, amount_inr, count}`
  ⬜, built from `CORE.ACCOUNT_EDGES` plus the transfers between members.
- **Without `edges`:** the adapter derives "sent ₹" links from transactions whose
  counterparty is another member. Shared-device links are missing until the
  backend sends them.

## 7. Rulebook

**`GET /api/rules`** item fields ⬜: `plain_english`, `plain_hindi`, `circular_no`,
`para_no`, `source_quote`, `highlight`, `severity`, `entity`,
`params[] {key, label, label_hi, unit, value, min, max, step}`, `approved_by`,
`rejection_reason`.

New endpoints and typed shapes:

| Endpoint | Shape |
|---|---|
| `GET /api/rules/{id}/versions` ⬜ | `{ versions: [{ version, status, created_at, approved_by, change_summary, change_summary_hi, source_citation }] }` |
| `GET /api/rules/conflicts` (type the items) | `{ conflict_id, typology, entity, description, status, detected_at, kind: overlap\|contradiction, rule_a, rule_b }`. Each side is `{ rule_id, rule_name, citation, circular_no, para_no, clause_text, plain_english }`. |
| `GET /api/rules/health` + `rules[]` ⬜ | `{ rule_id, rule_name, typology, alerts_30d, confirmed_30d, precision, verdict: healthy\|noisy\|quiet, proposed_fix, proposed_fix_hi }` |
| `GET /api/rules/jobs/{id}` + `step` (0–4), `circular_no`, `rule_ids[]` ⬜ | Drives the 4-step upload stepper and the review screen that follows it |
| `GET /api/rules/eval` ⬜ | `ML.EVAL_TYPOLOGY_COVERAGE` + `EVAL_REPORT` for the rule-health tab |

## 8. Time Machine (new) ⬜

`GET /api/time-machine` exists but returns daily history only. The what-if replay
needs:

- `GET /api/time-machine/rules` →
  `{ rules: [{ rule_id, rule_name, typology, param: {key, label, label_hi, unit, value, min, max, step} }] }`
- `POST /api/time-machine/replay` with body `{ rule_id, value, days }` →
  `{ rule_id, days, current: {value, alerts, fraud_caught, analyst_hours}, proposed: {…}, fraud_total }`

PROGRESS.md (checkpoint 4) notes that the agent's `time_machine` tool fails: its
`new_params` argument is an `object`, which warehouse-executed generic tools reject.
A plain REST endpoint that calls `AI.TIME_MACHINE` with scalar arguments avoids that
problem.

## 9. Ask Kavach — `POST /api/ask?stream=true`

The normalized SSE stream from `ask.py` is used as-is (`status`, `text_delta`,
`tool_call`, `tool_result`, `done`, `error`). One addition ⬜:

- `result_set: { columns: string[], rows: any[][] }` on `tool_result` and `done`,
  taken from the `system_execute_sql` tool result's `result_set`. Today it's
  dropped, so "Show the data" (table + auto chart) is hidden against the real
  backend.

## 10. Product tour (new) ⬜

`POST /api/tour/reset` → `{ ok, alert_id, ring_id, rule_id, circular_no }`. Calls
`AI.RESET_TOUR_DATA()` so the tour always starts from the same seeded state.

---

## Data-quality issues found while building the fixtures

These show up on screen with the real backend and should be fixed before the demo.

1. **Alert stories** (`AI.ALERT_STORIES`, 200 rows):
   - 193 stories start with "Here is a 3-5 sentence story in simple English:"; the
     Hindi versions carry a Hindi version of the same preamble.
   - 7 are model refusals ("I can't fulfill that request").
   - All of them say "risk score is 1", refer to people by raw IDs
     (`ACC0024016`, `CUST007049`) and name rule codes (`PASSTHROUGH_RULE`).
   - One story gives "₹6.29 lakh (6,290,000 rupees)", which is wrong: 6.29 lakh is
     6,29,000.
   - The adapter strips the preamble and hides refusals; the rest needs regenerating.
2. **Rule review history** (`RULES.RULE_LIBRARY`): approvals and rejections were
   left by the smoke test (`APPROVED_BY = smoke_test`, reason "Smoke test
   rejection"). Reset them before the demo.
3. **Rule SQL vs. source paragraph:** several rules share copy-pasted SQL that
   doesn't match their quoted paragraph. For example:
   - `CASH_REPORTING_KAVACH_2024_01_3` quotes the ₹50,000 PAN rule but checks cash
     of ₹10 L or more.
   - `STRUCTURING_KAVACH_2024_04_5` quotes the device-registry paragraph.
4. **Circular issue dates:**
   - `KAVACH/2024/07` is dated 29 Oct 2026 and `KAVACH/2025/01` is dated
     12 Jan 2027, both after the data's as-of date. The UI hides future dates.
   - The last paragraph of each circular has a "SYNTHETIC circular…" footer appended
     to its text.
5. **Evaluation numbers:** `ML.EVAL_REPORT` has identical rows for BLENDED,
   ML_ONLY and RULES_ONLY (precision 0.80, recall 0.58, F1 0.67). That conflicts
   with the README's F1 0.85 / precision 0.92 / recall 0.79. The UI doesn't compare
   methods until this is resolved.

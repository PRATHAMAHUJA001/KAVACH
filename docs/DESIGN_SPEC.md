# KAVACH — Frontend Design Spec (save in repo as `docs/DESIGN_SPEC.md`)

Goal: someone who has never seen the app understands each screen in **5 seconds**, and the demo looks like a funded fintech product, not a hackathon dashboard.
Principle: **one idea per screen, one primary action per card, and every number explained in words.**

---

## 1. Design tokens (Tailwind theme + CSS variables; never hard-code colours)

### Colour, light mode
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#F6F7FB` | App background |
| `--surface` | `#FFFFFF` | Cards, panels |
| `--surface-2` | `#F1F3F9` | Table headers, input fills |
| `--border` | `#E4E7EF` | 1px borders |
| `--text` | `#0E1325` | Primary text |
| `--text-muted` | `#5B6478` | Secondary text |
| `--brand` | `#4338CA` | Primary buttons, active nav, links |
| `--brand-soft` | `#EEF0FF` | Active nav background, selected rows |
| `--ok` / `--ok-soft` | `#15803D` / `#E8F6EE` | Safe / on track |
| `--warn` / `--warn-soft` | `#B45309` / `#FEF4E6` | Needs attention |
| `--danger` / `--danger-soft` | `#B91C1C` / `#FDECEC` | Act now / overdue |
| `--info` / `--info-soft` | `#1D4ED8` / `#EAF1FF` | Neutral info, citations |

### Colour, dark mode
`--bg #0A0F1E`, `--surface #111830`, `--surface-2 #172042`, `--border #243056`, `--text #E8EBF5`, `--text-muted #9AA3BD`, `--brand #818CF8`, `--brand-soft #1E2350`. Status colours use the -400 shades with 15%-opacity soft backgrounds.

### Charts (the same everywhere)
Series order: `#4338CA` (indigo), `#0EA5A4` (teal), `#F59E0B` (amber), `#E11D48` (rose), `#64748B` (slate). "Confirmed fraud" is always rose, "Alerts" always indigo. No pies, no 3D, no gradients inside bars. 2px lines, rounded bar corners (4px), hidden gridlines except a faint horizontal one, and a tooltip with ₹ formatting.

### Typography
- UI: **Inter** (Google Fonts). Headings: **Plus Jakarta Sans** 600/700. Hindi: **Noto Sans Devanagari**. Use `font-feature-settings: "tnum"` on every number.
- Scale: Display 36/44 (KPI numbers), H1 24/32, H2 18/26, Body 14/22, Small 12/18. Never below 12px.
- Sentence case everywhere. No ALL CAPS except tiny labels (11px, +0.06em tracking).

### Shape, space, depth
- Radius: cards 16px, buttons/inputs 10px, pills 999px.
- Spacing: 4px grid; card padding 20–24px; 24px gap between cards.
- Shadow: `0 1px 2px rgba(16,24,40,.04), 0 4px 16px rgba(16,24,40,.06)`. On hover, lift 1px and slightly increase the shadow.
- Layout: sidebar 248px (collapses to 72px icon rail), content max-width 1400px, 12-column grid.

### Motion (framer-motion)
- 180–240ms, ease-out. Page change: 8px fade-up. Drawers slide in from the right (280ms).
- KPI numbers **count up** on first load (600ms). The readiness gauge animates from 0 to its value.
- The streaming chat shows a typing shimmer, never a blank wait.
- Respect `prefers-reduced-motion` (turn all animation off).

### Icons & imagery
lucide-react only, 1.75px stroke, 18–20px. Empty states use a large soft-tinted icon in a circle, one sentence, and one button. No stock illustrations or emoji in the UI.

---

## 2. Core components (build these first in `shared/ui`, use them everywhere)
| Component | Spec |
|---|---|
| **KpiTile** | Label (small, muted) → big count-up number → one plain sentence ("3 reports are due within 48 hours") → optional trend chip (▲12% vs last week, coloured by meaning, not by direction). Whole tile clickable. |
| **StatusPill** | Icon + word + soft background: ✓ On track / ⚠ Needs attention / ⛔ Act now / ⏱ Overdue. Never colour alone. |
| **ReadinessGauge** | 240° radial arc, value 0–100 in the centre, band colour by value (<60 danger, 60–80 warn, >80 ok), with the reason string under it. |
| **RiskMeter** | Horizontal 5-segment bar + label (Low … Critical). Used for alerts/accounts instead of raw scores. |
| **CitationChip** | 📜 icon + "Circular 07 · ¶4.2". Info-soft background. Click → right drawer with the paragraph, the exact matching sentence highlighted, and a "Synthetic circular" label. |
| **ReasonBars** | The top 3 reasons as plain-language sentences, each with a bar showing its weight ("Cash deposits just under ₹10 L — 4 times in 2 days"). |
| **Timeline** | Vertical line, dated nodes, icons per event type (login, transfer, new beneficiary, alert). The suspicious event is highlighted. |
| **CaseDrawer** | Right panel, 640px, sticky header (alert title, RiskMeter, deadline countdown, primary action). |
| **Stepper** | For circular upload: Reading → Finding obligations → Writing checks → Ready for review, with a live tick per step. |
| **Badge** | `VERIFIED ✓` (ok-soft) / `AI-GENERATED` (info-soft) with an ⓘ tooltip explaining what each means. |
| **ExplainPopover** | ⓘ icon next to any technical term → a 1–2 sentence plain explanation. |
| **Money** | Formats ₹ in lakh/crore (`₹12.4 L`, `₹3.1 Cr`); hover shows the exact amount. |

Skeleton loaders match each component's shape. Every error says what happened and what to do next, with a Retry button.

---

## 3. Pages (layout + what the viewer should understand)

### Top bar (every page)
Page title + one-line subtitle, global search (alert/txn/account ID), EN | हिन्दी toggle, Presentation mode toggle, theme toggle, role chip ("Reviewer · read-only").

### 3.1 Today — *"Is the bank safe today, and what do I do first?"*
```
┌ Good morning. Here's today's compliance picture.            [▶ Take the 3-minute tour] ┐
├──────────────┬──────────────────────────────────────────────────────────────────────────┤
│ Readiness    │  KpiTile: New alerts │ Money at risk │ Reports due 48h │ Active mule rings │
│ gauge  82    │                                                                           │
│ "2 reports   ├──────────────────────────────────────────────────────────────────────────┤
│  close to    │  Needs your attention (5 cards, each: pill + one sentence + one button)   │
│  deadline"   │                                                                           │
├──────────────┴──────────────────────────────┬───────────────────────────────────────────┤
│ Alerts vs confirmed fraud · last 30 days     │ This week in one paragraph (brief card)   │
└──────────────────────────────────────────────┴───────────────────────────────────────────┘
```

### 3.2 Alerts + Case file — *"Why is this suspicious, and can I prove it?"*
List on the left: priority-sorted cards (RiskMeter, typology in plain words, ₹ amount, deadline pill). Filter chips across the top.
The case drawer shows, in order:
1. **The story**: 3–5 sentences, large (16px), EN/HI toggle.
2. **Why it was flagged**: ReasonBars + CitationChips.
3. **What happened**: Timeline.
4. **Who is connected**: mini network graph (click → Mule Rings).
5. **Actions** (sticky footer): `Mark as fraud` · `Not fraud` · `Download evidence pack` · `Verify evidence` (shows a green "✓ Untouched since 12 Sep, 14:32" seal, or a red "Changed" warning) · `Create draft report`.
Plus a separate "Why wasn't this flagged?" search box above the list.

### 3.3 Ask Kavach — *"Ask anything in plain English."*
Centered chat column (max 760px). Empty state: a big heading, "Ask about alerts, customers, money flows or regulations", and 6 suggested-question chips.
Each answer: plain answer first (large) → Badge → CitationChips → collapsible "Show the data" (table + auto chart) → collapsible "Show the SQL" (hidden in Presentation mode) → 👍/👎.

### 3.4 Mule Rings — *"Who is working together?"*
Ring cards (size, ₹ moved, how fast, confidence pill) → a full-width React Flow graph: nodes coloured by risk, edges labelled "shared phone", "shared IP", "sent ₹", and a hover card per account. The layout animates in once, and a legend is always visible.

### 3.5 Rulebook — *"From regulation to working checks in minutes."*
Big dropzone ("Drop a circular PDF here"). Then the Stepper, then a two-column review: **left**, the source paragraph with the highlighted sentence; **right**, the rule in plain English ("Flag if 3+ cash deposits between ₹9 L and ₹10 L within 7 days") with Approve / Edit / Reject. The raw SQL sits in a collapsed "For engineers" box. Tabs: Versions · Conflicts (side-by-side clauses in red/amber) · Rule health.

### 3.6 Time Machine — *"What if we changed the rule?"*
Pick a rule, then a large slider with the current value marked, then a `Replay last 90 days` button, then animated before/after bars for three numbers (alerts, confirmed fraud caught, analyst hours) and a one-sentence verdict in a callout ("Lowering to ₹8 L catches 4 more fraud cases for 11 extra review hours").

---

## 4. Demo features (these win the room)
1. **Presentation mode** (toggle, or press `P`): 115% type scale, hides SQL and technical expanders, cursor spotlight, turns on the brief tooltips.
2. **Product tour**: 6 spotlight steps with a dimmed background, numbered "1 of 6", Next/Back, `→` key to advance. It runs on seeded tour data (`RESET_TOUR_DATA`), so it never fails live.
3. **Keyboard shortcuts**: `G T` Today, `G A` Alerts, `/` search, `?` shortcuts sheet.
4. **Instant feel**: prefetch the case file on hover, keep previous data while fetching, show optimistic UI for feedback buttons.
5. **Measured-speed badge** on the evidence pack: "Generated in 3.2 s", using the real measured time. Never invent a speed claim.
6. **Offline-safe demo**: if the backend is cold, show "Waking up the secure server… (~20 s)" with progress instead of an error.

---

## 5. Words (UX copy rules)
- Say what it means, not what it is: "Suspicious activity" not "anomaly"; "How sure we are" not "confidence score"; "Money moved in and out within a day" not "rapid pass-through".
- Buttons are verbs: "Download evidence pack", not "Evidence".
- Put numbers in sentences: "₹4.2 Cr moved through 3 mule rings this month."
- Label all data "Synthetic data" in the footer and on the evidence pack.

---

## 6. Quality bar (the frontend isn't done until all of these pass)
- Lighthouse: Accessibility ≥ 95, Performance ≥ 85 (built app).
- WCAG AA contrast in both themes; full keyboard navigation; visible focus rings (2px brand).
- No layout shift on load; no spinner longer than 300ms without a skeleton.
- Looks right at 1280px (projector), 1440px and 1920px, plus a tablet.
- Screenshots of every page in light + dark saved to `docs/screens/`.
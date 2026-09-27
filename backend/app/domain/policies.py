"""
Pure business rules (no Snowflake, no FastAPI).

- Report deadlines: STRs are due 7 working days after identification
  (synthetic circular KAVACH/2024/01 para 6).
- Deadline bands, risk levels and the readiness score used across the UI.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.domain.entities import ReasonFact

STR_WORKING_DAYS = 7


def add_working_days(start: datetime, days: int) -> datetime:
    """Move forward `days` weekdays (Sat/Sun skipped). Negative moves backward."""
    step = 1 if days >= 0 else -1
    remaining = abs(days)
    current = start
    while remaining:
        current += timedelta(days=step)
        if current.weekday() < 5:
            remaining -= 1
    return current


def report_due(created_at: datetime) -> datetime:
    return add_working_days(created_at, STR_WORKING_DAYS)


def created_before_for_due_by(due_by: datetime) -> datetime:
    """Latest identification time whose report is due by `due_by` (inverse of report_due)."""
    return add_working_days(due_by, -STR_WORKING_DAYS)


def deadline_status(due: datetime, now: datetime) -> str:
    """overdue < 0 ≤ act < 48 h ≤ attention < 5 days ≤ ok"""
    remaining = due - now
    if remaining.total_seconds() < 0:
        return "overdue"
    if remaining < timedelta(hours=48):
        return "act"
    if remaining < timedelta(days=5):
        return "attention"
    return "ok"


def risk_level(severity: str | None, score: float | None) -> int:
    """1–5 for the UI's RiskMeter; severity wins, score is the fallback."""
    by_severity = {"CRITICAL": 5, "HIGH": 4, "MEDIUM": 3, "LOW": 2}
    if severity and severity.upper() in by_severity:
        return by_severity[severity.upper()]
    if score is None:
        return 3
    s = score / 100 if score > 1 else score
    return 5 if s >= 0.85 else 4 if s >= 0.65 else 3 if s >= 0.45 else 2 if s >= 0.25 else 1


@dataclass(frozen=True)
class ReadinessFactor:
    key: str
    count: int
    points: float


@dataclass(frozen=True)
class Readiness:
    score: int
    reason_en: str
    reason_hi: str
    factors: list[ReadinessFactor]


# Points lost per open item. Overdue reports matter most.
WEIGHTS = {"overdue": 4.0, "due_soon": 2.0, "rules_pending": 0.5, "conflicts": 0.5}


def readiness(overdue: int, due_soon: int, rules_pending: int, conflicts: int) -> Readiness:
    counts = {"overdue": overdue, "due_soon": due_soon, "rules_pending": rules_pending, "conflicts": conflicts}
    factors = [ReadinessFactor(k, c, WEIGHTS[k] * c) for k, c in counts.items() if c > 0]
    # Round half up (not banker's rounding) so the score matches the UI's Math.round.
    score = int(max(0.0, min(100.0, 100.0 - sum(f.points for f in factors))) + 0.5)
    if overdue:
        en = f"{overdue} report{' is' if overdue == 1 else 's are'} overdue and {due_soon} more {'is' if due_soon == 1 else 'are'} due within 48 hours."
        hi = f"{overdue} रिपोर्ट की समय सीमा निकल चुकी है और {due_soon} और 48 घंटों में देय हैं।"
    elif due_soon:
        en = f"{due_soon} report{' is' if due_soon == 1 else 's are'} close to the deadline."
        hi = f"{due_soon} रिपोर्ट की समय सीमा पास है।"
    else:
        en, hi = "All reports are on time.", "सभी रिपोर्ट समय पर हैं।"
    return Readiness(score=score, reason_en=en, reason_hi=hi, factors=factors)


def pct_change(now: float, prev: float) -> float | None:
    if not prev:
        return None
    return (now - prev) / prev * 100


def format_inr_compact(amount: float, lang: str = "en") -> str:
    """₹12.4 L / ₹3.1 Cr (en) or ₹12.4 लाख / ₹3.1 करोड़ (hi)."""
    lakh, crore = ("L", "Cr") if lang == "en" else ("लाख", "करोड़")
    a = abs(amount)
    if a >= 1e7:
        v = a / 1e7
        return f"₹{v:.0f} {crore}" if v >= 100 else f"₹{v:.1f}".rstrip("0").rstrip(".") + f" {crore}"
    if a >= 1e5:
        v = a / 1e5
        txt = f"{v:.1f}" if v >= 10 else f"{v:.2f}"
        return f"₹{txt.rstrip('0').rstrip('.')} {lakh}"
    return f"₹{a:,.0f}"


# ───────────── Alerts / case file ─────────────

def deadline_cutoffs(now: datetime) -> dict[str, datetime]:
    """Created-at cutoffs for the deadline bands, so filters and sorting can run in SQL.
    An open alert created before `overdue_before` is overdue; before `due_48h_before`,
    due within 48 h; before `attention_before`, due within 5 days."""
    return {
        "overdue_before": created_before_for_due_by(now),
        "due_48h_before": created_before_for_due_by(now + timedelta(hours=48)),
        "attention_before": created_before_for_due_by(now + timedelta(days=5)),
    }


def str_filed(status: str | None, resolution: str | None, action_required: str | None) -> bool:
    """A report counts as filed once the alert is closed as confirmed fraud and the
    check asks for a report (STR or CTR). There is no separate filing table yet."""
    return (status or "").upper() == "CLOSED" and (resolution or "").upper() == "TRUE_POSITIVE" and (action_required or "").upper() in ("STR", "CTR")


def classify_timeline_event(channel: str | None, direction: str | None) -> str:
    """Maps a transaction onto the UI's timeline event types."""
    if (direction or "").upper() == "CREDIT":
        return "cash_deposit" if (channel or "").upper() == "CASH" else "transfer_in"
    return "transfer_out"


def timeline_title(kind: str, counterparty: str | None, channel: str | None) -> tuple[str, str]:
    """(en, hi) one-line title for a transaction on the timeline."""
    ch = (channel or "").upper()
    who = counterparty or ""
    if kind == "cash_deposit":
        return "Cash deposited", "नकद जमा किया गया"
    if kind == "transfer_in":
        return (f"Received from {who} by {ch}" if who else f"Money received by {ch}"), (f"{who} से {ch} द्वारा पैसा मिला" if who else f"{ch} द्वारा पैसा मिला")
    if ch == "CASH":
        return "Cash withdrawn", "नकद निकाला गया"
    return (f"Sent to {who} by {ch}" if who else f"Money sent by {ch}"), (f"{who} को {ch} द्वारा पैसा भेजा" if who else f"{ch} द्वारा पैसा भेजा")


_CITATION = re.compile(r"(KAVACH/\d{4}/\d{2})(?:\D+(\d+))?", re.IGNORECASE)


def parse_citation(citation: str | None) -> tuple[str, str] | None:
    """"KAVACH/2024/05 para 4" → ("KAVACH/2024/05", "4"). Same rule as the frontend's parseCitation."""
    m = _CITATION.search(citation or "")
    if not m:
        return None
    return m.group(1).upper(), m.group(2) or "1"


def pick_highlight(paragraph: str | None, max_len: int = 160) -> str | None:
    """The part of a circular paragraph to mark in the citation drawer.

    Approximation: rules don't record which words they rely on, so this picks the first
    sentence that carries a number (thresholds are what checks test), and if that sentence
    is long, the clause around its first number. Always an exact substring."""
    if not paragraph:
        return None
    # Split on sentence ends only ("Rs. 9,00,000" is not one).
    sentences = [s.strip() for s in re.split(r"(?<=[.;])\s+(?=[A-Z(])", paragraph) if s.strip()]
    sentence = next((s for s in sentences if re.search(r"\d", s)), sentences[0] if sentences else "").rstrip(".;")
    if len(sentence) <= max_len:
        return sentence or None
    words = sentence.split(" ")
    first = next((i for i, w in enumerate(words) if re.search(r"\d", w)), 0)
    out: list[str] = []
    for w in words[max(0, first - 4):]:
        if len(" ".join(out + [w])) > max_len:
            break
        out.append(w)
    return " ".join(out)


_DETAIL_AMOUNT = re.compile(r"'AMOUNT_INR':\s*(?:Decimal\(')?([\d.]+)")
_DETAIL_CHANNEL = re.compile(r"'CHANNEL':\s*'([A-Z]+)'")
_DETAIL_RISK = re.compile(r"'RISK_CATEGORY':\s*'([A-Z]+)'")
_RISK_HI = {"HIGH": "उच्च", "MEDIUM": "मध्यम", "LOW": "कम"}


def alert_reasons(
    typology: str | None,
    amount_inr: float | None,
    txn_count: int | None,
    reasons_variant: dict | None,
) -> list[ReasonFact]:
    """Up to 3 plain-language reasons from what the alert actually records.

    CORE.ALERTS.REASONS is {"rule_hit", "details"}. `details` is the matched row, and it
    comes in two shapes: a real JSON object for anything the current rule engine wrote,
    and — for alerts written before the engine moved to bind parameters — a Python dict
    repr cut at 200 characters. Read the object by field where we have one, and fall back
    to scraping the old text so historical alerts keep their reasons. Only facts that can
    be read reliably are used: the triggering amount/channel and the customer's risk
    category. Weights are a fixed ordering, not model output."""
    from app.domain.entities import ReasonFact
    from app.domain.labels import typology_phrase

    out = [ReasonFact(
        text=f"Matches the pattern: {typology_phrase(typology)}",
        text_hi=f"इस पैटर्न से मेल: {typology_phrase(typology, 'hi')}",
        weight=0.6,
    )]
    raw = (reasons_variant or {}).get("details")
    if isinstance(raw, dict):
        amount_value = next((raw[k] for k in ("AMOUNT_INR", "TOTAL_AMOUNT") if raw.get(k) is not None), None)
        channel_value = raw.get("CHANNEL")
        risk_value = raw.get("RISK_CATEGORY")
    else:
        details = raw if isinstance(raw, str) else ""
        amount_match = _DETAIL_AMOUNT.search(details)
        channel_match = _DETAIL_CHANNEL.search(details)
        risk_match = _DETAIL_RISK.search(details)
        amount_value = amount_match.group(1) if amount_match else None
        channel_value = channel_match.group(1) if channel_match else None
        risk_value = risk_match.group(1) if risk_match else None
    try:
        amount_value = float(amount_value) if amount_value is not None else None
    except (TypeError, ValueError):
        amount_value = None
    if amount_value is not None:
        by = f" by {channel_value}" if channel_value else ""
        by_hi = f" ({channel_value})" if channel_value else ""
        out.append(ReasonFact(
            text=f"The transaction that set off the check: {format_inr_compact(amount_value)}{by}",
            text_hi=f"जिस लेनदेन से जाँच शुरू हुई: {format_inr_compact(amount_value, 'hi')}{by_hi}",
            weight=0.45,
        ))
    if risk_value in _RISK_HI:
        out.append(ReasonFact(
            text=f"The customer is rated {str(risk_value).lower()} risk",
            text_hi=f"ग्राहक {_RISK_HI[risk_value]} जोखिम श्रेणी में है",
            weight=0.35,
        ))
    if txn_count and amount_inr:
        s = "" if txn_count == 1 else "s"
        out.append(ReasonFact(
            text=f"{txn_count} transaction{s} worth {format_inr_compact(amount_inr)} in the last 30 days",
            text_hi=f"पिछले 30 दिनों में {format_inr_compact(amount_inr, 'hi')} के {txn_count} लेनदेन",
            weight=0.3,
        ))
    return out[:3]


# ───────────── Mule rings ─────────────

def ring_name(ring_id: str, lang: str = "en") -> str:
    """"RING-0003" → "Ring 3" / "समूह 3"."""
    n = ring_id.rsplit("-", 1)[-1].lstrip("0") or ring_id
    return f"Ring {n}" if lang == "en" else f"समूह {n}"


def ring_roles(money: dict[str, tuple[float, float]], kind: str = "mule") -> dict[str, str]:
    """Roles from money in/out per member: the member who takes in the most is the
    collector, the one who sends out the most (another member) is the exit, the rest
    are mules. A derived reading of the flows, not a label stored anywhere.

    A round-trip loop has no collector and no exit -- the money comes back to where it
    started, so every member is just a hop. Calling the biggest receiver a "collector"
    there would invent a structure the flows do not have, so every member reads `loop`."""
    if not money:
        return {}
    if kind == "round_trip":
        return {a: "loop" for a in money}
    collector = max(money, key=lambda a: (money[a][0], a))
    others = [a for a in money if a != collector]
    exit_ = max(others, key=lambda a: (money[a][1], a)) if others else None
    return {a: "collector" if a == collector else "exit" if a == exit_ else "mule" for a in money}


# ───────────── Rulebook ─────────────

_AMT = r"AMOUNT_INR"


def _inr(v: float, lang: str) -> str:
    return format_inr_compact(v, lang)


def describe_rule_sql(sql: str | None, typology: str | None) -> tuple[str, str]:
    """(en, hi) sentence saying what the rule's SQL actually checks.

    Read from the SQL itself (not the circular), so a reviewer can see when the check
    and the paragraph it cites disagree. Falls back to the typology when nothing
    recognisable is found."""
    from app.domain.labels import typology_phrase

    s = " ".join((sql or "").split())
    channel = re.search(r"CHANNEL\s*=\s*'(\w+)'", s, re.I)
    channels = re.search(r"CHANNEL\s+IN\s*\(([^)]*)\)", s, re.I)
    direction = re.search(r"DIRECTION\s*=\s*'(\w+)'", s, re.I)
    dormant = "STATUS = 'DORMANT'" in s.upper()
    if not (channel or channels or direction or dormant):
        return (f"Looks for {typology_phrase(typology)}.", f"जाँच: {typology_phrase(typology, 'hi')}।")

    ch = channel.group(1).upper() if channel else ", ".join(c.strip(" '").upper() for c in channels.group(1).split(",")) if channels else ""
    d = direction.group(1).upper() if direction else ""
    kind_en = " ".join(x for x in ({"CREDIT": "incoming", "DEBIT": "outgoing"}.get(d, ""), "cash" if ch == "CASH" else ch) if x)
    kind_hi = " ".join(x for x in ({"CREDIT": "आने वाले", "DEBIT": "जाने वाले"}.get(d, ""), "नकद" if ch == "CASH" else ch) if x)

    en = ["Flags"] + (["dormant accounts making"] if dormant else []) + [f"{kind_en} transactions".strip()]
    hi_amount = hi_count = hi_window = ""
    between = re.search(rf"{_AMT}\s+BETWEEN\s+([\d.]+)\s+AND\s+([\d.]+)", s, re.I)
    ge = re.search(rf"{_AMT}\s*(>=|>)\s*([\d.]+)", s, re.I)
    if between:
        lo_v, hi_v = float(between.group(1)), float(between.group(2))
        en.append(f"between {_inr(lo_v, 'en')} and {_inr(hi_v, 'en')}")
        hi_amount = f"{_inr(lo_v, 'hi')} से {_inr(hi_v, 'hi')} के बीच के"
    elif ge:
        v = float(ge.group(2))
        en.append(f"of {_inr(v, 'en')} or more" if ge.group(1) == ">=" else f"above {_inr(v, 'en')}")
        hi_amount = f"{_inr(v, 'hi')} या उससे ज़्यादा के" if ge.group(1) == ">=" else f"{_inr(v, 'hi')} से ज़्यादा के"
    count = re.search(r"COUNT\((?:\*|DISTINCT [\w.]+)\)\s*(>=|>)\s*(\d+)", s, re.I)
    if count:
        n = int(count.group(2)) + (1 if count.group(1) == ">" else 0)
        en.append(f"{n} or more times")
        hi_count = f"({n} या ज़्यादा बार)"
    days = re.search(r"DATEADD\(\s*'?(day|hour)'?\s*,\s*-(\d+)", s, re.I)
    if days:
        n, unit = int(days.group(2)), days.group(1).lower()
        en.append(f"in the last {n} {unit}{'s' if n != 1 else ''}")
        hi_window = f"पिछले {n} {'दिनों' if unit == 'day' else 'घंटों'} में"
    who = "निष्क्रिय खातों के " if dormant else ""
    hi = " ".join(x for x in (hi_window, hi_amount, f"{who}{kind_hi} लेनदेन".strip(), hi_count) if x) + " पर अलर्ट बनाता है।"
    return " ".join(en) + ".", hi


_PARAM_LABELS = {
    "amount": ("Amount limit", "रकम की सीमा", "inr"),
    "min_amount": ("Lowest amount", "न्यूनतम रकम", "inr"),
    "max_amount": ("Highest amount", "अधिकतम रकम", "inr"),
    "reporting_threshold": ("Reporting limit", "रिपोर्टिंग सीमा", "inr"),
    "threshold": ("Limit", "सीमा", "inr"),
    "max_frequency": ("How many times", "कितनी बार", "count"),
    "min_count": ("How many times", "कितनी बार", "count"),
    "count": ("How many times", "कितनी बार", "count"),
    "days": ("Days", "दिन", "days"),
    "window_days": ("Days", "दिन", "days"),
    "hours": ("Hours", "घंटे", "hours"),
    "percent": ("Share", "हिस्सा", "percent"),
}


def rule_params(params: dict | None) -> list[dict]:
    """Numeric parameters with labels, units and a sensible range for sliders."""
    out = []
    for key, value in (params or {}).items():
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            continue
        label, label_hi, unit = _PARAM_LABELS.get(key, (key.replace("_", " ").capitalize(), key.replace("_", " "), "inr" if "amount" in key else "count"))
        if unit == "inr":
            step = 50_000 if value >= 1_000_000 else 10_000 if value >= 100_000 else 1_000
            lo, hi = max(step, round(value * 0.5 / step) * step), round(value * 1.5 / step) * step
        elif unit == "percent":
            step, lo, hi = 5, 0, 100
        else:
            step, lo, hi = 1, 1, max(int(value) * 3, int(value) + 5)
        out.append({"key": key, "label": label, "label_hi": label_hi, "unit": unit, "value": value, "min": lo, "max": hi, "step": step})
    return out


def rule_health(alerts: int, confirmed: int, dismissed: int) -> tuple[float, str, tuple[str, str] | None]:
    """(precision, verdict, proposed fix EN/HI) for a rule over the last 30 days.

    quiet = never fired; noisy = floods the queue (200+) or is mostly wrong once
    analysts have ruled on at least 5 of its alerts; otherwise healthy."""
    resolved = confirmed + dismissed
    precision = round(confirmed / resolved, 3) if resolved else 0.0
    if alerts == 0:
        return precision, "quiet", ("It hasn't fired in 30 days. Check that the data it reads is still arriving.",
                                    "30 दिनों में यह एक बार भी नहीं चला। जाँचें कि इसका डेटा अब भी आ रहा है।")
    if alerts >= 200 or (resolved >= 5 and precision < 0.2):
        return precision, "noisy", (f"It raised {alerts} alerts in 30 days. Try a higher limit in Time Machine before changing it.",
                                    f"इसने 30 दिनों में {alerts} अलर्ट बनाए। बदलने से पहले टाइम मशीन में ऊँची सीमा आज़माएँ।")
    return precision, "healthy", None


# ───────────── Time Machine ─────────────

REVIEW_HOURS_PER_ALERT = 0.75  # 45 minutes to review one alert


def tunable_param(sql: str | None) -> dict | None:
    """The one limit in a rule's SQL that the what-if slider can move, with a range.

    Priority: the lower bound of a BETWEEN band, else an `AMOUNT_INR >=` limit, else the
    `HAVING COUNT(*) >=` count. None when the SQL has nothing numeric to tune."""
    s = sql or ""
    between = re.search(r"AMOUNT_INR BETWEEN (\d+) AND (\d+)", s)
    ge = re.search(r"AMOUNT_INR >= (\d+)", s)
    count = re.search(r"HAVING COUNT\(\*\) >= (\d+)", s)
    if between:
        lo, hi = int(between.group(1)), int(between.group(2))
        return {"key": "min_amount", "label": "Lowest amount that counts", "label_hi": "गिनी जाने वाली सबसे कम रकम", "unit": "inr",
                "value": lo, "min": max(50_000, round(lo * 0.5 / 50_000) * 50_000), "max": (hi // 50_000) * 50_000, "step": 50_000}
    if ge:
        v = int(ge.group(1))
        step = 50_000 if v >= 500_000 else 10_000
        return {"key": "amount", "label": "Amount that triggers the check", "label_hi": "जाँच शुरू करने वाली रकम", "unit": "inr",
                "value": v, "min": max(step, round(v * 0.4 / step) * step), "max": round(v * 2 / step) * step, "step": step}
    if count:
        n = int(count.group(1))
        return {"key": "count", "label": "How many times before it flags", "label_hi": "कितनी बार के बाद अलर्ट", "unit": "count",
                "value": n, "min": 1, "max": max(n * 3, n + 5), "step": 1}
    return None


def with_param(sql: str, key: str, value: float) -> str:
    """The rule's SQL with the tunable limit set to `value` (the same place tunable_param read it)."""
    v = int(round(value))
    if key == "min_amount":
        return re.sub(r"AMOUNT_INR BETWEEN \d+ AND", f"AMOUNT_INR BETWEEN {v} AND", sql, count=1)
    if key == "amount":
        return re.sub(r"AMOUNT_INR >= \d+", f"AMOUNT_INR >= {v}", sql, count=1)
    if key == "count":
        return re.sub(r"HAVING COUNT\(\*\) >= \d+", f"HAVING COUNT(*) >= {v}", sql, count=1)
    raise ValueError(f"unknown parameter {key}")


def with_window(sql: str, days: int) -> str:
    """Replay over the last `days` of data instead of the rule's own window."""
    return re.sub(r"DATEADD\('day', -\d+,", f"DATEADD('day', -{int(days)},", sql)


# ───────────── Why wasn't this flagged? ─────────────

NEAR_MISS = 0.85  # within 15% under a limit counts as "almost flagged"


def why_not_rule(txn: dict, sql: str | None, typology: str | None, band_count: int | None = None) -> dict | None:
    """How one rule's SQL treats one transaction: not_applicable | passed | near_miss, with a reason.

    Reads the channel, direction and amount limits from the SQL. `band_count` is how many of
    the account's transactions fall in a BETWEEN band over the rule's window (for count rules).
    None when the rule doesn't look at single transactions (customer-level checks)."""
    s = " ".join((sql or "").split())
    amount, channel, direction = float(txn["amount_inr"]), (txn["channel"] or "").upper(), (txn["direction"] or "").upper()
    ch = re.search(r"CHANNEL\s*=\s*'(\w+)'", s, re.I)
    dr = re.search(r"DIRECTION\s*=\s*'(\w+)'", s, re.I)
    between = re.search(r"AMOUNT_INR BETWEEN (\d+) AND (\d+)", s)
    ge = re.search(r"AMOUNT_INR >= (\d+)", s)
    count = re.search(r"HAVING COUNT\(\*\) >= (\d+)", s)
    if not (ch or dr or between or ge):
        return None
    money = lambda v: format_inr_compact(v)  # noqa: E731
    if ch and ch.group(1).upper() != channel:
        return {"result": "not_applicable", "reason": f"Only looks at {ch.group(1).upper()} transactions; this was {channel}."}
    if dr and dr.group(1).upper() != direction:
        return {"result": "not_applicable", "reason": f"Only looks at money {'coming in' if dr.group(1).upper() == 'CREDIT' else 'going out'}."}
    if between:
        lo, hi = float(between.group(1)), float(between.group(2))
        if lo <= amount <= hi:
            need = int(count.group(1)) if count else 1
            if band_count is not None and band_count < need:
                return {"result": "near_miss", "reason": f"In the {money(lo)}–{money(hi)} band, but only {band_count} such transaction{'s' if band_count != 1 else ''} in the window (needs {need})."}
            return {"result": "near_miss", "reason": f"In the {money(lo)}–{money(hi)} band; the check hasn't flagged the account yet."}
        if lo * NEAR_MISS <= amount < lo:
            return {"result": "near_miss", "reason": f"{money(amount)} is just under the {money(lo)} lower limit."}
        return {"result": "passed", "reason": f"{money(amount)} is outside the {money(lo)}–{money(hi)} band."}
    if ge:
        limit = float(ge.group(1))
        if amount >= limit:
            return {"result": "near_miss", "reason": f"Meets the {money(limit)} limit, but the check only reads its own time window, and this transaction falls outside it."}
        if amount >= limit * NEAR_MISS:
            return {"result": "near_miss", "reason": f"{money(amount)} is just under the {money(limit)} limit."}
        return {"result": "passed", "reason": f"{money(amount)} is under the {money(limit)} limit."}
    return {"result": "passed", "reason": "Checked; nothing matched."}


CUSTOMER_TOKEN = "XCUSTX"


def fill_customer(story: str | None, name: str | None, lang: str = "en") -> str | None:
    """Stories are stored with XCUSTX instead of the customer's name (so stored text never
    carries PII); the name, already masked by Snowflake for restricted roles, goes in here."""
    if not story or CUSTOMER_TOKEN not in story:
        return story
    who = name or ("the customer" if lang == "en" else "ग्राहक")
    if lang == "en":
        story = re.sub(rf"\b[Tt]he account (?:of )?{CUSTOMER_TOKEN}\b", f"{who}'s account", story)
        story = re.sub(rf"\b[Aa]ccount {CUSTOMER_TOKEN}\b", f"{who}'s account", story)
        story = story.replace(f"{CUSTOMER_TOKEN}'s", f"{who}'s" if not who.endswith("s") else f"{who}'")
    else:
        # "खाता X में" is oblique: "X के खाते में"; otherwise "X का खाता".
        story = re.sub(rf"खात[ाे] {CUSTOMER_TOKEN} (में|से|को|पर)", rf"{who} के खाते \1", story)
        story = re.sub(rf"खाता {CUSTOMER_TOKEN}", f"{who} का खाता", story)
    story = story.replace(CUSTOMER_TOKEN, who)
    return story[:1].upper() + story[1:]

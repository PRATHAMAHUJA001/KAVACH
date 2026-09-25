"""
Pure business rules (no Snowflake, no FastAPI).

- Report deadlines: STRs are due 7 working days after identification
  (synthetic circular KAVACH/2024/01 para 6).
- Deadline bands, risk levels and the readiness score used across the UI.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

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

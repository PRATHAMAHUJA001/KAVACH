"""Facts the Today dashboard is built from (domain entities, no infrastructure)."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime


@dataclass
class AlertFact:
    alert_id: str
    account_id: str
    customer_name: str | None
    typology: str
    severity: str
    score: float
    created_at: datetime
    amount_inr: float


@dataclass
class RingFact:
    ring_id: str
    ring_name: str
    member_count: int
    volume_inr: float
    confidence: str | None
    detected_at: datetime | None


@dataclass
class TrendRow:
    day: date
    alert_count: int
    confirmed_fraud: int


@dataclass
class AlertCounts:
    new_24h: int = 0
    new_same_day_last_week: int = 0
    serious_new_24h: int = 0
    money_at_risk_inr: float = 0.0
    money_at_risk_week_ago_inr: float = 0.0
    overdue: int = 0
    due_48h: int = 0
    #: All unresolved reports — the denominator for the deadline share of readiness.
    open_reports: int = 0


@dataclass
class WeekSummary:
    alerts: int = 0
    amount_inr: float = 0.0
    confirmed_fraud: int = 0
    top_typology: str | None = None


@dataclass
class DashboardFacts:
    as_of: datetime
    counts: AlertCounts
    urgent: list[AlertFact] = field(default_factory=list)
    due_soon: list[AlertFact] = field(default_factory=list)
    trend: list[TrendRow] = field(default_factory=list)
    active_rings: list[RingFact] = field(default_factory=list)
    active_rings_week_ago: int = 0
    pending_rules: int = 0
    first_pending_rule_id: str | None = None
    #: Every compiled rule — the denominator for the rulebook share of readiness.
    total_rules: int = 0
    open_conflicts: int = 0
    first_open_conflict_id: str | None = None
    week: WeekSummary = field(default_factory=WeekSummary)

"""In-memory repositories for tests (no Snowflake)."""
from datetime import date, datetime, timedelta

from app.domain.dashboard import AlertCounts, AlertFact, DashboardFacts, RingFact, TrendRow, WeekSummary

AS_OF = datetime(2026, 9, 24, 18, 0)


class FakeDashboardRepository:
    def __init__(self, facts: DashboardFacts | None = None):
        self._facts = facts
        self.calls: list[tuple] = []

    def as_of(self) -> datetime:
        return AS_OF

    def facts(self, now, overdue_before, due_48h_before) -> DashboardFacts:
        self.calls.append((now, overdue_before, due_48h_before))
        return self._facts or sample_facts(now)


def sample_facts(now: datetime = AS_OF) -> DashboardFacts:
    def alert(i: int, days_old: float, typ="RAPID_PASSTHROUGH") -> AlertFact:
        return AlertFact(f"ALT-{i}", f"ACC{i:07d}", f"Customer {i}", typ, "HIGH", 0.8, now - timedelta(days=days_old), 1_250_000)

    return DashboardFacts(
        as_of=now,
        counts=AlertCounts(new_24h=14, new_same_day_last_week=7, serious_new_24h=9, money_at_risk_inr=2.9e8, money_at_risk_week_ago_inr=2.6e8, overdue=4, due_48h=3),
        urgent=[alert(1, 20), alert(2, 12, "MULE_RING")],
        due_soon=[alert(3, 8, "ACCOUNT_TAKEOVER")],
        trend=[TrendRow(day=(now - timedelta(days=29 - i)).date(), alert_count=i % 9, confirmed_fraud=i % 3) for i in range(30)],
        active_rings=[
            RingFact("RING-A", "Ring RING-A", 5, 8.96e6, "HIGH", now - timedelta(days=2)),
            RingFact("RING-B", "Ring RING-B", 7, 2.6e7, "MEDIUM", now - timedelta(days=20)),
        ],
        active_rings_week_ago=1,
        pending_rules=10,
        first_pending_rule_id="RL-1",
        open_conflicts=9,
        first_open_conflict_id="CONF-1",
        week=WeekSummary(alerts=62, amount_inr=2.65e8, confirmed_fraud=1, top_typology="RAPID_PASSTHROUGH"),
    )

"""
Snowflake implementation of DashboardRepository (Today screen).

All values are bound (`params=`), never formatted into SQL. Timestamps in CORE are
TIMESTAMP_NTZ, so Python datetimes passed here are naive.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from snowflake.snowpark import Session

from app.domain.dashboard import AlertCounts, AlertFact, DashboardFacts, RingFact, TrendRow, WeekSummary
from app.domain.policies import ring_name
from app.domain.repositories import DashboardRepository

_ALERT_FACT_COLUMNS = """
    a.alert_id, a.account_id, c.customer_name, a.typology, a.severity, a.score, a.created_at,
    COALESCE(t.amount_inr, 0) AS amount_inr
"""
_ALERT_JOINS = """
    FROM CORE.ALERTS a
    LEFT JOIN CORE.CUSTOMERS c ON c.customer_id = a.customer_id
    LEFT JOIN CORE.TRANSACTIONS t ON t.txn_id = a.txn_id
"""
_OPEN = "a.status IN ('NEW', 'OPEN')"


def _naive(v) -> datetime:
    if isinstance(v, datetime):
        return v.replace(tzinfo=None)
    if isinstance(v, date):
        return datetime(v.year, v.month, v.day)
    return datetime.fromisoformat(str(v)).replace(tzinfo=None)


class SnowflakeDashboardRepository(DashboardRepository):
    def __init__(self, session: Session):
        self.session = session

    def _one(self, sql: str, params: list | None = None):
        rows = self.session.sql(sql, params=params or []).collect()
        return rows[0] if rows else None

    def as_of(self) -> datetime:
        row = self._one(
            """
            SELECT
              (SELECT TRY_TO_DATE(value) FROM APP.SETTINGS WHERE key = 'AS_OF_DATE') AS setting_date,
              (SELECT MAX(created_at) FROM CORE.ALERTS) AS newest_alert
            """
        )
        candidates = []
        if row and row["SETTING_DATE"]:
            candidates.append(_naive(row["SETTING_DATE"]) + timedelta(hours=18))
        if row and row["NEWEST_ALERT"]:
            candidates.append(_naive(row["NEWEST_ALERT"]))
        return max(candidates) if candidates else datetime.now()

    def _alert_facts(self, where: str, params: list, order: str, limit: int) -> list[AlertFact]:
        rows = self.session.sql(
            f"SELECT {_ALERT_FACT_COLUMNS} {_ALERT_JOINS} WHERE {where} ORDER BY {order} LIMIT {int(limit)}",
            params=params,
        ).collect()
        return [
            AlertFact(
                alert_id=r["ALERT_ID"],
                account_id=r["ACCOUNT_ID"],
                customer_name=r["CUSTOMER_NAME"],
                typology=r["TYPOLOGY"],
                severity=r["SEVERITY"],
                score=float(r["SCORE"] or 0),
                created_at=_naive(r["CREATED_AT"]),
                amount_inr=float(r["AMOUNT_INR"] or 0),
            )
            for r in rows
        ]

    def facts(self, now: datetime, overdue_before: datetime, due_48h_before: datetime) -> DashboardFacts:
        day_ago = now - timedelta(days=1)
        week_ago = now - timedelta(days=7)
        c = self._one(
            f"""
            SELECT
              COUNT_IF(a.created_at > ? AND a.created_at <= ?) AS new_24h,
              COUNT_IF(a.created_at > ? AND a.created_at <= ?) AS new_last_week,
              COUNT_IF(a.created_at > ? AND a.created_at <= ? AND a.severity IN ('HIGH', 'CRITICAL')) AS serious_new,
              COALESCE(SUM(IFF({_OPEN}, t.amount_inr, 0)), 0) AS money_open,
              COALESCE(SUM(IFF({_OPEN} AND a.created_at <= ?, t.amount_inr, 0)), 0) AS money_week_ago,
              COUNT_IF({_OPEN} AND a.created_at < ?) AS overdue,
              COUNT_IF({_OPEN} AND a.created_at >= ? AND a.created_at < ?) AS due_48h
            {_ALERT_JOINS}
            """,
            [day_ago, now, week_ago - timedelta(days=1), week_ago, day_ago, now, week_ago, overdue_before, overdue_before, due_48h_before],
        )
        counts = AlertCounts(
            new_24h=int(c["NEW_24H"]),
            new_same_day_last_week=int(c["NEW_LAST_WEEK"]),
            serious_new_24h=int(c["SERIOUS_NEW"]),
            money_at_risk_inr=float(c["MONEY_OPEN"]),
            money_at_risk_week_ago_inr=float(c["MONEY_WEEK_AGO"]),
            overdue=int(c["OVERDUE"]),
            due_48h=int(c["DUE_48H"]),
        )

        # Report deadlines grow with created_at, so the oldest open alerts are the most urgent.
        urgent = self._alert_facts(f"{_OPEN} AND a.created_at < ?", [overdue_before], "a.created_at ASC", 3)
        due_soon = self._alert_facts(f"{_OPEN} AND a.created_at >= ? AND a.created_at < ?", [overdue_before, due_48h_before], "a.created_at ASC", 3)

        trend_rows = self.session.sql(
            """
            SELECT created_at::DATE AS day,
                   COUNT(*) AS alert_count,
                   COUNT_IF(resolution = 'TRUE_POSITIVE') AS confirmed_fraud
            FROM CORE.ALERTS
            WHERE created_at > DATEADD('day', -30, ?::TIMESTAMP_NTZ) AND created_at <= ?
            GROUP BY 1
            """,
            params=[now, now],
        ).collect()
        by_day = {r["DAY"]: r for r in trend_rows}
        trend = []
        for i in range(29, -1, -1):
            d = (now - timedelta(days=i)).date()
            r = by_day.get(d)
            trend.append(TrendRow(day=d, alert_count=int(r["ALERT_COUNT"]) if r else 0, confirmed_fraud=int(r["CONFIRMED_FRAUD"]) if r else 0))

        ring_rows = self.session.sql(
            """
            SELECT r.ring_id, r.ring_size, r.confidence_label, r.detected_at,
                   COALESCE(v.volume, 0) AS volume
            FROM CORE.RINGS r
            LEFT JOIN (
              SELECT rm.ring_id, SUM(t.amount_inr) AS volume
              FROM CORE.RING_MEMBERS rm
              JOIN CORE.TRANSACTIONS t ON t.account_id = rm.account_id
              WHERE t.txn_ts > DATEADD('day', -30, ?::TIMESTAMP_NTZ)
              GROUP BY rm.ring_id
            ) v ON v.ring_id = r.ring_id
            WHERE r.confidence_label IN ('HIGH', 'MEDIUM')
            """,
            params=[now],
        ).collect()
        rings = [
            RingFact(
                ring_id=r["RING_ID"],
                ring_name=ring_name(r["RING_ID"]),
                member_count=int(r["RING_SIZE"] or 0),
                volume_inr=float(r["VOLUME"] or 0),
                confidence=r["CONFIDENCE_LABEL"],
                detected_at=_naive(r["DETECTED_AT"]) if r["DETECTED_AT"] else None,
            )
            for r in ring_rows
        ]

        rules = self._one(
            "SELECT COUNT(*) AS n, MIN(rule_id) AS first_id FROM RULES.RULE_LIBRARY WHERE status = 'PENDING_APPROVAL'"
        )
        conflicts = self._one(
            "SELECT COUNT(*) AS n, MIN(conflict_id) AS first_id FROM RULES.RULE_CONFLICTS WHERE status = 'OPEN'"
        )
        wk = self._one(
            f"""
            SELECT COUNT(*) AS alerts, COALESCE(SUM(t.amount_inr), 0) AS amount,
                   COUNT_IF(a.resolution = 'TRUE_POSITIVE') AS fraud,
                   MODE(a.typology) AS top_typology
            {_ALERT_JOINS}
            WHERE a.created_at > ? AND a.created_at <= ?
            """,
            [week_ago, now],
        )

        return DashboardFacts(
            as_of=now,
            counts=counts,
            urgent=urgent,
            due_soon=due_soon,
            trend=trend,
            active_rings=rings,
            active_rings_week_ago=sum(1 for r in rings if r.detected_at is None or r.detected_at <= week_ago),
            pending_rules=int(rules["N"]) if rules else 0,
            first_pending_rule_id=rules["FIRST_ID"] if rules else None,
            open_conflicts=int(conflicts["N"]) if conflicts else 0,
            first_open_conflict_id=conflicts["FIRST_ID"] if conflicts else None,
            week=WeekSummary(
                alerts=int(wk["ALERTS"]) if wk else 0,
                amount_inr=float(wk["AMOUNT"]) if wk else 0.0,
                confirmed_fraud=int(wk["FRAUD"]) if wk else 0,
                top_typology=wk["TOP_TYPOLOGY"] if wk else None,
            ),
        )

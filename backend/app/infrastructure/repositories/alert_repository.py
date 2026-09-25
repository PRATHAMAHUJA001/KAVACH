"""
Concrete implementation of AlertRepository using Snowflake
Infrastructure layer - depends on domain protocols
"""
from typing import Optional, List
from datetime import datetime
from snowflake.snowpark import Session
from app.domain.entities import Alert, AlertDetail
from app.domain.repositories import AlertRepository


class SnowflakeAlertRepository(AlertRepository):
    """Snowflake implementation of AlertRepository"""

    def __init__(self, session: Session):
        self.session = session

    @staticmethod
    def _to_alert(row) -> Alert:
        return Alert(
            alert_id=row['ALERT_ID'],
            account_id=row['ACCOUNT_ID'],
            customer_id=row['CUSTOMER_ID'],
            typology=row['TYPOLOGY'],
            severity=row['SEVERITY'],
            score=float(row['SCORE']),
            status=row['STATUS'],
            rule_name=row['RULE_NAME'],
            citation=row['CITATION'],
            created_at=row['CREATED_AT'],
            resolution=row['RESOLUTION'],
            customer_name=row['CUSTOMER_NAME'],
            pan=row['PAN']
        )

    def get_alert(self, alert_id: str) -> Optional[Alert]:
        """Get a single alert by ID"""
        sql = f"""
            SELECT a.alert_id, a.account_id, a.customer_id, a.typology, a.severity, a.score,
                   a.status, a.rule_name, a.citation, a.created_at, a.resolution,
                   c.customer_name, c.pan
            FROM CORE.ALERTS a
            LEFT JOIN CORE.CUSTOMERS c ON a.customer_id = c.customer_id
            WHERE a.alert_id = '{alert_id}'
        """

        rows = self.session.sql(sql).collect()
        if not rows:
            return None

        return self._to_alert(rows[0])

    def list_alerts(
        self,
        status: Optional[str] = None,
        severity: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> tuple[List[Alert], int]:
        """List alerts with filters"""
        where_parts = []
        if status:
            where_parts.append(f"a.status = '{status}'")
        if severity:
            where_parts.append(f"a.severity = '{severity}'")
        where_clause = "WHERE " + " AND ".join(where_parts) if where_parts else ""

        # Get total count
        count_sql = f"SELECT COUNT(*) AS total FROM CORE.ALERTS a {where_clause}"
        total = self.session.sql(count_sql).collect()[0]['TOTAL']

        # Get alerts
        alerts_sql = f"""
            SELECT a.alert_id, a.account_id, a.customer_id, a.typology, a.severity, a.score,
                   a.status, a.rule_name, a.citation, a.created_at, a.resolution,
                   c.customer_name, c.pan
            FROM CORE.ALERTS a
            LEFT JOIN CORE.CUSTOMERS c ON a.customer_id = c.customer_id
            {where_clause}
            ORDER BY a.created_at DESC
            LIMIT {limit} OFFSET {offset}
        """

        rows = self.session.sql(alerts_sql).collect()
        alerts = [self._to_alert(row) for row in rows]

        return alerts, total

    def get_alert_detail(self, alert_id: str) -> Optional[AlertDetail]:
        """Get detailed alert with story and transactions"""
        sql = f"""
            SELECT 
                a.alert_id, a.account_id, a.customer_id, a.typology, a.severity, a.score,
                a.status, a.rule_name, a.citation, a.created_at, a.resolution,
                c.customer_name, c.pan,
                s.story_en, s.story_hi,
                t.txn_count, t.total_amount_inr
            FROM CORE.ALERTS a
            LEFT JOIN CORE.CUSTOMERS c ON a.customer_id = c.customer_id
            LEFT JOIN AI.ALERT_STORIES s ON a.alert_id = s.alert_id
            LEFT JOIN (
                SELECT account_id, COUNT(*) AS txn_count, SUM(amount_inr) AS total_amount_inr
                FROM CORE.TRANSACTIONS
                WHERE txn_ts >= DATEADD('day', -30, (SELECT MAX(created_at) FROM CORE.ALERTS))
                GROUP BY account_id
            ) t ON a.account_id = t.account_id
            WHERE a.alert_id = '{alert_id}'
        """

        rows = self.session.sql(sql).collect()
        if not rows:
            return None

        row = rows[0]
        alert = self._to_alert(row)

        return AlertDetail(
            alert=alert,
            story_en=row['STORY_EN'],
            story_hi=row['STORY_HI'],
            txn_count=row['TXN_COUNT'] or 0,
            total_amount_inr=float(row['TOTAL_AMOUNT_INR'] or 0)
        )

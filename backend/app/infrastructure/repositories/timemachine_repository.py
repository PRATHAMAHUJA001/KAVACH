"""
Time Machine read model: rule SQL to replay, and the replay itself.

Replays run the rule's own compiled SQL (from RULES.RULE_LIBRARY, never from the
request) with the limit and window substituted, and count how many results are
planted fraud accounts in RAW.GROUND_TRUTH.
"""
from __future__ import annotations

from typing import Optional

from snowflake.snowpark import Session



class SnowflakeTimeMachineRepository:
    def __init__(self, session: Session):
        self.session = session

    def active_rules(self) -> list[dict]:
        rows = self.session.sql(
            "SELECT rule_id, rule_name, typology, sql_text FROM RULES.RULE_LIBRARY "
            "WHERE status NOT IN ('REJECTED', 'SUPERSEDED') ORDER BY typology, rule_name"
        ).collect()
        return [{k.lower(): r[k] for k in ("RULE_ID", "RULE_NAME", "TYPOLOGY", "SQL_TEXT")} for r in rows]

    def rule(self, rule_id: str) -> Optional[dict]:
        rows = self.session.sql("SELECT rule_id, rule_name, typology, sql_text FROM RULES.RULE_LIBRARY WHERE rule_id = ?", params=[rule_id]).collect()
        return {k.lower(): rows[0][k] for k in ("RULE_ID", "RULE_NAME", "TYPOLOGY", "SQL_TEXT")} if rows else None

    def run(self, sql: str, typology: str) -> dict:
        """Result rows, distinct accounts, and those accounts that are planted fraud of any kind."""
        r = self.session.sql(
            f"""
            WITH q AS ({sql.strip().rstrip(';')}),
            truth AS (SELECT DISTINCT entity_id FROM RAW.GROUND_TRUTH WHERE entity_type = 'ACCOUNT')
            SELECT COUNT(*) AS rows_, COUNT(DISTINCT q.account_id) AS accounts,
                   COUNT(DISTINCT IFF(truth.entity_id IS NOT NULL, q.account_id, NULL)) AS fraud
            FROM q LEFT JOIN truth ON truth.entity_id = q.account_id
            """
        ).collect()[0]
        return {"alerts": int(r['ROWS_']), "accounts": int(r['ACCOUNTS']), "fraud": int(r['FRAUD'])}

    def fraud_total(self, typology: str) -> int:
        r = self.session.sql(
            "SELECT COUNT(DISTINCT entity_id) AS n FROM RAW.GROUND_TRUTH WHERE entity_type = 'ACCOUNT' AND typology = ?", params=[typology]
        ).collect()[0]
        if r['N']:
            return int(r['N'])
        return int(self.session.sql("SELECT COUNT(DISTINCT entity_id) AS n FROM RAW.GROUND_TRUTH WHERE entity_type = 'ACCOUNT'").collect()[0]['N'])

    def history(self, days: int) -> list[dict]:
        """Daily alert counts for the last `days`, anchored on the newest alert, with the top 3 patterns."""
        window = "created_at > DATEADD('day', -?, (SELECT MAX(created_at) FROM CORE.ALERTS))"
        daily = self.session.sql(
            f"""
            SELECT created_at::DATE AS d, COUNT(*) AS alerts, COUNT_IF(severity IN ('HIGH', 'CRITICAL')) AS high,
                   COALESCE(SUM(score), 0) AS score
            FROM CORE.ALERTS WHERE {window} GROUP BY 1 ORDER BY 1 DESC
            """,
            params=[int(days)],
        ).collect()
        top: dict = {}
        for r in self.session.sql(
            f"""
            SELECT created_at::DATE AS d, typology, COUNT(*) AS n
            FROM CORE.ALERTS WHERE {window} GROUP BY 1, 2
            QUALIFY ROW_NUMBER() OVER (PARTITION BY d ORDER BY n DESC, typology) <= 3
            """,
            params=[int(days)],
        ).collect():
            top.setdefault(r['D'], []).append({"typology": r['TYPOLOGY'], "count": int(r['N'])})
        return [{"date": str(r['D']), "alert_count": int(r['ALERTS']), "high_severity_count": int(r['HIGH']),
                 "total_risk_score": float(r['SCORE']), "top_typologies": sorted(top.get(r['D'], []), key=lambda x: -x["count"])}
                for r in daily]

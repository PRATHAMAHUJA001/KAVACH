"""
Circular paragraphs, global search and the product-tour reset. Bound parameters only.
"""
from __future__ import annotations

from typing import Optional

from snowflake.snowpark import Session

from app.domain import policies
from app.domain.labels import typology_phrase

TOUR_KEYS = ("TOUR_ALERT_ID", "TOUR_RING_ID", "TOUR_RULE_ID", "TOUR_CIRCULAR_NO")


class SnowflakeReferenceRepository:
    def __init__(self, session: Session):
        self.session = session

    def paragraph(self, circular_no: str, para_no: int) -> Optional[dict]:
        rows = self.session.sql(
            """
            SELECT para_no, ANY_VALUE(text) AS text, ANY_VALUE(issue_date) AS issue_date,
                   BOOLOR_AGG(is_amendment) AS is_amendment, ANY_VALUE(amends_circular) AS amends
            FROM AI.REG_CHUNKS WHERE circular_no = ? AND para_no BETWEEN ? AND ?
            GROUP BY para_no ORDER BY para_no
            """,
            params=[circular_no, para_no - 1, para_no + 1],
        ).collect()
        by = {int(r['PARA_NO']): r for r in rows}
        cur = by.get(para_no)
        if not cur:
            return None
        side = lambda n: {"para_no": str(n), "text": by[n]['TEXT']} if n in by else None  # noqa: E731
        return {
            "circular_no": circular_no, "para_no": str(para_no), "text": cur['TEXT'],
            "issue_date": cur['ISSUE_DATE'] or None, "is_amendment": bool(cur['IS_AMENDMENT']), "amends_circular": cur['AMENDS'],
            "before": side(para_no - 1), "after": side(para_no + 1),
        }

    def search(self, q: str, limit: int = 15) -> list[dict]:
        like = f"%{q}%"
        out: list[dict] = []
        for r in self.session.sql(
            """
            SELECT a.alert_id, a.account_id, a.typology, c.customer_name,
                   IFF(a.alert_id ILIKE ?, 'alert', IFF(a.account_id ILIKE ?, 'account', 'alert')) AS kind
            FROM CORE.ALERTS a
            LEFT JOIN CORE.ACCOUNTS acc ON acc.account_id = a.account_id
            LEFT JOIN CORE.CUSTOMERS c ON c.customer_id = COALESCE(a.customer_id, acc.customer_id, IFF(a.account_id LIKE 'CUST%', a.account_id, NULL))
            WHERE a.alert_id ILIKE ? OR a.account_id ILIKE ? OR c.customer_name ILIKE ?
            QUALIFY ROW_NUMBER() OVER (PARTITION BY a.account_id ORDER BY a.created_at DESC) = 1
            LIMIT 8
            """,
            params=[like, like, like, like, like],
        ).collect():
            name = r['CUSTOMER_NAME'] or r['ACCOUNT_ID']
            out.append({"kind": r['KIND'], "id": r['ALERT_ID'] if r['KIND'] == 'alert' else r['ACCOUNT_ID'], "title": name,
                        "subtitle": f"{r['ACCOUNT_ID']} · {typology_phrase(r['TYPOLOGY'])}", "alert_id": r['ALERT_ID']})
        if q.upper().startswith("TXN") and len(q) >= 5:
            for r in self.session.sql(
                """
                SELECT t.txn_id, t.account_id, t.amount_inr, a.alert_id
                FROM CORE.TRANSACTIONS t
                LEFT JOIN CORE.ALERTS a ON a.txn_id = t.txn_id
                WHERE t.txn_id ILIKE ? LIMIT 4
                """,
                params=[f"{q}%"],
            ).collect():
                out.append({"kind": "txn", "id": r['TXN_ID'], "title": r['TXN_ID'],
                            "subtitle": f"{policies.format_inr_compact(float(r['AMOUNT_INR'] or 0))} · {r['ACCOUNT_ID']}", "alert_id": r['ALERT_ID']})
        for r in self.session.sql("SELECT ring_id, ring_size FROM CORE.RINGS ORDER BY ring_score DESC").collect():
            name = policies.ring_name(r['RING_ID'])
            if q.lower() in name.lower() or q.lower() in r['RING_ID'].lower():
                out.append({"kind": "ring", "id": r['RING_ID'], "title": name, "title_hi": policies.ring_name(r['RING_ID'], "hi"),
                            "subtitle": f"{int(r['RING_SIZE'])} accounts"})
        for r in self.session.sql(
            "SELECT rule_id, rule_name, typology, sql_text, source_citation FROM RULES.RULE_LIBRARY "
            "WHERE rule_name ILIKE ? OR rule_id ILIKE ? OR typology ILIKE ? OR source_citation ILIKE ? LIMIT 5",
            params=[like, like, like, like],
        ).collect():
            en, hi = policies.describe_rule_sql(r['SQL_TEXT'], r['TYPOLOGY'])
            out.append({"kind": "rule", "id": r['RULE_ID'], "title": en, "title_hi": hi, "subtitle": r['SOURCE_CITATION']})
        return out[:limit]

    def reset_tour(self) -> dict:
        self.session.sql("CALL AI.RESET_TOUR_DATA()").collect()
        marks = ", ".join("?" * len(TOUR_KEYS))
        rows = {r['KEY']: r['VALUE'] for r in self.session.sql(f"SELECT key, value FROM APP.SETTINGS WHERE key IN ({marks})", params=list(TOUR_KEYS)).collect()}
        missing = [k for k in TOUR_KEYS if not rows.get(k)]
        if missing:
            raise LookupError(f"Tour data isn't seeded: {', '.join(missing)} missing in APP.SETTINGS")
        return {"ok": True, "alert_id": rows["TOUR_ALERT_ID"], "ring_id": rows["TOUR_RING_ID"], "rule_id": rows["TOUR_RULE_ID"],
                "circular_no": rows["TOUR_CIRCULAR_NO"]}

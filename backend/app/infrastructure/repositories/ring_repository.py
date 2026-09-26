"""
Concrete implementation of RingRepository using Snowflake.

Rings come from CORE.DETECT_MULE_RINGS() (sql/11_graph_detection.sql). "Money moved"
and "how fast" only count transfers between members of the same ring, not the members'
ordinary banking. All values are bound (`params=`).
"""
from __future__ import annotations

from typing import List, Optional

from snowflake.snowpark import Session

from app.domain import policies
from app.domain.entities import GraphEdgeFact, GraphNodeFact, Ring, RingDetail, TxnFact
from app.domain.repositories import RingRepository
from app.infrastructure.repositories.dashboard_repository import _naive

_SEVERITY_RANK = "CASE a.severity WHEN 'CRITICAL' THEN 5 WHEN 'HIGH' THEN 4 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 2 END"

# Transfers where both sides are members of the same ring.
_RING_TXNS = """
    SELECT m.ring_id, t.*
    FROM CORE.TRANSACTIONS t
    JOIN CORE.RING_MEMBERS m ON m.account_id = t.account_id
    JOIN CORE.RING_MEMBERS c ON c.account_id = t.counterparty AND c.ring_id = m.ring_id
"""

_RING_SELECT = f"""
    WITH rt AS ({_RING_TXNS}),
    vol AS (SELECT ring_id, SUM(IFF(direction = 'DEBIT', amount_inr, 0)) AS volume FROM rt GROUP BY ring_id),
    speed AS (
        -- hours from money arriving in a member account to the next payment out of it
        SELECT ring_id, MEDIAN(DATEDIFF('minute', txn_ts, next_debit)) / 60 AS hours
        FROM (
            SELECT ring_id, direction, txn_ts,
                   MIN(IFF(direction = 'DEBIT', txn_ts, NULL)) OVER (
                       PARTITION BY account_id ORDER BY txn_ts ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING) AS next_debit
            FROM rt
        )
        WHERE direction = 'CREDIT' AND next_debit IS NOT NULL
        GROUP BY ring_id
    ),
    city AS (
        SELECT m.ring_id, MODE(c.city) AS city
        FROM CORE.RING_MEMBERS m
        JOIN CORE.ACCOUNTS acc ON acc.account_id = m.account_id
        JOIN CORE.CUSTOMERS c ON c.customer_id = acc.customer_id
        GROUP BY m.ring_id
    )
    SELECT r.ring_id, r.ring_size, r.alerted_members, r.shared_devices, r.ring_score,
           r.confidence_label, r.detected_at, COALESCE(vol.volume, 0) AS volume, speed.hours, city.city,
           COUNT(*) OVER () AS total_count
    FROM CORE.RINGS r
    LEFT JOIN vol ON vol.ring_id = r.ring_id
    LEFT JOIN speed ON speed.ring_id = r.ring_id
    LEFT JOIN city ON city.ring_id = r.ring_id
"""


def _edge_kind(edge_type: str | None) -> str | None:
    t = (edge_type or "").upper()
    if "MONEY" in t:
        return "sent_money"
    if "DEVICE" in t:
        return "shared_device"
    if "IP" in t:
        return "shared_ip"
    if "PHONE" in t or "MOBILE" in t:
        return "shared_phone"
    return None


class SnowflakeRingRepository(RingRepository):
    """Snowflake implementation of RingRepository"""

    def __init__(self, session: Session):
        self.session = session

    @staticmethod
    def _to_ring(r) -> Ring:
        return Ring(
            ring_id=r['RING_ID'],
            ring_name=policies.ring_name(r['RING_ID']),
            member_count=int(r['RING_SIZE'] or 0),
            total_volume_inr=float(r['VOLUME'] or 0),
            risk_score=float(r['RING_SCORE'] or 0),
            status=r['CONFIDENCE_LABEL'] or "LOW",
            confidence=r['CONFIDENCE_LABEL'],
            speed_hours=round(float(r['HOURS']), 2) if r['HOURS'] is not None else None,
            detected_at=_naive(r['DETECTED_AT']) if r['DETECTED_AT'] else None,
            alerted_members=int(r['ALERTED_MEMBERS'] or 0),
            shared_devices=int(r['SHARED_DEVICES'] or 0),
            city=r['CITY'],
        )

    def list_rings(self, limit: int = 20, offset: int = 0) -> tuple[List[Ring], int]:
        rows = self.session.sql(f"{_RING_SELECT} ORDER BY r.ring_score DESC, r.ring_id LIMIT {int(limit)} OFFSET {int(offset)}").collect()
        total = int(rows[0]['TOTAL_COUNT']) if rows else int(self.session.sql("SELECT COUNT(*) AS n FROM CORE.RINGS").collect()[0]['N'])
        return [self._to_ring(r) for r in rows], total

    def get_ring(self, ring_id: str) -> Optional[Ring]:
        rows = self.session.sql(f"{_RING_SELECT} WHERE r.ring_id = ?", params=[ring_id]).collect()
        return self._to_ring(rows[0]) if rows else None

    def get_ring_detail(self, ring_id: str) -> Optional[RingDetail]:
        ring = self.get_ring(ring_id)
        if not ring:
            return None
        members = self.session.sql(
            f"""
            WITH rt AS ({_RING_TXNS} WHERE m.ring_id = ?),
            out_legs AS (
                SELECT account_id, SUM(IFF(direction = 'CREDIT', amount_inr, 0)) AS credits,
                       SUM(IFF(direction = 'DEBIT', amount_inr, 0)) AS money_out
                FROM rt GROUP BY account_id
            ),
            -- what other members sent to this account, from the sender's DEBIT row
            in_legs AS (
                SELECT counterparty AS account_id, SUM(amount_inr) AS received
                FROM rt WHERE direction = 'DEBIT' GROUP BY counterparty
            ),
            -- Some rings only book the sender's leg; then the receiver's side is the sender's DEBIT.
            flows AS (
                SELECT COALESCE(o.account_id, i.account_id) AS account_id,
                       COALESCE(NULLIF(o.credits, 0), i.received, 0) AS money_in,
                       COALESCE(o.money_out, 0) AS money_out
                FROM out_legs o FULL OUTER JOIN in_legs i ON i.account_id = o.account_id
            )
            SELECT m.account_id, MAX(c.customer_name) AS customer_name, MAX(c.city) AS city,
                   MAX({_SEVERITY_RANK}) AS risk, MAX(a.alert_id) AS alert_id,
                   MAX(f.money_in) AS money_in, MAX(f.money_out) AS money_out
            FROM CORE.RING_MEMBERS m
            LEFT JOIN flows f ON f.account_id = m.account_id
            LEFT JOIN CORE.ACCOUNTS acc ON acc.account_id = m.account_id
            LEFT JOIN CORE.CUSTOMERS c ON c.customer_id = acc.customer_id
            LEFT JOIN CORE.ALERTS a ON a.account_id = m.account_id AND a.status <> 'CLOSED'
            WHERE m.ring_id = ?
            GROUP BY m.account_id
            ORDER BY m.account_id
            """,
            params=[ring_id, ring_id],
        ).collect()
        money = {m['ACCOUNT_ID']: (float(m['MONEY_IN'] or 0), float(m['MONEY_OUT'] or 0)) for m in members}
        roles = policies.ring_roles(money)
        # Members without an open alert take the ring's own risk band.
        ring_risk = {"HIGH": 4, "MEDIUM": 3}.get((ring.confidence or "").upper(), 2)
        nodes = [
            GraphNodeFact(
                id=m['ACCOUNT_ID'], label=m['CUSTOMER_NAME'] or m['ACCOUNT_ID'],
                risk_level=int(m['RISK']) if m['RISK'] else ring_risk, kind="member", city=m['CITY'],
                alert_id=m['ALERT_ID'], role=roles.get(m['ACCOUNT_ID']),
                money_in_inr=money[m['ACCOUNT_ID']][0], money_out_inr=money[m['ACCOUNT_ID']][1],
            )
            for m in members
        ]

        edges: dict[tuple[str, str, str], GraphEdgeFact] = {}
        for e in self.session.sql(
            """
            SELECT e.account_a, e.account_b, e.edge_type, e.edge_key
            FROM CORE.ACCOUNT_EDGES e
            JOIN CORE.RING_MEMBERS a ON a.account_id = e.account_a AND a.ring_id = ?
            JOIN CORE.RING_MEMBERS b ON b.account_id = e.account_b AND b.ring_id = ?
            """,
            params=[ring_id, ring_id],
        ).collect():
            kind = _edge_kind(e['EDGE_TYPE'])
            if not kind or e['ACCOUNT_A'] == e['ACCOUNT_B']:
                continue
            if kind == "sent_money":
                amt, _, n = str(e['EDGE_KEY'] or "").partition("|")
                key = (e['ACCOUNT_A'], e['ACCOUNT_B'], kind)
                edges[key] = GraphEdgeFact(e['ACCOUNT_A'], e['ACCOUNT_B'], kind,
                                           amount_inr=float(amt) if amt else None, count=int(n) if n.isdigit() else None)
            else:
                a, b = sorted((e['ACCOUNT_A'], e['ACCOUNT_B']))
                prev = edges.get((a, b, kind))
                edges[(a, b, kind)] = GraphEdgeFact(a, b, kind, count=(prev.count or 0) + 1 if prev else 1)

        txns = self.session.sql(
            f"""
            SELECT txn_id, account_id, txn_ts, amount_inr, channel, direction, counterparty, counterparty_bank, country, narration
            FROM ({_RING_TXNS} WHERE m.ring_id = ?)
            ORDER BY txn_ts DESC LIMIT 100
            """,
            params=[ring_id],
        ).collect()
        transactions = [
            TxnFact(
                txn_id=t['TXN_ID'], account_id=t['ACCOUNT_ID'], txn_ts=_naive(t['TXN_TS']), amount_inr=float(t['AMOUNT_INR'] or 0),
                channel=t['CHANNEL'], direction=t['DIRECTION'], counterparty=t['COUNTERPARTY'],
                counterparty_bank=t['COUNTERPARTY_BANK'], country=t['COUNTRY'], narration=t['NARRATION'],
            )
            for t in txns
        ]
        return RingDetail(ring=ring, members=nodes, edges=list(edges.values()), transactions=transactions)

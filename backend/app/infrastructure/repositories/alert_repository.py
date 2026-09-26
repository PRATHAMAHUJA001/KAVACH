"""
Concrete implementation of AlertRepository using Snowflake
Infrastructure layer - depends on domain protocols

All values are bound (`params=`), never formatted into SQL. The 30-day activity
window is anchored on the newest transaction, not the newest alert: alerts carry the
time the rule executor ran, which can be long after the synthetic transactions.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import List, Optional

from snowflake.snowpark import Session

from app.domain import policies
from app.domain.entities import (
    Alert,
    AlertDetail,
    CitationRefFact,
    GraphEdgeFact,
    GraphFact,
    GraphNodeFact,
    TimelineFact,
    TxnFact,
)
from app.domain.repositories import AlertRepository
from app.infrastructure.repositories.dashboard_repository import SnowflakeDashboardRepository, _naive

_WINDOW_START = "DATEADD('day', -30, (SELECT MAX(txn_ts) FROM CORE.TRANSACTIONS))"

_SEVERITY_RANK = "CASE {col} WHEN 'CRITICAL' THEN 5 WHEN 'HIGH' THEN 4 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 2 ELSE 1 END"

# Rule-generated alerts leave CUSTOMER_ID empty: the account knows its owner, and
# customer-level checks (KYC) put the customer id in ACCOUNT_ID.
_CUSTOMER = "COALESCE(a.customer_id, acc.customer_id, IFF(a.account_id LIKE 'CUST%', a.account_id, NULL))"

_COLUMNS = f"""
    a.alert_id, a.account_id, {_CUSTOMER} AS customer_id, a.typology, a.severity, a.score,
    a.status, a.rule_name, a.citation, a.created_at, a.resolution, a.action_required, a.txn_id,
    c.customer_name, c.pan, c.city, acc.branch_code,
    w.amount_inr, w.txn_count, w.window_start, w.window_end, r.ring_id
"""

# `{win_filter}` narrows the window aggregate to one account for the detail query.
_FROM = f"""
    WITH win AS (
        SELECT account_id, SUM(amount_inr) AS amount_inr, COUNT(*) AS txn_count,
               MIN(txn_ts) AS window_start, MAX(txn_ts) AS window_end
        FROM CORE.TRANSACTIONS
        WHERE txn_ts >= {_WINDOW_START} {{win_filter}}
        GROUP BY account_id
    ),
    ring AS (SELECT account_id, MIN(ring_id) AS ring_id FROM CORE.RING_MEMBERS GROUP BY account_id)
    SELECT {{columns}}
    FROM CORE.ALERTS a
    LEFT JOIN CORE.ACCOUNTS acc ON acc.account_id = a.account_id
    LEFT JOIN CORE.CUSTOMERS c ON c.customer_id = {_CUSTOMER}
    LEFT JOIN win w ON w.account_id = a.account_id
    LEFT JOIN ring r ON r.account_id = a.account_id
    {{extra_joins}}
"""

_EDGE_KINDS = (("MONEY", "sent_money"), ("DEVICE", "shared_device"), ("IP", "shared_ip"), ("PHONE", "shared_phone"), ("MOBILE", "shared_phone"))


def _edge_kind(edge_type: str | None) -> str | None:
    t = (edge_type or "").upper()
    return next((kind for key, kind in _EDGE_KINDS if key in t), None)


def _opt_dt(v) -> datetime | None:
    return _naive(v) if v is not None else None


def _variant(v) -> dict | None:
    if v is None:
        return None
    if isinstance(v, dict):
        return v
    try:
        parsed = json.loads(v)
    except (TypeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


class SnowflakeAlertRepository(AlertRepository):
    """Snowflake implementation of AlertRepository"""

    def __init__(self, session: Session):
        self.session = session

    @staticmethod
    def _to_alert(row) -> Alert:
        created_at = _naive(row['CREATED_AT'])
        return Alert(
            alert_id=row['ALERT_ID'],
            account_id=row['ACCOUNT_ID'],
            customer_id=row['CUSTOMER_ID'],
            typology=row['TYPOLOGY'],
            severity=row['SEVERITY'],
            score=float(row['SCORE'] or 0),
            status=row['STATUS'],
            rule_name=row['RULE_NAME'],
            citation=row['CITATION'],
            created_at=created_at,
            resolution=row['RESOLUTION'],
            customer_name=row['CUSTOMER_NAME'],
            pan=row['PAN'],
            amount_inr=float(row['AMOUNT_INR']) if row['AMOUNT_INR'] is not None else None,
            txn_count=int(row['TXN_COUNT']) if row['TXN_COUNT'] is not None else None,
            due_at=policies.report_due(created_at),
            str_filed=policies.str_filed(row['STATUS'], row['RESOLUTION'], row['ACTION_REQUIRED']),
            risk_level=policies.risk_level(row['SEVERITY'], row['SCORE']),
            ring_id=row['RING_ID'],
            window_start=_opt_dt(row['WINDOW_START']),
            window_end=_opt_dt(row['WINDOW_END']),
            branch=row['BRANCH_CODE'],
            city=row['CITY'],
            action_required=row['ACTION_REQUIRED'],
            txn_id=row['TXN_ID'],
        )

    def _select(self, where: str, params: list, *, columns: str = _COLUMNS, extra_joins: str = "",
                win_filter: str = "", win_params: list | None = None, tail: str = ""):
        sql = _FROM.format(win_filter=win_filter, columns=columns, extra_joins=extra_joins) + f" WHERE {where} {tail}"
        return self.session.sql(sql, params=(win_params or []) + params).collect()

    def as_of(self) -> datetime:
        return SnowflakeDashboardRepository(self.session).as_of()

    def get_alert(self, alert_id: str) -> Optional[Alert]:
        """Get a single alert by ID"""
        rows = self._select(
            "a.alert_id = ?", [alert_id],
            win_filter="AND account_id IN (SELECT account_id FROM CORE.ALERTS WHERE alert_id = ?)", win_params=[alert_id],
        )
        return self._to_alert(rows[0]) if rows else None

    def list_alerts(
        self,
        status: Optional[str] = None,
        severity: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
        typology: Optional[str] = None,
        due: Optional[str] = None,
        q: Optional[str] = None,
        sort: str = "priority",
        cutoffs: Optional[dict] = None,
    ) -> tuple[List[Alert], int]:
        """List alerts with filters; deadline filters and priority order run in SQL."""
        cut = cutoffs or policies.deadline_cutoffs(self.as_of())
        where, params = ["1 = 1"], []
        if status:
            where.append("a.status = ?")
            params.append(status)
        if severity:
            where.append("a.severity = ?")
            params.append(severity)
        if typology:
            where.append("a.typology = ?")
            params.append(typology)
        if due in ("overdue", "48h", "open"):
            where.append("a.status <> 'CLOSED'")
        if due == "overdue":
            where.append("a.created_at < ?")
            params.append(cut["overdue_before"])
        elif due == "48h":
            where.append("a.created_at >= ? AND a.created_at < ?")
            params += [cut["overdue_before"], cut["due_48h_before"]]
        if q and q.strip():
            where.append("(a.alert_id ILIKE ? OR a.account_id ILIKE ? OR c.customer_name ILIKE ? OR c.city ILIKE ?)")
            params += [f"%{q.strip()}%"] * 4

        if sort == "amount":
            order, order_params = "w.amount_inr DESC NULLS LAST, a.created_at DESC", []
        elif sort == "newest":
            order, order_params = "a.created_at DESC", []
        else:
            # Open first, then by how close the report deadline is, then how serious.
            order = f"""
                IFF(a.status = 'CLOSED', 0, 1) DESC,
                CASE WHEN a.status = 'CLOSED' THEN 0
                     WHEN a.created_at < ? THEN 3 WHEN a.created_at < ? THEN 2 WHEN a.created_at < ? THEN 1
                     ELSE 0 END DESC,
                {_SEVERITY_RANK.format(col='a.severity')} DESC, a.score DESC, a.created_at ASC
            """
            order_params = [cut["overdue_before"], cut["due_48h_before"], cut["attention_before"]]

        rows = self.session.sql(
            _FROM.format(win_filter="", columns=_COLUMNS + ", COUNT(*) OVER () AS total_count", extra_joins="")
            + f" WHERE {' AND '.join(where)} ORDER BY {order} LIMIT {int(limit)} OFFSET {int(offset)}",
            params=params + order_params,
        ).collect()
        total = int(rows[0]['TOTAL_COUNT']) if rows else 0
        if not rows and offset:
            # Past the last page: still report the real total.
            total = int(self.session.sql(
                _FROM.format(win_filter="", columns="COUNT(*) AS n", extra_joins="") + f" WHERE {' AND '.join(where)}",
                params=params,
            ).collect()[0]['N'])
        return [self._to_alert(r) for r in rows], total

    def get_alert_detail(self, alert_id: str) -> Optional[AlertDetail]:
        """Alert + story + reasons, a 30-day timeline, transactions, ring connections and the cited paragraph."""
        rows = self._select(
            "a.alert_id = ?", [alert_id],
            columns=_COLUMNS + ", a.reasons, s.story_en, s.story_hi",
            extra_joins="LEFT JOIN AI.ALERT_STORIES s ON s.alert_id = a.alert_id",
            win_filter="AND account_id IN (SELECT account_id FROM CORE.ALERTS WHERE alert_id = ?)", win_params=[alert_id],
        )
        if not rows:
            return None
        row = rows[0]
        alert = self._to_alert(row)
        transactions = self._transactions(alert)
        return AlertDetail(
            alert=alert,
            story_en=policies.fill_customer(row['STORY_EN'], alert.customer_name),
            story_hi=policies.fill_customer(row['STORY_HI'], alert.customer_name, "hi"),
            txn_count=alert.txn_count or 0,
            total_amount_inr=alert.amount_inr or 0.0,
            reasons=policies.alert_reasons(alert.typology, alert.amount_inr, alert.txn_count, _variant(row['REASONS'])),
            timeline=self._timeline(alert, transactions),
            transactions=transactions,
            connections=self._connections(alert),
            citation_ref=self._citation(alert.citation),
        )

    def _transactions(self, alert: Alert, limit: int = 50) -> list[TxnFact]:
        """The account's last 30 days (newest first), always including the alert's own transaction."""
        rows = self.session.sql(
            f"""
            SELECT txn_id, account_id, txn_ts, amount_inr, channel, direction,
                   counterparty, counterparty_bank, country, narration
            FROM CORE.TRANSACTIONS
            WHERE (account_id = ? AND txn_ts >= {_WINDOW_START}) OR txn_id = ?
            ORDER BY IFF(txn_id = ?, 0, 1), txn_ts DESC
            LIMIT {int(limit)}
            """,
            params=[alert.account_id, alert.txn_id or "", alert.txn_id or ""],
        ).collect()
        txns = [
            TxnFact(
                txn_id=r['TXN_ID'], account_id=r['ACCOUNT_ID'], txn_ts=_naive(r['TXN_TS']),
                amount_inr=float(r['AMOUNT_INR'] or 0), channel=r['CHANNEL'], direction=r['DIRECTION'],
                counterparty=r['COUNTERPARTY'], counterparty_bank=r['COUNTERPARTY_BANK'],
                country=r['COUNTRY'], narration=r['NARRATION'],
            )
            for r in rows
        ]
        return sorted(txns, key=lambda t: t.txn_ts, reverse=True)

    def _timeline(self, alert: Alert, txns: list[TxnFact], max_txns: int = 15) -> list[TimelineFact]:
        """Recent transactions + payees added in the window + the alert itself, oldest first.

        The alert's own transaction (CORE.ALERTS.TXN_ID) is the one marked suspicious;
        nothing is marked when the rule didn't record one."""
        shown = txns[:max_txns]
        if alert.txn_id and all(t.txn_id != alert.txn_id for t in shown):
            shown += [t for t in txns if t.txn_id == alert.txn_id]
        events: list[TimelineFact] = []
        for t in shown:
            kind = policies.classify_timeline_event(t.channel, t.direction)
            en, hi = policies.timeline_title(kind, t.counterparty, t.channel)
            events.append(TimelineFact(
                id=t.txn_id, at=t.txn_ts, type=kind, title=en, title_hi=hi,
                detail=t.counterparty_bank or None, amount_inr=t.amount_inr, suspicious=t.txn_id == alert.txn_id,
            ))
        payees = self.session.sql(
            f"""
            SELECT beneficiary_id, beneficiary_name, beneficiary_bank, added_at
            FROM CORE.BENEFICIARIES
            WHERE account_id = ? AND added_at >= {_WINDOW_START}
            ORDER BY added_at DESC LIMIT 5
            """,
            params=[alert.account_id],
        ).collect()
        for p in payees:
            name = p['BENEFICIARY_NAME'] or ""
            events.append(TimelineFact(
                id=str(p['BENEFICIARY_ID']), at=_naive(p['ADDED_AT']), type="new_beneficiary",
                title=f"Added payee {name}".strip(), title_hi=f"नया प्राप्तकर्ता जोड़ा: {name}".strip(),
                detail=p['BENEFICIARY_BANK'] or None,
            ))
        events.append(TimelineFact(id=f"{alert.alert_id}-alert", at=alert.created_at, type="alert", title="Alert raised", title_hi="अलर्ट बना"))
        return sorted(events, key=lambda e: e.at)

    def _connections(self, alert: Alert, max_nodes: int = 12) -> Optional[GraphFact]:
        """Ring members (subject first) and the shared device/IP/phone links between them.
        None when the account isn't in a known ring."""
        if not alert.ring_id:
            return None
        members = self.session.sql(
            f"""
            SELECT rm.account_id, MAX(c.customer_name) AS customer_name, MAX(c.city) AS city,
                   MAX({_SEVERITY_RANK.format(col='al.severity')}) AS risk, MAX(al.alert_id) AS alert_id
            FROM CORE.RING_MEMBERS rm
            LEFT JOIN CORE.ACCOUNTS acc ON acc.account_id = rm.account_id
            LEFT JOIN CORE.CUSTOMERS c ON c.customer_id = acc.customer_id
            LEFT JOIN CORE.ALERTS al ON al.account_id = rm.account_id AND al.status <> 'CLOSED'
            WHERE rm.ring_id = ?
            GROUP BY rm.account_id
            ORDER BY IFF(rm.account_id = ?, 0, 1), MAX(al.alert_id) IS NULL, rm.account_id
            LIMIT {int(max_nodes)}
            """,
            params=[alert.ring_id, alert.account_id],
        ).collect()
        nodes = [
            GraphNodeFact(
                id=m['ACCOUNT_ID'],
                label=m['CUSTOMER_NAME'] or m['ACCOUNT_ID'],
                # Members without an open alert show as low risk; the ring itself is the signal.
                risk_level=(alert.risk_level or 3) if m['ACCOUNT_ID'] == alert.account_id else (int(m['RISK'] or 1) if m['ALERT_ID'] else 2),
                kind="subject" if m['ACCOUNT_ID'] == alert.account_id else "member",
                city=m['CITY'],
                alert_id=m['ALERT_ID'],
            )
            for m in members
        ]
        ids = [n.id for n in nodes]
        edges: list[GraphEdgeFact] = []
        if len(ids) > 1:
            marks = ", ".join("?" * len(ids))
            seen: set[tuple[str, str, str]] = set()
            for e in self.session.sql(
                f"SELECT account_a, account_b, edge_type FROM CORE.ACCOUNT_EDGES WHERE account_a IN ({marks}) AND account_b IN ({marks})",
                params=ids + ids,
            ).collect():
                kind = _edge_kind(e['EDGE_TYPE'])
                a, b = sorted((e['ACCOUNT_A'], e['ACCOUNT_B']))
                if kind and a != b and (a, b, kind) not in seen:
                    seen.add((a, b, kind))
                    edges.append(GraphEdgeFact(source=a, target=b, kind=kind))
        return GraphFact(nodes=nodes, edges=edges)

    def _citation(self, citation: str | None) -> Optional[CitationRefFact]:
        parsed = policies.parse_citation(citation)
        if not parsed:
            return None
        circular_no, para_no = parsed
        rows = self.session.sql(
            "SELECT text FROM AI.REG_CHUNKS WHERE circular_no = ? AND para_no = ? LIMIT 1",
            params=[circular_no, int(para_no)],
        ).collect()
        return CitationRefFact(circular_no=circular_no, para_no=para_no, highlight=policies.pick_highlight(rows[0]['TEXT']) if rows else None)

    def set_resolution(self, alert_id: str, resolution: str) -> bool:
        rows = self.session.sql(
            "UPDATE CORE.ALERTS SET status = 'CLOSED', resolution = ?, resolved_at = CURRENT_TIMESTAMP() WHERE alert_id = ?",
            params=[resolution, alert_id],
        ).collect()
        return bool(rows and rows[0][0])

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
        counts=AlertCounts(new_24h=14, new_same_day_last_week=7, serious_new_24h=9, money_at_risk_inr=2.9e8, money_at_risk_week_ago_inr=2.6e8, overdue=4, due_48h=3, open_reports=40),
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
        total_rules=20,
        open_conflicts=9,
        first_open_conflict_id="CONF-1",
        week=WeekSummary(alerts=62, amount_inr=2.65e8, confirmed_fraud=1, top_typology="RAPID_PASSTHROUGH"),
    )


# ───────────── Alerts ─────────────

from app.domain import policies  # noqa: E402
from app.domain.entities import (  # noqa: E402
    Alert,
    AlertDetail,
    CitationRefFact,
    GraphEdgeFact,
    GraphFact,
    GraphNodeFact,
    TimelineFact,
    TxnFact,
)

_SEV = {"CRITICAL": 5, "HIGH": 4, "MEDIUM": 3, "LOW": 2}
PARA = (
    "All attempts of cash deposits in amounts ranging from Rs. 9,00,000 to Rs. 9,99,999 conducted more than "
    "three times in a rolling 30-day period by the same customer or linked accounts shall be flagged as "
    "potential structuring and reported as STR."
)


def _alert(alert_id, days_old, typology, severity, score, status="NEW", resolution=None, ring_id=None, amount=None, name=None, city="Pune"):
    created = AS_OF - timedelta(days=days_old)
    return Alert(
        alert_id=alert_id, account_id=f"ACC-{alert_id[-3:]}", customer_id=f"CUST-{alert_id[-3:]}",
        typology=typology, severity=severity, score=score, status=status, rule_name=f"{typology}_RULE",
        citation="KAVACH/2024/01 para 2", created_at=created, resolution=resolution,
        customer_name=name or f"Customer {alert_id[-3:]}", pan="ABCDE1234F",
        amount_inr=amount, txn_count=4 if amount else None, due_at=policies.report_due(created),
        str_filed=policies.str_filed(status, resolution, "STR"), risk_level=policies.risk_level(severity, score),
        ring_id=ring_id, window_start=AS_OF - timedelta(days=30) if amount else None, window_end=AS_OF if amount else None,
        branch="BR0106", city=city, action_required="STR", txn_id=f"TXN-{alert_id[-3:]}-2",
    )


class FakeAlertRepository:
    """In-memory alerts covering each deadline band, a ring member, a closed/filed
    alert and one with no transactions (so no amount and no volume reason)."""

    def __init__(self):
        self.alerts = [
            _alert("ALT-001", 12, "STRUCTURING", "HIGH", 0.85, amount=3_800_000, name="Priya Traders"),          # overdue
            _alert("ALT-002", 8, "MULE_RING", "HIGH", 0.95, ring_id="RING-A", amount=1_250_000, city="Mumbai"),  # due < 48 h
            _alert("ALT-003", 1, "ROUND_TRIPPING", "MEDIUM", 0.65, amount=9_900_000),                            # new, not due soon
            _alert("ALT-004", 20, "STRUCTURING", "HIGH", 0.9, status="CLOSED", resolution="TRUE_POSITIVE", amount=2_000_000),
            _alert("ALT-005", 2, "DORMANT_REACTIVATION", "LOW", 0.3),                                           # no transactions
        ]
        self.resolutions: dict[str, str] = {}
        self.last_cutoffs: dict | None = None

    def as_of(self) -> datetime:
        return AS_OF

    def get_alert(self, alert_id):
        return next((a for a in self.alerts if a.alert_id == alert_id), None)

    def list_alerts(self, status=None, severity=None, limit=20, offset=0, typology=None, due=None, q=None, sort="priority", cutoffs=None):
        cut = cutoffs or policies.deadline_cutoffs(AS_OF)
        self.last_cutoffs = cut
        rows = [a for a in self.alerts if (not status or a.status == status) and (not severity or a.severity == severity) and (not typology or a.typology == typology)]
        if due in ("overdue", "48h", "open"):
            rows = [a for a in rows if a.status != "CLOSED"]
        if due == "overdue":
            rows = [a for a in rows if a.created_at < cut["overdue_before"]]
        elif due == "48h":
            rows = [a for a in rows if cut["overdue_before"] <= a.created_at < cut["due_48h_before"]]
        if q:
            needle = q.lower()
            rows = [a for a in rows if needle in f"{a.alert_id} {a.account_id} {a.customer_name} {a.city}".lower()]

        def urgency(a):
            if a.status == "CLOSED":
                return 0
            return 3 if a.created_at < cut["overdue_before"] else 2 if a.created_at < cut["due_48h_before"] else 1 if a.created_at < cut["attention_before"] else 0

        if sort == "amount":
            rows.sort(key=lambda a: -(a.amount_inr or -1))
        elif sort == "newest":
            rows.sort(key=lambda a: a.created_at, reverse=True)
        else:
            rows.sort(key=lambda a: (a.status != "CLOSED", urgency(a), _SEV.get(a.severity, 1), a.score, -a.created_at.timestamp()), reverse=True)
        return rows[offset:offset + limit], len(rows)

    def get_alert_detail(self, alert_id):
        a = self.get_alert(alert_id)
        if not a:
            return None
        txns = [] if not a.amount_inr else [
            TxnFact(f"TXN-{a.alert_id[-3:]}-{i}", a.account_id, AS_OF - timedelta(days=5 - i), a.amount_inr / 4,
                    "CASH" if i < 3 else "NEFT", "CREDIT" if i < 3 else "DEBIT", None if i < 3 else "R. Traders", "HDFC Bank", "IN", "")
            for i in range(4)
        ]
        timeline = []
        for t in txns:
            kind = policies.classify_timeline_event(t.channel, t.direction)
            en, hi = policies.timeline_title(kind, t.counterparty, t.channel)
            timeline.append(TimelineFact(t.txn_id, t.txn_ts, kind, en, hi, t.counterparty_bank, t.amount_inr, t.txn_id == a.txn_id))
        timeline.append(TimelineFact(f"{a.alert_id}-alert", a.created_at, "alert", "Alert raised", "अलर्ट बना"))
        connections = GraphFact(
            nodes=[GraphNodeFact(a.account_id, a.customer_name, a.risk_level, "subject", a.city, a.alert_id),
                   GraphNodeFact("ACC-900", "Member 900", 4, "member", "Mumbai", "ALT-900"),
                   GraphNodeFact("ACC-901", "Member 901", 2, "member")],
            edges=[GraphEdgeFact(a.account_id, "ACC-900", "shared_device"), GraphEdgeFact("ACC-900", "ACC-901", "shared_ip")],
        ) if a.ring_id else None
        return AlertDetail(
            alert=a, story_en="Here is a 3-5 sentence story in simple English: Test story.", story_hi="परीक्षण कहानी।",
            txn_count=a.txn_count or 0, total_amount_inr=a.amount_inr or 0.0,
            reasons=policies.alert_reasons(a.typology, a.amount_inr, a.txn_count, {"rule_hit": a.rule_name, "details": "{'CNT': 4, 'TOT"}),
            timeline=sorted(timeline, key=lambda e: e.at), transactions=txns, connections=connections,
            citation_ref=CitationRefFact("KAVACH/2024/01", "2", policies.pick_highlight(PARA)),
        )

    def set_resolution(self, alert_id, resolution):
        if not self.get_alert(alert_id):
            return False
        self.resolutions[alert_id] = resolution
        return True


# ───────────── Rings ─────────────

from app.domain.entities import Ring, RingDetail  # noqa: E402


class FakeRingRepository:
    def __init__(self):
        self.ring = Ring("RING-0001", policies.ring_name("RING-0001"), 3, 4_500_000.0, 0.93, "HIGH", confidence="HIGH",
                         speed_hours=0.32, detected_at=AS_OF, alerted_members=1, shared_devices=2, city="Madurai")

    def list_rings(self, limit=20, offset=0):
        return [self.ring][offset:offset + limit], 1

    def get_ring(self, ring_id):
        return self.ring if ring_id == self.ring.ring_id else None

    def get_ring_detail(self, ring_id):
        if ring_id != self.ring.ring_id:
            return None
        money = {"ACC-1": (3e6, 1e6), "ACC-2": (1e6, 2.9e6), "ACC-3": (1.5e6, 1.4e6)}
        roles = policies.ring_roles(money)
        members = [GraphNodeFact(a, f"Member {a[-1]}", 4, "member", "Madurai", "ALT-001" if a == "ACC-1" else None, roles[a], i, o)
                   for a, (i, o) in money.items()]
        edges = [GraphEdgeFact("ACC-1", "ACC-2", "sent_money", 1e6, 3), GraphEdgeFact("ACC-1", "ACC-3", "shared_device", count=2)]
        txns = [TxnFact("TXN-9", "ACC-1", AS_OF - timedelta(days=3), 1e6, "IMPS", "DEBIT", "ACC-2", "KAVACH", "IN", "IMPS payment")]
        return RingDetail(self.ring, members, edges, txns)


# ───────────── Rules ─────────────

from app.domain.entities import Rule, RuleConflict, RuleHealthRow, UploadJob  # noqa: E402

STRUCT_SQL = ("SELECT 1 FROM t WHERE t.CHANNEL = 'CASH' AND t.DIRECTION = 'CREDIT' AND t.AMOUNT_INR BETWEEN 900000 AND 999999 "
              "AND t.TXN_TS >= DATEADD('day', -30, x) GROUP BY 1 HAVING COUNT(*) >= 3")
CTR_SQL = "SELECT 1 FROM t WHERE t.CHANNEL = 'CASH' AND t.AMOUNT_INR >= 1000000 AND t.TXN_TS >= DATEADD('day', -30, x)"


def _rule(rid, typ, sql, status="PENDING_APPROVAL", para="2", version=1, cite=None):
    return Rule(rid, f"{typ}_KAVACH_2024_01_{para}", version, typ, sql, status, cite or f"KAVACH/2024/01 para {para}", AS_OF,
                entity="TXN", params={"min_amount": 900000, "max_amount": 999999, "max_frequency": 3} if typ == "STRUCTURING" else {"amount": 1000000},
                severity="HIGH", circular_no="KAVACH/2024/01", para_no=para, source_text=PARA)


class FakeRuleRepository:
    def __init__(self):
        self.rules = [_rule("RL-1", "STRUCTURING", STRUCT_SQL), _rule("RL-2", "CASH_REPORTING", CTR_SQL, para="1"),
                      _rule("RL-3", "STRUCTURING", STRUCT_SQL.replace("900000 AND 999999", "1300000 AND 1499999"), version=2,
                            cite="KAVACH/2025/01 (amends KAVACH/2024/01)")]
        self.jobs: dict[str, UploadJob] = {}
        self.fail_at: str | None = None

    def list_rules(self, status=None, limit=20, offset=0):
        rows = [r for r in self.rules if not status or r.status == status]
        return rows[offset:offset + limit], len(rows)

    def get_rule(self, rule_id):
        return next((r for r in self.rules if r.rule_id == rule_id), None)

    def approve_rule(self, rule_id, user):
        r = self.get_rule(rule_id)
        if r:
            r.status, r.approved_by = "APPROVED", user
        return bool(r)

    def reject_rule(self, rule_id, user, reason):
        r = self.get_rule(rule_id)
        if r:
            r.status, r.rejection_reason = "REJECTED", reason
        return bool(r)

    def rule_versions(self, rule_id):
        return [self.rules[0], self.rules[2]] if rule_id in ("RL-1", "RL-3") else ([self.get_rule(rule_id)] if self.get_rule(rule_id) else [])

    def conflicts(self):
        return [RuleConflict("CONF-1", "STRUCTURING", "TXN", "Different limits", "OPEN", AS_OF, self.rules[0], self.rules[2])]

    def health_counts(self):
        return ({"total": 3, "active": 0, "pending": 3, "rejected": 0},
                [RuleHealthRow("RL-2", "CTR", "CASH_REPORTING", 500, 10, 40), RuleHealthRow("RL-1", "STR", "STRUCTURING", 12, 6, 2),
                 RuleHealthRow("RL-3", "STR2", "STRUCTURING", 0, 0, 0)])

    def evaluation(self):
        return {"coverage": [{"typology": "MULE_RING", "fraud_cases": 29, "caught_by_rules": 1, "caught_in_top_50": 0}],
                "precision": 0.011, "recall": 0.099, "test_set_size": 161, "source": "RAW.GROUND_TRUTH"}

    def create_job(self, job_id, filename):
        self.jobs[job_id] = UploadJob(job_id, filename, "RUNNING", 0, 5, "Reading the circular")

    def update_job(self, job_id, *, status, step, progress, message, circular_no=None, rule_ids=None):
        j = self.jobs[job_id]
        j.status, j.step, j.progress, j.message = status, step, progress, message
        j.circular_no = circular_no or j.circular_no
        if rule_ids is not None:
            j.rule_ids = rule_ids

    def get_job(self, job_id):
        return self.jobs.get(job_id)

    def _maybe_fail(self, step):
        if self.fail_at == step:
            raise RuntimeError("boom")

    def store_upload(self, filename, data):
        self._maybe_fail("store")
        return f"uploads/{filename}"

    def parse_upload(self, rel):
        self._maybe_fail("parse")
        return "KAVACH/2026/09"

    def extract_obligations(self, circular_no):
        self._maybe_fail("extract")
        return "OK"

    def compile_checks(self, circular_no):
        self._maybe_fail("compile")
        return ["RL-9", "RL-10"]

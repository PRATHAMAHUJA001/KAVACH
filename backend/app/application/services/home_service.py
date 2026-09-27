"""
Today dashboard use case: turns DashboardFacts into KPIs, a readiness score with its
reasons, the "needs your attention" list, the 30-day trend and a one-paragraph brief.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from app.domain.dashboard import DashboardFacts
from app.domain.labels import typology_phrase
from app.domain.policies import created_before_for_due_by, format_inr_compact, readiness, report_due, ring_name
from app.domain.repositories import DashboardRepository


@dataclass
class HomeView:
    readiness_score: dict
    top_alerts: list[dict]
    trend: list[dict]
    kpis: dict
    attention: list[dict]
    weekly_brief: dict
    as_of: str


class HomeService:
    def __init__(self, repo: DashboardRepository):
        self.repo = repo

    def build(self) -> HomeView:
        now = self.repo.as_of()
        facts = self.repo.facts(
            now=now,
            overdue_before=created_before_for_due_by(now),
            due_48h_before=created_before_for_due_by(now + timedelta(hours=48)),
        )
        return self.compose(facts)

    @staticmethod
    def compose(f: DashboardFacts) -> HomeView:
        c = f.counts
        r = readiness(
            c.overdue, c.due_48h, f.pending_rules, f.open_conflicts,
            open_reports=c.open_reports, total_rules=f.total_rules,
        )

        attention: list[dict] = []
        for a in f.urgent[:2]:
            attention.append(_alert_item("report_overdue", "overdue", a))
        for a in f.due_soon[:1]:
            attention.append(_alert_item("report_due", "act", a))
        high = sorted(
            (x for x in f.active_rings if (x.confidence or "").upper() == "HIGH"),
            key=lambda x: x.detected_at.timestamp() if x.detected_at else 0,
            reverse=True,
        )
        if high:
            ring = high[0]
            attention.append({
                "id": f"att-{ring.ring_id}", "kind": "ring_new", "status": "attention", "entity_id": ring.ring_id,
                "params": {"name": ring.ring_name, "name_hi": ring_name(ring.ring_id, "hi"), "amount_inr": ring.volume_inr, "count": ring.member_count},
            })
        if f.pending_rules and f.first_pending_rule_id:
            attention.append({"id": "att-rules", "kind": "rule_pending", "status": "attention", "entity_id": f.first_pending_rule_id, "params": {"count": f.pending_rules}})
        if len(attention) < 5 and f.open_conflicts and f.first_open_conflict_id:
            attention.append({"id": "att-conflicts", "kind": "conflict_open", "status": "attention", "entity_id": f.first_open_conflict_id, "params": {"count": f.open_conflicts}})

        biggest = max(f.active_rings, key=lambda x: x.volume_inr, default=None)
        w = f.week
        fraud_verb = "has" if w.confirmed_fraud == 1 else "have"
        brief_en = (
            f"This week KAVACH raised {w.alerts} alerts involving {format_inr_compact(w.amount_inr)}. "
            f"{w.confirmed_fraud} of them {fraud_verb} been confirmed as fraud so far"
            + (f", most often {typology_phrase(w.top_typology)}. " if w.top_typology else ". ")
            + (f"{biggest.ring_name} is the largest active group, moving {format_inr_compact(biggest.volume_inr)} through {biggest.member_count} accounts. " if biggest else "")
            + (f"{c.overdue} reports are overdue — clear those first." if c.overdue else "All reports are on time.")
        )
        brief_hi = (
            f"इस हफ़्ते KAVACH ने {w.alerts} अलर्ट बनाए, जिनमें {format_inr_compact(w.amount_inr, 'hi')} शामिल हैं। "
            f"अब तक {w.confirmed_fraud} को धोखाधड़ी माना गया है"
            + (f", सबसे ज़्यादा \"{typology_phrase(w.top_typology, 'hi')}\" वाले। " if w.top_typology else "। ")
            + (f"{biggest.ring_name} सबसे बड़ा सक्रिय समूह है, जिसने {biggest.member_count} खातों से {format_inr_compact(biggest.volume_inr, 'hi')} घुमाए। " if biggest else "")
            + (f"{c.overdue} रिपोर्ट की समय सीमा निकल चुकी है — पहले उन्हें निपटाएँ।" if c.overdue else "सभी रिपोर्ट समय पर हैं।")
        )

        return HomeView(
            readiness_score={
                "score": r.score,
                "reason": r.reason_en,
                "reason_hi": r.reason_hi,
                "factors": [{"key": x.key, "count": x.count, "points": x.points} for x in r.factors],
            },
            top_alerts=[
                {"alert_id": a.alert_id, "account_id": a.account_id, "typology": a.typology, "severity": a.severity, "score": a.score, "created_at": a.created_at.isoformat()}
                for a in sorted(f.urgent + f.due_soon, key=lambda a: a.score, reverse=True)[:5]
            ],
            trend=[{"date": t.day.isoformat(), "alert_count": t.alert_count, "confirmed_fraud": t.confirmed_fraud} for t in f.trend],
            kpis={
                "new_alerts": c.new_24h,
                "new_alerts_prev": c.new_same_day_last_week,
                "serious_new_alerts": c.serious_new_24h,
                "money_at_risk_inr": c.money_at_risk_inr,
                "money_at_risk_prev_inr": c.money_at_risk_week_ago_inr,
                "reports_due_48h": c.due_48h,
                "reports_overdue": c.overdue,
                "active_rings": len(f.active_rings),
                "active_rings_prev": f.active_rings_week_ago,
                "ring_volume_30d_inr": sum(x.volume_inr for x in f.active_rings),
            },
            attention=attention[:5],
            weekly_brief={"text": brief_en, "text_hi": brief_hi, "generated_at": f.as_of.isoformat()},
            as_of=f.as_of.isoformat(),
        )


def _alert_item(kind: str, status: str, a) -> dict:
    return {
        "id": f"att-{a.alert_id}",
        "kind": kind,
        "status": status,
        "entity_id": a.alert_id,
        "params": {
            "name": a.customer_name or a.account_id,
            "amount_inr": a.amount_inr,
            "due_at": report_due(a.created_at).isoformat(),
            "typology": a.typology,
        },
    }

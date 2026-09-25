from datetime import timedelta

from app.application.services.home_service import HomeService
from app.domain.policies import created_before_for_due_by, report_due
from tests.fakes import AS_OF, FakeDashboardRepository


def test_builds_kpis_and_attention():
    repo = FakeDashboardRepository()
    view = HomeService(repo).build()

    now, overdue_before, due_before = repo.calls[0]
    assert now == AS_OF and overdue_before == created_before_for_due_by(AS_OF)
    assert view.kpis["new_alerts"] == 14 and view.kpis["reports_overdue"] == 4
    assert view.kpis["active_rings"] == 2 and view.kpis["ring_volume_30d_inr"] == 8.96e6 + 2.6e7

    kinds = [a["kind"] for a in view.attention]
    assert kinds == ["report_overdue", "report_overdue", "report_due", "ring_new", "rule_pending"]
    assert view.attention[0]["params"]["due_at"] == report_due(AS_OF - timedelta(days=20)).isoformat()
    assert view.attention[3]["entity_id"] == "RING-A"  # newest HIGH-confidence ring


def test_readiness_and_brief_are_bilingual():
    view = HomeService(FakeDashboardRepository()).build()
    assert view.readiness_score["score"] == 69
    assert view.readiness_score["reason_hi"]
    assert "1 of them has been confirmed" in view.weekly_brief["text"]
    assert "करोड़" in view.weekly_brief["text_hi"]
    assert len(view.trend) == 30

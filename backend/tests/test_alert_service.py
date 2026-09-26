"""
Unit tests for AlertService with fake repository
"""
import pytest

from app.application.services.alert_service import AlertService
from app.domain.policies import deadline_cutoffs
from tests.fakes import AS_OF, FakeAlertRepository


class TestAlertService:
    """Test cases for AlertService"""

    def setup_method(self):
        self.fake_repo = FakeAlertRepository()
        self.service = AlertService(self.fake_repo)

    def test_get_alert_success(self):
        alert = self.service.get_alert("ALT-001")
        assert alert is not None
        assert alert.account_id == "ACC-001"
        assert alert.severity == "HIGH"

    def test_get_alert_not_found(self):
        assert self.service.get_alert("ALT-999") is None

    def test_list_alerts_no_filters(self):
        alerts, total, total_pages = self.service.list_alerts(page=1, page_size=10)
        assert len(alerts) == 5
        assert total == 5
        assert total_pages == 1

    def test_list_alerts_with_status_filter(self):
        alerts, total, _ = self.service.list_alerts(status="CLOSED", page=1, page_size=10)
        assert [a.alert_id for a in alerts] == ["ALT-004"]
        assert total == 1

    def test_list_alerts_with_severity_filter(self):
        alerts, total, _ = self.service.list_alerts(severity="HIGH", page=1, page_size=10)
        assert total == 3
        assert all(a.severity == "HIGH" for a in alerts)

    def test_list_alerts_pagination(self):
        alerts, total, total_pages = self.service.list_alerts(page=1, page_size=2)
        assert (len(alerts), total, total_pages) == (2, 5, 3)
        alerts, total, total_pages = self.service.list_alerts(page=3, page_size=2)
        assert (len(alerts), total, total_pages) == (1, 5, 3)

    def test_deadlines_measured_against_as_of(self):
        self.service.list_alerts()
        assert self.fake_repo.last_cutoffs == deadline_cutoffs(AS_OF)

    @pytest.mark.parametrize("due, expected", [
        ("overdue", ["ALT-001"]),
        ("48h", ["ALT-002"]),
        ("open", ["ALT-001", "ALT-002", "ALT-003", "ALT-005"]),
    ])
    def test_due_filter(self, due, expected):
        alerts, total, _ = self.service.list_alerts(due=due)
        assert [a.alert_id for a in alerts] == expected
        assert total == len(expected)

    def test_priority_sort_open_then_deadline_then_severity(self):
        alerts, _, _ = self.service.list_alerts(sort="priority")
        assert [a.alert_id for a in alerts] == ["ALT-001", "ALT-002", "ALT-003", "ALT-005", "ALT-004"]

    def test_amount_and_newest_sort(self):
        by_amount, _, _ = self.service.list_alerts(sort="amount")
        assert by_amount[0].alert_id == "ALT-003" and by_amount[-1].alert_id == "ALT-005"
        newest, _, _ = self.service.list_alerts(sort="newest")
        assert newest[0].alert_id == "ALT-003"

    def test_typology_and_text_search(self):
        alerts, _, _ = self.service.list_alerts(typology="STRUCTURING")
        assert {a.alert_id for a in alerts} == {"ALT-001", "ALT-004"}
        alerts, _, _ = self.service.list_alerts(q="priya")
        assert [a.alert_id for a in alerts] == ["ALT-001"]
        alerts, _, _ = self.service.list_alerts(q="mumbai")
        assert [a.alert_id for a in alerts] == ["ALT-002"]

    def test_get_alert_detail_success(self):
        detail = self.service.get_alert_detail("ALT-001")
        assert detail is not None
        assert detail.txn_count == 4
        assert detail.total_amount_inr == 3_800_000
        assert len(detail.reasons) == 2  # pattern + volume; the dict-dump details are not shown
        assert any(e.suspicious for e in detail.timeline)
        assert detail.connections is None
        assert detail.citation_ref.highlight

    def test_get_alert_detail_ring_member_and_no_transactions(self):
        assert len(self.service.get_alert_detail("ALT-002").connections.nodes) == 3
        empty = self.service.get_alert_detail("ALT-005")
        assert empty.transactions == [] and len(empty.reasons) == 1

    def test_get_alert_detail_not_found(self):
        assert self.service.get_alert_detail("ALT-999") is None

    def test_record_verdict(self):
        assert self.service.record_verdict("ALT-003", "FRAUD") == "TRUE_POSITIVE"
        assert self.service.record_verdict("ALT-005", "NOT_FRAUD") == "FALSE_POSITIVE"
        assert self.fake_repo.resolutions == {"ALT-003": "TRUE_POSITIVE", "ALT-005": "FALSE_POSITIVE"}
        assert self.service.record_verdict("ALT-999", "FRAUD") is None

"""
Unit tests for AlertService with fake repository
"""
import pytest
from datetime import datetime
from typing import Optional, List
from app.domain.entities import Alert, AlertDetail
from app.domain.repositories import AlertRepository
from app.application.services.alert_service import AlertService


class FakeAlertRepository(AlertRepository):
    """Fake alert repository for testing"""
    
    def __init__(self):
        self.alerts = [
            Alert(
                alert_id="ALT-001",
                account_id="ACC-001",
                customer_id="CUST-001",
                typology="Structuring",
                severity="HIGH",
                score=0.85,
                status="OPEN",
                rule_name="STRUCTURING_RULE",
                citation="CIR-2024-001",
                created_at=datetime(2026, 9, 1, 10, 0, 0),
                resolution=None
            ),
            Alert(
                alert_id="ALT-002",
                account_id="ACC-002",
                customer_id="CUST-002",
                typology="Money Laundering",
                severity="CRITICAL",
                score=0.95,
                status="OPEN",
                rule_name="LAYERING_RULE",
                citation="CIR-2024-002",
                created_at=datetime(2026, 9, 2, 11, 0, 0),
                resolution=None
            ),
            Alert(
                alert_id="ALT-003",
                account_id="ACC-003",
                customer_id="CUST-003",
                typology="Round-Tripping",
                severity="MEDIUM",
                score=0.65,
                status="CLOSED",
                rule_name="ROUND_TRIP_RULE",
                citation="CIR-2024-003",
                created_at=datetime(2026, 9, 3, 12, 0, 0),
                resolution="False positive"
            )
        ]
    
    def get_alert(self, alert_id: str) -> Optional[Alert]:
        for alert in self.alerts:
            if alert.alert_id == alert_id:
                return alert
        return None
    
    def list_alerts(
        self,
        status: Optional[str] = None,
        severity: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> tuple[List[Alert], int]:
        filtered = self.alerts
        
        if status:
            filtered = [a for a in filtered if a.status == status]
        if severity:
            filtered = [a for a in filtered if a.severity == severity]
        
        total = len(filtered)
        paginated = filtered[offset:offset + limit]
        
        return paginated, total
    
    def get_alert_detail(self, alert_id: str) -> Optional[AlertDetail]:
        alert = self.get_alert(alert_id)
        if not alert:
            return None
        
        return AlertDetail(
            alert=alert,
            story_en="This is a test alert story in English.",
            story_hi="यह हिंदी में एक परीक्षण अलर्ट कहानी है।",
            txn_count=10,
            total_amount_inr=1000000.0
        )


class TestAlertService:
    """Test cases for AlertService"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.fake_repo = FakeAlertRepository()
        self.service = AlertService(self.fake_repo)
    
    def test_get_alert_success(self):
        """Test getting an alert that exists"""
        alert = self.service.get_alert("ALT-001")
        
        assert alert is not None
        assert alert.alert_id == "ALT-001"
        assert alert.account_id == "ACC-001"
        assert alert.severity == "HIGH"
    
    def test_get_alert_not_found(self):
        """Test getting an alert that doesn't exist"""
        alert = self.service.get_alert("ALT-999")
        
        assert alert is None
    
    def test_list_alerts_no_filters(self):
        """Test listing all alerts without filters"""
        alerts, total, total_pages = self.service.list_alerts(page=1, page_size=10)
        
        assert len(alerts) == 3
        assert total == 3
        assert total_pages == 1
    
    def test_list_alerts_with_status_filter(self):
        """Test listing alerts filtered by status"""
        alerts, total, total_pages = self.service.list_alerts(status="OPEN", page=1, page_size=10)
        
        assert len(alerts) == 2
        assert total == 2
        assert all(a.status == "OPEN" for a in alerts)
    
    def test_list_alerts_with_severity_filter(self):
        """Test listing alerts filtered by severity"""
        alerts, total, total_pages = self.service.list_alerts(severity="HIGH", page=1, page_size=10)
        
        assert len(alerts) == 1
        assert total == 1
        assert alerts[0].severity == "HIGH"
    
    def test_list_alerts_pagination(self):
        """Test alert pagination"""
        # First page
        alerts, total, total_pages = self.service.list_alerts(page=1, page_size=2)
        
        assert len(alerts) == 2
        assert total == 3
        assert total_pages == 2
        
        # Second page
        alerts, total, total_pages = self.service.list_alerts(page=2, page_size=2)
        
        assert len(alerts) == 1
        assert total == 3
        assert total_pages == 2
    
    def test_get_alert_detail_success(self):
        """Test getting alert detail"""
        detail = self.service.get_alert_detail("ALT-001")
        
        assert detail is not None
        assert detail.alert.alert_id == "ALT-001"
        assert detail.story_en is not None
        assert detail.story_hi is not None
        assert detail.txn_count == 10
        assert detail.total_amount_inr == 1000000.0
    
    def test_get_alert_detail_not_found(self):
        """Test getting detail for non-existent alert"""
        detail = self.service.get_alert_detail("ALT-999")
        
        assert detail is None

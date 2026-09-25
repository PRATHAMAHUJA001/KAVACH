"""
Alert application service
Business logic layer - orchestrates between presentation and domain
"""
from typing import Optional, List
from app.domain.repositories import AlertRepository
from app.domain.entities import Alert, AlertDetail


class AlertService:
    """Service for alert operations"""
    
    def __init__(self, alert_repo: AlertRepository):
        self.alert_repo = alert_repo
    
    def get_alert(self, alert_id: str) -> Optional[Alert]:
        """Get a single alert"""
        return self.alert_repo.get_alert(alert_id)
    
    def list_alerts(
        self,
        status: Optional[str] = None,
        severity: Optional[str] = None,
        page: int = 1,
        page_size: int = 20
    ) -> tuple[List[Alert], int, int]:
        """
        List alerts with pagination
        Returns (alerts, total_count, total_pages)
        """
        offset = (page - 1) * page_size
        alerts, total = self.alert_repo.list_alerts(
            status=status,
            severity=severity,
            limit=page_size,
            offset=offset
        )
        
        total_pages = (total + page_size - 1) // page_size
        return alerts, total, total_pages
    
    def get_alert_detail(self, alert_id: str) -> Optional[AlertDetail]:
        """Get detailed alert with story and transactions"""
        return self.alert_repo.get_alert_detail(alert_id)

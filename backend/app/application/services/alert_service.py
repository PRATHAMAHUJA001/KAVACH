"""
Alert application service
Business logic layer - orchestrates between presentation and domain
"""
from typing import Optional, List
from app.domain import policies
from app.domain.repositories import AlertRepository
from app.domain.entities import Alert, AlertDetail

VERDICT_RESOLUTION = {"FRAUD": "TRUE_POSITIVE", "NOT_FRAUD": "FALSE_POSITIVE"}


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
        page_size: int = 20,
        typology: Optional[str] = None,
        due: Optional[str] = None,
        q: Optional[str] = None,
        sort: str = "priority",
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
            offset=offset,
            typology=typology,
            due=due,
            q=q,
            sort=sort,
            # Deadlines are measured against the data's as-of date, as on Today.
            cutoffs=policies.deadline_cutoffs(self.alert_repo.as_of()),
        )

        total_pages = (total + page_size - 1) // page_size
        return alerts, total, total_pages

    def get_alert_detail(self, alert_id: str) -> Optional[AlertDetail]:
        """Get detailed alert with story and transactions"""
        return self.alert_repo.get_alert_detail(alert_id)

    def record_verdict(self, alert_id: str, verdict: str) -> Optional[str]:
        """Close the alert as confirmed fraud or a false alarm. Returns the resolution,
        or None when the alert doesn't exist."""
        resolution = VERDICT_RESOLUTION[verdict]
        return resolution if self.alert_repo.set_resolution(alert_id, resolution) else None

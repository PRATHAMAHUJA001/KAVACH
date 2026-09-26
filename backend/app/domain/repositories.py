"""
Repository protocols (interfaces) for the domain layer
Following dependency inversion principle
"""
from typing import Protocol, Optional, List
from datetime import datetime
from app.domain.entities import Alert, AlertDetail, Rule, Ring, RingDetail, Evidence
from app.domain.dashboard import DashboardFacts


class AlertRepository(Protocol):
    """Protocol for alert data access"""

    def as_of(self) -> datetime:
        """The data's "now" (same definition as the Today dashboard)."""
        ...

    def get_alert(self, alert_id: str) -> Optional[Alert]:
        """Get a single alert by ID"""
        ...

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
        """List alerts with filters. Returns (alerts, total_count).

        `due` is overdue | 48h | open. `cutoffs` holds the created-at thresholds from
        `policies.deadline_cutoffs(now)`; deadline filters and priority sorting use them."""
        ...

    def get_alert_detail(self, alert_id: str) -> Optional[AlertDetail]:
        """Get detailed alert with story, reasons, timeline, transactions and connections"""
        ...

    def set_resolution(self, alert_id: str, resolution: str) -> bool:
        """Close an alert with TRUE_POSITIVE or FALSE_POSITIVE. False if it doesn't exist."""
        ...


class RuleRepository(Protocol):
    """Protocol for rule data access"""
    
    def list_rules(
        self,
        status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> tuple[List[Rule], int]:
        """List rules with filters. Returns (rules, total_count)"""
        ...
    
    def get_rule(self, rule_id: str) -> Optional[Rule]:
        """Get a single rule by ID"""
        ...
    
    def approve_rule(self, rule_id: str, user: str) -> bool:
        """Approve a rule"""
        ...
    
    def reject_rule(self, rule_id: str, user: str, reason: str) -> bool:
        """Reject a rule"""
        ...

    def rule_versions(self, rule_id: str) -> List[Rule]: ...
    def conflicts(self) -> list: ...
    def health_counts(self) -> tuple[dict, list]: ...
    def evaluation(self) -> Optional[dict]: ...
    def create_job(self, job_id: str, filename: str) -> None: ...
    def update_job(self, job_id: str, **fields) -> None: ...
    def get_job(self, job_id: str): ...
    def store_upload(self, filename: str, data: bytes) -> str: ...
    def parse_upload(self, rel_path: str) -> str: ...
    def extract_obligations(self, circular_no: str) -> str: ...
    def compile_checks(self, circular_no: str) -> list[str]: ...


class RingRepository(Protocol):
    """Protocol for mule ring data access"""
    
    def list_rings(self, limit: int = 20, offset: int = 0) -> tuple[List[Ring], int]:
        """List mule rings. Returns (rings, total_count)"""
        ...
    
    def get_ring(self, ring_id: str) -> Optional[Ring]:
        """Get a single ring by ID"""
        ...

    def get_ring_detail(self, ring_id: str) -> Optional["RingDetail"]:
        """Members (with roles and money in/out), links between them, and their transfers"""
        ...


class EvidenceRepository(Protocol):
    """Protocol for evidence data access"""
    
    def get_evidence(self, alert_id: str) -> Optional[Evidence]:
        """Get evidence for an alert"""
        ...
    
    def verify_evidence(self, alert_id: str) -> dict:
        """Verify evidence integrity"""
        ...
    
    def create_evidence(self, alert_id: str, evidence_json: dict) -> Evidence:
        """Create evidence pack"""
        ...


class DashboardRepository(Protocol):
    """Protocol for the Today dashboard's read model."""

    def as_of(self) -> "datetime":
        """The data's "now": SETTINGS.AS_OF_DATE, or the newest alert if that is later."""
        ...

    def facts(self, now: "datetime", overdue_before: "datetime", due_48h_before: "datetime") -> "DashboardFacts":
        """Everything the dashboard needs. An open report is overdue when its alert was
        created before `overdue_before`, and due within 48 h when created before
        `due_48h_before` (both computed by domain policy)."""
        ...

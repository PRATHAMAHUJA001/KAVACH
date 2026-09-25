"""
Repository protocols (interfaces) for the domain layer
Following dependency inversion principle
"""
from typing import Protocol, Optional, List
from app.domain.entities import Alert, AlertDetail, Rule, Ring, Evidence


class AlertRepository(Protocol):
    """Protocol for alert data access"""
    
    def get_alert(self, alert_id: str) -> Optional[Alert]:
        """Get a single alert by ID"""
        ...
    
    def list_alerts(
        self, 
        status: Optional[str] = None,
        severity: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> tuple[List[Alert], int]:
        """List alerts with filters. Returns (alerts, total_count)"""
        ...
    
    def get_alert_detail(self, alert_id: str) -> Optional[AlertDetail]:
        """Get detailed alert with story and transactions"""
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


class RingRepository(Protocol):
    """Protocol for mule ring data access"""
    
    def list_rings(self, limit: int = 20, offset: int = 0) -> tuple[List[Ring], int]:
        """List mule rings. Returns (rings, total_count)"""
        ...
    
    def get_ring(self, ring_id: str) -> Optional[Ring]:
        """Get a single ring by ID"""
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

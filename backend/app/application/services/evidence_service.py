"""
Evidence application service
"""
from typing import Optional
from app.domain.repositories import EvidenceRepository
from app.domain.entities import Evidence


class EvidenceService:
    """Service for evidence operations"""
    
    def __init__(self, evidence_repo: EvidenceRepository):
        self.evidence_repo = evidence_repo
    
    def get_evidence(self, alert_id: str) -> Optional[Evidence]:
        """Get evidence for an alert"""
        return self.evidence_repo.get_evidence(alert_id)
    
    def verify_evidence(self, alert_id: str) -> dict:
        """Verify evidence integrity"""
        return self.evidence_repo.verify_evidence(alert_id)
    
    def create_evidence(self, alert_id: str) -> Evidence:
        """Create evidence pack for an alert"""
        return self.evidence_repo.create_evidence(alert_id, {})

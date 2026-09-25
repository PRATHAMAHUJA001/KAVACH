"""
Concrete implementation of EvidenceRepository using Snowflake
"""
from typing import Optional
import json
from snowflake.snowpark import Session
from app.domain.entities import Evidence
from app.domain.repositories import EvidenceRepository


class SnowflakeEvidenceRepository(EvidenceRepository):
    """Snowflake implementation of EvidenceRepository"""
    
    def __init__(self, session: Session):
        self.session = session
    
    def get_evidence(self, alert_id: str) -> Optional[Evidence]:
        """Get evidence for an alert"""
        sql = f"""
            SELECT alert_id, evidence_json, file_path, sha256_hash, created_by, created_at
            FROM AUDIT.EVIDENCE_REGISTRY
            WHERE alert_id = '{alert_id}'
        """
        
        rows = self.session.sql(sql).collect()
        if not rows:
            return None
        
        row = rows[0]
        return Evidence(
            alert_id=row['ALERT_ID'],
            evidence_json=json.loads(row['EVIDENCE_JSON']) if row['EVIDENCE_JSON'] else {},
            file_path=row['FILE_PATH'],
            sha256_hash=row['SHA256_HASH'],
            created_by=row['CREATED_BY'],
            created_at=row['CREATED_AT']
        )
    
    def verify_evidence(self, alert_id: str) -> dict:
        """Verify evidence integrity"""
        sql = f"SELECT AI.VERIFY_EVIDENCE('{alert_id}')"
        rows = self.session.sql(sql).collect()
        if not rows:
            return {"verified": False, "reason": "No evidence found"}
        
        return json.loads(rows[0][0])
    
    def create_evidence(self, alert_id: str, evidence_json: dict) -> Evidence:
        """Create evidence pack - calls AI.BUILD_EVIDENCE_PACK"""
        sql = f"SELECT AI.BUILD_EVIDENCE_PACK('{alert_id}')"
        self.session.sql(sql).collect()
        
        # Retrieve the created evidence
        evidence = self.get_evidence(alert_id)
        if not evidence:
            raise RuntimeError(f"Failed to create evidence for alert {alert_id}")
        
        return evidence

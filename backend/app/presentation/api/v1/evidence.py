"""
Evidence API endpoints
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.infrastructure.snowflake.connection import get_session
from app.infrastructure.repositories.evidence_repository import SnowflakeEvidenceRepository
from app.application.services.evidence_service import EvidenceService

router = APIRouter()


class EvidenceResponse(BaseModel):
    """Evidence response model"""
    alert_id: str
    evidence_json: dict
    file_path: Optional[str]
    sha256_hash: Optional[str]
    created_by: str
    created_at: str


class VerifyResponse(BaseModel):
    """Evidence verification response"""
    verified: bool
    details: dict


class FeedbackRequest(BaseModel):
    """Feedback request model"""
    rating: int
    comment: Optional[str] = None


class STRDraftResponse(BaseModel):
    """STR draft response"""
    alert_id: str
    str_draft: str
    format: str


def get_evidence_service() -> EvidenceService:
    """Dependency injection for evidence service"""
    session = get_session()
    evidence_repo = SnowflakeEvidenceRepository(session)
    return EvidenceService(evidence_repo)


@router.get("/alerts/{alert_id}/evidence", response_model=EvidenceResponse)
async def get_evidence(alert_id: str):
    """Get evidence for an alert"""
    try:
        service = get_evidence_service()
        evidence = service.get_evidence(alert_id)
        
        if not evidence:
            raise HTTPException(status_code=404, detail="Evidence not found")
        
        return EvidenceResponse(
            alert_id=evidence.alert_id,
            evidence_json=evidence.evidence_json,
            file_path=evidence.file_path,
            sha256_hash=evidence.sha256_hash,
            created_by=evidence.created_by,
            created_at=evidence.created_at.isoformat()
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch evidence: {str(e)}")


@router.post("/alerts/{alert_id}/evidence", response_model=EvidenceResponse)
async def create_evidence(alert_id: str):
    """Create evidence pack for an alert"""
    try:
        service = get_evidence_service()
        evidence = service.create_evidence(alert_id)
        
        return EvidenceResponse(
            alert_id=evidence.alert_id,
            evidence_json=evidence.evidence_json,
            file_path=evidence.file_path,
            sha256_hash=evidence.sha256_hash,
            created_by=evidence.created_by,
            created_at=evidence.created_at.isoformat()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create evidence: {str(e)}")


@router.get("/alerts/{alert_id}/verify", response_model=VerifyResponse)
async def verify_evidence(alert_id: str):
    """Verify evidence integrity"""
    try:
        service = get_evidence_service()
        result = service.verify_evidence(alert_id)
        
        has_evidence = result.get('has_evidence', False)
        
        return VerifyResponse(
            verified=has_evidence,
            details=result
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to verify evidence: {str(e)}")


@router.post("/alerts/{alert_id}/feedback")
async def submit_feedback(alert_id: str, feedback: FeedbackRequest):
    """Submit feedback for an alert"""
    try:
        session = get_session()
        
        sql = f"""
            INSERT INTO AUDIT.ALERT_FEEDBACK (alert_id, rating, comment, submitted_at)
            VALUES ('{alert_id}', {feedback.rating}, 
                    {f"'{feedback.comment}'" if feedback.comment else 'NULL'}, 
                    CURRENT_TIMESTAMP())
        """
        
        session.sql(sql).collect()
        
        return {"message": "Feedback submitted successfully", "alert_id": alert_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to submit feedback: {str(e)}")


@router.get("/alerts/{alert_id}/str-draft", response_model=STRDraftResponse)
async def get_str_draft(alert_id: str):
    """Generate STR draft for an alert"""
    try:
        session = get_session()
        
        sql = f"SELECT AI.GENERATE_STR_DRAFT('{alert_id}')"
        result = session.sql(sql).collect()
        
        if not result:
            raise HTTPException(status_code=404, detail="Failed to generate STR draft")
        
        str_draft = result[0][0]
        
        return STRDraftResponse(
            alert_id=alert_id,
            str_draft=str_draft,
            format="text"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate STR draft: {str(e)}")

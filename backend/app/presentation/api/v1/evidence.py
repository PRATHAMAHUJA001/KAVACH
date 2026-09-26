"""
Evidence API endpoints
"""
import time
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Literal, Optional
from app.application.services.alert_service import AlertService
from app.infrastructure.snowflake.connection import get_session
from app.presentation.api.v1.alerts import get_alert_service
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
    # Primary artifact: readable HTML evidence pack
    presigned_url: Optional[str] = None
    html_sha256_hash: Optional[str] = None
    # Best-effort PDF rendering of the same pack
    pdf_presigned_url: Optional[str] = None
    pdf_sha256_hash: Optional[str] = None
    # JSON is kept as a downloadable attachment, not the primary artifact
    json_presigned_url: Optional[str] = None
    # Measured time to build the pack (POST only) for the "Generated in 3.2 s" badge
    generation_ms: Optional[int] = None


class VerifyResponse(BaseModel):
    """Evidence verification response"""
    verified: bool
    details: dict


class FeedbackRequest(BaseModel):
    """Feedback request model"""
    rating: int
    comment: Optional[str] = None
    # When set, the alert is also closed as confirmed fraud / false alarm
    verdict: Optional[Literal["FRAUD", "NOT_FRAUD"]] = None


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


def _get_presigned_url(file_path: Optional[str]) -> Optional[str]:
    """Generate a short-lived presigned URL to download the evidence file"""
    if not file_path:
        return None
    session = get_session()
    # GET_PRESIGNED_URL needs the path at compile time, so it can't be a bind variable.
    # The path comes from AUDIT.EVIDENCE_REGISTRY, not the request; quotes are escaped anyway.
    literal = file_path.replace("\\", "\\\\").replace("'", "\\'")
    rows = session.sql(f"SELECT GET_PRESIGNED_URL(@APP.EVIDENCE_STAGE, '{literal}', 3600)").collect()
    return rows[0][0] if rows else None


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
            created_at=evidence.created_at.isoformat(),
            presigned_url=_get_presigned_url(evidence.html_file_path),
            html_sha256_hash=evidence.html_sha256_hash,
            pdf_presigned_url=_get_presigned_url(evidence.pdf_file_path),
            pdf_sha256_hash=evidence.pdf_sha256_hash,
            json_presigned_url=_get_presigned_url(evidence.file_path),
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
        started = time.perf_counter()
        evidence = service.create_evidence(alert_id)
        generation_ms = round((time.perf_counter() - started) * 1000)

        return EvidenceResponse(
            alert_id=evidence.alert_id,
            evidence_json=evidence.evidence_json,
            file_path=evidence.file_path,
            sha256_hash=evidence.sha256_hash,
            created_by=evidence.created_by,
            created_at=evidence.created_at.isoformat(),
            presigned_url=_get_presigned_url(evidence.html_file_path),
            html_sha256_hash=evidence.html_sha256_hash,
            pdf_presigned_url=_get_presigned_url(evidence.pdf_file_path),
            pdf_sha256_hash=evidence.pdf_sha256_hash,
            json_presigned_url=_get_presigned_url(evidence.file_path),
            generation_ms=generation_ms,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create evidence: {str(e)}")


@router.get("/alerts/{alert_id}/verify", response_model=VerifyResponse)
async def verify_evidence(alert_id: str):
    """Verify evidence integrity"""
    try:
        service = get_evidence_service()
        result = service.verify_evidence(alert_id)
        
        verified = result.get('integrity_status') == 'MATCH' and result.get(
            'html_integrity_status', 'MATCH'
        ) == 'MATCH'
        
        return VerifyResponse(
            verified=verified,
            details=result
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to verify evidence: {str(e)}")


@router.post("/alerts/{alert_id}/feedback")
async def submit_feedback(alert_id: str, feedback: FeedbackRequest, alerts: AlertService = Depends(get_alert_service)):
    """Submit feedback for an alert. With a verdict, the alert is closed as confirmed
    fraud (TRUE_POSITIVE) or a false alarm (FALSE_POSITIVE)."""
    try:
        resolution = None
        if feedback.verdict:
            resolution = alerts.record_verdict(alert_id, feedback.verdict)
            if resolution is None:
                raise HTTPException(status_code=404, detail="Alert not found")

        get_session().sql(
            """
            INSERT INTO AUDIT.ALERT_FEEDBACK (alert_id, rating, comment, submitted_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP())
            """,
            params=[alert_id, feedback.rating, feedback.comment],
        ).collect()

        body = {"message": "Feedback submitted successfully", "alert_id": alert_id}
        if resolution:
            body.update(status="CLOSED", resolution=resolution)
        return body
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to submit feedback: {str(e)}")


@router.get("/alerts/{alert_id}/str-draft", response_model=STRDraftResponse)
async def get_str_draft(alert_id: str):
    """Generate STR draft for an alert"""
    try:
        session = get_session()
        
        result = session.sql("SELECT AI.DRAFT_STR(?)", params=[alert_id]).collect()
        
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

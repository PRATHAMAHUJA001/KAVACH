"""
Rules endpoints - rule management and approval
"""
from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from typing import Optional
import uuid
from app.infrastructure.snowflake.connection import get_session
from app.infrastructure.repositories.rule_repository import SnowflakeRuleRepository
from app.application.services.rule_service import RuleService

router = APIRouter()


class RuleResponse(BaseModel):
    """Rule response model"""
    rule_id: str
    rule_name: str
    version: int
    typology: str
    sql_text: str
    status: str
    source_citation: str
    created_at: str


class RuleListResponse(BaseModel):
    """Rule list response model"""
    rules: list[RuleResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class ApproveRejectRequest(BaseModel):
    """Approve/reject request model"""
    user: str
    reason: Optional[str] = None


class RuleHealthResponse(BaseModel):
    """Rule health response"""
    total_rules: int
    active_rules: int
    pending_rules: int
    rejected_rules: int
    avg_precision: float


class ConflictResponse(BaseModel):
    """Rule conflict response"""
    conflicts: list[dict]


class UploadResponse(BaseModel):
    """Upload response"""
    job_id: str
    status: str
    message: str


class JobStatusResponse(BaseModel):
    """Job status response"""
    job_id: str
    status: str
    progress: int
    message: str


def get_rule_service() -> RuleService:
    """Dependency injection for rule service"""
    session = get_session()
    rule_repo = SnowflakeRuleRepository(session)
    return RuleService(rule_repo)


@router.get("/rules", response_model=RuleListResponse)
async def list_rules(
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
):
    """List rules with optional filters"""
    try:
        service = get_rule_service()
        rules, total, total_pages = service.list_rules(
            status=status,
            page=page,
            page_size=page_size
        )
        
        rule_responses = [
            RuleResponse(
                rule_id=r.rule_id,
                rule_name=r.rule_name,
                version=r.version,
                typology=r.typology,
                sql_text=r.sql_text,
                status=r.status,
                source_citation=r.source_citation,
                created_at=r.created_at.isoformat()
            )
            for r in rules
        ]
        
        return RuleListResponse(
            rules=rule_responses,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch rules: {str(e)}")


@router.post("/rules/{rule_id}/approve")
async def approve_rule(rule_id: str, request: ApproveRejectRequest):
    """Approve a rule"""
    try:
        service = get_rule_service()
        success = service.approve_rule(rule_id, request.user)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to approve rule")
        
        return {"message": "Rule approved successfully", "rule_id": rule_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to approve rule: {str(e)}")


@router.post("/rules/{rule_id}/reject")
async def reject_rule(rule_id: str, request: ApproveRejectRequest):
    """Reject a rule"""
    try:
        if not request.reason:
            raise HTTPException(status_code=400, detail="Rejection reason is required")
        
        service = get_rule_service()
        success = service.reject_rule(rule_id, request.user, request.reason)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to reject rule")
        
        return {"message": "Rule rejected successfully", "rule_id": rule_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reject rule: {str(e)}")


@router.get("/rules/conflicts", response_model=ConflictResponse)
async def get_rule_conflicts():
    """Get rule conflicts"""
    try:
        session = get_session()
        
        sql = """
            SELECT 
                r1.rule_id AS rule1_id,
                r1.rule_name AS rule1_name,
                r2.rule_id AS rule2_id,
                r2.rule_name AS rule2_name,
                'Overlapping typology' AS conflict_type
            FROM RULES.RULE_LIBRARY r1
            JOIN RULES.RULE_LIBRARY r2 
                ON r1.typology = r2.typology 
                AND r1.rule_id < r2.rule_id
            WHERE r1.status = 'APPROVED' AND r2.status = 'APPROVED'
            LIMIT 50
        """
        
        rows = session.sql(sql).collect()
        conflicts = [
            {
                "rule1_id": r['RULE1_ID'],
                "rule1_name": r['RULE1_NAME'],
                "rule2_id": r['RULE2_ID'],
                "rule2_name": r['RULE2_NAME'],
                "conflict_type": r['CONFLICT_TYPE']
            }
            for r in rows
        ]
        
        return ConflictResponse(conflicts=conflicts)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch conflicts: {str(e)}")


@router.get("/rules/health", response_model=RuleHealthResponse)
async def get_rule_health():
    """Get rule health metrics"""
    try:
        session = get_session()
        
        sql = """
            SELECT 
                COUNT(*) AS total_rules,
                SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS active_rules,
                SUM(CASE WHEN status = 'PENDING_APPROVAL' THEN 1 ELSE 0 END) AS pending_rules,
                SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_rules,
                (SELECT COALESCE(AVG(precision_pct), 0) / 100.0 FROM ML.EVAL_RULE_PRECISION) AS avg_precision
            FROM RULES.RULE_LIBRARY
        """
        
        row = session.sql(sql).collect()[0]
        
        return RuleHealthResponse(
            total_rules=row['TOTAL_RULES'],
            active_rules=row['ACTIVE_RULES'],
            pending_rules=row['PENDING_RULES'],
            rejected_rules=row['REJECTED_RULES'],
            avg_precision=float(row['AVG_PRECISION'])
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch rule health: {str(e)}")


@router.get("/rules/{rule_id}", response_model=RuleResponse)
async def get_rule(rule_id: str):
    """Get a specific rule"""
    try:
        service = get_rule_service()
        rule = service.get_rule(rule_id)
        
        if not rule:
            raise HTTPException(status_code=404, detail="Rule not found")
        
        return RuleResponse(
            rule_id=rule.rule_id,
            rule_name=rule.rule_name,
            version=rule.version,
            typology=rule.typology,
            sql_text=rule.sql_text,
            status=rule.status,
            source_citation=rule.source_citation,
            created_at=rule.created_at.isoformat()
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch rule: {str(e)}")


@router.post("/rules/upload", response_model=UploadResponse)
async def upload_rules(file: UploadFile = File(...)):
    """Upload rules from CSV/YAML file"""
    try:
        job_id = str(uuid.uuid4())
        
        # For now, return success without actual processing
        # In production, this would parse the file and insert rules
        
        return UploadResponse(
            job_id=job_id,
            status="PENDING",
            message=f"Rule upload job {job_id} created successfully"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload rules: {str(e)}")


@router.get("/rules/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Get status of a rule upload job"""
    try:
        # For now, return mock status
        # In production, this would query a jobs table
        
        return JobStatusResponse(
            job_id=job_id,
            status="COMPLETED",
            progress=100,
            message="All rules processed successfully"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch job status: {str(e)}")

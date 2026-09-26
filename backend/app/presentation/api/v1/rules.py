"""
Rules endpoints - review, versions, conflicts, health, evaluation and circular uploads.
Shapes mirror frontend/src/services/api/dto.ts (docs/API_EXTENSIONS.md §7).
"""
import re
from typing import List, Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel

from app.application.services.rule_service import MAX_UPLOAD_BYTES, RuleService
from app.domain import policies
from app.domain.entities import Rule
from app.infrastructure.repositories.rule_repository import SnowflakeRuleRepository
from app.infrastructure.snowflake.connection import get_session

router = APIRouter()


class RuleParamResponse(BaseModel):
    key: str
    label: str
    label_hi: str
    unit: Literal["inr", "count", "hours", "days", "percent"]
    value: float
    min: float
    max: float
    step: float


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
    plain_english: Optional[str] = None
    plain_hindi: Optional[str] = None
    circular_no: Optional[str] = None
    para_no: Optional[str] = None
    source_quote: Optional[str] = None
    highlight: Optional[str] = None
    severity: Optional[str] = None
    entity: Optional[str] = None
    params: List[RuleParamResponse] = []
    approved_by: Optional[str] = None
    rejection_reason: Optional[str] = None


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


class RuleHealthRowResponse(BaseModel):
    rule_id: str
    rule_name: str
    typology: str
    alerts_30d: int
    confirmed_30d: int
    precision: float
    verdict: Literal["healthy", "noisy", "quiet"]
    proposed_fix: Optional[str] = None
    proposed_fix_hi: Optional[str] = None


class RuleHealthResponse(BaseModel):
    """Rule health response"""
    total_rules: int
    active_rules: int
    pending_rules: int
    rejected_rules: int
    avg_precision: float
    rules: List[RuleHealthRowResponse] = []


class ConflictSideResponse(BaseModel):
    rule_id: str
    rule_name: str
    citation: str
    circular_no: Optional[str] = None
    para_no: Optional[str] = None
    clause_text: str
    plain_english: str


class ConflictItem(BaseModel):
    conflict_id: str
    typology: str
    entity: Optional[str] = None
    description: str
    status: str
    detected_at: Optional[str] = None
    kind: Literal["overlap", "contradiction"]
    rule_a: ConflictSideResponse
    rule_b: ConflictSideResponse


class ConflictResponse(BaseModel):
    """Rule conflict response"""
    conflicts: List[ConflictItem]


class RuleVersionResponse(BaseModel):
    version: int
    status: str
    created_at: str
    approved_by: Optional[str] = None
    change_summary: str
    change_summary_hi: str
    source_citation: str


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
    step: Optional[int] = None
    circular_no: Optional[str] = None
    rule_ids: List[str] = []


def get_rule_service() -> RuleService:
    """Dependency injection for rule service"""
    return RuleService(SnowflakeRuleRepository(get_session()))


def to_rule_response(r: Rule) -> RuleResponse:
    en, hi = policies.describe_rule_sql(r.sql_text, r.typology)
    return RuleResponse(
        rule_id=r.rule_id, rule_name=r.rule_name, version=r.version, typology=r.typology, sql_text=r.sql_text,
        status=r.status, source_citation=r.source_citation, created_at=r.created_at.isoformat(),
        plain_english=en, plain_hindi=hi, circular_no=r.circular_no, para_no=r.para_no,
        source_quote=r.source_text, highlight=policies.pick_highlight(r.source_text),
        severity=r.severity, entity=r.entity, params=[RuleParamResponse(**p) for p in policies.rule_params(r.params)],
        approved_by=r.approved_by, rejection_reason=r.rejection_reason,
    )


def _amounts(sql: str) -> set[float]:
    return {float(x) for x in re.findall(r"AMOUNT_INR\s*(?:>=|>|BETWEEN)\s*([\d.]+)", sql or "", re.I)}


def _side(r: Rule) -> ConflictSideResponse:
    return ConflictSideResponse(
        rule_id=r.rule_id, rule_name=r.rule_name, citation=r.source_citation, circular_no=r.circular_no, para_no=r.para_no,
        clause_text=r.source_text or "", plain_english=policies.describe_rule_sql(r.sql_text, r.typology)[0],
    )


@router.get("/rules", response_model=RuleListResponse)
async def list_rules(
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    service: RuleService = Depends(get_rule_service),
):
    """List rules with optional filters"""
    try:
        rules, total, total_pages = service.list_rules(status=status, page=page, page_size=page_size)
        return RuleListResponse(rules=[to_rule_response(r) for r in rules], total=total, page=page, page_size=page_size, total_pages=total_pages)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch rules: {str(e)}")


@router.post("/rules/{rule_id}/approve")
async def approve_rule(rule_id: str, request: ApproveRejectRequest, service: RuleService = Depends(get_rule_service)):
    """Approve a rule"""
    try:
        if not service.approve_rule(rule_id, request.user):
            raise HTTPException(status_code=404, detail="Rule not found")
        return {"message": "Rule approved successfully", "rule_id": rule_id, "status": "APPROVED"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to approve rule: {str(e)}")


@router.post("/rules/{rule_id}/reject")
async def reject_rule(rule_id: str, request: ApproveRejectRequest, service: RuleService = Depends(get_rule_service)):
    """Reject a rule"""
    if not (request.reason or "").strip():
        raise HTTPException(status_code=422, detail="A reason is required to reject a rule.")
    try:
        if not service.reject_rule(rule_id, request.user, request.reason.strip()):
            raise HTTPException(status_code=404, detail="Rule not found")
        return {"message": "Rule rejected successfully", "rule_id": rule_id, "status": "REJECTED"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reject rule: {str(e)}")


@router.get("/rules/conflicts", response_model=ConflictResponse)
async def get_rule_conflicts(service: RuleService = Depends(get_rule_service)):
    """Pairs of rules that overlap, or contradict each other on thresholds"""
    try:
        items = []
        for c in service.conflicts():
            a, b = _amounts(c.rule_a.sql_text), _amounts(c.rule_b.sql_text)
            items.append(ConflictItem(
                conflict_id=c.conflict_id, typology=c.typology, entity=c.entity, description=c.description, status=c.status,
                detected_at=c.detected_at.isoformat() if c.detected_at else None,
                kind="contradiction" if a and b and a != b else "overlap",
                rule_a=_side(c.rule_a), rule_b=_side(c.rule_b),
            ))
        return ConflictResponse(conflicts=items)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch conflicts: {str(e)}")


@router.get("/rules/health", response_model=RuleHealthResponse)
async def get_rule_health(service: RuleService = Depends(get_rule_service)):
    """Counts by status, and per rule: alerts and confirmed fraud in the last 30 days, with a verdict"""
    try:
        return RuleHealthResponse(**service.health())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch rule health: {str(e)}")


@router.get("/rules/eval")
async def get_rule_eval(service: RuleService = Depends(get_rule_service)):
    """How many planted fraud cases per typology the rules catch (ML.EVAL_* or RAW.GROUND_TRUTH)"""
    try:
        result = service.evaluation()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to evaluate rules: {str(e)}")
    if not result:
        raise HTTPException(status_code=404, detail="No evaluation data yet")
    return result


@router.post("/rules/upload", response_model=UploadResponse)
async def upload_circular(background: BackgroundTasks, file: UploadFile = File(...), service: RuleService = Depends(get_rule_service)):
    """Upload a circular PDF. It is read, its obligations extracted and checks written in
    the background; poll /rules/jobs/{job_id}."""
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    try:
        job = service.start_upload(file.filename or "circular.pdf", data)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start the upload: {str(e)}")
    background.add_task(service.process_upload, job.job_id, job.filename, data)
    return UploadResponse(job_id=job.job_id, status=job.status, message=f"Received {job.filename}")


@router.get("/rules/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str, service: RuleService = Depends(get_rule_service)):
    """Progress of a circular upload"""
    try:
        job = service.get_job(job_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch job status: {str(e)}")
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatusResponse(job_id=job.job_id, status=job.status, progress=job.progress, message=job.message,
                             step=job.step, circular_no=job.circular_no, rule_ids=job.rule_ids)


@router.get("/rules/{rule_id}/versions")
async def get_rule_versions(rule_id: str, service: RuleService = Depends(get_rule_service)):
    """This rule's history: the original and any versions created by amendments"""
    try:
        versions = service.versions(rule_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch versions: {str(e)}")
    if not versions:
        raise HTTPException(status_code=404, detail="Rule not found")
    out = []
    for v in versions:
        amended = re.search(r"\(amends ([^)]+)\)", v.source_citation or "")
        if amended:
            en = f"Updated by amendment {v.circular_no}, which changes {amended.group(1)}."
            hi = f"संशोधन {v.circular_no} से बदला गया, जो {amended.group(1)} को बदलता है।"
        else:
            en = f"First version, written from {v.circular_no} paragraph {v.para_no}."
            hi = f"पहला संस्करण, {v.circular_no} के अनुच्छेद {v.para_no} से लिखा गया।"
        if v.status == "SUPERSEDED":
            en, hi = en + " Replaced by a newer version.", hi + " नए संस्करण से बदला गया।"
        out.append(RuleVersionResponse(version=v.version, status=v.status, created_at=v.created_at.isoformat(), approved_by=v.approved_by,
                                       change_summary=en, change_summary_hi=hi, source_citation=v.source_citation))
    return {"versions": out}


@router.get("/rules/{rule_id}", response_model=RuleResponse)
async def get_rule(rule_id: str, service: RuleService = Depends(get_rule_service)):
    """Get a specific rule"""
    try:
        rule = service.get_rule(rule_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch rule: {str(e)}")
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return to_rule_response(rule)

"""
Alert API endpoints - presentation only; logic lives in AlertService.
Field shapes mirror frontend/src/services/api/dto.ts (docs/API_EXTENSIONS.md §3).
"""
from datetime import datetime
from typing import List, Literal, Optional

TimelineType = Literal["login", "device_change", "new_beneficiary", "cash_deposit", "transfer_in", "transfer_out", "alert", "kyc"]
EdgeKind = Literal["shared_phone", "shared_ip", "shared_device", "sent_money"]

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.application.services.alert_service import AlertService
from app.domain.entities import Alert, AlertDetail
from app.infrastructure.repositories.alert_repository import SnowflakeAlertRepository
from app.infrastructure.snowflake.connection import get_session

router = APIRouter()


class AlertResponse(BaseModel):
    """Alert response model"""
    alert_id: str
    account_id: str
    customer_id: Optional[str]
    typology: str
    severity: str
    score: float
    status: str
    rule_name: str
    citation: str
    created_at: str
    resolution: Optional[str] = None
    customer_name: Optional[str] = None
    pan: Optional[str] = None
    amount_inr: Optional[float] = None
    txn_count: Optional[int] = None
    due_at: Optional[str] = None
    str_filed: Optional[bool] = None
    risk_level: Optional[int] = None
    ring_id: Optional[str] = None
    window_start: Optional[str] = None
    window_end: Optional[str] = None
    branch: Optional[str] = None
    city: Optional[str] = None
    action_required: Optional[str] = None


class AlertListResponse(BaseModel):
    """Alert list response model"""
    alerts: list[AlertResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class ReasonResponse(BaseModel):
    text: str
    text_hi: Optional[str] = None
    weight: float


class TimelineEventResponse(BaseModel):
    id: str
    at: str
    type: TimelineType
    title: str
    title_hi: Optional[str] = None
    detail: Optional[str] = None
    amount_inr: Optional[float] = None
    suspicious: bool = False


class TxnResponse(BaseModel):
    txn_id: str
    account_id: str
    txn_ts: str
    amount_inr: float
    channel: str
    direction: Literal["CREDIT", "DEBIT"]
    counterparty: str
    counterparty_bank: str
    country: str
    narration: str


class GraphNodeResponse(BaseModel):
    id: str
    label: str
    risk_level: int
    kind: Literal["subject", "member", "external"]
    city: Optional[str] = None
    alert_id: Optional[str] = None


class GraphEdgeResponse(BaseModel):
    source: str
    target: str
    kind: EdgeKind


class GraphResponse(BaseModel):
    nodes: List[GraphNodeResponse]
    edges: List[GraphEdgeResponse]


class CitationRefResponse(BaseModel):
    circular_no: str
    para_no: str
    highlight: Optional[str] = None


class AlertDetailResponse(BaseModel):
    """Alert detail response model"""
    alert: AlertResponse
    story_en: Optional[str]
    story_hi: Optional[str]
    txn_count: int
    total_amount_inr: float
    reasons: List[ReasonResponse] = []
    timeline: List[TimelineEventResponse] = []
    transactions: List[TxnResponse] = []
    connections: Optional[GraphResponse] = None
    citation_ref: Optional[CitationRefResponse] = None


def get_alert_service() -> AlertService:
    """Dependency injection for alert service"""
    return AlertService(SnowflakeAlertRepository(get_session()))


def _iso(v: Optional[datetime]) -> Optional[str]:
    return v.isoformat() if v else None


def to_alert_response(a: Alert) -> AlertResponse:
    return AlertResponse(
        alert_id=a.alert_id,
        account_id=a.account_id,
        customer_id=a.customer_id,
        typology=a.typology,
        severity=a.severity,
        score=a.score,
        status=a.status,
        rule_name=a.rule_name,
        citation=a.citation,
        created_at=a.created_at.isoformat(),
        resolution=a.resolution,
        customer_name=a.customer_name,
        pan=a.pan,
        amount_inr=a.amount_inr,
        txn_count=a.txn_count,
        due_at=_iso(a.due_at),
        str_filed=a.str_filed,
        risk_level=a.risk_level,
        ring_id=a.ring_id,
        window_start=_iso(a.window_start),
        window_end=_iso(a.window_end),
        branch=a.branch,
        city=a.city,
        action_required=a.action_required,
    )


def to_detail_response(d: AlertDetail) -> AlertDetailResponse:
    return AlertDetailResponse(
        alert=to_alert_response(d.alert),
        story_en=d.story_en,
        story_hi=d.story_hi,
        txn_count=d.txn_count,
        total_amount_inr=d.total_amount_inr,
        reasons=[ReasonResponse(text=r.text, text_hi=r.text_hi, weight=r.weight) for r in d.reasons],
        timeline=[
            TimelineEventResponse(
                id=e.id, at=e.at.isoformat(), type=e.type, title=e.title, title_hi=e.title_hi,
                detail=e.detail, amount_inr=e.amount_inr, suspicious=e.suspicious,
            )
            for e in d.timeline
        ],
        transactions=[
            TxnResponse(
                txn_id=t.txn_id, account_id=t.account_id, txn_ts=t.txn_ts.isoformat(), amount_inr=t.amount_inr,
                channel=t.channel, direction=t.direction, counterparty=t.counterparty or "",
                counterparty_bank=t.counterparty_bank or "", country=t.country or "", narration=t.narration or "",
            )
            for t in d.transactions
        ],
        connections=GraphResponse(
            nodes=[GraphNodeResponse(**n.__dict__) for n in d.connections.nodes],
            edges=[GraphEdgeResponse(**e.__dict__) for e in d.connections.edges],
        ) if d.connections else None,
        citation_ref=CitationRefResponse(**d.citation_ref.__dict__) if d.citation_ref else None,
    )


@router.get("/alerts", response_model=AlertListResponse)
async def list_alerts(
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    typology: Optional[str] = Query(None),
    due: Optional[Literal["overdue", "48h", "open"]] = Query(None, description="Report deadline band"),
    q: Optional[str] = Query(None, max_length=100, description="Matches alert id, account, customer name or city"),
    sort: Literal["priority", "amount", "newest"] = Query("priority"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    service: AlertService = Depends(get_alert_service),
):
    """List alerts with optional filters. `priority` puts open alerts first, then the
    nearest report deadline, then severity."""
    try:
        alerts, total, total_pages = service.list_alerts(
            status=status, severity=severity, page=page, page_size=page_size,
            typology=typology, due=due, q=q, sort=sort,
        )
        return AlertListResponse(
            alerts=[to_alert_response(a) for a in alerts],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch alerts: {str(e)}")


@router.get("/alerts/{alert_id}", response_model=AlertDetailResponse)
async def get_alert_detail(alert_id: str, service: AlertService = Depends(get_alert_service)):
    """The case file: story, reasons, timeline, transactions, connections and the cited paragraph."""
    try:
        detail = service.get_alert_detail(alert_id)
        if not detail:
            raise HTTPException(status_code=404, detail="Alert not found")
        return to_detail_response(detail)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch alert detail: {str(e)}")

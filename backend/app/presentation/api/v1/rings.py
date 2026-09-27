"""
Rings endpoints - mule rings found by CORE.DETECT_MULE_RINGS().
Shapes mirror frontend/src/services/api/dto.ts (docs/API_EXTENSIONS.md §6).
"""
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.application.services.ring_service import RingService
from app.domain import policies
from app.domain.entities import Ring
from app.infrastructure.repositories.ring_repository import SnowflakeRingRepository
from app.infrastructure.snowflake.connection import get_session
from app.presentation.api.v1.alerts import GraphEdgeResponse, TxnResponse

router = APIRouter()


class RingResponse(BaseModel):
    """Ring response model"""
    ring_id: str
    ring_name: str
    member_count: int
    total_volume_inr: float
    risk_score: float
    status: str
    #: "mule" = collector -> mules -> exit; "round_trip" = closed loop back to origin.
    ring_kind: Literal["mule", "round_trip"] = "mule"
    hops: Optional[int] = None
    #: round_trip only: the loop in order, e.g. ["ACC1", "ACC2", "ACC3", "ACC1"].
    loop_path: Optional[List[str]] = None
    ring_name_hi: Optional[str] = None
    confidence: Optional[str] = None
    speed_hours: Optional[float] = None
    detected_at: Optional[str] = None
    alerted_members: Optional[int] = None
    shared_devices: Optional[int] = None
    city: Optional[str] = None


class RingListResponse(BaseModel):
    """Ring list response model"""
    rings: list[RingResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class RingMemberResponse(BaseModel):
    id: str
    label: str
    risk_level: int
    kind: Literal["subject", "member", "external"]
    role: Optional[Literal["collector", "mule", "exit", "loop"]] = None
    city: Optional[str] = None
    alert_id: Optional[str] = None
    money_in_inr: Optional[float] = None
    money_out_inr: Optional[float] = None


class RingEdgeResponse(GraphEdgeResponse):
    amount_inr: Optional[float] = None
    count: Optional[int] = None


class RingDetailResponse(BaseModel):
    """Ring detail response model"""
    ring: RingResponse
    members: List[RingMemberResponse]
    edges: List[RingEdgeResponse] = []
    transactions: List[TxnResponse]


def get_ring_service() -> RingService:
    """Dependency injection for ring service"""
    return RingService(SnowflakeRingRepository(get_session()))


def to_ring_response(r: Ring) -> RingResponse:
    return RingResponse(
        ring_id=r.ring_id,
        ring_name=r.ring_name,
        ring_name_hi=policies.ring_name(r.ring_id, "hi"),
        member_count=r.member_count,
        total_volume_inr=r.total_volume_inr,
        risk_score=r.risk_score,
        status=r.status,
        ring_kind="round_trip" if r.ring_kind == "round_trip" else "mule",
        hops=r.hops,
        loop_path=r.loop_path,
        confidence=r.confidence,
        speed_hours=r.speed_hours,
        detected_at=r.detected_at.isoformat() if r.detected_at else None,
        alerted_members=r.alerted_members,
        shared_devices=r.shared_devices,
        city=r.city,
    )


@router.get("/rings", response_model=RingListResponse)
async def list_rings(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    service: RingService = Depends(get_ring_service),
):
    """List rings, most suspicious first. `ring_kind` distinguishes collection rings
    from round-trip loops -- both shapes are planted and they read differently."""
    try:
        rings, total, total_pages = service.list_rings(page=page, page_size=page_size)
        return RingListResponse(rings=[to_ring_response(r) for r in rings], total=total, page=page, page_size=page_size, total_pages=total_pages)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch rings: {str(e)}")


@router.get("/rings/{ring_id}", response_model=RingDetailResponse)
async def get_ring_detail(ring_id: str, service: RingService = Depends(get_ring_service)):
    """Members (with roles), shared-device/IP and money links between them, and their transfers"""
    try:
        d = service.get_ring_detail(ring_id)
        if not d:
            raise HTTPException(status_code=404, detail="Ring not found")
        return RingDetailResponse(
            ring=to_ring_response(d.ring),
            members=[RingMemberResponse(**m.__dict__) for m in d.members],
            edges=[RingEdgeResponse(**e.__dict__) for e in d.edges],
            transactions=[
                TxnResponse(
                    txn_id=t.txn_id, account_id=t.account_id, txn_ts=t.txn_ts.isoformat(), amount_inr=t.amount_inr,
                    channel=t.channel, direction=t.direction, counterparty=t.counterparty or "",
                    counterparty_bank=t.counterparty_bank or "", country=t.country or "", narration=t.narration or "",
                )
                for t in d.transactions
            ],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch ring detail: {str(e)}")

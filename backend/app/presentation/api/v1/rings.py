"""
Rings endpoints - mule ring detection
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from app.infrastructure.snowflake.connection import get_session
from app.infrastructure.repositories.ring_repository import SnowflakeRingRepository
from app.application.services.ring_service import RingService

router = APIRouter()


class RingResponse(BaseModel):
    """Ring response model"""
    ring_id: str
    ring_name: str
    member_count: int
    total_volume_inr: float
    risk_score: float
    status: str


class RingListResponse(BaseModel):
    """Ring list response model"""
    rings: list[RingResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class RingDetailResponse(BaseModel):
    """Ring detail response model"""
    ring: RingResponse
    members: list[dict]
    transactions: list[dict]


def get_ring_service() -> RingService:
    """Dependency injection for ring service"""
    session = get_session()
    ring_repo = SnowflakeRingRepository(session)
    return RingService(ring_repo)


@router.get("/rings", response_model=RingListResponse)
async def list_rings(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
):
    """List mule rings"""
    try:
        service = get_ring_service()
        rings, total, total_pages = service.list_rings(page=page, page_size=page_size)
        
        ring_responses = [
            RingResponse(
                ring_id=r.ring_id,
                ring_name=r.ring_name,
                member_count=r.member_count,
                total_volume_inr=r.total_volume_inr,
                risk_score=r.risk_score,
                status=r.status
            )
            for r in rings
        ]
        
        return RingListResponse(
            rings=ring_responses,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch rings: {str(e)}")


@router.get("/rings/{ring_id}", response_model=RingDetailResponse)
async def get_ring_detail(ring_id: str):
    """Get detailed information for a specific ring"""
    try:
        service = get_ring_service()
        ring = service.get_ring(ring_id)
        
        if not ring:
            raise HTTPException(status_code=404, detail="Ring not found")
        
        # Get ring members with their transaction counts
        session = get_session()
        members_sql = f"""
            SELECT 
                rm.account_id,
                COUNT(t.txn_id) AS transaction_count
            FROM CORE.RING_MEMBERS rm
            LEFT JOIN CORE.TRANSACTIONS t ON t.account_id = rm.account_id
            WHERE rm.ring_id = '{ring_id}'
            GROUP BY rm.account_id
            ORDER BY transaction_count DESC
        """
        
        members_rows = session.sql(members_sql).collect()
        members = [
            {
                "account_id": r['ACCOUNT_ID'],
                "transaction_count": r['TRANSACTION_COUNT']
            }
            for r in members_rows
        ]
        
        # Get transactions among ring member accounts (either side of the transfer)
        txn_sql = f"""
            SELECT txn_id, account_id, counterparty, amount_inr, txn_ts
            FROM CORE.TRANSACTIONS
            WHERE account_id IN (
                SELECT account_id FROM CORE.RING_MEMBERS WHERE ring_id = '{ring_id}'
            )
            OR counterparty IN (
                SELECT account_id FROM CORE.RING_MEMBERS WHERE ring_id = '{ring_id}'
            )
            ORDER BY txn_ts DESC
            LIMIT 100
        """
        
        txn_rows = session.sql(txn_sql).collect()
        transactions = [
            {
                "txn_id": r['TXN_ID'],
                "from_account": r['ACCOUNT_ID'],
                "to_account": r['COUNTERPARTY'],
                "amount_inr": float(r['AMOUNT_INR']),
                "txn_ts": str(r['TXN_TS'])
            }
            for r in txn_rows
        ]
        
        ring_response = RingResponse(
            ring_id=ring.ring_id,
            ring_name=ring.ring_name,
            member_count=ring.member_count,
            total_volume_inr=ring.total_volume_inr,
            risk_score=ring.risk_score,
            status=ring.status
        )
        
        return RingDetailResponse(
            ring=ring_response,
            members=members,
            transactions=transactions
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch ring detail: {str(e)}")

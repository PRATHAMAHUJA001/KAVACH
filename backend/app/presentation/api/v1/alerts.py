"""
Alert API endpoints - refactored to use services
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from pydantic import BaseModel
from app.infrastructure.snowflake.connection import get_session
from app.infrastructure.repositories.alert_repository import SnowflakeAlertRepository
from app.application.services.alert_service import AlertService

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


class AlertListResponse(BaseModel):
    """Alert list response model"""
    alerts: list[AlertResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class AlertDetailResponse(BaseModel):
    """Alert detail response model"""
    alert: AlertResponse
    story_en: Optional[str]
    story_hi: Optional[str]
    txn_count: int
    total_amount_inr: float


def get_alert_service() -> AlertService:
    """Dependency injection for alert service"""
    session = get_session()
    alert_repo = SnowflakeAlertRepository(session)
    return AlertService(alert_repo)


@router.get("/alerts", response_model=AlertListResponse)
async def list_alerts(
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
):
    """List alerts with optional filters"""
    try:
        service = get_alert_service()
        alerts, total, total_pages = service.list_alerts(
            status=status,
            severity=severity,
            page=page,
            page_size=page_size
        )
        
        alert_responses = [
            AlertResponse(
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
                resolution=a.resolution
            )
            for a in alerts
        ]
        
        return AlertListResponse(
            alerts=alert_responses,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch alerts: {str(e)}")


@router.get("/alerts/{alert_id}", response_model=AlertDetailResponse)
async def get_alert_detail(alert_id: str):
    """Get detailed information for a specific alert"""
    try:
        service = get_alert_service()
        detail = service.get_alert_detail(alert_id)
        
        if not detail:
            raise HTTPException(status_code=404, detail="Alert not found")
        
        alert_response = AlertResponse(
            alert_id=detail.alert.alert_id,
            account_id=detail.alert.account_id,
            customer_id=detail.alert.customer_id,
            typology=detail.alert.typology,
            severity=detail.alert.severity,
            score=detail.alert.score,
            status=detail.alert.status,
            rule_name=detail.alert.rule_name,
            citation=detail.alert.citation,
            created_at=detail.alert.created_at.isoformat(),
            resolution=detail.alert.resolution
        )
        
        return AlertDetailResponse(
            alert=alert_response,
            story_en=detail.story_en,
            story_hi=detail.story_hi,
            txn_count=detail.txn_count,
            total_amount_inr=detail.total_amount_inr
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch alert detail: {str(e)}")

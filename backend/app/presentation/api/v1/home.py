"""Home (Today) dashboard endpoint — presentation only; logic lives in HomeService."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.application.services.home_service import HomeService
from app.infrastructure.repositories.dashboard_repository import SnowflakeDashboardRepository
from app.infrastructure.snowflake.connection import get_session

router = APIRouter()


class ReadinessFactor(BaseModel):
    key: str
    count: int
    points: float


class ReadinessScore(BaseModel):
    score: float
    reason: str
    reason_hi: Optional[str] = None
    factors: List[ReadinessFactor] = []


class TopAlert(BaseModel):
    alert_id: str
    account_id: str
    typology: str
    severity: str
    score: float
    created_at: str


class TrendData(BaseModel):
    date: str
    alert_count: int
    confirmed_fraud: Optional[int] = None


class HomeKpis(BaseModel):
    new_alerts: int
    new_alerts_prev: int
    serious_new_alerts: int
    money_at_risk_inr: float
    money_at_risk_prev_inr: float
    reports_due_48h: int
    reports_overdue: int
    active_rings: int
    active_rings_prev: int
    ring_volume_30d_inr: float


class AttentionParams(BaseModel):
    name: Optional[str] = None
    name_hi: Optional[str] = None
    amount_inr: Optional[float] = None
    due_at: Optional[str] = None
    count: Optional[int] = None
    typology: Optional[str] = None


class AttentionItem(BaseModel):
    id: str
    kind: str
    status: str
    entity_id: str
    params: AttentionParams


class WeeklyBrief(BaseModel):
    text: str
    text_hi: str
    generated_at: str


class HomeResponse(BaseModel):
    readiness_score: ReadinessScore
    top_alerts: List[TopAlert]
    trend: List[TrendData]
    kpis: Optional[HomeKpis] = None
    attention: List[AttentionItem] = []
    weekly_brief: Optional[WeeklyBrief] = None
    as_of: Optional[str] = None


def get_home_service() -> HomeService:
    return HomeService(SnowflakeDashboardRepository(get_session()))


@router.get("/home", response_model=HomeResponse)
async def get_home_dashboard(service: HomeService = Depends(get_home_service)):
    """
    Today dashboard: readiness score (with the factors pulling it down), KPIs,
    the five things needing attention, a 30-day alerts vs confirmed-fraud trend
    and a one-paragraph weekly brief. Deadlines use the data's as-of date.
    """
    try:
        view = service.build()
    except Exception as e:  # surfaced as a friendly error by the UI
        raise HTTPException(status_code=500, detail=f"Failed to fetch home data: {e}")
    return HomeResponse(**view.__dict__)

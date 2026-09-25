"""Home dashboard endpoint"""
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.infrastructure.snowflake.connection import get_session

router = APIRouter()


class ReadinessScore(BaseModel):
    score: float
    reason: str


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


class HomeResponse(BaseModel):
    readiness_score: ReadinessScore
    top_alerts: List[TopAlert]
    trend: List[TrendData]


@router.get("/home", response_model=HomeResponse)
async def get_home_dashboard():
    """
    Get home dashboard data:
    - Readiness score
    - Top 5 alerts
    - 7-day trend
    """
    try:
        session = get_session()
        
        # Get readiness score
        readiness_df = session.sql("""
            SELECT 
                GREATEST(0, LEAST(100, 
                    (SELECT COUNT(DISTINCT rule_id) * 100.0 / GREATEST(COUNT(*), 1) 
                     FROM RULES.RULE_LIBRARY WHERE status = 'APPROVED') * 0.25 +
                    (SELECT COUNT(*) * 100.0 / GREATEST(COUNT(*), 1) 
                     FROM CORE.ALERTS WHERE created_at >= DATEADD('day', -7, CURRENT_DATE())) * 0.30 +
                    50.0
                )) AS score,
                'Operational status' AS reason
        """).collect()
        
        readiness = ReadinessScore(
            score=round(float(readiness_df[0]['SCORE']), 1),
            reason=readiness_df[0]['REASON']
        )
        
        # Get top 5 alerts
        alerts_df = session.sql("""
            SELECT 
                alert_id,
                account_id,
                typology,
                severity,
                score,
                TO_VARCHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
            FROM CORE.ALERTS
            WHERE status IN ('NEW', 'OPEN')
            ORDER BY score DESC, created_at DESC
            LIMIT 5
        """).collect()
        
        top_alerts = [
            TopAlert(
                alert_id=row['ALERT_ID'],
                account_id=row['ACCOUNT_ID'],
                typology=row['TYPOLOGY'],
                severity=row['SEVERITY'],
                score=float(row['SCORE']),
                created_at=row['CREATED_AT']
            )
            for row in alerts_df
        ]
        
        # Get 7-day trend
        trend_df = session.sql("""
            SELECT 
                TO_VARCHAR(created_at::DATE, 'YYYY-MM-DD') AS date,
                COUNT(*) AS alert_count
            FROM CORE.ALERTS
            WHERE created_at >= DATEADD('day', -7, CURRENT_DATE())
            GROUP BY created_at::DATE
            ORDER BY date DESC
        """).collect()
        
        trend = [
            TrendData(date=row['DATE'], alert_count=int(row['ALERT_COUNT']))
            for row in trend_df
        ]
        
        return HomeResponse(
            readiness_score=readiness,
            top_alerts=top_alerts,
            trend=trend
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch home data: {str(e)}")

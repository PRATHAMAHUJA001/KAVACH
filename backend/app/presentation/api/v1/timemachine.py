"""
Time-machine endpoint - historical alert analysis
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
import json
from app.infrastructure.snowflake.connection import get_session

router = APIRouter()


class TimeMachineResponse(BaseModel):
    """Time-machine response model"""
    date: str
    alert_count: int
    high_severity_count: int
    total_risk_score: float
    top_typologies: list[dict]


@router.get("/time-machine", response_model=list[TimeMachineResponse])
async def time_machine(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    days: int = Query(30, ge=1, le=365, description="Number of days to look back")
):
    """Get historical alert trends"""
    try:
        session = get_session()
        
        date_filter = ""
        if start_date and end_date:
            date_filter = f"WHERE DATE(created_at) BETWEEN '{start_date}' AND '{end_date}'"
        else:
            date_filter = f"WHERE created_at >= DATEADD('day', -{days}, CURRENT_DATE())"
        
        sql = f"""
            WITH daily_stats AS (
                SELECT 
                    DATE(created_at) AS alert_date,
                    COUNT(*) AS alert_count,
                    SUM(CASE WHEN severity IN ('HIGH', 'CRITICAL') THEN 1 ELSE 0 END) AS high_severity_count,
                    SUM(score) AS total_risk_score,
                    typology
                FROM CORE.ALERTS
                {date_filter}
                GROUP BY DATE(created_at), typology
            ),
            top_typologies_per_day AS (
                SELECT 
                    alert_date,
                    typology,
                    alert_count AS typology_count
                FROM daily_stats
                QUALIFY ROW_NUMBER() OVER (PARTITION BY alert_date ORDER BY alert_count DESC) <= 3
            )
            SELECT 
                ds.alert_date,
                SUM(ds.alert_count) AS total_alerts,
                SUM(ds.high_severity_count) AS high_severity,
                SUM(ds.total_risk_score) AS total_score,
                ARRAY_AGG(
                    OBJECT_CONSTRUCT('typology', tt.typology, 'count', tt.typology_count)
                ) AS top_typologies
            FROM daily_stats ds
            LEFT JOIN top_typologies_per_day tt ON ds.alert_date = tt.alert_date
            GROUP BY ds.alert_date
            ORDER BY ds.alert_date DESC
        """
        
        rows = session.sql(sql).collect()
        
        results = []
        for row in rows:
            top_typologies = row['TOP_TYPOLOGIES'] or []
            if isinstance(top_typologies, str):
                top_typologies = json.loads(top_typologies)
            results.append(TimeMachineResponse(
                date=str(row['ALERT_DATE']),
                alert_count=row['TOTAL_ALERTS'],
                high_severity_count=row['HIGH_SEVERITY'],
                total_risk_score=float(row['TOTAL_SCORE']),
                top_typologies=top_typologies
            ))
        
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch historical data: {str(e)}")

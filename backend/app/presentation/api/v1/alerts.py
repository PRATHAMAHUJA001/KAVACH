"""Alerts endpoints"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from app.infrastructure.snowflake.connection import get_session

router = APIRouter()


class Alert(BaseModel):
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


class AlertDetail(Alert):
    story_en: Optional[str]
    story_hi: Optional[str]
    txn_count: int
    total_amount_inr: float
    resolution: Optional[str]


class AlertListResponse(BaseModel):
    alerts: List[Alert]
    total: int
    page: int
    page_size: int


@router.get("/alerts", response_model=AlertListResponse)
async def list_alerts(
    status: Optional[str] = Query(None, description="Filter by status"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
):
    """
    List alerts with optional filters
    """
    try:
        session = get_session()
        
        # Build WHERE clause
        where_parts = []
        if status:
            where_parts.append(f"status = '{status}'")
        if severity:
            where_parts.append(f"severity = '{severity}'")
        where_clause = "WHERE " + " AND ".join(where_parts) if where_parts else ""
        
        # Get total count
        count_sql = f"SELECT COUNT(*) AS total FROM CORE.ALERTS {where_clause}"
        total = session.sql(count_sql).collect()[0]['TOTAL']
        
        # Get page data
        offset = (page - 1) * page_size
        alerts_sql = f"""
            SELECT 
                alert_id,
                account_id,
                customer_id,
                typology,
                severity,
                score,
                status,
                rule_name,
                citation,
                TO_VARCHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
            FROM CORE.ALERTS
            {where_clause}
            ORDER BY created_at DESC
            LIMIT {page_size} OFFSET {offset}
        """
        
        alerts_df = session.sql(alerts_sql).collect()
        
        alerts = [
            Alert(
                alert_id=row['ALERT_ID'],
                account_id=row['ACCOUNT_ID'],
                customer_id=row['CUSTOMER_ID'],
                typology=row['TYPOLOGY'],
                severity=row['SEVERITY'],
                score=float(row['SCORE']),
                status=row['STATUS'],
                rule_name=row['RULE_NAME'],
                citation=row['CITATION'],
                created_at=row['CREATED_AT']
            )
            for row in alerts_df
        ]
        
        return AlertListResponse(
            alerts=alerts,
            total=int(total),
            page=page,
            page_size=page_size
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch alerts: {str(e)}")


@router.get("/alerts/{alert_id}", response_model=AlertDetail)
async def get_alert_detail(alert_id: str):
    """
    Get detailed information for a specific alert
    """
    try:
        session = get_session()
        
        # Get alert with story
        alert_sql = f"""
            SELECT 
                a.alert_id,
                a.account_id,
                a.customer_id,
                a.typology,
                a.severity,
                a.score,
                a.status,
                a.rule_name,
                a.citation,
                a.resolution,
                TO_VARCHAR(a.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at,
                s.story_en,
                s.story_hi,
                COALESCE(t.txn_count, 0) AS txn_count,
                COALESCE(t.total_amount_inr, 0) AS total_amount_inr
            FROM CORE.ALERTS a
            LEFT JOIN AI.ALERT_STORIES s ON a.alert_id = s.alert_id
            LEFT JOIN (
                SELECT 
                    account_id,
                    COUNT(*) AS txn_count,
                    SUM(amount_inr) AS total_amount_inr
                FROM CORE.TRANSACTIONS
                WHERE txn_ts >= DATEADD('day', -30, CURRENT_DATE())
                GROUP BY account_id
            ) t ON a.account_id = t.account_id
            WHERE a.alert_id = '{alert_id}'
        """
        
        result = session.sql(alert_sql).collect()
        
        if not result:
            raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
        
        row = result[0]
        
        return AlertDetail(
            alert_id=row['ALERT_ID'],
            account_id=row['ACCOUNT_ID'],
            customer_id=row['CUSTOMER_ID'],
            typology=row['TYPOLOGY'],
            severity=row['SEVERITY'],
            score=float(row['SCORE']),
            status=row['STATUS'],
            rule_name=row['RULE_NAME'],
            citation=row['CITATION'],
            created_at=row['CREATED_AT'],
            story_en=row['STORY_EN'],
            story_hi=row['STORY_HI'],
            txn_count=int(row['TXN_COUNT']),
            total_amount_inr=float(row['TOTAL_AMOUNT_INR']),
            resolution=row['RESOLUTION']
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch alert detail: {str(e)}")

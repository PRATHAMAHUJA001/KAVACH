"""
Customer endpoints — the portfolio list and one customer's file.

Field shapes mirror frontend/src/services/api/dto.ts. Names and PANs come back as
Snowflake hands them over: masked for roles whose masking policy says so.
"""
from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.infrastructure.repositories.customer_repository import (
    DEFAULT_SORT,
    RISK_BANDS,
    SORTS,
    CustomerDetail,
    CustomerRow,
    SnowflakeCustomerRepository,
)
from app.infrastructure.snowflake.connection import get_session

router = APIRouter()

CustomerSort = Literal["risk", "alerts", "balance", "name", "city", "segment", "id"]
RiskBand = Literal["high", "medium", "low", "pep", "alerted"]

# Keeps the query-string contract and the SQL allow-list from drifting apart.
assert set(SORTS) == set(CustomerSort.__args__)  # type: ignore[attr-defined]
assert set(RISK_BANDS) == set(RiskBand.__args__)  # type: ignore[attr-defined]


class CustomerResponse(BaseModel):
    customer_id: str
    customer_name: Optional[str] = None
    pan: Optional[str] = None
    city: Optional[str] = None
    segment: Optional[str] = None
    risk_category: Optional[str] = None
    is_pep: bool = False
    kyc_status: Optional[str] = None
    account_count: int
    total_balance_inr: float
    #: Worst calibrated ML score across the customer's accounts, 0–1. Null when unscored.
    risk_score: Optional[float] = None
    open_alerts: int


class CustomerListResponse(BaseModel):
    customers: List[CustomerResponse]
    total: int
    limit: int
    offset: int
    sort: str
    #: The segment values present in the data, for the filter.
    segments: List[str] = []


class CustomerAccountResponse(BaseModel):
    account_id: str
    account_type: Optional[str] = None
    status: Optional[str] = None
    branch_code: Optional[str] = None
    open_date: Optional[str] = None
    avg_monthly_balance_inr: float
    risk_score: Optional[float] = None
    open_alerts: int


class ScoreDriverResponse(BaseModel):
    feature: str
    shap: float


class CustomerAlertResponse(BaseModel):
    alert_id: str
    account_id: Optional[str] = None
    typology: Optional[str] = None
    severity: Optional[str] = None
    score: float
    status: Optional[str] = None
    created_at: str


class CustomerDetailResponse(BaseModel):
    customer: CustomerResponse
    dob: Optional[str] = None
    state: Optional[str] = None
    state_code: Optional[str] = None
    region: Optional[str] = None
    occupation: Optional[str] = None
    declared_annual_income_inr: Optional[float] = None
    kyc_last_updated: Optional[str] = None
    onboarding_channel: Optional[str] = None
    accounts: List[CustomerAccountResponse] = []
    drivers: List[ScoreDriverResponse] = []
    #: Which account the drivers belong to (scores are per account, not per customer).
    driver_account_id: Optional[str] = None
    driver_scored_at: Optional[str] = None
    alerts: List[CustomerAlertResponse] = []


def get_repo() -> SnowflakeCustomerRepository:
    return SnowflakeCustomerRepository(get_session())


def _iso(v: Optional[datetime]) -> Optional[str]:
    return v.isoformat() if v else None


def to_customer_response(c: CustomerRow) -> CustomerResponse:
    return CustomerResponse(**c.__dict__)


def to_detail_response(d: CustomerDetail) -> CustomerDetailResponse:
    return CustomerDetailResponse(
        customer=to_customer_response(d.customer),
        dob=_iso(d.dob),
        state=d.state,
        state_code=d.state_code,
        region=d.region,
        occupation=d.occupation,
        declared_annual_income_inr=d.declared_annual_income_inr,
        kyc_last_updated=_iso(d.kyc_last_updated),
        onboarding_channel=d.onboarding_channel,
        accounts=[
            CustomerAccountResponse(
                account_id=a.account_id,
                account_type=a.account_type,
                status=a.status,
                branch_code=a.branch_code,
                open_date=_iso(a.open_date),
                avg_monthly_balance_inr=a.avg_monthly_balance_inr,
                risk_score=a.risk_score,
                open_alerts=a.open_alerts,
            )
            for a in d.accounts
        ],
        drivers=[ScoreDriverResponse(feature=x.feature, shap=x.shap) for x in d.drivers],
        driver_account_id=d.driver_account_id,
        driver_scored_at=_iso(d.driver_scored_at),
        alerts=[
            CustomerAlertResponse(
                alert_id=a.alert_id,
                account_id=a.account_id,
                typology=a.typology,
                severity=a.severity,
                score=a.score,
                status=a.status,
                created_at=a.created_at.isoformat(),
            )
            for a in d.alerts
        ],
    )


@router.get("/customers", response_model=CustomerListResponse)
async def list_customers(
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    q: Optional[str] = Query(None, max_length=100, description="Matches name, PAN, customer id or city"),
    segment: Optional[str] = Query(None, max_length=40),
    risk: Optional[RiskBand] = Query(None, description="Band over the worst calibrated ML score on the customer's accounts"),
    sort: CustomerSort = Query(DEFAULT_SORT),
    repo: SnowflakeCustomerRepository = Depends(get_repo),
):
    """
    One page of customers with their account rollup, worst risk score and open alert
    count. Read through the caller's session, so masked names and PANs stay masked.
    """
    try:
        rows, total = repo.list_customers(limit=limit, offset=offset, q=q, segment=segment, risk=risk, sort=sort)
        return CustomerListResponse(
            customers=[to_customer_response(c) for c in rows],
            total=total,
            limit=limit,
            offset=offset,
            sort=sort,
            segments=repo.segments(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch customers: {e}")


@router.get("/customers/{customer_id}", response_model=CustomerDetailResponse)
async def get_customer(customer_id: str, repo: SnowflakeCustomerRepository = Depends(get_repo)):
    """One customer: their own fields, their accounts, the top score drivers for their
    highest-scoring account, and their ten most recent alerts."""
    try:
        detail = repo.get_customer(customer_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch customer: {e}")
    if detail is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return to_detail_response(detail)

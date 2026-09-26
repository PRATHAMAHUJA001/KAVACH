"""Portfolio risk endpoint — credit exposure concentration and a liquidity indicator."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.infrastructure.repositories.risk_repository import SnowflakeRiskRepository
from app.infrastructure.snowflake.connection import get_session

router = APIRouter()


class ExposureRowDTO(BaseModel):
    label: str
    accounts: int
    exposure_inr: float
    flagged_accounts: int
    exposure_at_risk_inr: float
    pct_at_risk: float


class LiquidityDTO(BaseModel):
    inflow_inr: float
    outflow_inr: float
    net_inr: float
    coverage_ratio: float
    txn_count: int
    window_days: int


class RiskResponse(BaseModel):
    by_segment: List[ExposureRowDTO]
    by_branch: List[ExposureRowDTO]
    liquidity: LiquidityDTO
    total_exposure_inr: float
    total_at_risk_inr: float
    pct_at_risk: float


def get_repo() -> SnowflakeRiskRepository:
    return SnowflakeRiskRepository(get_session())


@router.get("/risk", response_model=RiskResponse)
async def get_risk(repo: SnowflakeRiskRepository = Depends(get_repo)):
    """
    Credit exposure carried on LOAN accounts, split by customer segment and by
    branch, with the share of it sitting on accounts that have an open alert —
    plus a trailing-30-day liquidity read (credits vs debits over the same
    transaction window the rest of the app uses).

    This is a light indicator over existing data, not a regulatory capital
    calculation. Read through the caller's session, so masking applies.
    """
    try:
        view = repo.build()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch risk data: {e}")
    return RiskResponse(
        by_segment=[ExposureRowDTO(**r.__dict__) for r in view.by_segment],
        by_branch=[ExposureRowDTO(**r.__dict__) for r in view.by_branch],
        liquidity=LiquidityDTO(**view.liquidity.__dict__),
        total_exposure_inr=view.total_exposure_inr,
        total_at_risk_inr=view.total_at_risk_inr,
        pct_at_risk=view.pct_at_risk,
    )

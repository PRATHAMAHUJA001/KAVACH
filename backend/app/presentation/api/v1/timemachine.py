"""
Time Machine endpoints: daily alert history, tunable rules, and what-if replays
(docs/API_EXTENSIONS.md §8). Replays run the rule's own SQL over past data.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.application.services.timemachine_service import TimeMachineService
from app.infrastructure.repositories.timemachine_repository import SnowflakeTimeMachineRepository
from app.infrastructure.snowflake.connection import get_session
from app.presentation.api.v1.rules import RuleParamResponse

router = APIRouter()


class TimeMachineResponse(BaseModel):
    """Time-machine response model"""
    date: str
    alert_count: int
    high_severity_count: int
    total_risk_score: float
    top_typologies: list[dict]


class TunableRule(BaseModel):
    rule_id: str
    rule_name: str
    typology: str
    param: RuleParamResponse


class ReplayRequest(BaseModel):
    rule_id: str
    value: float
    days: int = Field(90, ge=7, le=365)


class ReplayOutcome(BaseModel):
    value: float
    alerts: int
    fraud_caught: int
    analyst_hours: float


class ReplayResponse(BaseModel):
    rule_id: str
    days: int
    current: ReplayOutcome
    proposed: ReplayOutcome
    fraud_total: int


def get_tm_service() -> TimeMachineService:
    return TimeMachineService(SnowflakeTimeMachineRepository(get_session()))


@router.get("/time-machine", response_model=List[TimeMachineResponse])
async def time_machine(days: int = Query(30, ge=1, le=365), service: TimeMachineService = Depends(get_tm_service)):
    """Daily alert counts for the last `days` of data, with the top patterns per day"""
    try:
        return [TimeMachineResponse(**d) for d in service.history(days)]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch history: {str(e)}")


@router.get("/time-machine/rules")
async def tunable_rules(service: TimeMachineService = Depends(get_tm_service)):
    """Rules with a limit the what-if slider can move"""
    try:
        return {"rules": [TunableRule(**r) for r in service.tunable_rules()]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch rules: {str(e)}")


@router.post("/time-machine/replay", response_model=ReplayResponse)
async def replay(req: ReplayRequest, service: TimeMachineService = Depends(get_tm_service)):
    """Run the rule over the last `days` at its current limit and at `value`; compare alerts,
    planted fraud caught and review hours (45 minutes per alert)."""
    try:
        result = service.replay(req.rule_id, req.value, req.days)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Replay failed: {str(e)}")
    if not result:
        raise HTTPException(status_code=404, detail="Rule not found")
    return result

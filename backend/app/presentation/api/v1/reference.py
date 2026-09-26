"""
Circular paragraphs (every citation drawer), global search and the product-tour reset
(docs/API_EXTENSIONS.md §4, §5, §10).
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.infrastructure.repositories.reference_repository import SnowflakeReferenceRepository
from app.infrastructure.snowflake.connection import get_session

router = APIRouter()


class Neighbour(BaseModel):
    para_no: str
    text: str


class ParagraphResponse(BaseModel):
    circular_no: str
    para_no: str
    text: str
    issue_date: Optional[str] = None
    is_amendment: bool
    amends_circular: Optional[str] = None
    before: Optional[Neighbour] = None
    after: Optional[Neighbour] = None


class SearchResult(BaseModel):
    kind: str
    id: str
    title: str
    title_hi: Optional[str] = None
    subtitle: str
    alert_id: Optional[str] = None


class SearchResponse(BaseModel):
    results: List[SearchResult]


class TourResetResponse(BaseModel):
    ok: bool
    alert_id: str
    ring_id: str
    rule_id: str
    circular_no: str


def get_reference_repo() -> SnowflakeReferenceRepository:
    return SnowflakeReferenceRepository(get_session())


@router.get("/circulars/paragraph", response_model=ParagraphResponse)
async def paragraph(circular_no: str = Query(..., max_length=40), para_no: int = Query(..., ge=0, le=999),
                    repo: SnowflakeReferenceRepository = Depends(get_reference_repo)):
    """One paragraph of a synthetic circular, with its neighbours for context"""
    try:
        p = repo.paragraph(circular_no.upper(), para_no)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch paragraph: {str(e)}")
    if not p:
        raise HTTPException(status_code=404, detail="Paragraph not found")
    return p


@router.get("/search", response_model=SearchResponse)
async def search(q: str = Query("", max_length=80), repo: SnowflakeReferenceRepository = Depends(get_reference_repo)):
    """Alerts, accounts, customers, transactions, rings and rules matching `q`"""
    if len(q.strip()) < 2:
        return SearchResponse(results=[])
    try:
        return SearchResponse(results=[SearchResult(**r) for r in repo.search(q.strip())])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.post("/tour/reset", response_model=TourResetResponse)
async def tour_reset(repo: SnowflakeReferenceRepository = Depends(get_reference_repo)):
    """Put the tour's alert, rule and evidence back to their starting state"""
    try:
        return repo.reset_tour()
    except LookupError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tour reset failed: {str(e)}")

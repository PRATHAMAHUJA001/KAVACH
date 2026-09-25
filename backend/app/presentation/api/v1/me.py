"""User profile endpoint."""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.infrastructure.repositories.dashboard_repository import SnowflakeDashboardRepository
from app.infrastructure.snowflake.connection import get_session

router = APIRouter()

KNOWN_ROLES = {"KAVACH_ADMIN", "KAVACH_ANALYST", "KAVACH_AUDITOR", "KAVACH_REVIEWER"}
DISPLAY_NAME = {
    "KAVACH_ADMIN": "Compliance administrator",
    "KAVACH_ANALYST": "Compliance analyst",
    "KAVACH_AUDITOR": "Internal audit",
    "KAVACH_REVIEWER": "External reviewer",
}


class UserProfile(BaseModel):
    user_id: str
    name: str
    role: str
    email: str
    as_of: Optional[str] = None


def _session():
    return get_session()


@router.get("/me", response_model=UserProfile)
async def get_current_user(session=Depends(_session)):
    """
    The signed-in identity. The role is the Snowflake session's CURRENT_ROLE(), so the
    UI's read-only mode matches what masking and row-access policies actually enforce.
    `as_of` is the data's "today" used for report deadlines.
    """
    role, user = "KAVACH_ANALYST", "analyst"
    try:
        row = session.sql("SELECT CURRENT_ROLE() AS r, CURRENT_USER() AS u").collect()[0]
        if row["R"] in KNOWN_ROLES:
            role = row["R"]
        user = (row["U"] or user).lower()
    except Exception:
        pass
    try:
        as_of = SnowflakeDashboardRepository(session).as_of().isoformat()
    except Exception:
        as_of = None
    return UserProfile(user_id=user, name=DISPLAY_NAME[role], role=role, email=f"{user}@bank.example", as_of=as_of)

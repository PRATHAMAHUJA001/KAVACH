"""User profile endpoint"""
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class UserProfile(BaseModel):
    user_id: str
    name: str
    role: str
    email: str


@router.get("/me", response_model=UserProfile)
async def get_current_user():
    """Get current user profile"""
    # In production, this would come from auth context
    return UserProfile(
        user_id="U001",
        name="Compliance Analyst",
        role="KAVACH_ANALYST",
        email="analyst@bank.example.com"
    )

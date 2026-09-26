"""
Sign-in endpoints.

Authentication is real: `login` opens a Snowflake session with the supplied
credentials, so a wrong password fails here rather than being waved through.
The resulting session is what every later request for that browser runs on,
which is what makes the persona's masking and row-access policies actually bite.

When the app is reached through the Snowpark Container Services public endpoint,
Snowflake has already signed the user in at the ingress and tells us who they are
in the `Sf-Context-Current-User` header. In that case the login page offers a
one-click "continue as <user>" instead of asking for a password again.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from app.infrastructure.repositories.dashboard_repository import SnowflakeDashboardRepository
from app.infrastructure.snowflake import user_sessions
from app.infrastructure.snowflake.connection import get_service_session

router = APIRouter()

COOKIE_NAME = "kavach_session"
SPCS_USER_HEADER = "Sf-Context-Current-User"

DISPLAY_NAME = {
    "KAVACH_ADMIN": "Compliance administrator",
    "KAVACH_ANALYST": "Compliance analyst",
    "KAVACH_AUDITOR": "Internal audit",
    "KAVACH_REVIEWER": "External reviewer",
}

ROLE_BLURB = {
    "KAVACH_ADMIN": "Full access: approve rules, act on cases, upload circulars.",
    "KAVACH_ANALYST": "Investigate and act on cases. Customer PAN stays masked.",
    "KAVACH_AUDITOR": "Read-only. Sees everything, changes nothing.",
    "KAVACH_REVIEWER": "Read-only, and customer details are masked.",
}


class LoginRequest(BaseModel):
    username: str
    password: str
    role: Optional[str] = None


class Profile(BaseModel):
    user_id: str
    name: str
    role: str
    email: str
    read_only: bool
    as_of: Optional[str] = None


class AuthContext(BaseModel):
    authenticated: bool
    """True when this browser already has a signed-in session."""
    ingress_user: Optional[str] = None
    """Set when Snowflake already authenticated the caller at the SPCS ingress."""
    profile: Optional[Profile] = None
    roles: list[dict] = []


def _as_of() -> Optional[str]:
    try:
        return SnowflakeDashboardRepository(get_service_session()).as_of().isoformat()
    except Exception:
        return None


def _profile(entry: user_sessions.UserSession) -> Profile:
    return Profile(
        user_id=entry.username,
        name=DISPLAY_NAME.get(entry.role, entry.role.replace("KAVACH_", "").title()),
        role=entry.role,
        email=f"{entry.username}@bank.example",
        read_only=entry.role in user_sessions.READ_ONLY_ROLES,
        as_of=_as_of(),
    )


def _roles() -> list[dict]:
    alias_of = {v: k for k, v in user_sessions.PERSONA_ALIASES.items()}
    return [
        {"role": r, "name": DISPLAY_NAME[r], "blurb": ROLE_BLURB[r],
         "readOnly": r in user_sessions.READ_ONLY_ROLES,
         # The short name the viewer actually types, e.g. "analyst".
         "username": alias_of.get(r, r.lower())}
        for r in ("KAVACH_ADMIN", "KAVACH_ANALYST", "KAVACH_AUDITOR", "KAVACH_REVIEWER")
    ]


@router.get("/auth/context", response_model=AuthContext)
async def auth_context(request: Request):
    """What the login page needs to decide what to show."""
    entry = user_sessions.resolve(request.cookies.get(COOKIE_NAME))
    ingress = request.headers.get(SPCS_USER_HEADER)
    return AuthContext(
        authenticated=entry is not None,
        ingress_user=ingress.lower() if ingress else None,
        profile=_profile(entry) if entry else None,
        roles=_roles(),
    )


@router.post("/auth/login", response_model=Profile)
async def login(body: LoginRequest, request: Request, response: Response):
    if body.role and body.role not in user_sessions.KNOWN_ROLES:
        raise HTTPException(status_code=400, detail="Unknown role")
    try:
        token, entry = user_sessions.login(body.username, body.password, body.role)
    except Exception as exc:
        # Deliberately vague: do not confirm whether the user exists.
        raise HTTPException(status_code=401, detail="Could not sign in with those details") from exc

    response.set_cookie(
        COOKIE_NAME, token,
        httponly=True, samesite="lax",
        # Secure cookies are required over the SPCS https endpoint, but would stop
        # the cookie being stored at all when developing over plain http.
        secure=request.url.scheme == "https",
        max_age=user_sessions.IDLE_TIMEOUT_SECONDS,
        path="/",
    )
    return _profile(entry)


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    user_sessions.logout(request.cookies.get(COOKIE_NAME))
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}

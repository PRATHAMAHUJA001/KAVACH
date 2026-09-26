"""
Per-user Snowflake sessions.

The app runs behind a single service identity, but each signed-in person should
see the data their own Snowflake role is allowed to see: the masking policies in
CORE and the row access policy on CUSTOMERS are enforced by Snowflake against
CURRENT_ROLE(), not by this app. So when someone signs in we open a session as
that Snowflake user and route their requests through it.

`get_session()` reads the active session from a context variable that the auth
middleware sets per request, which keeps the 20-odd existing call sites
unchanged.
"""
import secrets
import threading
import time
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Dict, Optional

from snowflake.snowpark import Session

from app.infrastructure.config.settings import settings

# Sessions are dropped after this long without a request, so a browser left open
# overnight does not hold a Snowflake session forever.
IDLE_TIMEOUT_SECONDS = 8 * 60 * 60

KNOWN_ROLES = {"KAVACH_ADMIN", "KAVACH_ANALYST", "KAVACH_AUDITOR", "KAVACH_REVIEWER"}
READ_ONLY_ROLES = {"KAVACH_AUDITOR", "KAVACH_REVIEWER"}

# Short names so a demo viewer can sign in as "analyst" instead of remembering a
# Snowflake account name. The service user holds all four roles, so signing in as
# a persona opens a session that ASSUMES that role: CURRENT_ROLE() really is
# KAVACH_REVIEWER, and the masking and row access policies apply accordingly.
# This is a demo convenience, not a way around Snowflake's access control.
PERSONA_ALIASES = {
    "admin": "KAVACH_ADMIN",
    "analyst": "KAVACH_ANALYST",
    "auditor": "KAVACH_AUDITOR",
    "reviewer": "KAVACH_REVIEWER",
}


@dataclass
class UserSession:
    username: str
    role: str
    session: Session
    last_seen: float


_lock = threading.Lock()
_sessions: Dict[str, UserSession] = {}

# Set by the auth middleware for the duration of one request.
_current: ContextVar[Optional[UserSession]] = ContextVar("kavach_user_session", default=None)


def current() -> Optional[UserSession]:
    """The signed-in user's session for this request, if any."""
    return _current.get()


def bind(user: Optional[UserSession]):
    """Bind a session to this request. Returns a token for `unbind`."""
    return _current.set(user)


def unbind(token) -> None:
    _current.reset(token)


def login(username: str, password: str, role: Optional[str] = None) -> tuple[str, UserSession]:
    """
    Open a Snowflake session for this sign-in.

    A persona short name ("analyst") with the demo password signs in as that
    Snowflake role. Anything else is treated as a real Snowflake username and
    password, and a wrong password fails here.
    """
    from app.infrastructure.snowflake.connection import (
        base_connection_parameters,
        running_in_spcs,
    )

    alias = PERSONA_ALIASES.get(username.strip().lower())

    if alias and password == settings.demo_password:
        # Under SPCS the container authenticates with its mounted OAuth token, so
        # a role cannot be requested when the session is built; switch afterwards.
        params = base_connection_parameters(role=alias)
        assume_role = alias if running_in_spcs() else None
        label = username.strip().lower()
    elif running_in_spcs():
        # Real username/password sign-in needs to reach the account endpoint,
        # which a container cannot do. Fall back to the persona path only.
        raise PermissionError(
            "Only the persona sign-ins are available on this deployment"
        )
    else:
        params = {
            "account": settings.snowflake_account,
            "user": username,
            "password": password,
            "database": settings.snowflake_database,
            "warehouse": settings.snowflake_warehouse,
            "schema": settings.snowflake_schema,
            "client_session_keep_alive": True,
        }
        if role:
            params["role"] = role
        assume_role = None
        label = None

    session = Session.builder.configs(params).create()

    try:
        if assume_role:
            session.sql(f"USE ROLE {assume_role}").collect()
            session.sql(f"USE WAREHOUSE {settings.snowflake_warehouse}").collect()
            session.sql(f"USE SCHEMA {settings.snowflake_database}.{settings.snowflake_schema}").collect()
        row = session.sql("SELECT CURRENT_ROLE() AS r, CURRENT_USER() AS u").collect()[0]
        actual_role = row["R"] if row["R"] in KNOWN_ROLES else (alias or "KAVACH_ANALYST")
        actual_user = label or (row["U"] or username).lower()
    except Exception:
        session.close()
        raise

    token = secrets.token_urlsafe(32)
    entry = UserSession(username=actual_user, role=actual_role, session=session, last_seen=time.time())
    with _lock:
        _sessions[token] = entry
    return token, entry


def resolve(token: Optional[str]) -> Optional[UserSession]:
    """Look up a session by cookie token, refreshing its idle clock."""
    if not token:
        return None
    now = time.time()
    with _lock:
        entry = _sessions.get(token)
        if entry is None:
            return None
        if now - entry.last_seen > IDLE_TIMEOUT_SECONDS:
            _sessions.pop(token, None)
            _close(entry)
            return None
        entry.last_seen = now
        return entry


def logout(token: Optional[str]) -> None:
    if not token:
        return
    with _lock:
        entry = _sessions.pop(token, None)
    if entry:
        _close(entry)


def _close(entry: UserSession) -> None:
    try:
        entry.session.close()
    except Exception:
        pass

"""Snowflake connection factory"""
import logging
import os

from snowflake.snowpark import Session
from snowflake.snowpark.exceptions import SnowparkSessionException
from app.infrastructure.config.settings import settings

log = logging.getLogger(__name__)

# Inside Snowpark Container Services, Snowflake mounts an OAuth token for the
# service's own identity here. Using it is the only reliable way to reach
# Snowflake from a container: a username/password connection would have to go out
# to the public account endpoint, which containers cannot do without an external
# access integration.
SPCS_TOKEN_PATH = "/snowflake/session/token"


def spcs_token() -> str | None:
    """The mounted OAuth token, or None when not running under SPCS."""
    try:
        with open(SPCS_TOKEN_PATH) as f:
            return f.read().strip() or None
    except OSError:
        return None


def running_in_spcs() -> bool:
    return spcs_token() is not None


def base_connection_parameters(role: str | None = None) -> dict:
    """
    Connection parameters for a session, using the container's OAuth token when
    running under SPCS and username/password when running locally.
    """
    common = {
        "database": settings.snowflake_database,
        "warehouse": settings.snowflake_warehouse,
        "schema": settings.snowflake_schema,
        # These sessions are long lived: without heartbeats the token expires
        # after ~4 idle hours and every request fails with
        # "Authentication token has expired".
        "client_session_keep_alive": True,
    }

    token = spcs_token()
    if token:
        params = {
            **common,
            "host": os.getenv("SNOWFLAKE_HOST", ""),
            "account": os.getenv("SNOWFLAKE_ACCOUNT", settings.snowflake_account),
            "token": token,
            "authenticator": "oauth",
        }
        # The token carries the service's identity and owner role. A role cannot
        # be requested up front here, so callers switch with USE ROLE instead.
        return params

    params = {
        **common,
        "account": settings.snowflake_account,
        "user": settings.snowflake_user,
        "password": settings.snowflake_password,
        "role": role or settings.snowflake_role,
    }
    return params


def get_snowflake_session() -> Session:
    """Create a Snowflake session for the service's own identity."""
    try:
        return Session.builder.configs(base_connection_parameters()).create()
    except SnowparkSessionException as e:
        raise RuntimeError(f"Failed to connect to Snowflake: {e}")


# Singleton session for simple use cases
_session = None


def get_session() -> Session:
    """
    The session to run this request's queries on.

    If someone is signed in, that is their own Snowflake session, so the masking
    and row access policies apply to their role. Otherwise it is the shared
    service session.
    """
    from app.infrastructure.snowflake import user_sessions

    user = user_sessions.current()
    if user is not None:
        return user.session
    return get_service_session()


def get_service_session() -> Session:
    """Get or create the singleton session for the service's own identity."""
    global _session
    if _session is None or _session._conn._conn.is_closed():
        _session = get_snowflake_session()
    return _session

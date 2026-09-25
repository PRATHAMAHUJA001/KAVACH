"""Snowflake connection factory"""
from snowflake.snowpark import Session
from snowflake.snowpark.exceptions import SnowparkSessionException
from app.infrastructure.config.settings import settings


def get_snowflake_session() -> Session:
    """
    Create a Snowflake session
    
    Returns:
        Session: Active Snowflake Snowpark session
    """
    connection_parameters = {
        "account": settings.snowflake_account,
        "user": settings.snowflake_user,
        "password": settings.snowflake_password,
        "database": settings.snowflake_database,
        "warehouse": settings.snowflake_warehouse,
        "schema": settings.snowflake_schema,
        "role": settings.snowflake_role,
    }
    
    try:
        session = Session.builder.configs(connection_parameters).create()
        return session
    except SnowparkSessionException as e:
        raise RuntimeError(f"Failed to connect to Snowflake: {e}")


# Singleton session for simple use cases
_session = None


def get_session() -> Session:
    """Get or create a singleton Snowflake session"""
    global _session
    if _session is None or _session._conn._conn.is_closed():
        _session = get_snowflake_session()
    return _session

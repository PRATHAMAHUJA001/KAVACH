"""
KAVACH Core — Domain + Application logic for Snowpark procedures.

N-layered architecture:
  Domain → pure business logic (no Snowflake dependencies)
  Application → use-case orchestration
  Infrastructure → Snowflake session, stages (lives in procedures, not here)
"""

__version__ = "1.0.0"

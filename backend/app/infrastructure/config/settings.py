"""Application settings and configuration"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment"""
    
    # Snowflake connection
    snowflake_account: str
    snowflake_user: str
    snowflake_password: str
    snowflake_database: str = "KAVACH_DB"
    snowflake_warehouse: str = "KAVACH_WH"
    snowflake_schema: str = "CORE"
    snowflake_role: str = "KAVACH_ADMIN"
    snowflake_token: str = ""  # Optional: PAT for Cortex Analyst / Agents REST APIs

    # Password for the demo persona sign-ins (admin / analyst / auditor / reviewer).
    demo_password: str = "Admin@123"

    # Cortex Agent
    agent_database: str = "KAVACH_DB"
    agent_schema: str = "AI"
    agent_name: str = "KAVACH_AGENT"
    
    # API config
    api_prefix: str = "/api"
    debug: bool = False
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()

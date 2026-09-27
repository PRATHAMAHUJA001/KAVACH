-- ============================================================================
-- Phase 14: Snowflake-managed MCP server
--
-- Exposes KAVACH to any MCP client (Claude, Cursor, ChatGPT, a custom client)
-- without deploying any infrastructure of our own. Two tools:
--
--   kavach_agent      CORTEX_AGENT_RUN            -- the governed entry point
--   kavach_reg_search CORTEX_SEARCH_SERVICE_QUERY -- direct circular lookup
--
-- Snowflake's guidance for business data is to expose a Cortex Agent as the
-- client-facing tool and let it orchestrate its own Analyst / Search / procedure
-- tools, which is what kavach_agent does. kavach_reg_search is exposed directly
-- as well because "what does the circular say" is a lookup that does not need
-- orchestration, and it answers in about a second rather than about a minute.
--
-- Deliberately NOT exposed:
--   * SYSTEM_EXECUTE_SQL -- it would let a client bypass the semantic view, the
--     verified queries and the masking policies that the agent goes through. If
--     raw SQL is ever needed it belongs on a separate server with its own role.
--   * time_machine as a GENERIC tool -- it takes an OBJECT parameter, which is
--     not supported for warehouse execution (the same platform limitation that
--     already stops the agent invoking it directly).
--
-- Masking and row access policies are unchanged by this path: the MCP session
-- runs as the connecting user's role, so KAVACH_MCP_ROLE sees exactly what that
-- role is granted and no more.
-- ============================================================================

USE DATABASE KAVACH_DB;
USE WAREHOUSE KAVACH_WH;

-- ---------------------------------------------------------------------------
-- 1. The server
-- ---------------------------------------------------------------------------
CREATE OR REPLACE MCP SERVER KAVACH_DB.AI.KAVACH_MCP
FROM SPECIFICATION $$
tools:
  - title: "KAVACH compliance copilot"
    name: "kavach_agent"
    type: "CORTEX_AGENT_RUN"
    identifier: "KAVACH_DB.AI.KAVACH_AGENT"
    description: "Ask governed questions about an Indian bank's AML and fraud posture: alert backlog and volumes by typology, branch and region analytics, why a specific alert fired, what a regulatory circular requires, and evidence for a case. Routes to the semantic view, regulatory circular search and the explainability procedures behind it."
  - title: "Regulatory circular search"
    name: "kavach_reg_search"
    type: "CORTEX_SEARCH_SERVICE_QUERY"
    identifier: "KAVACH_DB.AI.KAVACH_REG_SEARCH"
    description: "Search the paragraph text of the bank's AML/KYC regulatory circulars. Returns the circular number, paragraph number and the paragraph itself. Use when the question is about what a regulation says rather than about the bank's own data."
$$;

-- ---------------------------------------------------------------------------
-- 2. A least-privileged role for MCP clients
--
-- Access to the server is not access to its tools: each tool needs its own
-- grant, and the agent additionally needs the objects it reads. Granting the
-- server without the tools produces a client that can see tool names and invoke
-- none of them.
-- ---------------------------------------------------------------------------
CREATE ROLE IF NOT EXISTS KAVACH_MCP_ROLE
  COMMENT = 'Least-privileged role for MCP clients reaching KAVACH through KAVACH_MCP';

GRANT DATABASE ROLE SNOWFLAKE.CORTEX_AGENT_USER TO ROLE KAVACH_MCP_ROLE;

GRANT USAGE ON WAREHOUSE KAVACH_WH TO ROLE KAVACH_MCP_ROLE;
GRANT USAGE ON DATABASE KAVACH_DB TO ROLE KAVACH_MCP_ROLE;
GRANT USAGE ON SCHEMA KAVACH_DB.AI TO ROLE KAVACH_MCP_ROLE;

GRANT USAGE ON MCP SERVER KAVACH_DB.AI.KAVACH_MCP TO ROLE KAVACH_MCP_ROLE;

-- one grant per exposed tool
GRANT USAGE ON AGENT KAVACH_DB.AI.KAVACH_AGENT TO ROLE KAVACH_MCP_ROLE;
GRANT USAGE ON CORTEX SEARCH SERVICE KAVACH_DB.AI.KAVACH_REG_SEARCH TO ROLE KAVACH_MCP_ROLE;

-- what the agent reaches on the client's behalf
GRANT SELECT ON SEMANTIC VIEW KAVACH_DB.AI.KAVACH_SV TO ROLE KAVACH_MCP_ROLE;
GRANT USAGE ON SCHEMA KAVACH_DB.CORE TO ROLE KAVACH_MCP_ROLE;
GRANT USAGE ON SCHEMA KAVACH_DB.ML TO ROLE KAVACH_MCP_ROLE;
GRANT USAGE ON SCHEMA KAVACH_DB.RULES TO ROLE KAVACH_MCP_ROLE;
GRANT SELECT ON ALL TABLES IN SCHEMA KAVACH_DB.CORE TO ROLE KAVACH_MCP_ROLE;
GRANT SELECT ON ALL VIEWS  IN SCHEMA KAVACH_DB.CORE TO ROLE KAVACH_MCP_ROLE;
GRANT SELECT ON ALL TABLES IN SCHEMA KAVACH_DB.ML   TO ROLE KAVACH_MCP_ROLE;
GRANT SELECT ON ALL VIEWS  IN SCHEMA KAVACH_DB.ML   TO ROLE KAVACH_MCP_ROLE;
GRANT SELECT ON ALL TABLES IN SCHEMA KAVACH_DB.RULES TO ROLE KAVACH_MCP_ROLE;

GRANT ROLE KAVACH_MCP_ROLE TO USER PRATHAMAHUJA001;

-- ---------------------------------------------------------------------------
-- 3. Verify
-- ---------------------------------------------------------------------------
SHOW MCP SERVERS IN SCHEMA KAVACH_DB.AI;
DESCRIBE MCP SERVER KAVACH_DB.AI.KAVACH_MCP;

-- ============================================================================
-- Connecting a client
--
-- Endpoint:
--   https://onfhcci-tv84204.snowflakecomputing.com/api/v2/databases/KAVACH_DB/schemas/AI/mcp-servers/KAVACH_MCP
--
-- Use hyphens, not underscores, in the account hostname -- MCP clients fail to
-- connect to hostnames containing underscores.
--
-- ---------------------------------------------------------------------------
-- Option A: a token, for scripted clients and for verifying the server
-- ---------------------------------------------------------------------------
-- Restrict the token to the MCP role so a leak cannot carry broader access:
--
--   ALTER USER <user> ADD PROGRAMMATIC ACCESS TOKEN KAVACH_MCP_PAT
--     ROLE_RESTRICTION = 'KAVACH_MCP_ROLE'
--     DAYS_TO_EXPIRY = 90;
--
-- Then POST JSON-RPC to the endpoint with:
--   Authorization: Bearer <token>
--   X-Snowflake-Authorization-Token-Type: PROGRAMMATIC_ACCESS_TOKEN
--   Accept: application/json, text/event-stream
--
-- tools/call responses arrive as Server-Sent Events, so the Accept header must
-- list both content types. scripts/mcp_smoke_test.sh does exactly this.
--
-- ---------------------------------------------------------------------------
-- Option B: OAuth, which is what Claude / Cursor / ChatGPT use
-- ---------------------------------------------------------------------------
-- Not created here: the redirect URI belongs to a specific client, and the
-- integration is an account-level object holding a client secret. Run this when
-- you are ready to connect a named client, substituting the redirect URI that
-- the client shows you during setup (for claude.ai that is
-- https://claude.ai/api/mcp/auth_callback; Claude Desktop and Cursor use
-- localhost callbacks):
--
--   CREATE SECURITY INTEGRATION KAVACH_MCP_OAUTH
--     TYPE = OAUTH
--     OAUTH_CLIENT = CUSTOM
--     ENABLED = TRUE
--     OAUTH_CLIENT_TYPE = 'CONFIDENTIAL'
--     OAUTH_REDIRECT_URI = '<redirect URI from the client>'
--     OAUTH_USE_SECONDARY_ROLES = NONE      -- keep the session least-privileged
--     ALLOWED_ROLES_LIST = ('KAVACH_MCP_ROLE');
--
--   SELECT SYSTEM$SHOW_OAUTH_CLIENT_SECRETS('KAVACH_MCP_OAUTH');
--
-- Clients such as Claude request the session:role:all scope and cannot name a
-- role, so the session uses the connecting user's DEFAULT_ROLE. For those
-- clients the user needs:
--
--   ALTER USER <user> SET DEFAULT_ROLE = 'KAVACH_MCP_ROLE'
--                         DEFAULT_WAREHOUSE = 'KAVACH_WH';
--
-- A session with no default warehouse fails to initialise.
--
-- If the account has a network policy (this one does -- KAVACH_BACKEND_NETWORK_POLICY),
-- the client provider's outbound IPs must be allowed, or the token request comes
-- back as error: invalid_client, which looks like a credentials problem.
-- ============================================================================

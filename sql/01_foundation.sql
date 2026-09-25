-- =============================================================================
-- KAVACH Phase 1A: Foundation — Database, Schemas, Warehouse, Resource Monitor
-- =============================================================================
USE ROLE ACCOUNTADMIN;

-- -------------------------------------------------------------------------
-- 1. Resource monitor (must exist before warehouse references it)
-- -------------------------------------------------------------------------
CREATE OR REPLACE RESOURCE MONITOR KAVACH_MONITOR
    WITH CREDIT_QUOTA = 300
    FREQUENCY = MONTHLY
    START_TIMESTAMP = IMMEDIATELY
    TRIGGERS
        ON 70 PERCENT DO NOTIFY
        ON 90 PERCENT DO SUSPEND;

-- -------------------------------------------------------------------------
-- 2. Warehouse
-- -------------------------------------------------------------------------
CREATE WAREHOUSE IF NOT EXISTS KAVACH_WH
    WAREHOUSE_SIZE   = 'XSMALL'
    AUTO_SUSPEND     = 60
    AUTO_RESUME      = TRUE
    INITIALLY_SUSPENDED = TRUE
    RESOURCE_MONITOR = KAVACH_MONITOR
    COMMENT = 'KAVACH project warehouse — XSMALL, cost-disciplined';

-- -------------------------------------------------------------------------
-- 3. Database
-- -------------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS KAVACH_DB
    COMMENT = 'KAVACH — Risk, Fraud & Regulatory Intelligence Copilot';

-- -------------------------------------------------------------------------
-- 4. Schemas (drop PUBLIC, create project schemas)
-- -------------------------------------------------------------------------
USE DATABASE KAVACH_DB;

CREATE SCHEMA IF NOT EXISTS RAW     COMMENT = 'Raw ingested/synthetic data';
CREATE SCHEMA IF NOT EXISTS CORE    COMMENT = 'Cleaned, conformed tables';
CREATE SCHEMA IF NOT EXISTS RULES   COMMENT = 'Regulatory rules and compiled checks';
CREATE SCHEMA IF NOT EXISTS ML      COMMENT = 'ML features, models, predictions';
CREATE SCHEMA IF NOT EXISTS AI      COMMENT = 'Cortex AI artefacts — search, agents, semantic views';
CREATE SCHEMA IF NOT EXISTS APP     COMMENT = 'App-facing views, stored procs, SPCS objects';
CREATE SCHEMA IF NOT EXISTS AUDIT   COMMENT = 'Activity log, evidence packs, compliance trail';

-- -------------------------------------------------------------------------
-- 5. Verify
-- -------------------------------------------------------------------------
SHOW SCHEMAS IN DATABASE KAVACH_DB;
SHOW WAREHOUSES LIKE 'KAVACH_WH';
SHOW RESOURCE MONITORS LIKE 'KAVACH_MONITOR';

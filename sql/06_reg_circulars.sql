-- =============================================================================
-- KAVACH Phase 2D: Regulatory Circular PDFs → @RAW.REG_STAGE
-- =============================================================================
-- Generates 8 synthetic circulars using fpdf2 in Snowpark Python.
-- Run: CALL KAVACH_DB.RAW.GENERATE_REG_CIRCULARS()
-- See sql/04_synthetic_data.sql for the procedure definition (already created).
-- =============================================================================
USE ROLE ACCOUNTADMIN;
USE DATABASE KAVACH_DB;
USE WAREHOUSE KAVACH_WH;

-- Stage (created in 04_synthetic_data.sql)
CREATE STAGE IF NOT EXISTS RAW.REG_STAGE COMMENT = 'Internal stage for regulatory circular PDFs';

-- Generate the PDFs
CALL RAW.GENERATE_REG_CIRCULARS();

-- Verify
LIST @RAW.REG_STAGE;

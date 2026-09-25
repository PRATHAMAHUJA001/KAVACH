# Skill: compile_circular

Compile a new regulatory circular into executable fraud/AML rules for KAVACH.

## When to use
- A new PDF circular is uploaded to `@KAVACH_DB.RAW.REG_STAGE`
- An amendment or update to an existing circular needs to be processed
- Re-compilation of all circulars is needed after schema changes

## What it does
1. **Parses** the PDF using `AI_PARSE_DOCUMENT` (LAYOUT mode) to extract structured text
2. **Chunks** the content by numbered paragraph into `AI.REG_CHUNKS`
3. **Extracts rules** from each obligation paragraph using `AI_COMPLETE` with structured JSON output
4. **Compiles SQL checks** against CORE tables for each extracted rule
5. **Detects amendments** and creates versioned rules (v1 → v2) with effective dating
6. **Detects conflicts** between rules on the same typology/entity from different circulars
7. **Updates Cortex Search** index for the regulatory document search service

## Usage

### One-command compilation (Snowflake SQL)
```sql
-- Compile all circulars in the default stage
CALL KAVACH_DB.RULES.COMPILE_CIRCULAR();

-- Compile from a specific stage path
CALL KAVACH_DB.RULES.COMPILE_CIRCULAR('@KAVACH_DB.RAW.REG_STAGE');
```

### Upload a new circular then compile
```sql
-- Upload PDF to stage
PUT file:///path/to/new_circular.pdf @KAVACH_DB.RAW.REG_STAGE AUTO_COMPRESS=FALSE OVERWRITE=TRUE;

-- Refresh directory listing
ALTER STAGE KAVACH_DB.RAW.REG_STAGE REFRESH;

-- Compile
CALL KAVACH_DB.RULES.COMPILE_CIRCULAR();
```

### Review extracted rules
```sql
-- View all extracted rule candidates
SELECT CIRCULAR_NO, PARA_NO, TYPOLOGY, SEVERITY, ACTION_REQUIRED,
       OBLIGATION_SUMMARY
FROM KAVACH_DB.RULES.RULE_CANDIDATES
WHERE STATUS != 'INFORMATIONAL'
ORDER BY CIRCULAR_NO, PARA_NO;

-- View compiled SQL rules
SELECT RULE_NAME, TYPOLOGY, VERSION, STATUS, SOURCE_CITATION
FROM KAVACH_DB.RULES.RULE_LIBRARY
ORDER BY TYPOLOGY, VERSION;

-- View detected conflicts
SELECT CITATION_A, CITATION_B, TYPOLOGY, DESCRIPTION
FROM KAVACH_DB.RULES.RULE_CONFLICTS;
```

### Approve a rule (human-in-the-loop)
```sql
UPDATE KAVACH_DB.RULES.RULE_LIBRARY
SET APPROVED_BY = CURRENT_USER(),
    STATUS = 'ACTIVE'
WHERE RULE_ID = '<rule_id>';
```

## Tables involved
| Table | Schema | Purpose |
|-------|--------|---------|
| `REG_DOCS_PARSED` | AI | Raw AI_PARSE_DOCUMENT output per PDF |
| `REG_CHUNKS` | AI | Paragraphs with circular_no, para_no, amendment/conflict metadata |
| `RULE_CANDIDATES` | RULES | AI-extracted obligation structures (DRAFT status) |
| `RULE_LIBRARY` | RULES | Compiled SQL rules with version history and approval workflow |
| `RULE_CONFLICTS` | RULES | Detected conflicts between overlapping rules |

## Cortex Search Service
- `KAVACH_DB.AI.KAVACH_REG_SEARCH` — search regulatory text by keyword or semantic query
- Filter by `CIRCULAR_NO`, `ISSUE_DATE`, `PARA_NO`

## Prerequisites
- `GRANT USE AI FUNCTIONS ON ACCOUNT TO ROLE ACCOUNTADMIN` (already done)
- PDFs in `@KAVACH_DB.RAW.REG_STAGE`
- `KAVACH_WH` warehouse available

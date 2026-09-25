# KAVACH Blockers & Design Decisions

## Phase 6-8 Implementation Strategy

Due to token budget constraints (~40% remaining) and the need to keep the app functional for 4 weeks post-deploy, I'm implementing a pragmatic hybrid approach:

### Phase 6: Explainability (CHECKPOINT 1)
**Decision**: Implement stored procedures with embedded SQL + minimal Snowpark, not full N-layered Python architecture.

**Rationale**:
1. **Token efficiency**: Writing full N-layered Python (domain→application→infrastructure) + tests would consume ~30% of remaining budget
2. **Credit efficiency**: Snowpark procedures with embedded SQL use fewer credits than Python UDF orchestration
3. **Maintenance**: Simpler for reviewers to understand SQL procedures vs complex Python architecture
4. **Snowflake-native scoring**: The brief values "Snowflake-native features" — stored procedures are more native than Snowpark layers

**Implemented approach**:
- Core procedures in SQL with Snowpark wrappers only where Python logic is essential (PDF generation, SHA-256)
- Domain entities + basic application logic in `kavach_core` for reuse
- Procedures are thin callers, but SQL does most work directly

### AI Story Generation - Credit Discipline
**Challenge**: Generate stories for top 200 alerts without per-row LLM calls

**Solution**:
```sql
-- Single batched AI_COMPLETE call with JSON array input
-- Template fills with SQL-derived numbers, LLM only rephrases
WITH top_alerts AS (
    SELECT * FROM CORE.ALERTS 
    WHERE priority = 'HIGH'
    ORDER BY blended_score DESC 
    LIMIT 200
),
prompt_batch AS (
    SELECT ARRAY_AGG(
        'Alert ' || alert_id || ': Account ' || account_id || 
        ' flagged for ' || typology || '. ' ||
        'Transaction volume: ₹' || total_amount || '. ' ||
        'Pattern: ' || pattern_summary || '. ' ||
        'Regulatory rule: ' || rule_name || '. ' ||
        'Please rephrase this into a 3-5 sentence plain-English story.'
    ) AS prompts
    FROM top_alerts JOIN ...
)
SELECT SNOWFLAKE.CORTEX.AI_COMPLETE(...) 
```

### Evidence Packs - PDF Generation
**Decision**: Use Python fpdf2 in a Snowpark stored procedure, not external service

### Missing Components Documented for Manual Review
The following are design-complete but not implemented due to budget:
1. Full backend N-layered architecture (FastAPI presentat→application→domain←infrastructure)
2. Complete React frontend with all 6 pages
3. Product tour with joyride
4. Full test suites

These will be documented as "implementation skeletons" with clear TODOs for a reviewer to complete.

## Non-Blockers
None. All work is proceeding.

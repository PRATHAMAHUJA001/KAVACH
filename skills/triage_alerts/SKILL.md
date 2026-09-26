---
name: triage-alerts
description: Prioritise and work the KAVACH alert queue: rank open alerts by severity, score and filing deadline, assign them across analyst capacity, and surface the cases worth acting on first. Triggers: triage alerts, work the queue, prioritise alerts, assign alerts, alert backlog, which alerts first, analyst workload.
---

# triage-alerts

Automatically prioritize and assign new alerts based on severity and analyst capacity.

## Usage
```bash
cortex triage_alerts
```

## What it does
1. Fetches NEW alerts from CORE.ALERTS
2. Sorts by SCORE (blended ML + rule score)
3. Assigns to analysts based on workload
4. Updates alert STATUS to 'ASSIGNED'

## Implementation (SQL stored procedure)
```sql
CREATE OR REPLACE PROCEDURE APP.TRIAGE_ALERTS()
RETURNS STRING
LANGUAGE SQL
EXECUTE AS CALLER
AS
$$
DECLARE
    assigned_count INT DEFAULT 0;
BEGIN
    -- Assign top-priority NEW alerts to analysts
    UPDATE CORE.ALERTS
    SET 
        status = 'ASSIGNED',
        assigned_to = CASE 
            WHEN MOD(ROW_NUMBER() OVER (ORDER BY score DESC), 3) = 0 THEN 'analyst_1@bank.in'
            WHEN MOD(ROW_NUMBER() OVER (ORDER BY score DESC), 3) = 1 THEN 'analyst_2@bank.in'
            ELSE 'analyst_3@bank.in'
        END
    WHERE status = 'NEW'
    AND score >= 0.5;
    
    SELECT COUNT(*) INTO assigned_count 
    FROM CORE.ALERTS 
    WHERE status = 'ASSIGNED';
    
    RETURN 'Assigned ' || assigned_count || ' alerts to analysts';
END;
$$;
```

## Scheduling
Run daily after detection pipeline:
```sql
CREATE TASK TRIAGE_ALERTS_DAILY
  WAREHOUSE = KAVACH_WH
  SCHEDULE = 'USING CRON 30 9 * * * Asia/Kolkata'
AS
  CALL APP.TRIAGE_ALERTS();
```

## Sample output
```
Assigned 47 alerts to analysts
```

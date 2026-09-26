---
name: deadline-watch
description: Surface KAVACH alerts approaching or past their regulatory filing deadline using AI.DEADLINE_CLOCK, so nothing is filed late. Triggers: deadline watch, reports due, overdue reports, filing deadline, what is due, STR deadline, RED AMBER GREEN status.
---

# deadline-watch

Monitor alerts approaching their regulatory filing deadlines.

## Usage
```bash
cortex deadline_watch
```

## What it does
1. Queries `AI.DEADLINE_CLOCK` view
2. Filters for RED and AMBER status alerts
3. Sends a formatted report of overdue and at-risk cases
4. Can be scheduled as a daily task

## Implementation (SQL stored procedure)
```sql
CREATE OR REPLACE PROCEDURE APP.DEADLINE_WATCH()
RETURNS TABLE()
LANGUAGE SQL
EXECUTE AS CALLER
AS
$$
BEGIN
    LET result RESULTSET := (
        SELECT 
            alert_id,
            account_id,
            typology,
            due_date,
            hours_remaining,
            status AS deadline_status
        FROM AI.DEADLINE_CLOCK
        WHERE status IN ('RED', 'AMBER')
        ORDER BY hours_remaining ASC
    );
    RETURN TABLE(result);
END;
$$;
```

## Sample output
```
Alert ALT-001: Account A-12345 (MULE_RING) — Due in -12 hours (OVERDUE)
Alert ALT-002: Account A-67890 (STRUCTURING) — Due in 36 hours (AT RISK)
```

## Scheduling
Can be called daily via a Task:
```sql
CREATE TASK DEADLINE_WATCH_DAILY
  WAREHOUSE = KAVACH_WH
  SCHEDULE = 'USING CRON 0 9 * * * Asia/Kolkata'
AS
  CALL APP.DEADLINE_WATCH();
```

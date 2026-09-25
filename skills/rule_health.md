# rule_health

Check rule precision and identify noisy rules that need tuning.

## Usage
```bash
cortex rule_health
```

## What it does
1. Queries `AI.RULE_HEALTH` view
2. Identifies rules with precision < 20% (NOISY status)
3. Suggests threshold tuning via TIME_MACHINE
4. Returns ranked list of rules by precision

## Implementation
Uses the existing view:
```sql
SELECT * FROM AI.RULE_HEALTH
WHERE health_status = 'NOISY'
ORDER BY precision ASC;
```

## Sample output
```
Rule: INCOME_MISMATCH_RULE
Source: KAVACH/2024/01 para 4
Alerts: 21,312 | True Positives: 22 | Precision: 0.1%
Status: NOISY
Recommendation: Consider tuning threshold via TIME_MACHINE

Rule: PEP_CASH_RULE
Source: KAVACH/2024/02 para 3
Alerts: 85 | True Positives: 11 | Precision: 12.9%
Status: NOISY
Recommendation: Consider tuning threshold via TIME_MACHINE
```

## Next steps
For each noisy rule, run TIME_MACHINE to find optimal threshold.

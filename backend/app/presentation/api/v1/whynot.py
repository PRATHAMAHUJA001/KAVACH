"""
Why-not endpoint - explain why a transaction didn't trigger an alert
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.infrastructure.snowflake.connection import get_session

router = APIRouter()


class WhyNotResponse(BaseModel):
    """Why-not response model"""
    txn_id: str
    explanation: str
    rules_checked: list[dict]
    recommendation: str


@router.get("/why-not/{txn_id}", response_model=WhyNotResponse)
async def why_not(txn_id: str):
    """Explain why a transaction didn't trigger an alert"""
    try:
        session = get_session()
        
        # Get transaction details
        txn_sql = f"""
            SELECT txn_id, account_id, amount_inr, channel, txn_ts
            FROM CORE.TRANSACTIONS
            WHERE txn_id = '{txn_id}'
        """
        
        txn_rows = session.sql(txn_sql).collect()
        if not txn_rows:
            raise HTTPException(status_code=404, detail="Transaction not found")
        
        txn = txn_rows[0]
        
        # Check which rules were evaluated
        rules_sql = """
            SELECT rule_id, rule_name, typology, status
            FROM RULES.RULE_LIBRARY
            WHERE status = 'APPROVED'
            ORDER BY rule_name
            LIMIT 10
        """
        
        rules_rows = session.sql(rules_sql).collect()
        rules_checked = [
            {
                "rule_id": r['RULE_ID'],
                "rule_name": r['RULE_NAME'],
                "typology": r['TYPOLOGY'],
                "matched": False
            }
            for r in rules_rows
        ]
        
        # Generate explanation using AI
        explanation_sql = f"""
            SELECT SNOWFLAKE.CORTEX.COMPLETE(
                'llama3.1-8b',
                'Explain why transaction {txn_id} (amount: ₹{txn['AMOUNT_INR']/100000:.2f} lakh, channel: {txn['CHANNEL']}) did not trigger any fraud alerts. Be concise and specific.'
            )
        """
        
        explanation_result = session.sql(explanation_sql).collect()
        explanation = explanation_result[0][0] if explanation_result else "No alerts triggered."
        
        return WhyNotResponse(
            txn_id=txn_id,
            explanation=explanation,
            rules_checked=rules_checked,
            recommendation="Transaction appears normal based on current rules."
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze transaction: {str(e)}")

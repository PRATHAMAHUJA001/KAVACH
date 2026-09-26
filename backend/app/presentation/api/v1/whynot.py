"""
Why-not endpoint: which checks looked at a transaction, and why none of them flagged it.

Deterministic: each active rule's own limits (read from its SQL) are compared with the
transaction. No LLM call, so the explanation can't invent reasons.
"""
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.domain import policies
from app.domain.labels import typology_phrase
from app.infrastructure.snowflake.connection import get_session

router = APIRouter()


def _rule_label(typology: str, citation: str | None) -> str:
    """"Large cash that must be reported · 2024/01 ¶4" — the paragraph tells same-pattern rules apart."""
    cite = policies.parse_citation(citation)
    where = f" · {cite[0].replace('KAVACH/', '')} ¶{cite[1]}" if cite else ""
    phrase = typology_phrase(typology)
    return f"{phrase[:1].upper()}{phrase[1:]}{where}"


class RuleChecked(BaseModel):
    rule_id: str
    rule_name: str
    typology: Optional[str] = None
    result: Literal["passed", "not_applicable", "near_miss"]
    reason: str


class WhyNotResponse(BaseModel):
    """Why-not response model"""
    txn_id: str
    explanation: str
    rules_checked: list[RuleChecked]
    recommendation: str


@router.get("/why-not/{txn_id}", response_model=WhyNotResponse)
async def why_not(txn_id: str):
    """Explain why a transaction didn't trigger an alert (or open its alert if it did)"""
    tid = txn_id.strip().upper()
    try:
        session = get_session()
        rows = session.sql(
            "SELECT txn_id, account_id, amount_inr, channel, direction, txn_ts FROM CORE.TRANSACTIONS WHERE txn_id = ?", params=[tid]
        ).collect()
        if not rows:
            raise HTTPException(status_code=404, detail="Transaction not found")
        txn = {k.lower(): rows[0][k] for k in ("TXN_ID", "ACCOUNT_ID", "AMOUNT_INR", "CHANNEL", "DIRECTION", "TXN_TS")}

        flagged = session.sql("SELECT alert_id, typology FROM CORE.ALERTS WHERE txn_id = ? ORDER BY created_at DESC LIMIT 1", params=[tid]).collect()
        amount = policies.format_inr_compact(float(txn["amount_inr"]))
        channel = "cash" if txn["channel"] == "CASH" else txn["channel"]
        what = f"A {channel} {'deposit' if txn['direction'] == 'CREDIT' and txn['channel'] == 'CASH' else 'credit' if txn['direction'] == 'CREDIT' else 'payment'} of {amount} on {txn['txn_ts']:%d %b %Y}"
        if flagged:
            return WhyNotResponse(
                txn_id=tid,
                explanation=f"{what}. It was flagged: {typology_phrase(flagged[0]['TYPOLOGY'])}.",
                rules_checked=[], recommendation=f"open_alert:{flagged[0]['ALERT_ID']}",
            )

        rules = session.sql(
            "SELECT rule_id, rule_name, typology, sql_text, source_citation FROM RULES.RULE_LIBRARY WHERE status NOT IN ('REJECTED', 'SUPERSEDED') ORDER BY typology, rule_name"
        ).collect()
        checked: list[RuleChecked] = []
        suggestion: Optional[str] = None
        for r in rules:
            band = None
            between = policies.re.search(r"AMOUNT_INR BETWEEN (\d+) AND (\d+)", r["SQL_TEXT"] or "")
            if between and float(between.group(1)) <= float(txn["amount_inr"]) <= float(between.group(2)):
                band = int(session.sql(
                    "SELECT COUNT(*) FROM CORE.TRANSACTIONS WHERE account_id = ? AND channel = ? AND amount_inr BETWEEN ? AND ? "
                    "AND txn_ts BETWEEN DATEADD('day', -30, ?::TIMESTAMP_NTZ) AND ?::TIMESTAMP_NTZ",
                    params=[txn["account_id"], txn["channel"], int(between.group(1)), int(between.group(2)), txn["txn_ts"], txn["txn_ts"]],
                ).collect()[0][0])
            v = policies.why_not_rule(txn, r["SQL_TEXT"], r["TYPOLOGY"], band)
            if not v:
                continue
            checked.append(RuleChecked(rule_id=r["RULE_ID"], rule_name=_rule_label(r["TYPOLOGY"], r["SOURCE_CITATION"]), typology=r["TYPOLOGY"], **v))
            if v["result"] == "near_miss" and "just under" in v["reason"] and not suggestion:
                suggestion = f"The {typology_phrase(r['TYPOLOGY'])} check came close. Try a lower limit in Time Machine before changing the rule."
        order = {"near_miss": 0, "passed": 1, "not_applicable": 2}
        checked.sort(key=lambda c: order[c.result])
        near = sum(c.result == "near_miss" for c in checked)
        explanation = f"{what}. {len(checked)} checks looked at it and none raised an alert" + (f"; {near} came close." if near else ".")
        return WhyNotResponse(txn_id=tid, explanation=explanation, rules_checked=checked,
                              recommendation=suggestion or "Nothing unusual. No change needed.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze transaction: {str(e)}")

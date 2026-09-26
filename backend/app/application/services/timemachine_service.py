"""
Time Machine: replay a rule over past data with a different limit, before changing it.
"""
from __future__ import annotations

from app.domain import policies


class TimeMachineService:
    def __init__(self, repo):
        self.repo = repo

    def tunable_rules(self) -> list[dict]:
        out = []
        for r in self.repo.active_rules():
            p = policies.tunable_param(r["sql_text"])
            if p:
                out.append({"rule_id": r["rule_id"], "rule_name": r["rule_name"], "typology": r["typology"], "param": p})
        return out

    def replay(self, rule_id: str, value: float, days: int) -> dict | None:
        rule = self.repo.rule(rule_id)
        if not rule:
            return None
        p = policies.tunable_param(rule["sql_text"])
        if not p:
            raise ValueError("This rule has no limit that can be replayed.")
        if not (p["min"] <= value <= p["max"]):
            raise ValueError(f"Choose a value between {p['min']} and {p['max']}.")
        base = policies.with_window(rule["sql_text"], days)

        def outcome(v: float) -> dict:
            res = self.repo.run(policies.with_param(base, p["key"], v), rule["typology"])
            return {"value": v, "alerts": res["alerts"], "fraud_caught": res["fraud"],
                    "analyst_hours": round(res["alerts"] * policies.REVIEW_HOURS_PER_ALERT, 1)}

        return {"rule_id": rule_id, "days": days, "current": outcome(p["value"]), "proposed": outcome(value),
                "fraud_total": self.repo.fraud_total(rule["typology"])}

    def history(self, days: int) -> list[dict]:
        return self.repo.history(days)

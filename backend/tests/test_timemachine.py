"""Time Machine: tunable limits, SQL substitution and the replay contract (fake repository)."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.application.services.timemachine_service import TimeMachineService
from app.domain.policies import tunable_param, with_param, with_window
from app.main import app
from app.presentation.api.v1 import timemachine
from tests.fakes import CTR_SQL, STRUCT_SQL

SAMPLES = Path(__file__).parent / "samples"


class FakeTM:
    def __init__(self):
        self.ran: list[str] = []

    def active_rules(self):
        return [{"rule_id": "RL-1", "rule_name": "STR", "typology": "STRUCTURING", "sql_text": STRUCT_SQL},
                {"rule_id": "RL-KYC", "rule_name": "KYC", "typology": "KYC_CDD", "sql_text": "SELECT 1"}]

    def rule(self, rid):
        return next((r for r in self.active_rules() if r["rule_id"] == rid), None)

    def run(self, sql, typology):
        self.ran.append(sql)
        lo = int(sql.split("BETWEEN ")[1].split(" ")[0])
        return {"alerts": 42 if lo >= 900000 else 57, "accounts": 20, "fraud": 11 if lo >= 900000 else 15}

    def fraud_total(self, typology):
        return 19

    def history(self, days):
        return []


def test_tunable_param_and_substitution():
    p = tunable_param(STRUCT_SQL)
    assert (p["key"], p["value"], p["max"]) == ("min_amount", 900000, 950000)
    assert tunable_param(CTR_SQL)["key"] == "amount"
    assert tunable_param("SELECT 1 GROUP BY 1 HAVING COUNT(*) >= 5")["key"] == "count"
    assert tunable_param("SELECT 1") is None
    s = with_window(with_param(STRUCT_SQL, "min_amount", 800000), 90)
    assert "BETWEEN 800000 AND 999999" in s and "DATEADD('day', -90," in s
    with pytest.raises(ValueError):
        with_param(STRUCT_SQL, "nope", 1)


def test_replay_contract_and_sample():
    repo = FakeTM()
    app.dependency_overrides[timemachine.get_tm_service] = lambda: TimeMachineService(repo)
    try:
        c = TestClient(app)
        rules = c.get("/api/time-machine/rules").json()
        res = c.post("/api/time-machine/replay", json={"rule_id": "RL-1", "value": 800000, "days": 90}).json()
        assert c.post("/api/time-machine/replay", json={"rule_id": "RL-1", "value": 100, "days": 90}).status_code == 422
        assert c.post("/api/time-machine/replay", json={"rule_id": "RL-KYC", "value": 1, "days": 90}).status_code == 422
        assert c.post("/api/time-machine/replay", json={"rule_id": "RL-X", "value": 1, "days": 90}).status_code == 404
    finally:
        app.dependency_overrides.clear()
    assert [r["rule_id"] for r in rules["rules"]] == ["RL-1"]
    assert res["current"] == {"value": 900000, "alerts": 42, "fraud_caught": 11, "analyst_hours": 31.5}
    assert res["proposed"]["fraud_caught"] == 15 and res["fraud_total"] == 19
    assert all("DATEADD('day', -90," in s for s in repo.ran)
    (SAMPLES / "tm_rules.json").write_text(json.dumps(rules, ensure_ascii=False, indent=2))
    (SAMPLES / "replay.json").write_text(json.dumps(res, ensure_ascii=False, indent=2))

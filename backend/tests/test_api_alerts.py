"""HTTP contract for /api/alerts, /api/alerts/{id} and feedback verdicts (no Snowflake: fake repository injected)."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.application.services.alert_service import AlertService
from app.main import app
from app.presentation.api.v1 import alerts, evidence
from tests.fakes import FakeAlertRepository

SAMPLES = Path(__file__).parent / "samples"


@pytest.fixture
def client():
    repo = FakeAlertRepository()
    app.dependency_overrides[alerts.get_alert_service] = lambda: AlertService(repo)
    try:
        yield TestClient(app), repo
    finally:
        app.dependency_overrides.clear()


def test_alert_list_contract_and_sample(client):
    c, _ = client
    res = c.get("/api/alerts", params={"page_size": 50})
    assert res.status_code == 200
    body = res.json()
    first = body["alerts"][0]
    assert first["alert_id"] == "ALT-001"
    assert set(first) >= {"amount_inr", "txn_count", "due_at", "str_filed", "risk_level", "ring_id", "window_start", "window_end", "branch", "city", "action_required"}
    assert next(a for a in body["alerts"] if a["alert_id"] == "ALT-004")["str_filed"] is True
    SAMPLES.mkdir(exist_ok=True)
    (SAMPLES / "alerts.json").write_text(json.dumps(body, ensure_ascii=False, indent=2))


def test_alert_list_filters(client):
    c, _ = client
    assert [a["alert_id"] for a in c.get("/api/alerts", params={"due": "48h"}).json()["alerts"]] == ["ALT-002"]
    assert c.get("/api/alerts", params={"q": "priya", "sort": "amount"}).json()["total"] == 1
    assert c.get("/api/alerts", params={"due": "soon"}).status_code == 422
    assert c.get("/api/alerts", params={"sort": "random"}).status_code == 422


def test_alert_detail_contract_and_sample(client):
    c, _ = client
    res = c.get("/api/alerts/ALT-002")
    assert res.status_code == 200
    body = res.json()
    assert body["reasons"][0]["weight"] == 0.6 and body["reasons"][0]["text_hi"]
    assert [e["type"] for e in body["timeline"]].count("alert") == 1
    assert [e["at"] for e in body["timeline"]] == sorted(e["at"] for e in body["timeline"])
    assert sum(e["suspicious"] for e in body["timeline"]) == 1
    assert {t["direction"] for t in body["transactions"]} == {"CREDIT", "DEBIT"}
    assert body["connections"]["nodes"][0]["kind"] == "subject"
    assert body["citation_ref"] == {"circular_no": "KAVACH/2024/01", "para_no": "2", "highlight": body["citation_ref"]["highlight"]}
    (SAMPLES / "alert_detail.json").write_text(json.dumps(body, ensure_ascii=False, indent=2))

    empty = c.get("/api/alerts/ALT-005").json()
    assert empty["connections"] is None and empty["transactions"] == []
    assert c.get("/api/alerts/ALT-999").status_code == 404


class _FakeSession:
    def __init__(self):
        self.calls = []

    def sql(self, query, params=None):
        self.calls.append((" ".join(query.split()), params))
        return self

    def collect(self):
        return []


def test_feedback_verdict_closes_alert(client, monkeypatch):
    c, repo = client
    session = _FakeSession()
    monkeypatch.setattr(evidence, "get_session", lambda: session)

    res = c.post("/api/alerts/ALT-003/feedback", json={"rating": 5, "verdict": "FRAUD"})
    assert res.status_code == 200
    assert res.json()["resolution"] == "TRUE_POSITIVE"
    assert repo.resolutions == {"ALT-003": "TRUE_POSITIVE"}
    # Values are bound, never formatted into the SQL.
    assert session.calls[0][1] == ["ALT-003", 5, None]

    assert c.post("/api/alerts/ALT-003/feedback", json={"rating": 1}).json().get("resolution") is None
    assert c.post("/api/alerts/ALT-999/feedback", json={"rating": 1, "verdict": "NOT_FRAUD"}).status_code == 404
    assert c.post("/api/alerts/ALT-003/feedback", json={"rating": 1, "verdict": "MAYBE"}).status_code == 422

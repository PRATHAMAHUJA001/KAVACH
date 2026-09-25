"""HTTP contract for /api/home and /api/me (no Snowflake: fake repository injected)."""
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.application.services.home_service import HomeService
from app.main import app
from app.presentation.api.v1 import home
from tests.fakes import FakeDashboardRepository

SAMPLES = Path(__file__).parent / "samples"


def test_home_contract_and_sample():
    app.dependency_overrides[home.get_home_service] = lambda: HomeService(FakeDashboardRepository())
    try:
        res = TestClient(app).get("/api/home")
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 200
    body = res.json()
    assert set(body) >= {"readiness_score", "top_alerts", "trend", "kpis", "attention", "weekly_brief", "as_of"}
    assert body["readiness_score"]["factors"][0] == {"key": "overdue", "count": 4, "points": 16.0}
    SAMPLES.mkdir(exist_ok=True)
    (SAMPLES / "home.json").write_text(json.dumps(body, ensure_ascii=False, indent=2))

"""HTTP contract for /api/rings and /api/rings/{id} (fake repository)."""
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.application.services.ring_service import RingService
from app.domain.policies import ring_name, ring_roles
from app.main import app
from app.presentation.api.v1 import rings
from tests.fakes import FakeRingRepository

SAMPLES = Path(__file__).parent / "samples"


def test_ring_policies():
    assert ring_name("RING-0012") == "Ring 12" and ring_name("RING-0012", "hi") == "समूह 12"
    assert ring_roles({"a": (5, 1), "b": (1, 5), "c": (2, 2)}) == {"a": "collector", "b": "exit", "c": "mule"}
    assert ring_roles({"a": (1, 1)}) == {"a": "collector"}
    assert ring_roles({}) == {}


def test_rings_contract_and_samples():
    app.dependency_overrides[rings.get_ring_service] = lambda: RingService(FakeRingRepository())
    try:
        c = TestClient(app)
        lst = c.get("/api/rings").json()
        detail = c.get("/api/rings/RING-0001").json()
        assert c.get("/api/rings/RING-9").status_code == 404
    finally:
        app.dependency_overrides.clear()
    r = lst["rings"][0]
    assert r["ring_name"] == "Ring 1" and r["ring_name_hi"] == "समूह 1" and r["confidence"] == "HIGH" and r["speed_hours"] == 0.32
    assert {m["role"] for m in detail["members"]} == {"collector", "exit", "mule"}
    assert detail["edges"][0] == {"source": "ACC-1", "target": "ACC-2", "kind": "sent_money", "amount_inr": 1e6, "count": 3}
    assert detail["transactions"][0]["direction"] == "DEBIT"
    SAMPLES.mkdir(exist_ok=True)
    (SAMPLES / "rings.json").write_text(json.dumps(lst, ensure_ascii=False, indent=2))
    (SAMPLES / "ring_detail.json").write_text(json.dumps(detail, ensure_ascii=False, indent=2))

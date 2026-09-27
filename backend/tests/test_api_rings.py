"""HTTP contract for /api/rings and /api/rings/{id} (fake repository)."""
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.application.services.ring_service import RingService
from app.domain.entities import GraphEdgeFact
from app.domain.policies import ring_name, ring_roles
from app.infrastructure.repositories.ring_repository import _loop_path, _ring_kind
from app.main import app
from app.presentation.api.v1 import rings
from tests.fakes import FakeRingRepository

SAMPLES = Path(__file__).parent / "samples"


def test_ring_policies():
    assert ring_name("RING-0012") == "Ring 12" and ring_name("RING-0012", "hi") == "समूह 12"
    assert ring_roles({"a": (5, 1), "b": (1, 5), "c": (2, 2)}) == {"a": "collector", "b": "exit", "c": "mule"}
    assert ring_roles({"a": (1, 1)}) == {"a": "collector"}
    assert ring_roles({}) == {}


def test_round_trip_members_are_all_loop_hops():
    """A closed loop has no collector and no exit — every member is just a hop."""
    money = {"a": (5, 1), "b": (1, 5), "c": (2, 2)}
    assert ring_roles(money, "round_trip") == {"a": "loop", "b": "loop", "c": "loop"}
    assert ring_roles(money, "mule") == ring_roles(money)


def test_ring_kind_read_from_internal_edges():
    """A collection ring has one end that only pays in and one that only takes in;
    a loop has neither. Nothing is keyed off ring ids, so regenerated data still reads right."""
    # collector (out only) + exit (in only) + mules
    assert _ring_kind(on_edges=8, terminal_receivers=1, pure_senders=1) == "mule"
    # closed cycle: every member both sends and receives
    assert _ring_kind(on_edges=4, terminal_receivers=0, pure_senders=0) == "round_trip"
    # too small to call a loop, and a pair that only moves one way is not one
    assert _ring_kind(on_edges=2, terminal_receivers=0, pure_senders=0) == "mule"
    assert _ring_kind(on_edges=0, terminal_receivers=0, pure_senders=0) == "mule"


def test_loop_path_walks_the_cycle_once():
    def money(a, b):
        return GraphEdgeFact(a, b, "sent_money")

    # Starts at the lowest id and closes back on it.
    assert _loop_path([money("b", "c"), money("c", "a"), money("a", "b")]) == ["a", "b", "c", "a"]
    # A chain that never returns, and shared-device links, are not loops.
    assert _loop_path([money("a", "b"), money("b", "c")]) == []
    assert _loop_path([GraphEdgeFact("a", "b", "shared_device")]) == []
    assert _loop_path([]) == []


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

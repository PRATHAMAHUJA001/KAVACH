"""Rulebook: rule policies, the upload pipeline and the HTTP contract (fake repository)."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.application.services.rule_service import RuleService, safe_filename
from app.domain.policies import describe_rule_sql, rule_health, rule_params
from app.main import app
from app.presentation.api.v1 import rules
from tests.fakes import CTR_SQL, STRUCT_SQL, FakeRuleRepository

SAMPLES = Path(__file__).parent / "samples"
PDF = b"%PDF-1.4 test"


def test_describe_rule_sql_reads_the_sql():
    en, hi = describe_rule_sql(STRUCT_SQL, "STRUCTURING")
    assert en == "Flags incoming cash transactions between ₹9 L and ₹10 L 3 or more times in the last 30 days."
    assert hi.startswith("पिछले 30 दिनों में ₹9 लाख से ₹10 लाख के बीच") and hi.endswith("पर अलर्ट बनाता है।")
    assert describe_rule_sql(CTR_SQL, "CASH_REPORTING")[0] == "Flags cash transactions of ₹10 L or more in the last 30 days."
    assert describe_rule_sql("SELECT 1", "KYC_CDD")[0] == "Looks for customer checks out of date."


def test_rule_params_and_health():
    p = {x["key"]: x for x in rule_params({"amount": 1000000, "max_frequency": 3, "note": "x", "flag": True})}
    assert set(p) == {"amount", "max_frequency"}
    assert p["amount"]["unit"] == "inr" and p["amount"]["min"] < 1000000 < p["amount"]["max"]
    assert p["max_frequency"]["unit"] == "count"
    assert rule_health(0, 0, 0)[1] == "quiet"
    assert rule_health(500, 10, 40)[1] == "noisy"
    assert rule_health(12, 1, 9)[1] == "noisy"           # mostly wrong once 5+ were judged
    assert rule_health(12, 6, 2) == (0.75, "healthy", None)


def test_upload_pipeline_success_and_failure():
    repo = FakeRuleRepository()
    svc = RuleService(repo)
    with pytest.raises(ValueError):
        svc.start_upload("x.pdf", b"not a pdf")
    job = svc.start_upload("../../evil name.PDF", PDF)
    assert job.filename == "evil_name.PDF"
    svc.process_upload(job.job_id, job.filename, PDF)
    done = svc.get_job(job.job_id)
    assert (done.status, done.step, done.rule_ids, done.circular_no) == ("COMPLETED", 4, ["RL-9", "RL-10"], "KAVACH/2026/09")

    repo.fail_at = "extract"
    job2 = svc.start_upload("c.pdf", PDF)
    svc.process_upload(job2.job_id, job2.filename, PDF)
    failed = svc.get_job(job2.job_id)
    assert (failed.status, failed.step, failed.message) == ("FAILED", 1, "Finding obligations failed. Please try again.")


def test_safe_filename():
    assert safe_filename("KAVACH 2024/01.pdf") == "01.pdf"
    assert safe_filename("a b.txt") == "a_b.txt.pdf"


def test_rules_contract_and_samples():
    repo = FakeRuleRepository()
    app.dependency_overrides[rules.get_rule_service] = lambda: RuleService(repo)
    try:
        c = TestClient(app)
        lst = c.get("/api/rules").json()
        conflicts = c.get("/api/rules/conflicts").json()
        health = c.get("/api/rules/health").json()
        versions = c.get("/api/rules/RL-3/versions").json()
        assert c.get("/api/rules/eval").json()["source"] == "RAW.GROUND_TRUTH"
        assert c.post("/api/rules/RL-1/reject", json={"user": "a", "reason": " "}).status_code == 422
        assert c.post("/api/rules/RL-1/approve", json={"user": "aditi"}).json()["status"] == "APPROVED"
        assert c.post("/api/rules/RL-404/approve", json={"user": "aditi"}).status_code == 404
        up = c.post("/api/rules/upload", files={"file": ("KAVACH_2026_09.pdf", PDF, "application/pdf")}).json()
        job = c.get(f"/api/rules/jobs/{up['job_id']}").json()   # background task has run
        assert c.post("/api/rules/upload", files={"file": ("x.pdf", b"hello", "application/pdf")}).status_code == 422
    finally:
        app.dependency_overrides.clear()
    r = lst["rules"][0]
    assert r["plain_english"].startswith("Flags incoming cash") and r["plain_hindi"] and r["circular_no"] == "KAVACH/2024/01"
    assert r["highlight"] in r["source_quote"] and r["params"]
    assert conflicts["conflicts"][0]["kind"] == "contradiction"
    assert [x["verdict"] for x in health["rules"]] == ["noisy", "healthy", "quiet"]
    assert versions["versions"][1]["change_summary"].startswith("Updated by amendment")
    assert job["status"] == "COMPLETED" and job["step"] == 4 and job["rule_ids"] == ["RL-9", "RL-10"]
    SAMPLES.mkdir(exist_ok=True)
    for name, body in [("rules.json", lst), ("conflicts.json", conflicts), ("rule_health.json", health), ("job.json", job)]:
        (SAMPLES / name).write_text(json.dumps(body, ensure_ascii=False, indent=2))

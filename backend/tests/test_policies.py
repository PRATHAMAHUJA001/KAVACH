from datetime import datetime, timedelta

from app.domain.policies import (
    add_working_days,
    created_before_for_due_by,
    deadline_status,
    format_inr_compact,
    readiness,
    report_due,
    risk_level,
)


def test_working_days_skip_weekends():
    fri = datetime(2026, 9, 25, 10, 0)  # Friday
    assert add_working_days(fri, 1) == datetime(2026, 9, 28, 10, 0)  # Monday
    assert report_due(fri) == datetime(2026, 10, 6, 10, 0)  # 7 working days
    assert add_working_days(report_due(fri), -7) == fri


def test_created_before_is_inverse_of_due():
    now = datetime(2026, 9, 24, 18, 0)
    cutoff = created_before_for_due_by(now)
    assert report_due(cutoff) == now


def test_deadline_bands():
    now = datetime(2026, 9, 24, 12, 0)
    assert deadline_status(now - timedelta(hours=1), now) == "overdue"
    assert deadline_status(now + timedelta(hours=20), now) == "act"
    assert deadline_status(now + timedelta(days=3), now) == "attention"
    assert deadline_status(now + timedelta(days=9), now) == "ok"


def test_readiness_explains_itself():
    r = readiness(overdue=4, due_soon=3, rules_pending=10, conflicts=9)
    assert r.score == 69  # 100 - 16 - 6 - 5 - 4.5 = 68.5, rounded half up
    assert [f.key for f in r.factors] == ["overdue", "due_soon", "rules_pending", "conflicts"]
    assert r.reason_en == "4 reports are overdue and 3 more are due within 48 hours."
    assert readiness(0, 0, 0, 0).reason_en == "All reports are on time."


def test_risk_level_prefers_severity():
    assert risk_level("HIGH", 0.1) == 4
    assert risk_level(None, 0.9) == 5
    assert risk_level(None, 30) == 2


def test_inr_formatting():
    assert format_inr_compact(1_240_000) == "₹12.4 L"
    assert format_inr_compact(31_000_000) == "₹3.1 Cr"
    assert format_inr_compact(965_000) == "₹9.65 L"
    assert format_inr_compact(31_000_000, "hi") == "₹3.1 करोड़"

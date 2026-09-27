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
    # 4 of 40 reports overdue and 3 due soon; 10 of 20 rules pending, 9 conflicts.
    # overdue 45*0.1=4.5 · due_soon 20*0.075=1.5 · pending 20*0.5=10 · conflicts 15*0.45=6.75
    r = readiness(overdue=4, due_soon=3, rules_pending=10, conflicts=9, open_reports=40, total_rules=20)
    assert r.score == 77  # 100 - 22.8 = 77.2, rounded half up
    assert [f.key for f in r.factors] == ["overdue", "due_soon", "rules_pending", "conflicts"]
    assert r.reason_en == "4 reports are overdue and 3 more are due within 48 hours."
    assert readiness(0, 0, 0, 0).reason_en == "All reports are on time."


def test_readiness_is_bounded_by_share_not_volume():
    """A big backlog must not saturate the score: what matters is the share behind.

    Scoring raw counts sent the real 8,407-report book to 0 out of 100 and kept it
    there, which told a reviewer nothing about whether clearing work helped."""
    small = readiness(overdue=50, due_soon=10, rules_pending=2, conflicts=1, open_reports=100, total_rules=20)
    # The same proportions over a book 100x larger must score the same.
    large = readiness(overdue=5000, due_soon=1000, rules_pending=2, conflicts=1, open_reports=10_000, total_rules=20)
    assert small.score == large.score

    # Everything outstanding is the floor, and it is still a usable number, not 0.
    worst = readiness(overdue=10, due_soon=0, rules_pending=5, conflicts=5, open_reports=10, total_rules=5)
    assert worst.score == 100 - int(45 + 20 + 15)  # due_soon contributes nothing at 0
    assert worst.score > 0

    # Clearing the backlog has to move the number.
    assert readiness(1, 0, 0, 0, open_reports=100, total_rules=19).score > \
           readiness(90, 0, 0, 0, open_reports=100, total_rules=19).score


def test_readiness_without_denominators_does_not_invent_a_score():
    """No population means nothing outstanding to answer for, so no penalty is charged
    rather than a penalty computed against a denominator that was never supplied."""
    assert readiness(overdue=5, due_soon=5, rules_pending=5, conflicts=5).score == 100
    assert readiness(overdue=5, due_soon=5, rules_pending=5, conflicts=5).factors == []
    # A count larger than its population clamps instead of overshooting the cap.
    assert readiness(overdue=500, due_soon=0, rules_pending=0, conflicts=0, open_reports=10).score == 55


def test_risk_level_prefers_severity():
    assert risk_level("HIGH", 0.1) == 4
    assert risk_level(None, 0.9) == 5
    assert risk_level(None, 30) == 2


def test_inr_formatting():
    assert format_inr_compact(1_240_000) == "₹12.4 L"
    assert format_inr_compact(31_000_000) == "₹3.1 Cr"
    assert format_inr_compact(965_000) == "₹9.65 L"
    assert format_inr_compact(31_000_000, "hi") == "₹3.1 करोड़"


# ───────────── Alerts / case file ─────────────
from app.domain.policies import (  # noqa: E402
    alert_reasons,
    classify_timeline_event,
    parse_citation,
    pick_highlight,
    str_filed,
    timeline_title,
)
from tests.fakes import PARA  # noqa: E402


def test_str_filed_only_for_confirmed_reportable_alerts():
    assert str_filed("CLOSED", "TRUE_POSITIVE", "STR")
    assert str_filed("CLOSED", "TRUE_POSITIVE", "CTR")
    assert not str_filed("CLOSED", "FALSE_POSITIVE", "STR")
    assert not str_filed("CLOSED", "TRUE_POSITIVE", "EDD")
    assert not str_filed("NEW", None, "STR")


def test_classify_timeline_event():
    assert classify_timeline_event("CASH", "CREDIT") == "cash_deposit"
    assert classify_timeline_event("UPI", "CREDIT") == "transfer_in"
    assert classify_timeline_event("NEFT", "DEBIT") == "transfer_out"
    assert timeline_title("transfer_out", "R. Traders", "NEFT") == ("Sent to R. Traders by NEFT", "R. Traders को NEFT द्वारा पैसा भेजा")
    assert timeline_title("transfer_out", None, "CASH")[0] == "Cash withdrawn"


def test_parse_citation_matches_frontend_rule():
    assert parse_citation("KAVACH/2024/05 para 4") == ("KAVACH/2024/05", "4")
    assert parse_citation("kavach/2024/01") == ("KAVACH/2024/01", "1")
    assert parse_citation("CIR-2024-001") is None


def test_highlight_is_an_exact_substring_with_the_threshold():
    h = pick_highlight(PARA)
    assert h in PARA and "9,00,000" in h and len(h) <= 160
    assert pick_highlight("Report within 7 days. Keep records.") == "Report within 7 days"
    assert pick_highlight(None) is None


def test_alert_reasons_use_only_recorded_facts():
    # The live REASONS.details is a truncated dict repr of the matched row.
    live = {"details": "{'ACCOUNT_ID': 'ACC0004357', 'TXN_ID': 'TXN01490751', 'AMOUNT_INR': Decimal('8061270.52'), 'TXN_TS': datetime.datetime(2024, 9, 2, 13, 8, 12), 'CHANNEL': 'CASH'}"}
    r = alert_reasons("CASH_REPORTING", 9_256_547.72, 12, live)
    assert [x.weight for x in r] == [0.6, 0.45, 0.3]
    assert r[0].text == "Matches the pattern: large cash that must be reported"
    assert r[1].text == "The transaction that set off the check: ₹80.6 L by CASH"
    assert r[2].text == "12 transactions worth ₹92.6 L in the last 30 days"
    assert r[1].text_hi.startswith("जिस लेनदेन")

    kyc = {"details": "{'CUSTOMER_ID': 'CUST000006', 'RISK_CATEGORY': 'HIGH', 'KYC_STATUS': 'VERIFIED', 'DECLARED_ANNUA"}
    assert [x.text for x in alert_reasons("KYC_CDD", None, None, kyc)] == [
        "Matches the pattern: customer checks out of date",
        "The customer is rated high risk",
    ]
    assert len(alert_reasons("STRUCTURING", None, None, {"details": "{'CNT': 4, 'TOT"})) == 1
    assert len(alert_reasons("STRUCTURING", None, None, None)) == 1


from app.domain.policies import why_not_rule  # noqa: E402
from tests.fakes import CTR_SQL as _CTR, STRUCT_SQL as _STR  # noqa: E402


def test_why_not_rule():
    cash = {"amount_inr": 847000, "channel": "CASH", "direction": "CREDIT"}
    assert why_not_rule(cash, _STR, "STRUCTURING") == {"result": "near_miss", "reason": "₹8.47 L is just under the ₹9 L lower limit."}
    assert why_not_rule(cash, _CTR, "CASH_REPORTING")["result"] == "passed"
    assert why_not_rule({**cash, "amount_inr": 950000}, _STR, "STRUCTURING", band_count=1)["reason"].endswith("(needs 3).")
    assert why_not_rule({**cash, "channel": "UPI"}, _CTR, "CASH_REPORTING")["result"] == "not_applicable"
    assert why_not_rule({**cash, "amount_inr": 900000}, _CTR, "CASH_REPORTING")["result"] == "near_miss"
    assert why_not_rule(cash, "SELECT 1 FROM CORE.CUSTOMERS", "KYC_CDD") is None


from app.domain.policies import fill_customer  # noqa: E402


def test_fill_customer():
    assert fill_customer("The account XCUSTX had 10 transactions.", "Sita Chauhan") == "Sita Chauhan's account had 10 transactions."
    assert fill_customer("XCUSTX's account was flagged.", "Mehta Agencies") == "Mehta Agencies' account was flagged."
    assert fill_customer("XCUSTX deposited cash.", None) == "The customer deposited cash."
    assert fill_customer("खाता XCUSTX में 10 लेनदेन हुए।", "Si**********", "hi") == "Si********** के खाते में 10 लेनदेन हुए।"
    assert fill_customer(None, "x") is None
    assert fill_customer("खाता XCUSTX संदिग्ध है।", "Sita", "hi") == "Sita का खाता संदिग्ध है।"

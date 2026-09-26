"""
Customers: the portfolio list an analyst scans, and one customer's file.

Risk scores live in ML.LATEST_RISK_SCORES keyed by *account*, so a customer's
score is the worst score on any of their accounts (MAX). The same holds for the
score drivers: ML.RISK_SCORE_EXPLANATIONS is per account, so the drivers shown are
the ones belonging to the account that scored highest.

CORE.ALERTS.CUSTOMER_ID is empty on rule-generated rows, so alerts are attributed
through the account, with the same fallback the alert repository uses (customer
level checks put the customer id in ACCOUNT_ID).

CUSTOMER_NAME and PAN carry masking policies keyed to CURRENT_ROLE(). They are
selected plainly and Snowflake redacts them per role; nothing here tries to see
around that, and a masked value is the correct answer for that role.

Everything user-supplied is bound (`params=`). `sort` and `risk` never reach SQL
as text: each selects a fragment from a fixed allow-list, so an unrecognised value
falls back to the default rather than being interpolated.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional

from snowflake.snowpark import Session

from app.infrastructure.repositories.dashboard_repository import _naive


@dataclass
class CustomerRow:
    customer_id: str
    customer_name: Optional[str]
    pan: Optional[str]
    city: Optional[str]
    segment: Optional[str]
    risk_category: Optional[str]
    is_pep: bool
    kyc_status: Optional[str]
    account_count: int
    total_balance_inr: float
    #: Worst calibrated ML score across the customer's accounts, 0–1. None when unscored.
    risk_score: Optional[float]
    open_alerts: int


@dataclass
class CustomerAccount:
    account_id: str
    account_type: Optional[str]
    status: Optional[str]
    branch_code: Optional[str]
    open_date: Optional[datetime]
    avg_monthly_balance_inr: float
    risk_score: Optional[float]
    open_alerts: int


@dataclass
class ScoreDriver:
    feature: str
    #: SHAP contribution. Positive pushes the score up.
    shap: float


@dataclass
class CustomerAlert:
    alert_id: str
    account_id: Optional[str]
    typology: Optional[str]
    severity: Optional[str]
    score: float
    status: Optional[str]
    created_at: datetime


@dataclass
class CustomerDetail:
    customer: CustomerRow
    dob: Optional[datetime]
    state: Optional[str]
    state_code: Optional[str]
    region: Optional[str]
    occupation: Optional[str]
    declared_annual_income_inr: Optional[float]
    kyc_last_updated: Optional[datetime]
    onboarding_channel: Optional[str]
    accounts: List[CustomerAccount] = field(default_factory=list)
    #: Drivers for the highest-scoring account, strongest first.
    drivers: List[ScoreDriver] = field(default_factory=list)
    driver_account_id: Optional[str] = None
    driver_scored_at: Optional[datetime] = None
    alerts: List[CustomerAlert] = field(default_factory=list)


# Same fallback chain as the alert repository: the account knows its owner, and
# customer-level checks put the customer id where an account id would normally go.
_ALERT_CUSTOMER = "COALESCE(al.customer_id, acc.customer_id, IFF(al.account_id LIKE 'CUST%', al.account_id, NULL))"

# Per-customer account rollup, scores included, reused by the list and the detail.
_ACCT_ROLLUP = """
    SELECT a.customer_id,
           COUNT(*) AS account_count,
           SUM(COALESCE(a.avg_monthly_balance, 0)) AS total_balance,
           MAX(s.risk_score_calibrated) AS risk_score
    FROM CORE.ACCOUNTS a
    LEFT JOIN ML.LATEST_RISK_SCORES s ON s.account_id = a.account_id
    GROUP BY a.customer_id
"""

_OPEN_ALERTS_BY_CUSTOMER = f"""
    SELECT {_ALERT_CUSTOMER} AS customer_id, COUNT(*) AS open_alerts
    FROM CORE.ALERTS al
    LEFT JOIN CORE.ACCOUNTS acc ON acc.account_id = al.account_id
    WHERE al.status <> 'CLOSED'
    GROUP BY 1
"""

# Whitelist, not interpolation: the request's `sort` is a key into this map and an
# unknown key falls back to "risk". The values are literals written here, never
# user text.
SORTS = {
    "risk": "roll.risk_score DESC NULLS LAST, c.customer_id ASC",
    "alerts": "COALESCE(al.open_alerts, 0) DESC, roll.risk_score DESC NULLS LAST, c.customer_id ASC",
    "balance": "COALESCE(roll.total_balance, 0) DESC, c.customer_id ASC",
    "name": "c.customer_name ASC NULLS LAST, c.customer_id ASC",
    "city": "c.city ASC NULLS LAST, c.customer_id ASC",
    "segment": "c.segment ASC NULLS LAST, roll.risk_score DESC NULLS LAST",
    "id": "c.customer_id ASC",
}
DEFAULT_SORT = "risk"

# Bands over the calibrated ML score, matching the five risk steps the UI already
# uses (0.25 / 0.45 / 0.65 / 0.85). Also a whitelist.
RISK_BANDS = {
    "high": "roll.risk_score >= 0.65",
    "medium": "roll.risk_score >= 0.45 AND roll.risk_score < 0.65",
    "low": "roll.risk_score < 0.45 OR roll.risk_score IS NULL",
    "pep": "c.is_pep = TRUE",
    "alerted": "COALESCE(al.open_alerts, 0) > 0",
}


def _opt_float(v) -> Optional[float]:
    return float(v) if v is not None else None


def _opt_dt(v) -> Optional[datetime]:
    return _naive(v) if v is not None else None


class SnowflakeCustomerRepository:
    """Reads customers through the caller's session, so masking applies."""

    def __init__(self, session: Session):
        self.session = session

    # ───────────── list ─────────────

    def list_customers(
        self,
        limit: int = 25,
        offset: int = 0,
        q: Optional[str] = None,
        segment: Optional[str] = None,
        risk: Optional[str] = None,
        sort: str = DEFAULT_SORT,
    ) -> tuple[List[CustomerRow], int]:
        """One page of customers plus the real total, for pagination."""
        where: list[str] = ["1 = 1"]
        params: list = []

        if q and q.strip():
            # PAN and name are masked for some roles, so a search on them matches
            # what that role can see. That is intended: it never reveals more.
            where.append("(c.customer_name ILIKE ? OR c.pan ILIKE ? OR c.customer_id ILIKE ? OR c.city ILIKE ?)")
            params += [f"%{q.strip()}%"] * 4
        if segment and segment.strip():
            where.append("c.segment = ?")
            params.append(segment.strip().upper())
        band = RISK_BANDS.get((risk or "").strip().lower())
        if band:
            where.append(f"({band})")

        order = SORTS.get((sort or "").strip().lower(), SORTS[DEFAULT_SORT])
        clause = " AND ".join(where)

        rows = self.session.sql(
            f"""
            WITH roll AS ({_ACCT_ROLLUP}), al AS ({_OPEN_ALERTS_BY_CUSTOMER})
            SELECT c.customer_id, c.customer_name, c.pan, c.city, c.segment, c.risk_category,
                   c.is_pep, c.kyc_status,
                   COALESCE(roll.account_count, 0) AS account_count,
                   COALESCE(roll.total_balance, 0) AS total_balance,
                   roll.risk_score AS risk_score,
                   COALESCE(al.open_alerts, 0) AS open_alerts,
                   COUNT(*) OVER () AS total_count
            FROM CORE.CUSTOMERS c
            LEFT JOIN roll ON roll.customer_id = c.customer_id
            LEFT JOIN al ON al.customer_id = c.customer_id
            WHERE {clause}
            ORDER BY {order}
            LIMIT {int(limit)} OFFSET {int(offset)}
            """,
            params=params,
        ).collect()

        total = int(rows[0]["TOTAL_COUNT"]) if rows else 0
        if not rows and offset:
            # Past the last page: still report the real total so paging can recover.
            total = int(
                self.session.sql(
                    f"""
                    WITH roll AS ({_ACCT_ROLLUP}), al AS ({_OPEN_ALERTS_BY_CUSTOMER})
                    SELECT COUNT(*) AS n
                    FROM CORE.CUSTOMERS c
                    LEFT JOIN roll ON roll.customer_id = c.customer_id
                    LEFT JOIN al ON al.customer_id = c.customer_id
                    WHERE {clause}
                    """,
                    params=params,
                ).collect()[0]["N"]
            )
        return [self._to_row(r) for r in rows], total

    @staticmethod
    def _to_row(r) -> CustomerRow:
        return CustomerRow(
            customer_id=r["CUSTOMER_ID"],
            customer_name=r["CUSTOMER_NAME"],
            pan=r["PAN"],
            city=r["CITY"],
            segment=r["SEGMENT"],
            risk_category=r["RISK_CATEGORY"],
            is_pep=bool(r["IS_PEP"]),
            kyc_status=r["KYC_STATUS"],
            account_count=int(r["ACCOUNT_COUNT"] or 0),
            total_balance_inr=float(r["TOTAL_BALANCE"] or 0),
            risk_score=_opt_float(r["RISK_SCORE"]),
            open_alerts=int(r["OPEN_ALERTS"] or 0),
        )

    def segments(self) -> List[str]:
        """The segment values present, for the filter."""
        rows = self.session.sql(
            "SELECT DISTINCT segment FROM CORE.CUSTOMERS WHERE segment IS NOT NULL ORDER BY segment"
        ).collect()
        return [r["SEGMENT"] for r in rows]

    # ───────────── detail ─────────────

    def get_customer(self, customer_id: str, alert_limit: int = 10) -> Optional[CustomerDetail]:
        """The customer's own fields, their accounts, top score drivers and recent alerts."""
        rows = self.session.sql(
            f"""
            WITH roll AS ({_ACCT_ROLLUP}), al AS ({_OPEN_ALERTS_BY_CUSTOMER})
            SELECT c.customer_id, c.customer_name, c.pan, c.dob, c.city, c.state, c.state_code,
                   c.region, c.occupation, c.declared_annual_income, c.kyc_status,
                   c.kyc_last_updated, c.risk_category, c.is_pep, c.onboarding_channel, c.segment,
                   COALESCE(roll.account_count, 0) AS account_count,
                   COALESCE(roll.total_balance, 0) AS total_balance,
                   roll.risk_score AS risk_score,
                   COALESCE(al.open_alerts, 0) AS open_alerts
            FROM CORE.CUSTOMERS c
            LEFT JOIN roll ON roll.customer_id = c.customer_id
            LEFT JOIN al ON al.customer_id = c.customer_id
            WHERE c.customer_id = ?
            """,
            params=[customer_id],
        ).collect()
        if not rows:
            return None
        r = rows[0]
        drivers, driver_account, driver_at = self._drivers(customer_id)
        return CustomerDetail(
            customer=self._to_row(r),
            dob=_opt_dt(r["DOB"]),
            state=r["STATE"],
            state_code=r["STATE_CODE"],
            region=r["REGION"],
            occupation=r["OCCUPATION"],
            declared_annual_income_inr=_opt_float(r["DECLARED_ANNUAL_INCOME"]),
            kyc_last_updated=_opt_dt(r["KYC_LAST_UPDATED"]),
            onboarding_channel=r["ONBOARDING_CHANNEL"],
            accounts=self._accounts(customer_id),
            drivers=drivers,
            driver_account_id=driver_account,
            driver_scored_at=driver_at,
            alerts=self._alerts(customer_id, alert_limit),
        )

    def _accounts(self, customer_id: str) -> List[CustomerAccount]:
        rows = self.session.sql(
            """
            WITH open_al AS (
                SELECT account_id, COUNT(*) AS n FROM CORE.ALERTS WHERE status <> 'CLOSED' GROUP BY account_id
            )
            SELECT a.account_id, a.account_type, a.status, a.branch_code, a.open_date,
                   COALESCE(a.avg_monthly_balance, 0) AS balance,
                   s.risk_score_calibrated AS risk_score,
                   COALESCE(o.n, 0) AS open_alerts
            FROM CORE.ACCOUNTS a
            LEFT JOIN ML.LATEST_RISK_SCORES s ON s.account_id = a.account_id
            LEFT JOIN open_al o ON o.account_id = a.account_id
            WHERE a.customer_id = ?
            ORDER BY s.risk_score_calibrated DESC NULLS LAST, a.account_id
            """,
            params=[customer_id],
        ).collect()
        return [
            CustomerAccount(
                account_id=r["ACCOUNT_ID"],
                account_type=r["ACCOUNT_TYPE"],
                status=r["STATUS"],
                branch_code=r["BRANCH_CODE"],
                open_date=_opt_dt(r["OPEN_DATE"]),
                avg_monthly_balance_inr=float(r["BALANCE"] or 0),
                risk_score=_opt_float(r["RISK_SCORE"]),
                open_alerts=int(r["OPEN_ALERTS"] or 0),
            )
            for r in rows
        ]

    def _drivers(self, customer_id: str) -> tuple[List[ScoreDriver], Optional[str], Optional[datetime]]:
        """The three recorded drivers for the customer's highest-scoring account, strongest first."""
        rows = self.session.sql(
            """
            SELECT e.account_id, e.scored_at,
                   e.driver_1_feature, e.driver_1_shap,
                   e.driver_2_feature, e.driver_2_shap,
                   e.driver_3_feature, e.driver_3_shap
            FROM ML.RISK_SCORE_EXPLANATIONS e
            JOIN CORE.ACCOUNTS a ON a.account_id = e.account_id
            WHERE a.customer_id = ?
            QUALIFY ROW_NUMBER() OVER (ORDER BY e.risk_score DESC NULLS LAST, e.scored_at DESC) = 1
            """,
            params=[customer_id],
        ).collect()
        if not rows:
            return [], None, None
        r = rows[0]
        drivers = [
            ScoreDriver(feature=r[f"DRIVER_{i}_FEATURE"], shap=float(r[f"DRIVER_{i}_SHAP"] or 0))
            for i in (1, 2, 3)
            if r[f"DRIVER_{i}_FEATURE"]
        ]
        drivers.sort(key=lambda d: abs(d.shap), reverse=True)
        return drivers, r["ACCOUNT_ID"], _opt_dt(r["SCORED_AT"])

    def _alerts(self, customer_id: str, limit: int) -> List[CustomerAlert]:
        rows = self.session.sql(
            f"""
            SELECT al.alert_id, al.account_id, al.typology, al.severity, al.score, al.status, al.created_at
            FROM CORE.ALERTS al
            LEFT JOIN CORE.ACCOUNTS acc ON acc.account_id = al.account_id
            WHERE {_ALERT_CUSTOMER} = ?
            ORDER BY al.created_at DESC
            LIMIT {int(limit)}
            """,
            params=[customer_id],
        ).collect()
        return [
            CustomerAlert(
                alert_id=r["ALERT_ID"],
                account_id=r["ACCOUNT_ID"],
                typology=r["TYPOLOGY"],
                severity=r["SEVERITY"],
                score=float(r["SCORE"] or 0),
                status=r["STATUS"],
                created_at=_naive(r["CREATED_AT"]),
            )
            for r in rows
        ]

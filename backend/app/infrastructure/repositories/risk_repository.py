"""
Portfolio risk: credit exposure concentration and a liquidity indicator.

The brief asks for liquidity and credit risk alongside fraud. This is deliberately
a light read over data the platform already holds rather than a Basel computation:
exposure is the balance carried on LOAN accounts, and "at risk" means that exposure
sits on an account with an open alert against it. Liquidity is the trailing-30-day
credit/debit balance over the same transaction window the rest of the app uses.

Both are read through the caller's Snowflake session, so masking and row access
policies apply here exactly as they do everywhere else.
"""
from dataclasses import dataclass
from typing import List

CRORE = 10_000_000


@dataclass
class ExposureRow:
    label: str
    accounts: int
    exposure_inr: float
    flagged_accounts: int
    exposure_at_risk_inr: float
    pct_at_risk: float


@dataclass
class Liquidity:
    inflow_inr: float
    outflow_inr: float
    net_inr: float
    coverage_ratio: float
    txn_count: int
    window_days: int


@dataclass
class RiskView:
    by_segment: List[ExposureRow]
    by_branch: List[ExposureRow]
    liquidity: Liquidity
    total_exposure_inr: float
    total_at_risk_inr: float
    pct_at_risk: float


# One scan of LOAN accounts, reused for both groupings.
_LOANS = """
    WITH flagged AS (
      SELECT DISTINCT account_id FROM CORE.ALERTS WHERE status <> 'CLOSED'
    )
    SELECT a.branch_code, c.segment, a.avg_monthly_balance AS exposure,
           IFF(f.account_id IS NOT NULL, 1, 0) AS flagged
    FROM CORE.ACCOUNTS a
    JOIN CORE.CUSTOMERS c ON c.customer_id = a.customer_id
    LEFT JOIN flagged f ON f.account_id = a.account_id
    WHERE a.account_type = 'LOAN'
"""


def _exposure_by(session, column: str, limit: int | None) -> List[ExposureRow]:
    sql = f"""
        WITH loans AS ({_LOANS})
        SELECT {column} AS label,
               COUNT(*) AS accounts,
               SUM(exposure) AS exposure,
               SUM(flagged) AS flagged_accounts,
               SUM(exposure * flagged) AS at_risk
        FROM loans
        WHERE {column} IS NOT NULL
        GROUP BY {column}
        ORDER BY at_risk DESC
        {f'LIMIT {int(limit)}' if limit else ''}
    """
    rows = session.sql(sql).collect()
    out = []
    for r in rows:
        exposure = float(r["EXPOSURE"] or 0)
        at_risk = float(r["AT_RISK"] or 0)
        out.append(
            ExposureRow(
                label=str(r["LABEL"]),
                accounts=int(r["ACCOUNTS"] or 0),
                exposure_inr=exposure,
                flagged_accounts=int(r["FLAGGED_ACCOUNTS"] or 0),
                exposure_at_risk_inr=at_risk,
                pct_at_risk=round(100 * at_risk / exposure, 1) if exposure else 0.0,
            )
        )
    return out


class SnowflakeRiskRepository:
    def __init__(self, session):
        self.session = session

    def build(self, window_days: int = 30) -> RiskView:
        by_segment = _exposure_by(self.session, "segment", None)
        by_branch = _exposure_by(self.session, "branch_code", 6)

        # Anchored to the newest transaction, not the wall clock, so the window
        # always covers data that exists.
        row = self.session.sql(
            f"""
            WITH w AS (SELECT MAX(txn_ts) AS ts FROM CORE.TRANSACTIONS)
            SELECT SUM(IFF(direction = 'CREDIT', amount_inr, 0)) AS inflow,
                   SUM(IFF(direction = 'DEBIT',  amount_inr, 0)) AS outflow,
                   COUNT(*) AS txns
            FROM CORE.TRANSACTIONS t, w
            WHERE t.txn_ts > DATEADD('day', -{int(window_days)}, w.ts)
            """
        ).collect()[0]
        inflow = float(row["INFLOW"] or 0)
        outflow = float(row["OUTFLOW"] or 0)
        liquidity = Liquidity(
            inflow_inr=inflow,
            outflow_inr=outflow,
            net_inr=inflow - outflow,
            coverage_ratio=round(inflow / outflow, 3) if outflow else 0.0,
            txn_count=int(row["TXNS"] or 0),
            window_days=window_days,
        )

        total = sum(r.exposure_inr for r in by_segment)
        at_risk = sum(r.exposure_at_risk_inr for r in by_segment)
        return RiskView(
            by_segment=by_segment,
            by_branch=by_branch,
            liquidity=liquidity,
            total_exposure_inr=total,
            total_at_risk_inr=at_risk,
            pct_at_risk=round(100 * at_risk / total, 1) if total else 0.0,
        )

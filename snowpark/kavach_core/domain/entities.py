"""Domain entities for KAVACH"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List, Dict, Any
from decimal import Decimal


@dataclass
class Alert:
    """An alert flagging suspicious activity"""
    alert_id: str
    account_id: str
    customer_id: str
    typology: str
    rule_id: str
    ml_score: Optional[Decimal]
    blended_score: Decimal
    priority: str  # HIGH / MEDIUM / LOW
    status: str  # OPEN / UNDER_REVIEW / CLOSED_FRAUD / CLOSED_NON_FRAUD
    created_at: datetime
    
    def is_high_priority(self) -> bool:
        """Check if alert requires immediate attention"""
        return self.priority == 'HIGH' and self.blended_score >= 0.8


@dataclass
class RuleVersion:
    """A version of a regulatory rule"""
    rule_id: str
    version: int
    circular_no: str
    para_no: str
    clause_text: str
    sql_template: str
    threshold_params: Dict[str, Any]
    status: str  # PENDING_APPROVAL / APPROVED / REJECTED / SUPERSEDED
    compiled_by: str  # AI / HUMAN
    approved_by: Optional[str]
    approved_at: Optional[datetime]
    
    def source_citation(self) -> str:
        """Return formatted citation"""
        return f"{self.circular_no} para {self.para_no}"


@dataclass
class EvidencePack:
    """Audit-ready evidence package for an alert"""
    alert_id: str
    file_path: str
    sha256_hash: str
    created_by: str
    created_at: datetime
    
    def is_tampered(self, current_hash: str) -> bool:
        """Check if file has been tampered"""
        return self.sha256_hash != current_hash


@dataclass
class Citation:
    """A reference to a regulatory source"""
    circular_no: str
    para_no: str
    text: str
    
    def __str__(self) -> str:
        return f"{self.circular_no} para {self.para_no}"


@dataclass
class MoneyINR:
    """Indian Rupee amount with formatting"""
    amount: Decimal
    
    def format_lakh_crore(self) -> str:
        """Format as ₹X.Y L or ₹X.Y Cr"""
        amt = float(self.amount)
        if amt >= 10_000_000:  # 1 crore
            return f"₹{amt/10_000_000:.2f} Cr"
        elif amt >= 100_000:  # 1 lakh
            return f"₹{amt/100_000:.2f} L"
        else:
            return f"₹{amt:,.2f}"


@dataclass
class Ring:
    """A connected component of suspicious accounts"""
    ring_id: str
    member_count: int
    alert_density: Decimal  # % of members with alerts
    shared_device_count: int
    confidence: str  # HIGH / MEDIUM / LOW
    risk_score: Decimal

"""
Domain entities for KAVACH
Pure business objects with no dependencies on infrastructure
"""
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List


@dataclass
class Alert:
    """Alert domain entity"""
    alert_id: str
    account_id: str
    customer_id: Optional[str]
    typology: str
    severity: str
    score: float
    status: str
    rule_name: str
    citation: str
    created_at: datetime
    resolution: Optional[str] = None
    customer_name: Optional[str] = None
    pan: Optional[str] = None
    
    
@dataclass
class AlertDetail:
    """Detailed alert with story and transactions"""
    alert: Alert
    story_en: Optional[str]
    story_hi: Optional[str]
    txn_count: int
    total_amount_inr: float


@dataclass
class Rule:
    """Rule domain entity"""
    rule_id: str
    rule_name: str
    version: int
    typology: str
    sql_text: str
    status: str
    source_citation: str
    created_at: datetime
    
    
@dataclass
class Ring:
    """Mule ring entity"""
    ring_id: str
    ring_name: str
    member_count: int
    total_volume_inr: float
    risk_score: float
    status: str
    

@dataclass
class Evidence:
    """Evidence pack entity"""
    alert_id: str
    evidence_json: dict
    file_path: Optional[str]
    sha256_hash: Optional[str]
    created_by: str
    created_at: datetime

"""
Domain entities for KAVACH
Pure business objects with no dependencies on infrastructure
"""
from dataclasses import dataclass, field
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
    # Case-file facts (API_EXTENSIONS §3). Optional so older callers keep working.
    amount_inr: Optional[float] = None
    txn_count: Optional[int] = None
    due_at: Optional[datetime] = None
    str_filed: bool = False
    risk_level: Optional[int] = None
    ring_id: Optional[str] = None
    window_start: Optional[datetime] = None
    window_end: Optional[datetime] = None
    branch: Optional[str] = None
    city: Optional[str] = None
    action_required: Optional[str] = None
    txn_id: Optional[str] = None


@dataclass
class ReasonFact:
    text: str
    text_hi: str
    weight: float


@dataclass
class TimelineFact:
    id: str
    at: datetime
    type: str
    title: str
    title_hi: str
    detail: Optional[str] = None
    amount_inr: Optional[float] = None
    suspicious: bool = False


@dataclass
class TxnFact:
    txn_id: str
    account_id: str
    txn_ts: datetime
    amount_inr: float
    channel: str
    direction: str
    counterparty: Optional[str]
    counterparty_bank: Optional[str]
    country: Optional[str]
    narration: Optional[str]


@dataclass
class GraphNodeFact:
    id: str
    label: str
    risk_level: int
    kind: str  # subject | member | external
    city: Optional[str] = None
    alert_id: Optional[str] = None
    role: Optional[str] = None  # collector | mule | exit
    money_in_inr: Optional[float] = None
    money_out_inr: Optional[float] = None


@dataclass
class GraphEdgeFact:
    source: str
    target: str
    kind: str  # shared_phone | shared_ip | shared_device | sent_money
    amount_inr: Optional[float] = None
    count: Optional[int] = None


@dataclass
class GraphFact:
    nodes: List[GraphNodeFact]
    edges: List[GraphEdgeFact]


@dataclass
class CitationRefFact:
    circular_no: str
    para_no: str
    highlight: Optional[str] = None


@dataclass
class AlertDetail:
    """Detailed alert with story and transactions"""
    alert: Alert
    story_en: Optional[str]
    story_hi: Optional[str]
    txn_count: int
    total_amount_inr: float
    reasons: List[ReasonFact] = field(default_factory=list)
    timeline: List[TimelineFact] = field(default_factory=list)
    transactions: List[TxnFact] = field(default_factory=list)
    connections: Optional[GraphFact] = None
    citation_ref: Optional[CitationRefFact] = None


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
    entity: Optional[str] = None
    params: Optional[dict] = None
    severity: Optional[str] = None
    approved_by: Optional[str] = None
    rejected_by: Optional[str] = None
    rejection_reason: Optional[str] = None
    circular_no: Optional[str] = None
    para_no: Optional[str] = None
    source_text: Optional[str] = None


@dataclass
class RuleConflict:
    conflict_id: str
    typology: str
    entity: Optional[str]
    description: str
    status: str
    detected_at: Optional[datetime]
    rule_a: Rule
    rule_b: Rule


@dataclass
class RuleHealthRow:
    rule_id: str
    rule_name: str
    typology: str
    alerts_30d: int
    confirmed_30d: int
    dismissed_30d: int


@dataclass
class UploadJob:
    job_id: str
    filename: str
    status: str
    step: int
    progress: int
    message: str
    circular_no: Optional[str] = None
    rule_ids: List[str] = field(default_factory=list)


@dataclass
class Ring:
    """Mule ring entity"""
    ring_id: str
    ring_name: str
    member_count: int
    total_volume_inr: float
    risk_score: float
    status: str
    confidence: Optional[str] = None
    speed_hours: Optional[float] = None
    detected_at: Optional[datetime] = None
    alerted_members: Optional[int] = None
    shared_devices: Optional[int] = None
    city: Optional[str] = None


@dataclass
class RingDetail:
    ring: Ring
    members: List["GraphNodeFact"]
    edges: List["GraphEdgeFact"]
    transactions: List["TxnFact"]


@dataclass
class Evidence:
    """Evidence pack entity"""
    alert_id: str
    evidence_json: dict
    file_path: Optional[str]
    sha256_hash: Optional[str]
    created_by: str
    created_at: datetime
    html_file_path: Optional[str] = None
    html_sha256_hash: Optional[str] = None
    pdf_file_path: Optional[str] = None
    pdf_sha256_hash: Optional[str] = None

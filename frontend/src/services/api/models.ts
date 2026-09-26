/**
 * View models: what the UI consumes. camelCase, no nulls where a human label is
 * needed, bilingual text as { en, hi }. Adapters build these from wire DTOs.
 */
import type { EdgeKind, Role, Typology } from "./dto";

export type Lang = "en" | "hi";
export interface Text {
  en: string;
  hi: string;
}
export type RiskLevel = 1 | 2 | 3 | 4 | 5;
export type DeadlineStatus = "ok" | "attention" | "act" | "overdue";

export interface Me {
  userId: string;
  name: string;
  role: Role;
  email: string;
  readOnly: boolean;
  asOf: string | null;
}

export interface CitationRef {
  circularNo: string;
  paraNo: string;
  highlight?: string;
}

export interface Alert {
  id: string;
  accountId: string;
  customerId: string | null;
  customerName: Text;
  pan: string | null;
  typology: Typology | string;
  severity: string;
  riskLevel: RiskLevel;
  status: "NEW" | "OPEN" | "CLOSED" | string;
  resolution: string | null;
  ruleName: string;
  citation: CitationRef | null;
  createdAt: string;
  amount: number | null;
  txnCount: number | null;
  dueAt: string | null;
  reportFiled: boolean;
  ringId: string | null;
  city: Text | null;
  branch: string | null;
  windowStart: string | null;
  windowEnd: string | null;
}

export interface Reason {
  text: Text;
  weight: number;
}

export interface TimelineEvent {
  id: string;
  at: string;
  type: "login" | "device_change" | "new_beneficiary" | "cash_deposit" | "transfer_in" | "transfer_out" | "alert" | "kyc";
  title: Text;
  detail?: string;
  amount?: number;
  suspicious?: boolean;
}

export interface Txn {
  id: string;
  accountId: string;
  at: string;
  amount: number;
  channel: string;
  direction: "CREDIT" | "DEBIT";
  counterparty: string;
  counterpartyBank: string;
  country: string;
  narration: string;
}

export interface GraphNode {
  id: string;
  label: Text;
  riskLevel: RiskLevel;
  kind: "subject" | "member" | "external";
  role?: "collector" | "mule" | "exit";
  city?: string;
  alertId?: string | null;
  moneyIn?: number;
  moneyOut?: number;
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  amount?: number;
  count?: number;
}
export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface AlertDetail {
  alert: Alert;
  story: Text | null;
  reasons: Reason[];
  timeline: TimelineEvent[];
  transactions: Txn[];
  connections: Graph | null;
  citation: CitationRef | null;
  txnCount: number;
  totalAmount: number;
}

export interface AlertPage {
  alerts: Alert[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Evidence {
  alertId: string;
  url: string | null;
  pdfUrl: string | null;
  sha256: string | null;
  createdAt: string;
  createdBy: string;
  generationMs: number | null;
}
export interface Verification {
  verified: boolean;
  status: "MATCH" | "TAMPERED" | "UNKNOWN";
  createdAt: string | null;
  storedHash: string | null;
  computedHash: string | null;
}

export interface WhyNot {
  txnId: string;
  explanation: string;
  rules: Array<{ id: string; name: string; result: "passed" | "not_applicable" | "near_miss" | string; reason: string }>;
  recommendation: string;
  flaggedAlertId: string | null;
}

export interface AttentionItem {
  id: string;
  kind: "report_overdue" | "report_due" | "rule_pending" | "ring_new" | "conflict_open";
  status: "overdue" | "act" | "attention";
  entityId: string;
  name?: Text;
  amount?: number;
  dueAt?: string;
  count?: number;
  typology?: string;
}

export interface Home {
  readiness: { score: number; reason: Text; factors: Array<{ key: "overdue" | "due_soon" | "rules_pending" | "conflicts"; count: number; points: number }> };
  kpis: {
    newAlerts: number;
    newAlertsPrev: number;
    seriousNewAlerts: number;
    moneyAtRisk: number;
    moneyAtRiskPrev: number;
    reportsDue48h: number;
    reportsOverdue: number;
    activeRings: number;
    activeRingsPrev: number;
    ringVolume30d: number;
  } | null;
  attention: AttentionItem[];
  trend: Array<{ date: string; alerts: number; fraud: number | null }>;
  brief: { text: Text; generatedAt: string } | null;
  topAlerts: Array<{ id: string; accountId: string; typology: string; riskLevel: RiskLevel; createdAt: string }>;
  asOf: string | null;
}

export interface ExposureRow {
  label: string;
  accounts: number;
  exposure: number;
  flaggedAccounts: number;
  exposureAtRisk: number;
  /** Percentage, 0–100. */
  pctAtRisk: number;
}
export interface Liquidity {
  inflow: number;
  outflow: number;
  net: number;
  coverageRatio: number;
  txnCount: number;
  windowDays: number;
}
export interface PortfolioRisk {
  bySegment: ExposureRow[];
  byBranch: ExposureRow[];
  liquidity: Liquidity;
  totalExposure: number;
  totalAtRisk: number;
  pctAtRisk: number;
}

export interface Paragraph {
  circularNo: string;
  paraNo: string;
  text: string;
  issueDate: string | null;
  isAmendment: boolean;
  amends: string | null;
  before: { paraNo: string; text: string } | null;
  after: { paraNo: string; text: string } | null;
}

export interface SearchResult {
  kind: "alert" | "account" | "txn" | "ring" | "rule";
  id: string;
  title: Text;
  subtitle: string;
  alertId?: string;
}

export interface Ring {
  id: string;
  name: Text;
  memberCount: number;
  volume: number;
  riskLevel: RiskLevel;
  status: string;
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  speedHours: number | null;
  detectedAt: string | null;
  alertedMembers: number | null;
  city: Text | null;
}
export interface RingDetail {
  ring: Ring;
  graph: Graph;
  transactions: Txn[];
}

export interface RuleParam {
  key: string;
  label: Text;
  unit: "inr" | "count" | "hours" | "days" | "percent";
  value: number;
  min: number;
  max: number;
  step: number;
}

export interface Rule {
  id: string;
  name: string;
  version: number;
  typology: string;
  sql: string;
  status: "APPROVED" | "PENDING_APPROVAL" | "REJECTED" | "SUPERSEDED" | string;
  citation: CitationRef | null;
  sourceCitation: string;
  createdAt: string;
  plain: Text | null;
  sourceQuote: string | null;
  highlight: string | null;
  params: RuleParam[];
  approvedBy: string | null;
  rejectionReason: string | null;
  severity: string | null;
}

export interface RuleVersion {
  version: number;
  status: string;
  createdAt: string;
  approvedBy: string | null;
  change: Text;
  sourceCitation: string;
}

export interface ConflictSide {
  ruleId: string;
  ruleName: string;
  citation: CitationRef | null;
  clauseText: string;
  plain: string;
}
export interface Conflict {
  id: string;
  typology: string;
  description: string;
  status: string;
  detectedAt: string;
  kind: "overlap" | "contradiction";
  a: ConflictSide;
  b: ConflictSide;
}

export interface RuleHealth {
  total: number;
  active: number;
  pending: number;
  rejected: number;
  avgPrecision: number;
  rows: Array<{
    ruleId: string;
    ruleName: string;
    typology: string;
    alerts30d: number;
    confirmed30d: number;
    precision: number;
    verdict: "healthy" | "noisy" | "quiet";
    fix: Text | null;
  }>;
}

export interface UploadJob {
  jobId: string;
  status: "RUNNING" | "COMPLETED" | "FAILED" | string;
  progress: number;
  message: string;
  step: number;
  circularNo: string | null;
  ruleIds: string[];
}

export interface Tunable {
  ruleId: string;
  ruleName: string;
  typology: string;
  param: RuleParam;
}
export interface ReplayOutcome {
  value: number;
  alerts: number;
  fraudCaught: number;
  analystHours: number;
}
export interface Replay {
  ruleId: string;
  days: number;
  current: ReplayOutcome;
  proposed: ReplayOutcome;
  fraudTotal: number;
}

export interface AskCitation {
  circularNo: string | null;
  paraNo: string | null;
  text: string;
}
export interface ResultSet {
  columns: string[];
  rows: Array<Array<string | number | null>>;
}
export interface AskAnswer {
  question: string;
  answer: string;
  verified: boolean;
  sql: string | null;
  citations: AskCitation[];
  toolCalls: Array<{ name: string; type: string; status: string | null; summary: string | null }>;
  warnings: string[];
  resultSet: ResultSet | null;
}
export type AskStreamEvent =
  | { type: "status"; message: string }
  | { type: "delta"; text: string }
  | { type: "tool"; name: string; toolType: string }
  | { type: "tool_result"; citations: AskCitation[]; verified: boolean; sql: string | null; resultSet: ResultSet | null }
  | { type: "done"; answer: AskAnswer }
  | { type: "error"; message: string };

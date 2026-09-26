/**
 * Wire-level types (snake_case, exactly as the backend sends them).
 *
 * `generated/schema.ts` is the contract that exists today (from docs/openapi.json).
 * Everything marked EXT is an additive extension proposed in docs/API_EXTENSIONS.md:
 * mocks serve it now; the real backend may omit it, so every EXT field is optional
 * and the adapters degrade gracefully.
 */
import type { components } from "./generated/schema";

type S = components["schemas"];

export type Role = "KAVACH_ADMIN" | "KAVACH_ANALYST" | "KAVACH_AUDITOR" | "KAVACH_REVIEWER";
export type Severity = "HIGH" | "MEDIUM" | "LOW";
export type AlertStatus = "NEW" | "OPEN" | "CLOSED";
export type Resolution = "TRUE_POSITIVE" | "FALSE_POSITIVE";
export type RiskLevelDTO = 1 | 2 | 3 | 4 | 5;
export type Typology =
  | "STRUCTURING"
  | "RAPID_PASSTHROUGH"
  | "MULE_RING"
  | "ROUND_TRIPPING"
  | "PEP_UNUSUAL_CASH"
  | "HIGH_RISK_SWIFT"
  | "DORMANT_REACTIVATION"
  | "INCOME_MISMATCH"
  | "ACCOUNT_TAKEOVER"
  | "CASH_REPORTING"
  | "KYC_CDD"
  | "WIRE_TRANSFER";

export interface Localized {
  en: string;
  hi: string;
}

/* ───────────── Health / me ───────────── */
export type HealthDTO = S["HealthResponse"];
export type MeDTO = S["UserProfile"] & {
  /** EXT: the dataset's "today" (SETTINGS.AS_OF_DATE) so deadlines are computed against the data, not the wall clock. */
  as_of?: string;
};

/* ───────────── Alerts ───────────── */
export interface AlertExt {
  amount_inr: number;
  txn_count: number;
  /** STR filing deadline (7 working days from identification). */
  due_at: string;
  str_filed: boolean;
  risk_level: RiskLevelDTO;
  ring_id: string | null;
  window_start: string;
  window_end: string;
  branch: string;
  city: string;
  city_hi: string;
  customer_name_hi: string;
  action_required: "STR" | "CTR" | "REVIEW";
}
export type AlertDTO = S["AlertResponse"] & Partial<AlertExt>;
export type AlertListDTO = Omit<S["AlertListResponse"], "alerts"> & { alerts: AlertDTO[] };

export interface AlertListParams {
  status?: string;
  severity?: string;
  page?: number;
  page_size?: number;
  /** EXT filters */
  typology?: string;
  due?: "overdue" | "48h" | "open";
  q?: string;
  sort?: "priority" | "amount" | "newest";
}

export interface ReasonDTO {
  text: string;
  text_hi?: string;
  weight: number;
}

export type TimelineTypeDTO =
  | "login"
  | "device_change"
  | "new_beneficiary"
  | "cash_deposit"
  | "transfer_in"
  | "transfer_out"
  | "alert"
  | "kyc";

export interface TimelineEventDTO {
  id: string;
  at: string;
  type: TimelineTypeDTO;
  title: string;
  title_hi?: string;
  detail?: string;
  amount_inr?: number;
  suspicious?: boolean;
}

export interface TxnDTO {
  txn_id: string;
  account_id: string;
  txn_ts: string;
  amount_inr: number;
  channel: "CASH" | "UPI" | "NEFT" | "IMPS" | "RTGS" | "SWIFT";
  direction: "CREDIT" | "DEBIT";
  counterparty: string;
  counterparty_bank: string;
  country: string;
  narration: string;
  device_id?: string;
  ip_address?: string;
}

export type EdgeKind = "shared_phone" | "shared_ip" | "shared_device" | "sent_money";

export interface GraphNodeDTO {
  id: string;
  label: string;
  label_hi?: string;
  risk_level: RiskLevelDTO;
  kind: "subject" | "member" | "external";
  role?: "collector" | "mule" | "exit";
  city?: string;
  alert_id?: string | null;
  money_in_inr?: number;
  money_out_inr?: number;
}

export interface GraphEdgeDTO {
  source: string;
  target: string;
  kind: EdgeKind;
  amount_inr?: number;
  count?: number;
}

export interface CitationRefDTO {
  circular_no: string;
  para_no: string;
  /** Exact substring of the paragraph that the rule relies on. */
  highlight?: string;
}

export interface AlertDetailExt {
  reasons: ReasonDTO[];
  timeline: TimelineEventDTO[];
  transactions: TxnDTO[];
  connections: { nodes: GraphNodeDTO[]; edges: GraphEdgeDTO[] };
  citation_ref: CitationRefDTO;
}
/** EXT fields are typed here (the generated schema has them too, with `null`s); ours win. */
export type AlertDetailDTO = Omit<S["AlertDetailResponse"], "alert" | keyof AlertDetailExt> & { alert: AlertDTO } & Partial<AlertDetailExt>;

export type EvidenceDTO = Omit<S["EvidenceResponse"], "evidence_json"> & {
  /** Untyped JSON in openapi.json (generated as Record<string, never>). */
  evidence_json: Record<string, unknown>;
  /** EXT: real measured time to build the pack. */
  generation_ms?: number;
};
export type VerifyDTO = Omit<S["VerifyResponse"], "details"> & { details: Record<string, unknown> };
export type STRDraftDTO = S["STRDraftResponse"];
export type FeedbackRequestDTO = S["FeedbackRequest"] & {
  /** EXT: analyst verdict alongside the rating. */
  verdict?: "FRAUD" | "NOT_FRAUD";
};

export interface WhyNotRuleDTO {
  rule_id: string;
  rule_name: string;
  typology?: string;
  result: "passed" | "not_applicable" | "near_miss";
  reason: string;
}
export type WhyNotDTO = Omit<S["WhyNotResponse"], "rules_checked"> & { rules_checked: WhyNotRuleDTO[] };

/* ───────────── Home ───────────── */
export type AttentionKind = "report_overdue" | "report_due" | "rule_pending" | "ring_new" | "conflict_open";
export interface AttentionItemDTO {
  id: string;
  kind: AttentionKind;
  status: "overdue" | "act" | "attention";
  entity_id: string;
  /** Structured facts; the UI turns them into sentences in the active language. */
  params: {
    name?: string;
    name_hi?: string;
    amount_inr?: number;
    due_at?: string;
    count?: number;
    typology?: string;
  };
}

export interface HomeKpisDTO {
  new_alerts: number;
  new_alerts_prev: number;
  serious_new_alerts: number;
  money_at_risk_inr: number;
  money_at_risk_prev_inr: number;
  reports_due_48h: number;
  reports_overdue: number;
  active_rings: number;
  active_rings_prev: number;
  ring_volume_30d_inr: number;
}

export type TrendPointDTO = S["TrendData"] & { confirmed_fraud?: number };

export type HomeDTO = Omit<S["HomeResponse"], "trend" | "readiness_score" | "kpis" | "attention" | "weekly_brief" | "as_of"> & {
  readiness_score: S["ReadinessScore"] & {
    reason_hi?: string;
    /** EXT: what pulls the score down, so the number is explained in words. */
    factors?: Array<{ key: "overdue" | "due_soon" | "rules_pending" | "conflicts"; count: number; points: number }>;
  };
  trend: TrendPointDTO[];
  kpis?: HomeKpisDTO;
  attention?: AttentionItemDTO[];
  weekly_brief?: { text: string; text_hi: string; generated_at: string };
  as_of?: string;
};

/* ───────────── Portfolio risk ───────────── */
export interface ExposureRowDTO {
  /** Segment name (HNI, RETAIL, …) or branch code (BR0199). */
  label: string;
  accounts: number;
  exposure_inr: number;
  flagged_accounts: number;
  exposure_at_risk_inr: number;
  /** Already a percentage, 0–100 — not a fraction. */
  pct_at_risk: number;
}
export interface LiquidityDTO {
  inflow_inr: number;
  outflow_inr: number;
  net_inr: number;
  coverage_ratio: number;
  txn_count: number;
  window_days: number;
}
export interface RiskDTO {
  by_segment: ExposureRowDTO[];
  by_branch: ExposureRowDTO[];
  liquidity: LiquidityDTO;
  total_exposure_inr: number;
  total_at_risk_inr: number;
  pct_at_risk: number;
}

/* ───────────── Customers ───────────── */
export type CustomerSortDTO = "risk" | "alerts" | "balance" | "name" | "city" | "segment" | "id";
export type RiskBandDTO = "high" | "medium" | "low" | "pep" | "alerted";

export interface CustomerDTO {
  customer_id: string;
  /** Masked for roles whose masking policy says so — show it as it arrives. */
  customer_name: string | null;
  pan: string | null;
  city: string | null;
  segment: string | null;
  risk_category: string | null;
  is_pep: boolean;
  kyc_status: string | null;
  account_count: number;
  total_balance_inr: number;
  /** Worst calibrated ML score across the customer's accounts, 0–1. Null when unscored. */
  risk_score: number | null;
  open_alerts: number;
}
export interface CustomerListDTO {
  customers: CustomerDTO[];
  total: number;
  limit: number;
  offset: number;
  sort: string;
  segments: string[];
}
export interface CustomerAccountDTO {
  account_id: string;
  account_type: string | null;
  status: string | null;
  branch_code: string | null;
  open_date: string | null;
  avg_monthly_balance_inr: number;
  risk_score: number | null;
  open_alerts: number;
}
export interface ScoreDriverDTO {
  feature: string;
  /** SHAP contribution; positive pushed the score up. */
  shap: number;
}
export interface CustomerAlertDTO {
  alert_id: string;
  account_id: string | null;
  typology: string | null;
  severity: string | null;
  score: number;
  status: string | null;
  created_at: string;
}
export interface CustomerDetailDTO {
  customer: CustomerDTO;
  dob: string | null;
  state: string | null;
  state_code: string | null;
  region: string | null;
  occupation: string | null;
  declared_annual_income_inr: number | null;
  kyc_last_updated: string | null;
  onboarding_channel: string | null;
  accounts: CustomerAccountDTO[];
  drivers: ScoreDriverDTO[];
  /** Scores are per account, so the drivers belong to one account, not the customer. */
  driver_account_id: string | null;
  driver_scored_at: string | null;
  alerts: CustomerAlertDTO[];
}
export interface CustomerListParams {
  limit?: number;
  offset?: number;
  q?: string;
  segment?: string;
  risk?: RiskBandDTO;
  sort?: CustomerSortDTO;
}

/* ───────────── Circulars (EXT) ───────────── */
export interface ParagraphDTO {
  circular_no: string;
  para_no: string;
  text: string;
  issue_date: string | null;
  is_amendment: boolean;
  amends_circular: string | null;
  before?: { para_no: string; text: string } | null;
  after?: { para_no: string; text: string } | null;
}

/* ───────────── Search (EXT) ───────────── */
export interface SearchResultDTO {
  kind: "alert" | "account" | "txn" | "ring" | "rule";
  id: string;
  title: string;
  title_hi?: string;
  subtitle: string;
  /** Alert to open for account/txn hits. */
  alert_id?: string;
}

/* ───────────── Rings ───────────── */
export interface RingExt {
  confidence: "HIGH" | "MEDIUM" | "LOW";
  /** Median hours money stays in a member account before moving on. */
  speed_hours: number;
  detected_at: string;
  alerted_members: number;
  shared_devices: number;
  city: string;
  city_hi: string;
  ring_name_hi: string;
}
export type RingDTO = S["RingResponse"] & Partial<RingExt>;
export type RingListDTO = Omit<S["RingListResponse"], "rings"> & { rings: RingDTO[] };
export type RingDetailDTO = {
  ring: RingDTO;
  members: GraphNodeDTO[];
  transactions: TxnDTO[];
  edges?: GraphEdgeDTO[];
};

/* ───────────── Rules ───────────── */
export interface RuleParamDTO {
  key: string;
  label: string;
  label_hi: string;
  unit: "inr" | "count" | "hours" | "days" | "percent";
  value: number;
  min: number;
  max: number;
  step: number;
}
export interface RuleExt {
  plain_english: string;
  plain_hindi: string;
  circular_no: string;
  para_no: string;
  source_quote: string;
  highlight: string;
  severity: Severity;
  entity: string;
  params: RuleParamDTO[];
  approved_by: string | null;
  rejection_reason: string | null;
}
export type RuleDTO = S["RuleResponse"] & Partial<RuleExt>;
export type RuleListDTO = Omit<S["RuleListResponse"], "rules"> & { rules: RuleDTO[] };

export interface RuleVersionDTO {
  version: number;
  status: string;
  created_at: string;
  approved_by: string | null;
  change_summary: string;
  change_summary_hi: string;
  source_citation: string;
}

export interface ConflictSideDTO {
  rule_id: string;
  rule_name: string;
  citation: string;
  circular_no: string;
  para_no: string;
  clause_text: string;
  plain_english: string;
}
export interface ConflictDTO {
  conflict_id: string;
  typology: string;
  entity: string;
  description: string;
  status: string;
  detected_at: string;
  kind: "overlap" | "contradiction";
  rule_a: ConflictSideDTO;
  rule_b: ConflictSideDTO;
}

export interface RuleHealthRowDTO {
  rule_id: string;
  rule_name: string;
  typology: string;
  alerts_30d: number;
  confirmed_30d: number;
  precision: number;
  verdict: "healthy" | "noisy" | "quiet";
  proposed_fix?: string;
  proposed_fix_hi?: string;
}
export type RuleHealthDTO = S["RuleHealthResponse"] & { rules?: RuleHealthRowDTO[] };

export type UploadDTO = S["UploadResponse"];
export type JobStatusDTO = S["JobStatusResponse"] & {
  /** EXT: 0 reading · 1 obligations · 2 checks · 3 review · 4 done */
  step?: number;
  circular_no?: string;
  rule_ids?: string[];
};

/* ───────────── Time machine ───────────── */
export type TimeMachineDayDTO = Omit<S["TimeMachineResponse"], "top_typologies"> & { top_typologies: Array<{ typology: string; count: number }> };
export interface TunableRuleDTO {
  rule_id: string;
  rule_name: string;
  typology: Typology;
  param: RuleParamDTO;
}
export interface ReplayOutcomeDTO {
  value: number;
  alerts: number;
  fraud_caught: number;
  analyst_hours: number;
}
export interface ReplayDTO {
  rule_id: string;
  days: number;
  current: ReplayOutcomeDTO;
  proposed: ReplayOutcomeDTO;
  fraud_total: number;
}

/* ───────────── Ask (SSE, shape from backend ask.py) ───────────── */
export interface AskCitationDTO {
  circular_no: string | null;
  para_no: string | null;
  text: string;
}
export interface AskToolCallDTO {
  name: string;
  type: string;
  status?: string | null;
  summary?: string | null;
}
/** EXT: rows of the SQL the agent ran, so the UI can show the data. */
export interface ResultSetDTO {
  columns: string[];
  rows: Array<Array<string | number | null>>;
}
export interface AskDoneDTO {
  question: string;
  answer: string;
  verified_query: boolean;
  sql: string | null;
  citations: AskCitationDTO[];
  tool_calls: AskToolCallDTO[];
  warnings: string[];
  result_set?: ResultSetDTO | null;
}
export type AskEventDTO =
  | { event: "status"; data: { status?: string; message?: string } }
  | { event: "text_delta"; data: { text: string; content_index?: number } }
  | { event: "tool_call"; data: { name: string; type: string; input?: unknown } }
  | {
      event: "tool_result";
      data: {
        name: string;
        type: string;
        status: string;
        citations: AskCitationDTO[];
        verified_query: boolean;
        sql: string | null;
        result_set?: ResultSetDTO | null;
      };
    }
  | { event: "done"; data: AskDoneDTO }
  | { event: "error"; data: { message: string } };

/* ───────────── Tour (EXT) ───────────── */
export interface TourResetDTO {
  ok: boolean;
  alert_id: string;
  ring_id: string;
  rule_id: string;
  circular_no: string;
}

/* ───────────── Auth ───────────── */
export interface AuthProfileDTO {
  user_id: string;
  name: string;
  role: string;
  email: string;
  read_only: boolean;
  as_of?: string | null;
}
export interface AuthRoleDTO {
  role: string;
  name: string;
  blurb: string;
  readOnly: boolean;
  /** The short name the viewer types, e.g. "analyst". */
  username: string;
}
export interface AuthContextDTO {
  authenticated: boolean;
  /** Set when Snowflake already signed the visitor in at the SPCS ingress. */
  ingress_user: string | null;
  profile: AuthProfileDTO | null;
  roles: AuthRoleDTO[];
}

/**
 * DTO → view model. Every EXT field is optional on the wire; when the real backend
 * omits one, the adapter derives what it honestly can and otherwise returns null /
 * [] so the UI hides that section instead of showing a raw ID, 0 or "null".
 */
import type * as D from "./dto";
import type * as M from "./models";

const text = (en: string | null | undefined, hi?: string | null): M.Text => ({ en: en ?? "", hi: hi || en || "" });

export function parseCitation(s: string | null | undefined): M.CitationRef | null {
  if (!s) return null;
  const m = s.match(/(KAVACH\/\d{4}\/\d{2})(?:\D+(\d+))?/i);
  if (!m) return null;
  return { circularNo: m[1]!.toUpperCase(), paraNo: m[2] ?? "1" };
}

export function riskFrom(level: number | undefined | null, severity: string | undefined, score: number | undefined): M.RiskLevel {
  if (level && level >= 1 && level <= 5) return level as M.RiskLevel;
  if (severity === "CRITICAL") return 5;
  if (severity === "HIGH") return 4;
  if (severity === "MEDIUM") return 3;
  if (severity === "LOW") return 2;
  if (score != null) {
    const s = score > 1 ? score / 100 : score;
    return s >= 0.85 ? 5 : s >= 0.65 ? 4 : s >= 0.45 ? 3 : s >= 0.25 ? 2 : 1;
  }
  return 3;
}

/** LLM stories from AI.ALERT_STORIES start with a "Here is a 3-5 sentence story…" preamble. */
export function cleanStory(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s
    .replace(/^\s*here is[^:\n]*:\s*/i, "")
    .replace(/^\s*यहाँ[^:\n]*:\s*/, "")
    .trim();
  if (!t || /^I can(no|')t/i.test(t)) return null;
  return t;
}

export function toMe(d: D.MeDTO): M.Me {
  const role = d.role as D.Role;
  return {
    userId: d.user_id,
    name: d.name,
    role,
    email: d.email,
    readOnly: role === "KAVACH_REVIEWER" || role === "KAVACH_AUDITOR",
    asOf: d.as_of ?? null,
  };
}

export function toAlert(d: D.AlertDTO): M.Alert {
  const ext = d as D.AlertDTO & Partial<D.AlertExt>;
  return {
    id: d.alert_id,
    accountId: d.account_id,
    customerId: d.customer_id ?? null,
    customerName: text(d.customer_name ?? d.account_id, ext.customer_name_hi),
    pan: d.pan ?? null,
    typology: d.typology,
    severity: d.severity,
    riskLevel: riskFrom(ext.risk_level, d.severity, d.score),
    status: d.status,
    resolution: d.resolution ?? null,
    ruleName: d.rule_name,
    citation: parseCitation(d.citation),
    createdAt: d.created_at,
    amount: ext.amount_inr ?? null,
    txnCount: ext.txn_count ?? null,
    dueAt: ext.due_at ?? null,
    reportFiled: ext.str_filed ?? false,
    ringId: ext.ring_id ?? null,
    city: ext.city ? text(ext.city, ext.city_hi) : null,
    branch: ext.branch ?? null,
    windowStart: ext.window_start ?? null,
    windowEnd: ext.window_end ?? null,
  };
}

export function toTxn(t: D.TxnDTO): M.Txn {
  return {
    id: t.txn_id,
    accountId: t.account_id,
    at: t.txn_ts,
    amount: t.amount_inr,
    channel: t.channel,
    direction: t.direction,
    counterparty: t.counterparty,
    counterpartyBank: t.counterparty_bank,
    country: t.country,
    narration: t.narration,
  };
}

export function toGraph(nodes: D.GraphNodeDTO[], edges: D.GraphEdgeDTO[]): M.Graph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      label: text(n.label, n.label_hi),
      riskLevel: n.risk_level,
      kind: n.kind,
      role: n.role,
      city: n.city,
      alertId: n.alert_id ?? null,
      moneyIn: n.money_in_inr,
      moneyOut: n.money_out_inr,
    })),
    edges: edges.map((e, i) => ({ id: `${e.source}-${e.target}-${e.kind}-${i}`, source: e.source, target: e.target, kind: e.kind, amount: e.amount_inr, count: e.count })),
  };
}

export function toAlertDetail(d: D.AlertDetailDTO): M.AlertDetail {
  const alert = toAlert(d.alert);
  const en = cleanStory(d.story_en);
  const hi = cleanStory(d.story_hi);
  const citation = d.citation_ref
    ? { circularNo: d.citation_ref.circular_no, paraNo: d.citation_ref.para_no, highlight: d.citation_ref.highlight }
    : alert.citation;
  return {
    alert: { ...alert, amount: alert.amount ?? d.total_amount_inr, txnCount: alert.txnCount ?? d.txn_count },
    story: en ? { en, hi: hi ?? en } : null,
    reasons: (d.reasons ?? []).map((r) => ({ text: text(r.text, r.text_hi), weight: r.weight })),
    timeline: (d.timeline ?? []).map((e) => ({ id: e.id, at: e.at, type: e.type, title: text(e.title, e.title_hi), detail: e.detail, amount: e.amount_inr, suspicious: e.suspicious })),
    transactions: (d.transactions ?? []).map(toTxn),
    connections: d.connections && d.connections.nodes.length > 1 ? toGraph(d.connections.nodes, d.connections.edges) : null,
    citation,
    txnCount: d.txn_count,
    totalAmount: d.total_amount_inr,
  };
}

export function toAlertPage(d: D.AlertListDTO): M.AlertPage {
  return { alerts: d.alerts.map(toAlert), total: d.total, page: d.page, pageSize: d.page_size, totalPages: d.total_pages };
}

export function toEvidence(d: D.EvidenceDTO): M.Evidence {
  return {
    alertId: d.alert_id,
    url: d.presigned_url ?? null,
    pdfUrl: d.pdf_presigned_url ?? null,
    sha256: d.html_sha256_hash ?? d.sha256_hash ?? null,
    createdAt: d.created_at,
    createdBy: d.created_by,
    generationMs: d.generation_ms ?? null,
  };
}

export function toVerification(d: D.VerifyDTO): M.Verification {
  const det = (d.details ?? {}) as Record<string, unknown>;
  const s = String(det.html_integrity_status ?? det.integrity_status ?? (d.verified ? "MATCH" : "TAMPERED"));
  return {
    verified: d.verified,
    status: s === "MATCH" ? "MATCH" : s === "TAMPERED" ? "TAMPERED" : "UNKNOWN",
    createdAt: (det.created_at as string | undefined) ?? null,
    storedHash: (det.html_stored_hash as string | undefined) ?? (det.stored_hash as string | undefined) ?? null,
    computedHash: (det.html_computed_hash as string | undefined) ?? (det.computed_hash as string | undefined) ?? null,
  };
}

export function toWhyNot(d: D.WhyNotDTO): M.WhyNot {
  const flagged = d.recommendation.startsWith("open_alert:") ? d.recommendation.slice("open_alert:".length) : null;
  return {
    txnId: d.txn_id,
    explanation: d.explanation,
    rules: (d.rules_checked ?? []).map((r) => {
      // The live endpoint's rows are untyped; accept a boolean `matched` as well as `result`.
      const raw = r as unknown as Record<string, unknown>;
      const result = typeof raw.result === "string" ? raw.result : raw.matched === true ? "near_miss" : "passed";
      return { id: String(raw.rule_id ?? ""), name: String(raw.rule_name ?? raw.rule_id ?? ""), result, reason: String(raw.reason ?? "") };
    }),
    recommendation: flagged ? "" : d.recommendation,
    flaggedAlertId: flagged,
  };
}

export function toHome(d: D.HomeDTO): M.Home {
  const k = d.kpis;
  return {
    readiness: { score: d.readiness_score.score, reason: text(d.readiness_score.reason, d.readiness_score.reason_hi), factors: d.readiness_score.factors ?? [] },
    kpis: k
      ? {
          newAlerts: k.new_alerts,
          newAlertsPrev: k.new_alerts_prev,
          seriousNewAlerts: k.serious_new_alerts,
          moneyAtRisk: k.money_at_risk_inr,
          moneyAtRiskPrev: k.money_at_risk_prev_inr,
          reportsDue48h: k.reports_due_48h,
          reportsOverdue: k.reports_overdue,
          activeRings: k.active_rings,
          activeRingsPrev: k.active_rings_prev,
          ringVolume30d: k.ring_volume_30d_inr,
        }
      : null,
    attention: (d.attention ?? []).map((a) => ({
      id: a.id,
      kind: a.kind,
      status: a.status,
      entityId: a.entity_id,
      name: a.params.name ? text(a.params.name, a.params.name_hi) : undefined,
      amount: a.params.amount_inr,
      dueAt: a.params.due_at,
      count: a.params.count,
      typology: a.params.typology,
    })),
    trend: d.trend.map((t) => ({ date: t.date, alerts: t.alert_count, fraud: t.confirmed_fraud ?? null })),
    brief: d.weekly_brief ? { text: text(d.weekly_brief.text, d.weekly_brief.text_hi), generatedAt: d.weekly_brief.generated_at } : null,
    topAlerts: d.top_alerts.map((a) => ({ id: a.alert_id, accountId: a.account_id, typology: a.typology, riskLevel: riskFrom(undefined, a.severity, a.score), createdAt: a.created_at })),
    asOf: d.as_of ?? null,
  };
}

function toExposureRow(r: D.ExposureRowDTO): M.ExposureRow {
  return {
    label: r.label,
    accounts: r.accounts,
    exposure: r.exposure_inr,
    flaggedAccounts: r.flagged_accounts,
    exposureAtRisk: r.exposure_at_risk_inr,
    pctAtRisk: r.pct_at_risk,
  };
}

export function toPortfolioRisk(d: D.RiskDTO): M.PortfolioRisk {
  return {
    bySegment: (d.by_segment ?? []).map(toExposureRow),
    byBranch: (d.by_branch ?? []).map(toExposureRow),
    liquidity: {
      inflow: d.liquidity.inflow_inr,
      outflow: d.liquidity.outflow_inr,
      net: d.liquidity.net_inr,
      coverageRatio: d.liquidity.coverage_ratio,
      txnCount: d.liquidity.txn_count,
      windowDays: d.liquidity.window_days,
    },
    totalExposure: d.total_exposure_inr,
    totalAtRisk: d.total_at_risk_inr,
    pctAtRisk: d.pct_at_risk,
  };
}

/** The 5 risk steps, but honest about "we have no score for this one". */
function bandOf(score: number | null | undefined): M.RiskLevel | null {
  if (score == null) return null;
  return riskFrom(undefined, undefined, score);
}

export function toCustomer(d: D.CustomerDTO): M.Customer {
  return {
    id: d.customer_id,
    // Falls back to the id rather than showing an empty cell; a masked name is a real value.
    name: d.customer_name ?? d.customer_id,
    pan: d.pan ?? null,
    city: d.city ?? null,
    segment: d.segment ?? null,
    riskCategory: d.risk_category ?? null,
    isPep: !!d.is_pep,
    kycStatus: d.kyc_status ?? null,
    accountCount: d.account_count ?? 0,
    balance: d.total_balance_inr ?? 0,
    score: d.risk_score ?? null,
    riskLevel: bandOf(d.risk_score),
    openAlerts: d.open_alerts ?? 0,
  };
}

export function toCustomerPage(d: D.CustomerListDTO): M.CustomerPage {
  return {
    customers: (d.customers ?? []).map(toCustomer),
    total: d.total ?? 0,
    limit: d.limit ?? 25,
    offset: d.offset ?? 0,
    segments: d.segments ?? [],
  };
}

export function toCustomerDetail(d: D.CustomerDetailDTO): M.CustomerDetail {
  return {
    customer: toCustomer(d.customer),
    dob: d.dob ?? null,
    state: d.state ?? null,
    region: d.region ?? null,
    occupation: d.occupation ?? null,
    declaredIncome: d.declared_annual_income_inr ?? null,
    kycUpdatedAt: d.kyc_last_updated ?? null,
    onboardingChannel: d.onboarding_channel ?? null,
    accounts: (d.accounts ?? []).map((a) => ({
      id: a.account_id,
      type: a.account_type ?? null,
      status: a.status ?? null,
      branch: a.branch_code ?? null,
      openedAt: a.open_date ?? null,
      balance: a.avg_monthly_balance_inr ?? 0,
      score: a.risk_score ?? null,
      riskLevel: bandOf(a.risk_score),
      openAlerts: a.open_alerts ?? 0,
    })),
    drivers: (d.drivers ?? []).map((x) => ({ feature: x.feature, shap: x.shap })),
    driverAccountId: d.driver_account_id ?? null,
    driverScoredAt: d.driver_scored_at ?? null,
    alerts: (d.alerts ?? []).map((a) => ({
      id: a.alert_id,
      accountId: a.account_id ?? null,
      typology: a.typology ?? "GENERAL_AML",
      severity: a.severity ?? "",
      score: a.score ?? 0,
      status: a.status ?? "NEW",
      createdAt: a.created_at,
      riskLevel: riskFrom(undefined, a.severity ?? undefined, a.score),
    })),
  };
}

export function toParagraph(d: D.ParagraphDTO): M.Paragraph {
  return {
    circularNo: d.circular_no,
    paraNo: String(d.para_no),
    text: d.text,
    issueDate: d.issue_date,
    isAmendment: d.is_amendment,
    amends: d.amends_circular,
    before: d.before ? { paraNo: String(d.before.para_no), text: d.before.text } : null,
    after: d.after ? { paraNo: String(d.after.para_no), text: d.after.text } : null,
  };
}

export function toSearchResult(d: D.SearchResultDTO): M.SearchResult {
  return { kind: d.kind, id: d.id, title: text(d.title, d.title_hi), subtitle: d.subtitle, alertId: d.alert_id };
}

export function toRing(d: D.RingDTO): M.Ring {
  return {
    id: d.ring_id,
    name: text(d.ring_name, d.ring_name_hi),
    memberCount: d.member_count,
    volume: d.total_volume_inr,
    riskLevel: riskFrom(undefined, undefined, d.risk_score),
    status: d.status,
    confidence: d.confidence ?? null,
    speedHours: d.speed_hours ?? null,
    detectedAt: d.detected_at ?? null,
    alertedMembers: d.alerted_members ?? null,
    city: d.city ? text(d.city, d.city_hi) : null,
  };
}

/** Real backend: members are untyped rows and there are no edges — derive money edges from transactions. */
export function toRingDetail(d: D.RingDetailDTO): M.RingDetail {
  const members = (d.members as unknown as Array<Record<string, unknown>>).map((m): D.GraphNodeDTO => ({
    id: String(m.id ?? m.account_id ?? m.ACCOUNT_ID ?? ""),
    label: String(m.label ?? m.customer_name ?? m.CUSTOMER_NAME ?? m.account_id ?? m.ACCOUNT_ID ?? ""),
    label_hi: m.label_hi as string | undefined,
    risk_level: riskFrom(m.risk_level as number | undefined, undefined, m.risk_score as number | undefined),
    kind: "member",
    role: m.role as D.GraphNodeDTO["role"],
    city: m.city as string | undefined,
    alert_id: (m.alert_id as string | null | undefined) ?? null,
    money_in_inr: m.money_in_inr as number | undefined,
    money_out_inr: m.money_out_inr as number | undefined,
  }));
  const txns = (d.transactions ?? []).map((t) => toTxn(t as D.TxnDTO));
  let edges = d.edges;
  if (!edges) {
    const byLabel = new Map(members.map((m) => [m.label, m.id]));
    edges = txns
      .filter((t) => byLabel.has(t.counterparty))
      .map((t) => ({ source: t.accountId, target: byLabel.get(t.counterparty)!, kind: "sent_money" as const, amount_inr: t.amount }));
  }
  return { ring: toRing(d.ring), graph: toGraph(members, edges), transactions: txns };
}

function toParam(p: D.RuleParamDTO): M.RuleParam {
  return { key: p.key, label: text(p.label, p.label_hi), unit: p.unit, value: p.value, min: p.min, max: p.max, step: p.step };
}

export function toRule(d: D.RuleDTO): M.Rule {
  const cite = d.circular_no ? { circularNo: d.circular_no, paraNo: d.para_no ?? "1", highlight: d.highlight } : parseCitation(d.source_citation);
  return {
    id: d.rule_id,
    name: d.rule_name,
    version: d.version,
    typology: d.typology,
    sql: d.sql_text,
    status: d.status,
    citation: cite,
    sourceCitation: d.source_citation,
    createdAt: d.created_at,
    plain: d.plain_english ? text(d.plain_english, d.plain_hindi) : null,
    sourceQuote: d.source_quote ?? null,
    highlight: d.highlight ?? null,
    params: (d.params ?? []).map(toParam),
    approvedBy: d.approved_by ?? null,
    rejectionReason: d.rejection_reason ?? null,
    severity: d.severity ?? null,
  };
}

export function toRuleVersion(v: D.RuleVersionDTO): M.RuleVersion {
  return { version: v.version, status: v.status, createdAt: v.created_at, approvedBy: v.approved_by, change: text(v.change_summary, v.change_summary_hi), sourceCitation: v.source_citation };
}

export function toConflict(c: D.ConflictDTO): M.Conflict {
  const side = (s: D.ConflictSideDTO): M.ConflictSide => ({
    ruleId: s.rule_id,
    ruleName: s.rule_name,
    citation: s.circular_no ? { circularNo: s.circular_no, paraNo: s.para_no } : parseCitation(s.citation),
    clauseText: s.clause_text,
    plain: s.plain_english,
  });
  return { id: c.conflict_id, typology: c.typology, description: c.description, status: c.status, detectedAt: c.detected_at, kind: c.kind ?? "overlap", a: side(c.rule_a), b: side(c.rule_b) };
}

export function toRuleHealth(d: D.RuleHealthDTO): M.RuleHealth {
  return {
    total: d.total_rules,
    active: d.active_rules,
    pending: d.pending_rules,
    rejected: d.rejected_rules,
    avgPrecision: d.avg_precision,
    rows: (d.rules ?? []).map((r) => ({
      ruleId: r.rule_id,
      ruleName: r.rule_name,
      typology: r.typology,
      alerts30d: r.alerts_30d,
      confirmed30d: r.confirmed_30d,
      precision: r.precision,
      verdict: r.verdict,
      fix: r.proposed_fix ? text(r.proposed_fix, r.proposed_fix_hi) : null,
    })),
  };
}

export function toJob(d: D.JobStatusDTO): M.UploadJob {
  const step = d.step ?? (d.status === "COMPLETED" ? 4 : Math.min(3, Math.floor((d.progress ?? 0) / 25)));
  return { jobId: d.job_id, status: d.status, progress: d.progress, message: d.message, step, circularNo: d.circular_no ?? null, ruleIds: d.rule_ids ?? [] };
}

export function toTunable(t: D.TunableRuleDTO): M.Tunable {
  return { ruleId: t.rule_id, ruleName: t.rule_name, typology: t.typology, param: toParam(t.param) };
}

export function toReplay(r: D.ReplayDTO): M.Replay {
  const o = (x: D.ReplayOutcomeDTO): M.ReplayOutcome => ({ value: x.value, alerts: x.alerts, fraudCaught: x.fraud_caught, analystHours: x.analyst_hours });
  return { ruleId: r.rule_id, days: r.days, current: o(r.current), proposed: o(r.proposed), fraudTotal: r.fraud_total };
}

export function toAskCitation(c: D.AskCitationDTO): M.AskCitation {
  return { circularNo: c.circular_no, paraNo: c.para_no, text: c.text };
}

export function toAskAnswer(d: D.AskDoneDTO): M.AskAnswer {
  return {
    question: d.question,
    answer: d.answer,
    verified: d.verified_query,
    sql: d.sql,
    citations: d.citations.map(toAskCitation),
    toolCalls: d.tool_calls.map((t) => ({ name: t.name, type: t.type, status: t.status ?? null, summary: t.summary ?? null })),
    warnings: d.warnings,
    resultSet: d.result_set ?? null,
  };
}

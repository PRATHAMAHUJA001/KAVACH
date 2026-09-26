import { http, HttpResponse } from "msw";
import type { AlertDTO, AlertDetailDTO, EvidenceDTO, STRDraftDTO, VerifyDTO, WhyNotDTO } from "@/services/api/dto";
import { formatDate, formatDateTime } from "@/shared/lib/format";
import { asOf, getDb, isReadOnly, maskName, maskPan, mockRole, type AlertRow, type Db, type EvidenceRow } from "../db";
import { HOUR, forbidden, json, latency, money, notFound, sha256Hex } from "../util";

const TYPOLOGY_LABEL: Record<string, string> = {
  STRUCTURING: "Cash split to stay under the reporting limit",
  RAPID_PASSTHROUGH: "Money moved in and out within a day",
  MULE_RING: "Accounts working together to move money",
  ROUND_TRIPPING: "Money sent out and brought back in a loop",
  PEP_UNUSUAL_CASH: "Unusual cash for a politically exposed person",
  HIGH_RISK_SWIFT: "Transfer to a high-risk country",
  DORMANT_REACTIVATION: "Sleeping account suddenly active",
  INCOME_MISMATCH: "Money far above declared income",
  ACCOUNT_TAKEOVER: "Account possibly taken over",
};

/** List shape: the alert without the heavy detail fields, masked for reviewers. */
function toListDTO(a: AlertRow): AlertDTO {
  const { reasons: _r, timeline: _t, transactions: _x, connections: _c, citation_ref: _cr, story_en: _se, story_hi: _sh, story_source: _ss, ...rest } = a;
  void _r, _t, _x, _c, _cr, _se, _sh, _ss;
  if (mockRole() === "KAVACH_REVIEWER")
    return { ...rest, customer_name: maskName(rest.customer_name ?? ""), customer_name_hi: maskName(rest.customer_name ?? ""), pan: maskPan(rest.pan ?? "") };
  return rest;
}

function priority(a: AlertRow, now: number): number {
  const open = a.status !== "CLOSED";
  const due = Date.parse(a.due_at!) - now;
  const urgency = !open || a.str_filed ? 0 : due < 0 ? 3 : due < 48 * HOUR ? 2 : due < 5 * 24 * HOUR ? 1 : 0;
  return (open ? 100 : 0) + urgency * 10 + (a.risk_level ?? 1) * 2 + a.score;
}

function findAlert(db: Db, id: string) {
  return db.alerts.find((a) => a.alert_id === id);
}

function evidenceHtml(a: AlertRow, db: Db, createdAt: string, createdBy: string): string {
  const para = db.chunks.find((c) => c.circular_no === a.citation_ref.circular_no && c.para_no === a.citation_ref.para_no);
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
  const rows = a.transactions
    .map((t) => `<tr><td>${esc(formatDateTime(t.txn_ts))}</td><td>${t.channel}</td><td>${t.direction === "CREDIT" ? "In" : "Out"}</td><td>${esc(t.counterparty)}</td><td class="num">${esc(money(t.amount_inr))}</td></tr>`)
    .join("");
  const reasons = a.reasons.map((r) => `<li>${esc(r.text)}</li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Evidence pack · ${esc(a.alert_id)}</title>
<style>body{font:14px/1.55 system-ui,sans-serif;color:#0e1325;max-width:820px;margin:40px auto;padding:0 24px}h1{font-size:22px;margin:0}h2{font-size:16px;margin:28px 0 8px}.muted{color:#5b6478}.wm{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:72px;font-weight:800;color:rgba(185,28,28,.07);transform:rotate(-18deg);pointer-events:none}blockquote{margin:0;padding:12px 16px;border-left:4px solid #1d4ed8;background:#eaf1ff;border-radius:8px}mark{background:#fef4e6}table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:6px 8px;border-bottom:1px solid #e4e7ef;text-align:left}.num{text-align:right}.tag{display:inline-block;padding:2px 8px;border-radius:99px;background:#fdecec;color:#b91c1c;font-weight:600;font-size:12px}</style></head>
<body><div class="wm">SYNTHETIC DATA</div>
<p class="tag">Synthetic data — for demonstration only</p>
<h1>Evidence pack: ${esc(a.customer_name ?? "")}</h1>
<p class="muted">Alert ${esc(a.alert_id)} · Account ${esc(a.account_id)} · ${esc(a.branch ?? "")}, ${esc(a.city ?? "")}<br>Created ${esc(formatDateTime(createdAt))} by ${esc(createdBy)}</p>
<h2>What happened</h2><p>${esc(a.story_en)}</p>
<h2>Why it was flagged</h2><ol>${reasons}</ol>
<h2>Regulation relied on</h2><p class="muted">Circular ${esc(a.citation_ref.circular_no)}, paragraph ${esc(a.citation_ref.para_no)} (synthetic circular)</p>
<blockquote>${para ? esc(para.text).replace(esc(a.citation_ref.highlight ?? "\u0000"), `<mark>${esc(a.citation_ref.highlight ?? "")}</mark>`) : ""}</blockquote>
<h2>Check that fired</h2><p><code>${esc(a.rule_name)}</code> · risk ${a.risk_level}/5 · report due ${esc(formatDate(a.due_at!))}</p>
<h2>Transactions (${a.transactions.length})</h2><table><thead><tr><th>When</th><th>Channel</th><th>Direction</th><th>Counterparty</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<p class="muted" style="margin-top:32px">Integrity: this file's SHA-256 fingerprint is recorded in AUDIT.EVIDENCE_REGISTRY when it is created. Any change to this file changes the fingerprint.</p>
</body></html>`;
}

function evidenceDTO(a: AlertRow, e: EvidenceRow): EvidenceDTO {
  return {
    alert_id: a.alert_id,
    evidence_json: { alert_id: a.alert_id, account_id: a.account_id, rule_name: a.rule_name, citation: a.citation, txn_count: a.txn_count, amount_inr: a.amount_inr },
    file_path: `evidence_${a.alert_id}.html`,
    sha256_hash: e.sha256,
    html_sha256_hash: e.sha256,
    created_by: e.created_by,
    created_at: e.created_at,
    presigned_url: `/mock-files/evidence_${a.alert_id}.html`,
    pdf_presigned_url: null,
    pdf_sha256_hash: null,
    json_presigned_url: null,
    generation_ms: e.generation_ms,
  };
}

export const alertHandlers = [
  http.get("/api/alerts", async ({ request }) => {
    const db = await getDb();
    await latency();
    const now = asOf(db);
    const u = new URL(request.url).searchParams;
    const status = u.get("status");
    const severity = u.get("severity");
    const typology = u.get("typology");
    const due = u.get("due");
    const q = (u.get("q") ?? "").toLowerCase();
    const sort = u.get("sort") ?? "priority";
    const page = Math.max(1, Number(u.get("page") ?? 1));
    const size = Math.min(200, Math.max(1, Number(u.get("page_size") ?? 50)));
    let rows = db.alerts.filter((a) => {
      if (status && status !== "ALL" && (status === "OPEN" ? a.status === "CLOSED" : a.status !== status)) return false;
      if (severity && a.severity !== severity) return false;
      if (typology && a.typology !== typology) return false;
      const d = Date.parse(a.due_at!) - now;
      const pending = a.status !== "CLOSED" && !a.str_filed;
      if (due === "overdue" && !(pending && d < 0)) return false;
      if (due === "48h" && !(pending && d >= 0 && d <= 48 * HOUR)) return false;
      if (due === "open" && a.status === "CLOSED") return false;
      if (q && !(`${a.alert_id} ${a.account_id} ${a.customer_name} ${a.city}`.toLowerCase().includes(q))) return false;
      return true;
    });
    rows = rows.sort((a, b) =>
      sort === "amount" ? (b.amount_inr ?? 0) - (a.amount_inr ?? 0) : sort === "newest" ? Date.parse(b.created_at) - Date.parse(a.created_at) : priority(b, now) - priority(a, now),
    );
    const total = rows.length;
    return json({ alerts: rows.slice((page - 1) * size, page * size).map(toListDTO), total, page, page_size: size, total_pages: Math.max(1, Math.ceil(total / size)) });
  }),

  http.get("/api/alerts/:id", async ({ params }) => {
    const db = await getDb();
    await latency();
    const a = findAlert(db, String(params.id));
    if (!a) return notFound("Alert");
    // Reviewers see masked names everywhere, including inside the story text.
    const reviewer = mockRole() === "KAVACH_REVIEWER";
    const maskIn = (s: string | null, ...names: Array<string | null | undefined>) =>
      !reviewer || !s ? s : names.reduce<string>((acc, n) => (n ? acc.split(n).join(maskName(n)) : acc), s);
    const body: AlertDetailDTO = {
      alert: toListDTO(a),
      story_en: maskIn(a.story_en, a.customer_name),
      story_hi: maskIn(a.story_hi, a.customer_name_hi, a.customer_name),
      txn_count: a.txn_count ?? a.transactions.length,
      total_amount_inr: a.amount_inr ?? 0,
      reasons: a.reasons,
      timeline: a.timeline,
      transactions: a.transactions,
      connections: mockRole() === "KAVACH_REVIEWER"
        ? { ...a.connections, nodes: a.connections.nodes.map((n) => (n.kind === "external" ? n : { ...n, label: maskName(n.label), label_hi: maskName(n.label) })) }
        : a.connections,
      citation_ref: a.citation_ref,
    };
    return json(body);
  }),

  http.get("/api/alerts/:id/evidence", async ({ params }) => {
    const db = await getDb();
    await latency();
    const a = findAlert(db, String(params.id));
    if (!a) return notFound("Alert");
    const e = db.evidence.get(a.alert_id);
    if (!e) return notFound("Evidence pack");
    return json(evidenceDTO(a, e));
  }),

  http.post("/api/alerts/:id/evidence", async ({ params }) => {
    const db = await getDb();
    const started = performance.now();
    const a = findAlert(db, String(params.id));
    if (!a) return notFound("Alert");
    // Simulates the stored-procedure + render + upload time; the badge shows this *measured* duration.
    await latency(1800, 3200);
    const created_at = new Date(asOf(db) + (Date.now() % HOUR)).toISOString();
    const created_by = mockRole() === "KAVACH_REVIEWER" ? "reviewer@audit.example" : "aditi.rao@bank.example";
    const html = evidenceHtml(a, db, created_at, created_by);
    const sha256 = await sha256Hex(html);
    const row: EvidenceRow = { alert_id: a.alert_id, html, sha256, created_at, created_by, generation_ms: Math.round(performance.now() - started), tampered: false };
    db.evidence.set(a.alert_id, row);
    return json(evidenceDTO(a, row));
  }),

  /** Serves the evidence file itself (stands in for the Snowflake presigned URL). */
  http.get("/mock-files/:name", async ({ params }) => {
    const db = await getDb();
    const id = String(params.name).replace(/^evidence_/, "").replace(/\.html$/, "");
    const e = db.evidence.get(id);
    if (!e) return notFound("File");
    const body = e.tampered ? e.html.replace("</h1>", " (edited)</h1>") : e.html;
    return new HttpResponse(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }),

  /** Mock-only: simulate someone editing the stored file, to demo the red "Changed" seal. */
  http.post("/api/alerts/:id/evidence/tamper", async ({ params }) => {
    const db = await getDb();
    const e = db.evidence.get(String(params.id));
    if (!e) return notFound("Evidence pack");
    e.tampered = true;
    return json({ ok: true });
  }),

  http.get("/api/alerts/:id/verify", async ({ params }) => {
    const db = await getDb();
    await latency(500, 900);
    const e = db.evidence.get(String(params.id));
    if (!e) return notFound("Evidence pack");
    const current = e.tampered ? e.html.replace("</h1>", " (edited)</h1>") : e.html;
    const computed = await sha256Hex(current);
    const match = computed === e.sha256;
    const body: VerifyDTO = {
      verified: match,
      details: {
        integrity_status: match ? "MATCH" : "TAMPERED",
        html_integrity_status: match ? "MATCH" : "TAMPERED",
        html_file_path: `evidence_${e.alert_id}.html`,
        html_stored_hash: e.sha256,
        html_computed_hash: computed,
        created_at: e.created_at,
      },
    };
    return json(body);
  }),

  http.post("/api/alerts/:id/feedback", async ({ params, request }) => {
    const db = await getDb();
    await latency();
    if (isReadOnly(mockRole())) return forbidden();
    const a = findAlert(db, String(params.id));
    if (!a) return notFound("Alert");
    const body = (await request.json()) as { rating: number; comment?: string | null; verdict?: string };
    db.feedback.set(a.alert_id, body);
    if (body.verdict === "FRAUD") {
      a.status = "CLOSED";
      a.resolution = "TRUE_POSITIVE";
    } else if (body.verdict === "NOT_FRAUD") {
      a.status = "CLOSED";
      a.resolution = "FALSE_POSITIVE";
    }
    return json({ ok: true, alert_id: a.alert_id, status: a.status, resolution: a.resolution });
  }),

  http.get("/api/alerts/:id/str-draft", async ({ params }) => {
    const db = await getDb();
    await latency(600, 1100);
    if (isReadOnly(mockRole())) return forbidden();
    const a = findAlert(db, String(params.id));
    if (!a) return notFound("Alert");
    const draft = [
      "SUSPICIOUS TRANSACTION REPORT — DRAFT (synthetic data)",
      "",
      `Reporting entity: KAVACH Demo Bank · Branch: ${a.branch}, ${a.city}`,
      `Subject: ${a.customer_name} · PAN ${a.pan} · Account ${a.account_id}`,
      `Period: ${formatDate(a.window_start!)} to ${formatDate(a.window_end!)} · ${a.txn_count} transactions · ${money(a.amount_inr ?? 0)}`,
      `Pattern: ${TYPOLOGY_LABEL[a.typology] ?? a.typology}`,
      "",
      "Grounds for suspicion:",
      ...a.reasons.map((r, i) => `${i + 1}. ${r.text}`),
      "",
      `Regulatory basis: Circular ${a.citation_ref.circular_no}, paragraph ${a.citation_ref.para_no}.`,
      `Filing deadline: ${formatDate(a.due_at!)} (7 working days from identification).`,
      "",
      "Narrative:",
      a.story_en,
      "",
      "Prepared by KAVACH (AI-generated draft). A compliance officer must review before filing with FIU-IND.",
    ].join("\n");
    return json<STRDraftDTO>({ alert_id: a.alert_id, str_draft: draft, format: "text" });
  }),

  http.get("/api/why-not/:txn", async ({ params }) => {
    const db = await getDb();
    await latency(300, 600);
    const id = String(params.txn).trim().toUpperCase();
    const flagged = db.alerts.find((a) => a.transactions.some((t) => t.txn_id === id));
    if (flagged)
      return json<WhyNotDTO>({
        txn_id: id,
        explanation: `This transaction was flagged. It is part of the alert for ${mockRole() === "KAVACH_REVIEWER" ? maskName(flagged.customer_name ?? "") : flagged.customer_name}.`,
        rules_checked: [{ rule_id: flagged.rule_name, rule_name: flagged.rule_name, typology: flagged.typology, result: "passed", reason: "Matched this check." }],
        recommendation: `open_alert:${flagged.alert_id}`,
      });
    const demo = WHY_NOT_DEMO[id];
    if (demo) return json<WhyNotDTO>({ txn_id: id, ...demo });
    return notFound("Transaction");
  }),
];

/** Transactions that were deliberately *not* flagged, for the "Why wasn't this flagged?" box. */
export const WHY_NOT_DEMO: Record<string, Omit<WhyNotDTO, "txn_id">> = {
  TXN5500123: {
    explanation: "A cash deposit of ₹8.9 L at the Kothrud branch. It is just below the ₹9 L lower limit of the structuring check, and it was the only such deposit that month.",
    rules_checked: [
      { rule_id: "RL-a43a67c8", rule_name: "Structuring (cash ₹9 L–₹10 L, 3+ times)", typology: "STRUCTURING", result: "near_miss", reason: "₹8.9 L is under the ₹9 L lower limit, and there was only 1 deposit." },
      { rule_id: "RL-96ecb73a", rule_name: "Cash transaction report (₹10 L+)", typology: "CASH_REPORTING", result: "not_applicable", reason: "Below ₹10 L, so no cash report is needed." },
      { rule_id: "RL-10b1831f", rule_name: "PAN for cash over ₹50,000", typology: "CASH_REPORTING", result: "passed", reason: "PAN was provided at the counter." },
    ],
    recommendation: "Lowering the structuring limit to ₹8.5 L would catch this pattern. Try it in Time Machine before changing the rule.",
  },
  TXN5500456: {
    explanation: "A UPI transfer of ₹92,000 to a new payee, 3 hours after a login from the customer's usual phone.",
    rules_checked: [
      { rule_id: "ATO_RULE", rule_name: "Account takeover (new device + large transfer within 60 minutes)", typology: "ACCOUNT_TAKEOVER", result: "not_applicable", reason: "The phone was not new, and the transfer came 3 hours later." },
      { rule_id: "RL-682a9a7a", rule_name: "Channel limit (UPI ₹1 L)", typology: "WIRE_TRANSFER", result: "passed", reason: "₹92,000 is within the UPI limit." },
    ],
    recommendation: "Nothing unusual. No change needed.",
  },
};

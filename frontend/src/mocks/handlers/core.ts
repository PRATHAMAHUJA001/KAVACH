import { http, HttpResponse, delay } from "msw";
import type { AttentionItemDTO, HomeDTO, MeDTO, ParagraphDTO, SearchResultDTO, TourResetDTO } from "@/services/api/dto";
import { asOf, getDb, maskName, mockRole, resetTour } from "../db";
import { DAY, HOUR, istDay, json, latency, money, moneyHi, notFound } from "../util";

const PROFILES: Record<string, Omit<MeDTO, "as_of">> = {
  KAVACH_ANALYST: { user_id: "u-analyst-01", name: "Aditi Rao", role: "KAVACH_ANALYST", email: "aditi.rao@bank.example" },
  KAVACH_ADMIN: { user_id: "u-admin-01", name: "Anita Menon", role: "KAVACH_ADMIN", email: "anita.menon@bank.example" },
  KAVACH_REVIEWER: { user_id: "u-reviewer-01", name: "External reviewer", role: "KAVACH_REVIEWER", email: "reviewer@audit.example" },
  KAVACH_AUDITOR: { user_id: "u-auditor-01", name: "Internal audit", role: "KAVACH_AUDITOR", email: "audit@bank.example" },
};

/** `?cold=1` simulates a suspended SPCS service: /healthz fails for ~6 s, then wakes up. */
const coldUntil = (() => {
  try {
    return sessionStorage.getItem("kavach.mockCold") === "1" ? Date.now() + 6000 : 0;
  } catch {
    return 0;
  }
})();

export const coreHandlers = [
  http.get("/healthz", async () => {
    if (Date.now() < coldUntil) {
      await delay(900);
      return HttpResponse.json({ detail: "Service is resuming" }, { status: 503 });
    }
    await latency(40, 120);
    return json({ status: "healthy", service: "kavach-api", version: "1.0.0" });
  }),

  http.get("/api/me", async () => {
    const db = await getDb();
    await latency();
    return json<MeDTO>({ ...PROFILES[mockRole()]!, as_of: db.meta.as_of });
  }),

  http.get("/api/home", async () => {
    const db = await getDb();
    await latency(200, 450);
    const now = asOf(db);
    const open = db.alerts.filter((a) => a.status !== "CLOSED");
    const pendingReport = open.filter((a) => !a.str_filed);
    const overdue = pendingReport.filter((a) => Date.parse(a.due_at!) < now).sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!));
    const dueSoon = pendingReport
      .filter((a) => Date.parse(a.due_at!) >= now && Date.parse(a.due_at!) - now <= 48 * HOUR)
      .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!));
    const inWindow = (from: number, to: number) => db.alerts.filter((a) => {
      const t = Date.parse(a.created_at);
      return t > now - from && t <= now - to;
    });
    const newAlerts = inWindow(DAY, 0);
    const lastWeekSameDay = inWindow(8 * DAY, 7 * DAY);
    const moneyAtRisk = open.reduce((s, a) => s + (a.amount_inr ?? 0), 0);
    const openWeekAgo = db.alerts.filter((a) => Date.parse(a.created_at) <= now - 7 * DAY && (a.status !== "CLOSED" || Date.parse(a.due_at!) > now - 7 * DAY));
    const moneyWeekAgo = openWeekAgo.reduce((s, a) => s + (a.amount_inr ?? 0), 0);
    const activeRings = db.rings.filter((r) => r.ring.status === "ACTIVE");
    const newRings = activeRings.filter((r) => Date.parse(r.ring.detected_at!) > now - 7 * DAY);
    const pendingRules = db.rules.filter((r) => r.status === "PENDING_APPROVAL");
    const openConflicts = db.conflicts.filter((c) => c.status === "OPEN");

    const score = Math.round(Math.max(0, Math.min(100, 100 - 4 * overdue.length - 2 * dueSoon.length - 0.5 * pendingRules.length - 0.5 * openConflicts.length)));
    const reason =
      overdue.length > 0
        ? `${overdue.length} report${overdue.length === 1 ? " is" : "s are"} overdue and ${dueSoon.length} more ${dueSoon.length === 1 ? "is" : "are"} due within 48 hours.`
        : dueSoon.length > 0
          ? `${dueSoon.length} report${dueSoon.length === 1 ? " is" : "s are"} close to the deadline.`
          : "All reports are on time.";
    const reason_hi =
      overdue.length > 0
        ? `${overdue.length} रिपोर्ट की समय सीमा निकल चुकी है और ${dueSoon.length} और 48 घंटों में देय हैं।`
        : dueSoon.length > 0
          ? `${dueSoon.length} रिपोर्ट की समय सीमा पास है।`
          : "सभी रिपोर्ट समय पर हैं।";

    const attention: AttentionItemDTO[] = [];
    for (const a of overdue.slice(0, 2))
      attention.push({ id: `att-${a.alert_id}`, kind: "report_overdue", status: "overdue", entity_id: a.alert_id, params: { name: a.customer_name ?? "", name_hi: a.customer_name_hi, amount_inr: a.amount_inr, due_at: a.due_at, typology: a.typology } });
    for (const a of dueSoon.slice(0, 1))
      attention.push({ id: `att-${a.alert_id}`, kind: "report_due", status: "act", entity_id: a.alert_id, params: { name: a.customer_name ?? "", name_hi: a.customer_name_hi, amount_inr: a.amount_inr, due_at: a.due_at, typology: a.typology } });
    const hotRing = [...activeRings].sort((a, b) => Date.parse(b.ring.detected_at!) - Date.parse(a.ring.detected_at!)).find((r) => r.ring.confidence === "HIGH");
    if (hotRing)
      attention.push({ id: `att-${hotRing.ring.ring_id}`, kind: "ring_new", status: "attention", entity_id: hotRing.ring.ring_id, params: { name: hotRing.ring.ring_name, name_hi: hotRing.ring.ring_name_hi, amount_inr: hotRing.ring.total_volume_inr, count: hotRing.ring.member_count } });
    if (pendingRules.length)
      attention.push({ id: "att-rules", kind: "rule_pending", status: "attention", entity_id: pendingRules[0]!.rule_id, params: { count: pendingRules.length } });
    if (attention.length < 5 && openConflicts.length)
      attention.push({ id: "att-conflicts", kind: "conflict_open", status: "attention", entity_id: openConflicts[0]!.conflict_id, params: { count: openConflicts.length } });

    const trend = Array.from({ length: 30 }, (_, i) => {
      const day = istDay(now - (29 - i) * DAY);
      const same = db.alerts.filter((a) => istDay(Date.parse(a.created_at)) === day);
      return { date: day, alert_count: same.length, confirmed_fraud: same.filter((a) => a.resolution === "TRUE_POSITIVE").length };
    });

    const week = db.alerts.filter((a) => Date.parse(a.created_at) > now - 7 * DAY);
    const weekAmount = week.reduce((s, a) => s + (a.amount_inr ?? 0), 0);
    const weekFraud = week.filter((a) => a.resolution === "TRUE_POSITIVE").length;
    const topTyp = Object.entries(week.reduce<Record<string, number>>((acc, a) => ((acc[a.typology] = (acc[a.typology] ?? 0) + 1), acc), {})).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "RAPID_PASSTHROUGH";
    const TYP_EN: Record<string, string> = { RAPID_PASSTHROUGH: "money moved in and out within a day", PEP_UNUSUAL_CASH: "unusual cash by politically exposed people", ROUND_TRIPPING: "money sent out and brought back in a loop", MULE_RING: "accounts working together to move money", HIGH_RISK_SWIFT: "transfers to high-risk countries", ACCOUNT_TAKEOVER: "accounts possibly taken over", STRUCTURING: "cash split under the reporting limit", DORMANT_REACTIVATION: "sleeping accounts suddenly active", INCOME_MISMATCH: "money far above declared income" };
    const TYP_HI: Record<string, string> = { RAPID_PASSTHROUGH: "एक दिन में पैसा आया और गया", PEP_UNUSUAL_CASH: "राजनीतिक रूप से जुड़े लोगों का असामान्य नकद", ROUND_TRIPPING: "पैसा घुमाकर वापस लाना", MULE_RING: "मिलकर पैसा घुमाने वाले खाते", HIGH_RISK_SWIFT: "उच्च जोखिम वाले देशों में ट्रांसफ़र", ACCOUNT_TAKEOVER: "खातों पर संभावित कब्ज़ा", STRUCTURING: "सीमा से बचने के लिए नकद बाँटना", DORMANT_REACTIVATION: "निष्क्रिय खाते अचानक सक्रिय", INCOME_MISMATCH: "घोषित आय से कहीं ज़्यादा लेनदेन" };
    const biggest = [...activeRings].sort((a, b) => b.ring.total_volume_inr - a.ring.total_volume_inr)[0];

    const body: HomeDTO = {
      readiness_score: { score, reason, reason_hi },
      top_alerts: [...open].sort((a, b) => b.score - a.score).slice(0, 5).map((a) => ({ alert_id: a.alert_id, account_id: a.account_id, typology: a.typology, severity: a.severity, score: a.score, created_at: a.created_at })),
      trend,
      kpis: {
        new_alerts: newAlerts.length,
        new_alerts_prev: lastWeekSameDay.length,
        serious_new_alerts: newAlerts.filter((a) => (a.risk_level ?? 0) >= 4).length,
        money_at_risk_inr: moneyAtRisk,
        money_at_risk_prev_inr: moneyWeekAgo,
        reports_due_48h: dueSoon.length,
        reports_overdue: overdue.length,
        active_rings: activeRings.length,
        active_rings_prev: activeRings.length - newRings.length,
        ring_volume_30d_inr: activeRings.reduce((s, r) => s + r.ring.total_volume_inr, 0),
      },
      attention: attention.slice(0, 5),
      weekly_brief: {
        text: `This week KAVACH raised ${week.length} alerts involving ${money(weekAmount)}. ${weekFraud} of them have been confirmed as fraud so far, most often ${TYP_EN[topTyp]}. ${biggest ? `The ${biggest.ring.ring_name} is the largest active group, moving ${money(biggest.ring.total_volume_inr)} through ${biggest.ring.member_count} accounts. ` : ""}${overdue.length ? `${overdue.length} reports are overdue — clear those first.` : "All reports are on time."}`,
        text_hi: `इस हफ़्ते KAVACH ने ${week.length} अलर्ट बनाए, जिनमें ${moneyHi(weekAmount)} शामिल हैं। अब तक ${weekFraud} को धोखाधड़ी माना गया है, सबसे ज़्यादा "${TYP_HI[topTyp]}" वाले। ${biggest ? `${biggest.ring.ring_name_hi} सबसे बड़ा सक्रिय समूह है, जिसने ${biggest.ring.member_count} खातों से ${moneyHi(biggest.ring.total_volume_inr)} घुमाए। ` : ""}${overdue.length ? `${overdue.length} रिपोर्ट की समय सीमा निकल चुकी है — पहले उन्हें निपटाएँ।` : "सभी रिपोर्ट समय पर हैं।"}`,
        generated_at: new Date(now - 2 * HOUR).toISOString(),
      },
      as_of: db.meta.as_of,
    };
    return json(body);
  }),

  http.get("/api/search", async ({ request }) => {
    const db = await getDb();
    await latency(80, 180);
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase();
    if (q.length < 2) return json({ results: [] });
    const reviewer = mockRole() === "KAVACH_REVIEWER";
    const out: SearchResultDTO[] = [];
    for (const a of db.alerts) {
      const name = a.customer_name ?? "";
      if (a.alert_id.toLowerCase().includes(q) || name.toLowerCase().includes(q))
        out.push({ kind: "alert", id: a.alert_id, title: reviewer ? maskName(name) : name, title_hi: reviewer ? maskName(name) : a.customer_name_hi, subtitle: a.typology, alert_id: a.alert_id });
      else if (a.account_id.toLowerCase().includes(q))
        out.push({ kind: "account", id: a.account_id, title: reviewer ? maskName(name) : name, title_hi: reviewer ? maskName(name) : a.customer_name_hi, subtitle: a.account_id, alert_id: a.alert_id });
      else {
        const t = a.transactions.find((x) => x.txn_id.toLowerCase().includes(q));
        if (t) out.push({ kind: "txn", id: t.txn_id, title: t.txn_id, subtitle: `${money(t.amount_inr)} · ${reviewer ? maskName(name) : name}`, alert_id: a.alert_id });
      }
      if (out.length >= 12) break;
    }
    for (const r of db.rings) if (r.ring.ring_name.toLowerCase().includes(q) || r.ring.ring_id.toLowerCase().includes(q)) out.push({ kind: "ring", id: r.ring.ring_id, title: r.ring.ring_name, title_hi: r.ring.ring_name_hi, subtitle: `${r.ring.member_count} accounts` });
    for (const r of db.rules) if (r.rule_name.toLowerCase().includes(q) || r.rule_id.toLowerCase().includes(q) || (r.plain_english ?? "").toLowerCase().includes(q)) out.push({ kind: "rule", id: r.rule_id, title: r.plain_english ?? r.rule_name, title_hi: r.plain_hindi, subtitle: r.source_citation });
    return json({ results: out.slice(0, 15) });
  }),

  http.get("/api/circulars/paragraph", async ({ request }) => {
    const db = await getDb();
    await latency(80, 160);
    const u = new URL(request.url);
    const c = u.searchParams.get("circular_no");
    const p = u.searchParams.get("para_no");
    const idx = db.chunks.findIndex((x) => x.circular_no === c && x.para_no === p);
    if (idx < 0) return notFound("Paragraph");
    const cur = db.chunks[idx]!;
    const prev = db.chunks[idx - 1];
    const next = db.chunks[idx + 1];
    const body: ParagraphDTO = {
      ...cur,
      before: prev && prev.circular_no === c ? { para_no: prev.para_no, text: prev.text } : null,
      after: next && next.circular_no === c ? { para_no: next.para_no, text: next.text } : null,
    };
    return json(body);
  }),

  http.post("/api/tour/reset", async () => {
    const db = await getDb();
    await latency();
    resetTour(db);
    return json<TourResetDTO>({ ok: true, ...db.meta.tour });
  }),
];

import { http } from "msw";
import type { ReplayDTO, TimeMachineDayDTO, TunableRuleDTO } from "@/services/api/dto";
import { asOf, getDb } from "../db";
import { DAY, istDay, json, latency, notFound } from "../util";

/** Review effort per alert used by the replay (45 minutes). */
const HOURS_PER_ALERT = 0.75;

interface Model {
  rule: TunableRuleDTO;
  fraudTotal: number;
  alertsAt: (v: number) => number;
  fraudAt: (v: number) => number;
}

/**
 * Monotone response curves for the six detection checks over a 90-day replay.
 * Anchored so the structuring example from the design spec holds: lowering the
 * limit from ₹9 L to ₹8 L catches 4 more fraud cases for ~11 extra review hours.
 */
const MODELS: Model[] = [
  {
    rule: { rule_id: "CORE-STRUCTURING", rule_name: "STRUCTURING_RULE", typology: "STRUCTURING", param: { key: "min_amount", label: "Lowest cash deposit that counts", label_hi: "गिनी जाने वाली सबसे कम नकद जमा", unit: "inr", value: 900_000, min: 500_000, max: 1_000_000, step: 50_000 } },
    fraudTotal: 19,
    alertsAt: (v) => 42 * Math.exp(0.3 * (9 - v / 1e5)),
    fraudAt: (v) => Math.min(19, Math.max(2, 11 + 4 * (9 - v / 1e5))),
  },
  {
    rule: { rule_id: "CORE-PASSTHROUGH", rule_name: "PASSTHROUGH_RULE", typology: "RAPID_PASSTHROUGH", param: { key: "window_hours", label: "Money leaves within", label_hi: "पैसा इतने समय में निकल जाए", unit: "hours", value: 24, min: 6, max: 72, step: 6 } },
    fraudTotal: 24,
    alertsAt: (h) => 58 * Math.pow(h / 24, 0.6),
    fraudAt: (h) => Math.min(24, 14 * Math.pow(h / 24, 0.35)),
  },
  {
    rule: { rule_id: "CORE-PEP-CASH", rule_name: "PEP_CASH_RULE", typology: "PEP_UNUSUAL_CASH", param: { key: "cash_limit", label: "Cash amount that triggers a review", label_hi: "समीक्षा शुरू करने वाली नकद राशि", unit: "inr", value: 500_000, min: 100_000, max: 1_000_000, step: 50_000 } },
    fraudTotal: 13,
    alertsAt: (v) => 64 * Math.pow(500_000 / v, 0.8),
    fraudAt: (v) => Math.min(13, 9 * Math.pow(500_000 / v, 0.3)),
  },
  {
    rule: { rule_id: "CORE-ATO", rule_name: "ATO_RULE", typology: "ACCOUNT_TAKEOVER", param: { key: "minutes", label: "Large transfer within this long of a new-device login", label_hi: "नए डिवाइस लॉगिन के इतने समय में बड़ा ट्रांसफ़र", unit: "hours", value: 1, min: 0.25, max: 4, step: 0.25 } },
    fraudTotal: 10,
    alertsAt: (h) => 20 * Math.pow(h, 0.7),
    fraudAt: (h) => Math.min(10, 6 * Math.pow(h, 0.3)),
  },
  {
    rule: { rule_id: "CORE-MULE", rule_name: "MULE_RING_RULE", typology: "MULE_RING", param: { key: "shared_devices", label: "Shared phones or devices needed", label_hi: "ज़रूरी साझा फ़ोन या डिवाइस", unit: "count", value: 2, min: 1, max: 5, step: 1 } },
    fraudTotal: 17,
    alertsAt: (v) => 40 * Math.pow(2 / v, 1.2),
    fraudAt: (v) => Math.min(17, 12 * Math.pow(2 / v, 0.5)),
  },
  {
    rule: { rule_id: "CORE-DORMANT", rule_name: "DORMANT_RULE", typology: "DORMANT_REACTIVATION", param: { key: "amount", label: "Money received after reactivation", label_hi: "चालू होने के बाद मिली राशि", unit: "inr", value: 500_000, min: 100_000, max: 1_000_000, step: 50_000 } },
    fraudTotal: 9,
    alertsAt: (v) => 22 * Math.pow(500_000 / v, 0.7),
    fraudAt: (v) => Math.min(9, 6 * Math.pow(500_000 / v, 0.35)),
  },
];

function outcome(m: Model, v: number) {
  const alerts = Math.round(m.alertsAt(v));
  return { value: v, alerts, fraud_caught: Math.round(m.fraudAt(v)), analyst_hours: Math.round(alerts * HOURS_PER_ALERT) };
}

export const timeMachineHandlers = [
  http.get("/api/time-machine", async ({ request }) => {
    const db = await getDb();
    await latency();
    const days = Math.min(180, Math.max(1, Number(new URL(request.url).searchParams.get("days") ?? 30)));
    const now = asOf(db);
    const out = Array.from({ length: days }, (_, i) => {
      const day = istDay(now - (days - 1 - i) * DAY);
      const same = db.alerts.filter((a) => istDay(Date.parse(a.created_at)) === day);
      const typ = Object.entries(same.reduce<Record<string, number>>((acc, a) => ((acc[a.typology] = (acc[a.typology] ?? 0) + 1), acc), {}))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([typology, count]) => ({ typology, count }));
      return { date: day, alert_count: same.length, high_severity_count: same.filter((a) => a.severity === "HIGH").length, total_risk_score: Math.round(same.reduce((s, a) => s + a.score, 0) * 100) / 100, top_typologies: typ };
    });
    return json<TimeMachineDayDTO[]>(out);
  }),

  http.get("/api/time-machine/rules", async () => {
    await latency();
    return json({ rules: MODELS.map((m) => m.rule) });
  }),

  http.post("/api/time-machine/replay", async ({ request }) => {
    // Replays take a moment in real life too; long enough to show the progress state.
    await latency(1200, 1800);
    const body = (await request.json()) as { rule_id: string; value: number; days?: number };
    const m = MODELS.find((x) => x.rule.rule_id === body.rule_id);
    if (!m) return notFound("Rule");
    const res: ReplayDTO = {
      rule_id: m.rule.rule_id,
      days: body.days ?? 90,
      current: outcome(m, m.rule.param.value),
      proposed: outcome(m, body.value),
      fraud_total: m.fraudTotal,
    };
    return json(res);
  }),
];

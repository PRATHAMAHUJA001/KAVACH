/**
 * In-memory mock database. Fixtures are loaded lazily on the first request so the
 * app's first paint never waits for 1.6 MB of JSON. Mutations (approve, feedback,
 * evidence) live here for the session; `resetTour()` restores the tour's seed state.
 */
import type {
  AlertDTO,
  ConflictDTO,
  GraphEdgeDTO,
  GraphNodeDTO,
  ParagraphDTO,
  RingDTO,
  RuleDTO,
  RuleHealthRowDTO,
  RuleVersionDTO,
  Role,
  TxnDTO,
} from "@/services/api/dto";
import type { AlertDetailExt, Typology } from "@/services/api/dto";

export type AlertRow = AlertDTO &
  AlertDetailExt & { story_en: string; story_hi: string; story_source: string; typology: Typology };
export interface RingRow {
  ring: RingDTO;
  members: GraphNodeDTO[];
  edges: GraphEdgeDTO[];
  transactions: TxnDTO[];
}
export type RuleRow = RuleDTO & { versions: RuleVersionDTO[] };
export interface Meta {
  as_of: string;
  tour: { alert_id: string; ring_id: string; rule_id: string; circular_no: string };
  eval: {
    coverage: Array<{ typology: string; fraud_cases: number; caught_by_rules: number; caught_in_top_50: number }>;
    precision: number;
    recall: number;
    test_set_size: number;
  };
}

export interface EvidenceRow {
  alert_id: string;
  html: string;
  sha256: string;
  created_at: string;
  created_by: string;
  generation_ms: number;
  tampered: boolean;
}

export interface Db {
  alerts: AlertRow[];
  rings: RingRow[];
  rules: RuleRow[];
  conflicts: ConflictDTO[];
  health: RuleHealthRowDTO[];
  chunks: ParagraphDTO[];
  meta: Meta;
  evidence: Map<string, EvidenceRow>;
  feedback: Map<string, { verdict?: string; rating: number; comment?: string | null }>;
  jobs: Map<string, { started: number; circular_no: string; filename: string }>;
  seed: { rules: Map<string, { status: string; approved_by: string | null; rejection_reason: string | null }>; alerts: Map<string, Pick<AlertRow, "status" | "resolution" | "str_filed">> };
}

let dbPromise: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  dbPromise ??= (async () => {
    const [alerts, rings, rules, conflicts, health, meta, chunks] = await Promise.all([
      import("./fixtures/alerts.json").then((m) => m.default as unknown as AlertRow[]),
      import("./fixtures/rings.json").then((m) => m.default as unknown as RingRow[]),
      import("./fixtures/rules.json").then((m) => m.default as unknown as RuleRow[]),
      import("./fixtures/conflicts.json").then((m) => m.default as unknown as ConflictDTO[]),
      import("./fixtures/health.json").then((m) => m.default as unknown as RuleHealthRowDTO[]),
      import("./fixtures/meta.json").then((m) => m.default as unknown as Meta),
      import("@/services/api/static/reg_chunks.json").then((m) => m.default as unknown as ParagraphDTO[]),
    ]);
    return {
      alerts,
      rings,
      rules,
      conflicts,
      health,
      chunks,
      meta,
      evidence: new Map(),
      feedback: new Map(),
      jobs: new Map(),
      seed: {
        rules: new Map(rules.map((r) => [r.rule_id, { status: r.status, approved_by: r.approved_by ?? null, rejection_reason: r.rejection_reason ?? null }])),
        alerts: new Map(alerts.map((a) => [a.alert_id, { status: a.status, resolution: a.resolution, str_filed: a.str_filed }])),
      },
    };
  })();
  return dbPromise;
}

export function asOf(db: Db): number {
  return Date.parse(db.meta.as_of);
}

/** Mirrors the real Snowflake masking policies (MASK_CUSTOMER_NAME, tag-based MASK_PAN). */
export function maskName(name: string): string {
  return name.slice(0, 2) + "*".repeat(Math.max(3, name.length - 2));
}
export function maskPan(pan: string): string {
  return "XXXXX" + pan.slice(5);
}

/** Role for the mock session: `?role=reviewer|analyst|admin|auditor` sticks for the tab. */
export function mockRole(): Role {
  try {
    const v = sessionStorage.getItem("kavach.mockRole");
    if (v === "reviewer") return "KAVACH_REVIEWER";
    if (v === "admin") return "KAVACH_ADMIN";
    if (v === "auditor") return "KAVACH_AUDITOR";
  } catch {
    /* ignore */
  }
  return "KAVACH_ANALYST";
}

export function isReadOnly(role: Role): boolean {
  return role === "KAVACH_REVIEWER" || role === "KAVACH_AUDITOR";
}

export function resetTour(db: Db) {
  const { tour } = db.meta;
  const r = db.rules.find((x) => x.rule_id === tour.rule_id);
  const seed = db.seed.rules.get(tour.rule_id);
  if (r && seed) Object.assign(r, seed);
  const a = db.alerts.find((x) => x.alert_id === tour.alert_id);
  const aSeed = db.seed.alerts.get(tour.alert_id);
  if (a && aSeed) Object.assign(a, aSeed);
  db.evidence.delete(tour.alert_id);
  db.feedback.delete(tour.alert_id);
  db.jobs.clear();
}

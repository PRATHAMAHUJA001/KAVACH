import { http, HttpResponse } from "msw";
import type { JobStatusDTO, RuleDTO, RuleHealthDTO } from "@/services/api/dto";
import { getDb, isReadOnly, mockRole, type RuleRow } from "../db";
import { forbidden, json, latency, notFound } from "../util";

const strip = ({ versions: _v, ...r }: RuleRow): RuleDTO => (void _v, r);

/** Upload pipeline timing: each step takes ~1.6 s so the stepper visibly ticks. */
const STEP_MS = 1600;
const STEP_MESSAGES = ["Reading the circular", "Finding obligations", "Writing checks", "Ready for review"];

export const ruleHandlers = [
  http.get("/api/rules", async ({ request }) => {
    const db = await getDb();
    await latency();
    const u = new URL(request.url).searchParams;
    const status = u.get("status");
    const page = Math.max(1, Number(u.get("page") ?? 1));
    const size = Math.max(1, Number(u.get("page_size") ?? 50));
    const rows = db.rules.filter((r) => !status || r.status === status).map(strip);
    return json({ rules: rows.slice((page - 1) * size, page * size), total: rows.length, page, page_size: size, total_pages: Math.max(1, Math.ceil(rows.length / size)) });
  }),

  // Literal paths must come before /api/rules/:id (the real backend had this exact ordering bug).
  http.get("/api/rules/conflicts", async () => {
    const db = await getDb();
    await latency();
    return json({ conflicts: db.conflicts });
  }),

  http.get("/api/rules/health", async () => {
    const db = await getDb();
    await latency();
    const body: RuleHealthDTO = {
      total_rules: db.rules.length,
      active_rules: db.rules.filter((r) => r.status === "APPROVED").length,
      pending_rules: db.rules.filter((r) => r.status === "PENDING_APPROVAL").length,
      rejected_rules: db.rules.filter((r) => r.status === "REJECTED").length,
      avg_precision: Math.round((db.health.reduce((s, h) => s + h.precision, 0) / Math.max(1, db.health.length)) * 100) / 100,
      rules: db.health,
    };
    return json(body);
  }),

  http.get("/api/rules/eval", async () => {
    const db = await getDb();
    await latency();
    return json(db.meta.eval);
  }),

  http.post("/api/rules/upload", async ({ request }) => {
    const db = await getDb();
    await latency(300, 600);
    if (isReadOnly(mockRole())) return forbidden();
    const form = await request.formData();
    const file = form.get("file");
    const filename = file instanceof File ? file.name : "circular.pdf";
    const m = filename.match(/(\d{4})[_-](\d{2})/);
    const circular_no = m ? `KAVACH/${m[1]}/${m[2]}` : db.meta.tour.circular_no;
    const job_id = `JOB-${Date.now().toString(36).toUpperCase()}`;
    db.jobs.set(job_id, { started: Date.now(), circular_no, filename });
    return json({ job_id, status: "RUNNING", message: `Received ${filename}` });
  }),

  http.get("/api/rules/jobs/:id", async ({ params }) => {
    const db = await getDb();
    await latency(80, 160);
    const job = db.jobs.get(String(params.id));
    if (!job) return notFound("Job");
    const step = Math.min(4, Math.floor((Date.now() - job.started) / STEP_MS));
    const done = step >= 4;
    const produced = db.rules.filter((r) => r.circular_no === job.circular_no && (r.status === "PENDING_APPROVAL" || r.rule_id === db.meta.tour.rule_id)).map((r) => r.rule_id);
    const body: JobStatusDTO = {
      job_id: String(params.id),
      status: done ? "COMPLETED" : "RUNNING",
      progress: Math.min(100, Math.round(((Date.now() - job.started) / (STEP_MS * 4)) * 100)),
      message: STEP_MESSAGES[Math.min(3, step)]!,
      step,
      circular_no: job.circular_no,
      rule_ids: done ? produced : [],
    };
    return json(body);
  }),

  http.get("/api/rules/:id/versions", async ({ params }) => {
    const db = await getDb();
    await latency();
    const r = db.rules.find((x) => x.rule_id === params.id);
    if (!r) return notFound("Rule");
    return json({ versions: r.versions });
  }),

  http.get("/api/rules/:id", async ({ params }) => {
    const db = await getDb();
    await latency();
    const r = db.rules.find((x) => x.rule_id === params.id);
    return r ? json(strip(r)) : notFound("Rule");
  }),

  http.post("/api/rules/:id/approve", async ({ params, request }) => {
    const db = await getDb();
    await latency(300, 600);
    if (isReadOnly(mockRole())) return forbidden();
    const r = db.rules.find((x) => x.rule_id === params.id);
    if (!r) return notFound("Rule");
    const body = (await request.json()) as { user: string };
    r.status = "APPROVED";
    r.approved_by = body.user;
    r.rejection_reason = null;
    return json({ ok: true, rule_id: r.rule_id, status: r.status });
  }),

  http.post("/api/rules/:id/reject", async ({ params, request }) => {
    const db = await getDb();
    await latency(300, 600);
    if (isReadOnly(mockRole())) return forbidden();
    const r = db.rules.find((x) => x.rule_id === params.id);
    if (!r) return notFound("Rule");
    const body = (await request.json()) as { user: string; reason?: string | null };
    if (!body.reason?.trim()) return HttpResponse.json({ detail: "A reason is required to reject a rule." }, { status: 422 });
    r.status = "REJECTED";
    r.rejection_reason = body.reason;
    return json({ ok: true, rule_id: r.rule_id, status: r.status });
  }),
];

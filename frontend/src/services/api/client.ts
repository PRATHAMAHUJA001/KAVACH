/**
 * The only module that performs network I/O. Existing endpoints go through a client
 * generated from docs/openapi.json (paths, params and bodies are type-checked);
 * proposed extensions (docs/API_EXTENSIONS.md) go through `ext()`.
 */
import createClient from "openapi-fetch";
import type { paths } from "./generated/schema";
import type * as D from "./dto";
import * as A from "./adapters";
import type * as M from "./models";
import { API_BASE } from "./config";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: "network" | "server" | "notFound" | "forbidden" | "validation" | "unavailable",
  ) {
    super(message);
    this.name = "ApiError";
  }
  get retryable() {
    return this.kind === "network" || this.kind === "server" || this.kind === "unavailable";
  }
}

function kindFor(status: number): ApiError["kind"] {
  if (status === 404) return "notFound";
  if (status === 401 || status === 403) return "forbidden";
  if (status === 400 || status === 422) return "validation";
  if (status === 502 || status === 503 || status === 504) return "unavailable";
  return "server";
}

async function errorFrom(res: Response): Promise<ApiError> {
  let detail = res.statusText;
  try {
    const body = (await res.clone().json()) as { detail?: unknown };
    if (typeof body.detail === "string") detail = body.detail;
    else if (Array.isArray(body.detail) && typeof (body.detail[0] as { msg?: unknown })?.msg === "string") detail = (body.detail[0] as { msg: string }).msg;
  } catch {
    /* not json */
  }
  return new ApiError(detail || `Request failed (${res.status})`, res.status, kindFor(res.status));
}

// The sign-in cookie is HttpOnly and set by the server, so every request has to
// carry it — including the cross-origin case where VITE_API_BASE points elsewhere.
const api = createClient<paths>({ baseUrl: API_BASE, credentials: "include" });

/** Unwraps an openapi-fetch result, turning failures into ApiError. */
async function call<T>(p: Promise<{ data?: unknown; error?: unknown; response: Response }>): Promise<T> {
  let r: Awaited<typeof p>;
  try {
    r = await p;
  } catch (e) {
    throw new ApiError((e as Error).message || "Network error", 0, "network");
  }
  if (!r.response.ok) throw await errorFrom(r.response);
  return r.data as T;
}

async function ext<T>(path: string, init?: RequestInit & { query?: Record<string, string | number | undefined> }): Promise<T> {
  const url = new URL(API_BASE + path, window.location.origin);
  for (const [k, v] of Object.entries(init?.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "include",
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (e) {
    throw new ApiError((e as Error).message || "Network error", 0, "network");
  }
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}

/* ───────────── health & identity ───────────── */
export async function getHealth(signal?: AbortSignal): Promise<D.HealthDTO> {
  return call(api.GET("/healthz", { signal }));
}
export async function getMe(): Promise<M.Me> {
  return A.toMe(await call<D.MeDTO>(api.GET("/api/me")));
}

/* ───────────── sign-in ───────────── */
/** What the login screen needs: existing session, SPCS ingress identity, personas. */
export async function getAuthContext(): Promise<D.AuthContextDTO> {
  return ext("/api/auth/context");
}
/**
 * Real authentication: the server opens a Snowflake session with these credentials,
 * so a wrong password fails with 401 and `detail` explains it. The session cookie
 * is HttpOnly and set on the response.
 */
export async function login(body: { username: string; password: string; role?: string }): Promise<D.AuthProfileDTO> {
  return ext("/api/auth/login", { method: "POST", body: JSON.stringify(body) });
}
export async function logout(): Promise<void> {
  await ext("/api/auth/logout", { method: "POST" });
}

/* ───────────── home ───────────── */
export async function getHome(): Promise<M.Home> {
  return A.toHome(await call<D.HomeDTO>(api.GET("/api/home")));
}

/* ───────────── portfolio risk ───────────── */
export async function getRisk(): Promise<M.PortfolioRisk> {
  return A.toPortfolioRisk(await ext<D.RiskDTO>("/api/risk"));
}

/* ───────────── alerts ───────────── */
export async function listAlerts(params: D.AlertListParams = {}): Promise<M.AlertPage> {
  const { typology, due, q, sort, ...base } = params;
  // Extension filters ride along as extra query params; the current backend ignores them.
  const query = { ...base, ...(typology ? { typology } : {}), ...(due ? { due } : {}), ...(q ? { q } : {}), ...(sort ? { sort } : {}) } as Record<string, unknown>;
  return A.toAlertPage(await call<D.AlertListDTO>(api.GET("/api/alerts", { params: { query: query as never } })));
}
export async function getAlert(id: string): Promise<M.AlertDetail> {
  return A.toAlertDetail(await call<D.AlertDetailDTO>(api.GET("/api/alerts/{alert_id}", { params: { path: { alert_id: id } } })));
}
export async function getEvidence(id: string): Promise<M.Evidence | null> {
  try {
    return A.toEvidence(await call<D.EvidenceDTO>(api.GET("/api/alerts/{alert_id}/evidence", { params: { path: { alert_id: id } } })));
  } catch (e) {
    if (e instanceof ApiError && e.kind === "notFound") return null;
    throw e;
  }
}
/** Builds the pack. `clientMs` is the round-trip we measured, used when the backend doesn't report its own time. */
export async function createEvidence(id: string): Promise<M.Evidence & { clientMs: number }> {
  const t0 = performance.now();
  const e = A.toEvidence(await call<D.EvidenceDTO>(api.POST("/api/alerts/{alert_id}/evidence", { params: { path: { alert_id: id } } })));
  return { ...e, clientMs: Math.round(performance.now() - t0) };
}
export async function verifyEvidence(id: string): Promise<M.Verification> {
  return A.toVerification(await call<D.VerifyDTO>(api.GET("/api/alerts/{alert_id}/verify", { params: { path: { alert_id: id } } })));
}
export async function sendFeedback(id: string, body: D.FeedbackRequestDTO): Promise<void> {
  await call(api.POST("/api/alerts/{alert_id}/feedback", { params: { path: { alert_id: id } }, body }));
}
export async function getStrDraft(id: string): Promise<D.STRDraftDTO> {
  return call(api.GET("/api/alerts/{alert_id}/str-draft", { params: { path: { alert_id: id } } }));
}
export async function whyNot(txnId: string): Promise<M.WhyNot> {
  return A.toWhyNot(await call<D.WhyNotDTO>(api.GET("/api/why-not/{txn_id}", { params: { path: { txn_id: txnId } } })));
}
/** Mock-only helper to demo the red "Changed" seal. */
export async function tamperEvidence(id: string): Promise<void> {
  await ext(`/api/alerts/${encodeURIComponent(id)}/evidence/tamper`, { method: "POST" });
}

/**
 * Saves the evidence file. Fetches it as a blob first (so the file name is ours and
 * the page stays put); falls back to opening the URL if the host blocks CORS.
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

/* ───────────── circulars & search (EXT) ───────────── */
let staticChunks: Promise<D.ParagraphDTO[]> | null = null;
export async function getParagraph(circularNo: string, paraNo: string): Promise<M.Paragraph> {
  try {
    return A.toParagraph(await ext<D.ParagraphDTO>("/api/circulars/paragraph", { query: { circular_no: circularNo, para_no: paraNo } }));
  } catch (e) {
    // The synthetic circulars are static, so the bundled copy is a faithful fallback.
    staticChunks ??= import("./static/reg_chunks.json").then((m) => m.default as unknown as D.ParagraphDTO[]);
    const all = await staticChunks;
    const i = all.findIndex((c) => c.circular_no === circularNo && String(c.para_no) === String(paraNo));
    if (i < 0) throw e;
    const prev = all[i - 1];
    const next = all[i + 1];
    return A.toParagraph({
      ...all[i]!,
      before: prev?.circular_no === circularNo ? { para_no: prev.para_no, text: prev.text } : null,
      after: next?.circular_no === circularNo ? { para_no: next.para_no, text: next.text } : null,
    });
  }
}
export async function search(q: string): Promise<M.SearchResult[]> {
  const r = await ext<{ results: D.SearchResultDTO[] }>("/api/search", { query: { q } });
  return r.results.map(A.toSearchResult);
}
export async function resetTour(): Promise<D.TourResetDTO> {
  return ext("/api/tour/reset", { method: "POST" });
}

/* ───────────── rings ───────────── */
export async function listRings(): Promise<M.Ring[]> {
  const r = await call<D.RingListDTO>(api.GET("/api/rings", { params: { query: { page: 1, page_size: 100 } } }));
  return r.rings.map(A.toRing);
}
export async function getRing(id: string): Promise<M.RingDetail> {
  return A.toRingDetail(await call<D.RingDetailDTO>(api.GET("/api/rings/{ring_id}", { params: { path: { ring_id: id } } })));
}

/* ───────────── rules ───────────── */
export async function listRules(status?: string): Promise<M.Rule[]> {
  const r = await call<D.RuleListDTO>(api.GET("/api/rules", { params: { query: { status, page: 1, page_size: 200 } } }));
  return r.rules.map(A.toRule);
}
export async function getRule(id: string): Promise<M.Rule> {
  return A.toRule(await call<D.RuleDTO>(api.GET("/api/rules/{rule_id}", { params: { path: { rule_id: id } } })));
}
export async function getRuleVersions(id: string): Promise<M.RuleVersion[]> {
  try {
    const r = await ext<{ versions: D.RuleVersionDTO[] }>(`/api/rules/${encodeURIComponent(id)}/versions`);
    return r.versions.map(A.toRuleVersion);
  } catch (e) {
    if (e instanceof ApiError && e.kind === "notFound") return [];
    throw e;
  }
}
export async function approveRule(id: string, user: string): Promise<void> {
  await call(api.POST("/api/rules/{rule_id}/approve", { params: { path: { rule_id: id } }, body: { user } }));
}
export async function rejectRule(id: string, user: string, reason: string): Promise<void> {
  await call(api.POST("/api/rules/{rule_id}/reject", { params: { path: { rule_id: id } }, body: { user, reason } }));
}
export async function listConflicts(): Promise<M.Conflict[]> {
  const r = await call<{ conflicts: D.ConflictDTO[] }>(api.GET("/api/rules/conflicts"));
  return r.conflicts.filter((c) => c.rule_a && c.rule_b).map(A.toConflict);
}
export async function getRuleHealth(): Promise<M.RuleHealth> {
  return A.toRuleHealth(await call<D.RuleHealthDTO>(api.GET("/api/rules/health")));
}
export async function getEval(): Promise<{ coverage: Array<{ typology: string; fraud_cases: number; caught_by_rules: number; caught_in_top_50: number }>; precision: number; recall: number; test_set_size: number } | null> {
  try {
    return await ext("/api/rules/eval");
  } catch {
    return null;
  }
}
export async function uploadCircular(file: File): Promise<D.UploadDTO> {
  const fd = new FormData();
  fd.append("file", file);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/rules/upload`, { method: "POST", body: fd, credentials: "include" });
  } catch (e) {
    throw new ApiError((e as Error).message, 0, "network");
  }
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as D.UploadDTO;
}
export async function getJob(id: string): Promise<M.UploadJob> {
  return A.toJob(await call<D.JobStatusDTO>(api.GET("/api/rules/jobs/{job_id}", { params: { path: { job_id: id } } })));
}

/* ───────────── time machine ───────────── */
export async function getTimeMachineHistory(days = 30): Promise<D.TimeMachineDayDTO[]> {
  return call(api.GET("/api/time-machine", { params: { query: { days } } }));
}
export async function listTunables(): Promise<M.Tunable[]> {
  const r = await ext<{ rules: D.TunableRuleDTO[] }>("/api/time-machine/rules");
  return r.rules.map(A.toTunable);
}
export async function replay(ruleId: string, value: number, days = 90): Promise<M.Replay> {
  return A.toReplay(await ext<D.ReplayDTO>("/api/time-machine/replay", { method: "POST", body: JSON.stringify({ rule_id: ruleId, value, days }) }));
}

/* ───────────── ask (SSE) ───────────── */
/**
 * POSTs the question with ?stream=true and parses the normalized SSE stream
 * (status, text_delta, tool_call, tool_result, done, error) into AskStreamEvents.
 */
export async function askStream(question: string, onEvent: (e: M.AskStreamEvent) => void, signal?: AbortSignal): Promise<M.AskAnswer> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/ask?stream=true`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ question }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError((e as Error).message, 0, "network");
  }
  if (!res.ok || !res.body) throw await errorFrom(res);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let final: M.AskAnswer | null = null;
  let streamed = "";
  const handle = (event: string, data: string) => {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return;
    }
    switch (event) {
      case "status":
        onEvent({ type: "status", message: String(payload.message ?? payload.status ?? "") });
        break;
      case "text_delta": {
        const t = String(payload.text ?? "");
        streamed += t;
        onEvent({ type: "delta", text: t });
        break;
      }
      case "tool_call":
        onEvent({ type: "tool", name: String(payload.name ?? ""), toolType: String(payload.type ?? "") });
        break;
      case "tool_result": {
        const p = payload as unknown as Extract<D.AskEventDTO, { event: "tool_result" }>["data"];
        onEvent({ type: "tool_result", citations: (p.citations ?? []).map(A.toAskCitation), verified: !!p.verified_query, sql: p.sql ?? null, resultSet: p.result_set ?? null });
        break;
      }
      case "done":
        final = A.toAskAnswer(payload as unknown as D.AskDoneDTO);
        onEvent({ type: "done", answer: final });
        break;
      case "error":
        onEvent({ type: "error", message: String(payload.message ?? "The assistant could not answer.") });
        throw new ApiError(String(payload.message ?? "Ask failed"), 500, "server");
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trim());
      }
      if (data.length) handle(event, data.join("\n"));
    }
  }
  if (!final) {
    if (!streamed) throw new ApiError("The answer stream ended early.", 500, "server");
    final = { question, answer: streamed, verified: false, sql: null, citations: [], toolCalls: [], warnings: [], resultSet: null };
  }
  return final;
}

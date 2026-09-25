import { http, HttpResponse } from "msw";
import type { AskCitationDTO, AskDoneDTO, AskEventDTO, AskToolCallDTO, ResultSetDTO } from "@/services/api/dto";
import { formatDate } from "@/shared/lib/format";
import { asOf, getDb, maskName, mockRole, type Db } from "../db";
import { HOUR, money } from "../util";

/**
 * /api/ask?stream=true — emits the backend's normalized SSE events
 * (status → tool_call → tool_result → text_delta… → done), with realistic pacing.
 */

interface Script {
  tool: { name: string; type: string; input?: unknown };
  resultType: string;
  verified: boolean;
  sql: string | null;
  citations: AskCitationDTO[];
  result_set: ResultSetDTO | null;
  answer: string;
  thinkMs: number;
}

const cite = (db: Db, c: string, p: string): AskCitationDTO => ({ circular_no: c, para_no: p, text: db.chunks.find((x) => x.circular_no === c && x.para_no === p)?.text ?? "" });
const who = (name: string) => (mockRole() === "KAVACH_REVIEWER" ? maskName(name) : name);

function branches(db: Db): Script {
  const counts = new Map<string, { branch: string; city: string; n: number }>();
  for (const a of db.alerts.filter((x) => x.severity === "HIGH")) {
    const key = `${a.branch}|${a.city}`;
    const cur = counts.get(key) ?? { branch: (a.branch ?? "").replace(/ \(.*\)/, ""), city: a.city ?? "", n: 0 };
    cur.n++;
    counts.set(key, cur);
  }
  const rows = [...counts.values()].sort((a, b) => b.n - a.n || a.branch.localeCompare(b.branch)).slice(0, 10);
  const [first, second, third] = rows;
  return {
    tool: { name: "kavach_analyst", type: "cortex_analyst_text_to_sql", input: { query: "Which branches had the most high-risk alerts?" } },
    resultType: "system_execute_sql",
    verified: true,
    sql: "SELECT a.BRANCH_CODE, COUNT(DISTINCT al.ALERT_ID) AS alert_count\nFROM KAVACH_DB.CORE.ALERTS al\nJOIN KAVACH_DB.CORE.ACCOUNTS a ON al.ACCOUNT_ID = a.ACCOUNT_ID\nWHERE al.SEVERITY = 'HIGH'\nGROUP BY a.BRANCH_CODE\nORDER BY alert_count DESC\nLIMIT 10;",
    citations: [],
    result_set: { columns: ["Branch", "City", "High-risk alerts"], rows: rows.map((r) => [r.branch, r.city, r.n]) },
    answer: `**${first!.branch}, ${first!.city}** has the most high-risk alerts: **${first!.n}**. ${second ? `${second.branch} (${second.city}) comes next with ${second.n}` : ""}${third ? `, then ${third.branch} (${third.city}) with ${third.n}` : ""}. Start the review at ${first!.branch}; its alerts are listed in the table below.`,
    thinkMs: 1100,
  };
}

function circular(db: Db): Script {
  return {
    tool: { name: "kavach_reg_search", type: "cortex_search", input: { query: "cash deposits near the reporting threshold" } },
    resultType: "cortex_search",
    verified: false,
    sql: null,
    citations: [cite(db, "KAVACH/2024/01", "1"), cite(db, "KAVACH/2024/01", "2"), cite(db, "KAVACH/2024/01", "4"), cite(db, "KAVACH/2025/01", "2")],
    result_set: null,
    answer:
      "Cash deposits kept **just below the ₹10 lakh reporting limit** are treated as possible **structuring**. If the same customer, or linked accounts, deposit between ₹9 lakh and ₹9.99 lakh **more than three times in 30 days**, the bank must flag it and file a Suspicious Transaction Report. Banks must also run automatic checks for this pattern. Note that the 2025 amendment moves the band up to **₹13 lakh–₹15 lakh**, so both limits should be watched until the old rule is retired.",
    thinkMs: 1400,
  };
}

function explain(db: Db, q: string): Script {
  const id = q.match(/ALT-[0-9a-f-]{8,}/i)?.[0];
  const a =
    (id && db.alerts.find((x) => x.alert_id.toLowerCase().startsWith(id.toLowerCase()))) ||
    db.alerts.find((x) => x.customer_name && q.toLowerCase().includes(x.customer_name.toLowerCase())) ||
    db.alerts.find((x) => x.alert_id === db.meta.tour.alert_id)!;
  const reasons = a.reasons.map((r) => r.text.charAt(0).toLowerCase() + r.text.slice(1));
  return {
    tool: { name: "explain_alert", type: "generic", input: { alert_id: a.alert_id } },
    resultType: "generic",
    verified: false,
    sql: null,
    citations: [cite(db, a.citation_ref.circular_no, a.citation_ref.para_no)],
    result_set: {
      columns: ["When", "Direction", "Counterparty", "Amount (₹)"],
      rows: a.transactions.slice(0, 8).map((t) => [formatDate(t.txn_ts), t.direction === "CREDIT" ? "In" : "Out", who(t.counterparty), t.amount_inr]),
    },
    answer: `**${who(a.customer_name ?? "")}** was flagged because of ${reasons[0]}, and ${reasons[1]}. ${a.story_en.split(". ").slice(-1)[0]} The report is due on **${formatDate(a.due_at!)}**.`,
    thinkMs: 1300,
  };
}

function whatIf(): Script {
  return {
    tool: { name: "time_machine", type: "generic", input: { rule: "STRUCTURING_RULE", param: "min_amount", from: 900000, to: 800000, days: 90 } },
    resultType: "generic",
    verified: false,
    sql: "-- Replay of the last 90 days with the structuring lower limit at ₹8 L\nSELECT COUNT(*) AS alerts,\n       COUNT_IF(f.VERDICT = 'FRAUD') AS fraud_caught\nFROM KAVACH_DB.CORE.TRANSACTIONS t\nLEFT JOIN KAVACH_DB.CORE.ANALYST_FEEDBACK f ON f.ACCOUNT_ID = t.ACCOUNT_ID\nWHERE t.CHANNEL = 'CASH' AND t.DIRECTION = 'CREDIT'\n  AND t.AMOUNT_INR BETWEEN 800000 AND 999999\n  AND t.TXN_TS >= DATEADD('day', -90, CURRENT_DATE());",
    citations: [],
    result_set: {
      columns: ["Setting", "Alerts", "Fraud caught", "Review hours"],
      rows: [
        ["Today: ₹9 L", 42, 11, 32],
        ["What if: ₹8 L", 57, 15, 43],
      ],
    },
    answer:
      "Over the last 90 days, lowering the structuring limit from ₹9 lakh to ₹8 lakh would have raised **15 more alerts** and caught **4 more confirmed fraud cases**, for about **11 extra hours** of review. That is under 3 hours of review per extra fraud case caught, which looks worth it. Try other values in Time Machine before changing the rule.",
    thinkMs: 1700,
  };
}

function topRisk(db: Db): Script {
  const rows = [...db.alerts].filter((a) => a.status !== "CLOSED").sort((a, b) => b.score - a.score).slice(0, 10);
  return {
    tool: { name: "kavach_analyst", type: "cortex_analyst_text_to_sql", input: { query: "Top 10 risk accounts" } },
    resultType: "system_execute_sql",
    verified: true,
    sql: "SELECT r.ACCOUNT_ID, c.CUSTOMER_NAME, c.CITY, r.RISK_SCORE\nFROM KAVACH_DB.ML.LATEST_RISK_SCORES r\nJOIN KAVACH_DB.CORE.ACCOUNTS a ON a.ACCOUNT_ID = r.ACCOUNT_ID\nJOIN KAVACH_DB.CORE.CUSTOMERS c ON c.CUSTOMER_ID = a.CUSTOMER_ID\nORDER BY r.RISK_SCORE DESC\nLIMIT 10;",
    citations: [],
    result_set: { columns: ["Customer", "City", "Money involved (₹)", "Open since"], rows: rows.map((a) => [who(a.customer_name ?? ""), a.city ?? "", a.amount_inr ?? 0, formatDate(a.created_at)]) },
    answer: `The riskiest open account is **${who(rows[0]!.customer_name ?? "")}** in ${rows[0]!.city}, with ${money(rows[0]!.amount_inr ?? 0)} involved. Together, the top 10 accounts involve **${money(rows.reduce((s, a) => s + (a.amount_inr ?? 0), 0))}**.`,
    thinkMs: 900,
  };
}

function dueReports(db: Db): Script {
  const now = asOf(db);
  const rows = db.alerts
    .filter((a) => a.status !== "CLOSED" && !a.str_filed && Date.parse(a.due_at!) - now <= 7 * 24 * HOUR)
    .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!));
  const overdue = rows.filter((a) => Date.parse(a.due_at!) < now).length;
  return {
    tool: { name: "kavach_analyst", type: "cortex_analyst_text_to_sql", input: { query: "Which reports are due this week?" } },
    resultType: "system_execute_sql",
    verified: true,
    sql: "SELECT al.ALERT_ID, al.ACCOUNT_ID, al.TYPOLOGY, al.CITATION, al.CREATED_AT\nFROM KAVACH_DB.CORE.ALERTS al\nWHERE al.ACTION_REQUIRED = 'STR' AND al.STATUS = 'OPEN'\nORDER BY al.CREATED_AT ASC;",
    citations: [cite(db, "KAVACH/2024/01", "6")],
    result_set: { columns: ["Customer", "Due", "Money involved (₹)"], rows: rows.map((a) => [who(a.customer_name ?? ""), formatDate(a.due_at!), a.amount_inr ?? 0]) },
    answer: `**${rows.length} reports** are due within the next 7 days${overdue ? `, and **${overdue} of them are already overdue**` : ""}. Suspicious transaction reports must be filed within 7 working days of spotting the activity. Start with the overdue ones at the top of the table.`,
    thinkMs: 1000,
  };
}

function fallback(): Script {
  return {
    tool: { name: "kavach_analyst", type: "cortex_analyst_text_to_sql" },
    resultType: "system_execute_sql",
    verified: false,
    sql: null,
    citations: [],
    result_set: null,
    answer:
      "I couldn't find a reliable answer to that in the demo data. I can answer questions about **alerts**, **customers**, **money flows** and **what the circulars say**. Try one of the suggested questions, or ask about a specific customer by name.",
    thinkMs: 800,
  };
}

export function pickScript(db: Db, q: string): Script {
  const s = q.toLowerCase();
  if (/what[- ]if|instead of|would .* catch|lower(ed)? .*(limit|threshold)/.test(s)) return whatIf();
  if (/branch/.test(s)) return branches(db);
  if (/circular|regulat|say about|near the (reporting )?(threshold|limit)/.test(s)) return circular(db);
  if (/explain|why (was|is|did)|flagged/.test(s)) return explain(db, q);
  if (/top .*risk|riskiest|highest risk/.test(s)) return topRisk(db);
  if (/due|deadline|str\b|reports?/.test(s)) return dueReports(db);
  return fallback();
}

const enc = new TextEncoder();
const frame = (e: AskEventDTO) => enc.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const askHandlers = [
  http.post("/api/ask", async ({ request }) => {
    const db = await getDb();
    const { question } = (await request.json()) as { question: string };
    const stream = new URL(request.url).searchParams.get("stream") === "true";
    const s = pickScript(db, question);
    const toolCalls: AskToolCallDTO[] = [{ name: s.tool.name, type: s.tool.type, status: "success", summary: s.result_set ? `${s.result_set.rows.length} row(s)` : s.citations.length ? `${s.citations.length} search result(s)` : null }];
    const done: AskDoneDTO = { question, answer: s.answer, verified_query: s.verified, sql: s.sql, citations: s.citations, tool_calls: toolCalls, warnings: [], result_set: s.result_set };

    if (!stream) {
      await sleep(s.thinkMs + 900);
      return HttpResponse.json(done);
    }

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (e: AskEventDTO) => controller.enqueue(frame(e));
        send({ event: "status", data: { status: "planning", message: "Understanding the question" } });
        await sleep(350);
        send({ event: "tool_call", data: s.tool });
        send({ event: "status", data: { status: "executing_tool", message: s.tool.type === "cortex_search" ? "Searching the circulars" : s.tool.type === "generic" ? "Looking up the case" : "Querying the data" } });
        await sleep(s.thinkMs);
        send({ event: "tool_result", data: { name: s.tool.name, type: s.resultType, status: "success", citations: s.citations, verified_query: s.verified, sql: s.sql, result_set: s.result_set } });
        send({ event: "status", data: { status: "generating_response", message: "Writing the answer" } });
        await sleep(250);
        const tokens = s.answer.match(/\S+\s*/g) ?? [];
        for (let i = 0; i < tokens.length; i += 2) {
          send({ event: "text_delta", data: { content_index: 0, text: tokens.slice(i, i + 2).join("") } });
          await sleep(28);
        }
        send({ event: "done", data: done });
        controller.close();
      },
    });
    return new HttpResponse(body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  }),
];

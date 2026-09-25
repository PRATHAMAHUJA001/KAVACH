/**
 * Builds deterministic mock fixtures from data/exports/tables.
 *
 *   npm run gen:fixtures
 *
 * Real inputs: ALERT_STORIES (200 EN+HI stories → alerts), REG_CHUNKS (circular text),
 * RULE_LIBRARY / RULE_CANDIDATES / RULE_CONFLICTS (rules), EVAL_* (rule health).
 * Everything else (customers, transactions, timelines, rings) is synthesised from a
 * fixed seed so IDs line up across every endpoint and every run produces the same data.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import type {
  AlertDTO,
  AlertDetailExt,
  ConflictDTO,
  GraphEdgeDTO,
  GraphNodeDTO,
  ParagraphDTO,
  ReasonDTO,
  RingDTO,
  RuleDTO,
  RuleHealthRowDTO,
  RuleParamDTO,
  RuleVersionDTO,
  TimelineEventDTO,
  TxnDTO,
  Typology,
  RiskLevelDTO,
  Severity,
} from "../src/services/api/dto";
import {
  BANKS,
  BIZ_SUFFIX,
  CITIES,
  FIRST,
  HIGH_RISK_COUNTRIES,
  LAST,
  REASONS,
  REVIEWERS,
  REVIEW_OVERRIDES,
  RULE_CODE_TYPOLOGY,
  RULE_PLAIN,
  TYPOLOGY_CITATION,
  TYPOLOGY_EXPLAIN,
  TYPOLOGY_RULE_CODE,
  type ReasonFacts,
} from "./fixture-text";

const ROOT = path.resolve(import.meta.dirname, "../..");
const TABLES = path.join(ROOT, "data/exports/tables");
const OUT = path.resolve(import.meta.dirname, "../src/mocks/fixtures");
const STATIC_OUT = path.resolve(import.meta.dirname, "../src/services/api/static");

/** The dataset's "today" (SETTINGS.AS_OF_DATE = 2026-09-24), pinned to 11:00 IST. */
export const AS_OF = Date.parse("2026-09-24T11:00:00+05:30");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const IST = 5.5 * HOUR;

/* ───────────────────────── deterministic randomness ───────────────────────── */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: string) {
  let a = hash(seed);
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    float: (min: number, max: number) => next() * (max - min) + min,
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]!,
    chance: (p: number) => next() < p,
  };
}

const csv = (name: string) =>
  parse(readFileSync(path.join(TABLES, name), "utf8"), { columns: true, skip_empty_lines: true }) as Array<Record<string, string>>;
const iso = (t: number) => new Date(t).toISOString();
const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
const lakh = (inr: number) => round(inr / 1e5, inr >= 1e7 ? 0 : 2);

/* ───────────────────────── circulars ───────────────────────── */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_HI = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];

function cleanChunk(text: string): string {
  return text.split(/\n\s*\n\s*SYNTHETIC circular/i)[0]!.trim();
}

const chunkRows = csv("REG_CHUNKS.csv");
const chunks: ParagraphDTO[] = chunkRows.map((r) => {
  const [d, m, y] = r.ISSUE_DATE!.split(" ");
  const issued = Date.UTC(Number(y), MONTHS.indexOf(m!), Number(d));
  return {
    circular_no: r.CIRCULAR_NO!,
    para_no: r.PARA_NO!,
    text: cleanChunk(r.TEXT!),
    // Two circulars are dated after the dataset's "today"; hide those dates rather than show the future.
    issue_date: issued <= AS_OF ? new Date(issued).toISOString().slice(0, 10) : null,
    is_amendment: r.IS_AMENDMENT === "True",
    amends_circular: r.AMENDS_CIRCULAR || null,
  };
});
const chunk = (c: string, p: string) => chunks.find((x) => x.circular_no === c && x.para_no === String(p));

for (const [typ, ref] of Object.entries(TYPOLOGY_CITATION)) {
  const ch = chunk(ref.circular_no, ref.para_no);
  if (!ch) throw new Error(`Missing chunk for ${typ}`);
  if (!ch.text.toLowerCase().includes(ref.highlight.toLowerCase())) throw new Error(`Highlight not in paragraph for ${typ}`);
}

/* ───────────────────────── people & places ───────────────────────── */
interface Customer {
  customer_id: string;
  name: string;
  name_hi: string;
  is_business: boolean;
  pan: string;
  city: (typeof CITIES)[number];
  branch: string;
  branch_code: string;
  is_pep: boolean;
}
const customers = new Map<string, Customer>();
const usedNames = new Set<string>();

function makeCustomer(customer_id: string, typology: Typology): Customer {
  const existing = customers.get(customer_id);
  if (existing) return existing;
  const r = rng("cust:" + customer_id);
  const bizBias = ["RAPID_PASSTHROUGH", "ROUND_TRIPPING", "HIGH_RISK_SWIFT", "INCOME_MISMATCH"].includes(typology) ? 0.5 : 0.12;
  let name = "";
  let name_hi = "";
  let is_business = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    is_business = typology !== "PEP_UNUSUAL_CASH" && r.chance(bizBias);
    if (is_business) {
      const [l, lh] = r.pick(LAST);
      const [s, sh] = r.pick(BIZ_SUFFIX);
      name = `${l} ${s}`;
      name_hi = `${lh} ${sh}`;
    } else {
      const [f, fh] = r.pick(FIRST);
      const [l, lh] = r.pick(LAST);
      name = `${f} ${l}`;
      name_hi = `${fh} ${lh}`;
    }
    if (!usedNames.has(name)) break;
  }
  usedNames.add(name);
  const city = r.pick(CITIES);
  const branch = r.pick(city.branches);
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const pan =
    Array.from({ length: 3 }, () => r.pick([...letters])).join("") +
    (is_business ? "F" : "P") +
    name.split(" ").pop()![0] +
    String(r.int(1000, 9999)) +
    r.pick([...letters]);
  const c: Customer = {
    customer_id,
    name,
    name_hi,
    is_business,
    pan,
    city,
    branch,
    branch_code: `BR0${100 + (hash(city.en + branch) % 190)}`,
    is_pep: typology === "PEP_UNUSUAL_CASH",
  };
  customers.set(customer_id, c);
  return c;
}

/* ───────────────────────── stories ───────────────────────── */
interface Parsed {
  accountId?: string;
  customerId?: string;
  count?: number;
  amountInr?: number;
  dates: Array<{ m: number; d: number }>;
  ruleCode?: string;
  refusal: boolean;
}

function parseStory(en: string): Parsed {
  const refusal = /^I can(no|')t/i.test(en.trim());
  const dates = [...en.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\b/g)].map(
    (m) => ({ m: MONTHS.indexOf(m[1]!), d: Number(m[2]) }),
  );
  const amt = en.match(/(?:₹\s*)?([\d,]+(?:\.\d+)?)\s*(lakh|crore)/i);
  const rupees = en.match(/([\d,]{5,})\s*rupees/i);
  const amountInr = amt
    ? Number(amt[1]!.replace(/,/g, "")) * (amt[2]!.toLowerCase() === "crore" ? 1e7 : 1e5)
    : rupees
      ? Number(rupees[1]!.replace(/,/g, ""))
      : undefined;
  const cnt = en.match(/(\d+)\s+(?:\w+\s+){0,2}transactions?/i);
  return {
    accountId: en.match(/ACC\d{7}/)?.[0],
    customerId: en.match(/CUST\d{6}/)?.[0],
    count: cnt ? Number(cnt[1]) : undefined,
    amountInr,
    dates,
    ruleCode: en.match(/\b([A-Z]+(?:_[A-Z]+)*_RULE)\b/)?.[1],
    refusal,
  };
}

function detectTypology(p: Parsed, en: string, seed: string): Typology {
  if (p.ruleCode && RULE_CODE_TYPOLOGY[p.ruleCode]) return RULE_CODE_TYPOLOGY[p.ruleCode]!;
  const s = en.toLowerCase();
  if (/round[- ]?trip/.test(s)) return "ROUND_TRIPPING";
  if (/reactivat|dormant|inactive/.test(s)) return "DORMANT_REACTIVATION";
  if (/mule|shared device/.test(s)) return "MULE_RING";
  if (/structur|just (below|under)/.test(s)) return "STRUCTURING";
  if (/pass-?through|in and out|quickly moved/.test(s)) return "RAPID_PASSTHROUGH";
  if (/income/.test(s)) return "INCOME_MISMATCH";
  if (/swift|abroad|international|high risk transaction/.test(s)) return "HIGH_RISK_SWIFT";
  if (/takeover|new device/.test(s)) return "ACCOUNT_TAKEOVER";
  if (/cash/.test(s)) return "PEP_UNUSUAL_CASH";
  return rng(seed).pick(["INCOME_MISMATCH", "DORMANT_REACTIVATION", "HIGH_RISK_SWIFT"] as const);
}

const DROP_EN = /\brule\b|_RULE|KAVACH|regulation|risk (?:score|level)|\bdocument\b|circular|paragraph|here is|simple english/i;
const DROP_HI = /नियम|_RULE|KAVACH|जोखिम|दस्तावेज|परिपत्र|अनुच्छेद|विनियम|स्कोर|कहानी|अंग्रेजी/;

function shiftDateEn(txt: string, shiftDays: number): string {
  return txt.replace(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\b/g,
    (_m, mon: string, d: string) => {
      const t = Date.UTC(2026, MONTHS.indexOf(mon), Number(d)) + shiftDays * DAY;
      const dt = new Date(t);
      return `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
    },
  );
}
function shiftDateHi(txt: string, shiftDays: number): string {
  return txt.replace(/(\d{1,2})\s+(जनवरी|फ़रवरी|फरवरी|मार्च|अप्रैल|मई|जून|जुलाई|अगस्त|सितंबर|सितम्बर|अक्टूबर|नवंबर|दिसंबर)/g, (_m, d: string, mon: string) => {
    const norm = mon === "फरवरी" ? "फ़रवरी" : mon === "सितम्बर" ? "सितंबर" : mon;
    const t = Date.UTC(2026, MONTHS_HI.indexOf(norm), Number(d)) + shiftDays * DAY;
    const dt = new Date(t);
    return `${dt.getUTCDate()} ${MONTHS_HI[dt.getUTCMonth()]}`;
  });
}

function splitSentences(txt: string, hi: boolean): string[] {
  const parts = hi ? txt.split(/(?<=[।!?])\s*/) : txt.split(/(?<=[.!?])\s+(?=[A-Z"“])/);
  return parts.map((s) => s.trim()).filter(Boolean);
}

function cleanEn(raw: string, cust: Customer, shiftDays: number, typ: Typology): string | null {
  let body = raw.trim();
  if (/^here is/i.test(body)) body = body.split(/\n\s*\n/).slice(1).join(" ");
  const kept = splitSentences(body.replace(/\s*\n\s*/g, " "), false).filter((s) => !DROP_EN.test(s));
  if (!kept.length || !kept.some((s) => /\d/.test(s))) return null;
  let out = kept.join(" ");
  const possessive = cust.name.endsWith("s") ? `${cust.name}'` : `${cust.name}'s`;
  out = out
    .replace(/\b[Aa]ccount (?:number )?ACC\d{7}/g, (m) => (m[0] === "A" ? `${possessive} account` : `${possessive} account`))
    .replace(/\b[Aa] customer(?:,)? (?:named |with ID )?CUST\d{6},?/g, cust.name)
    .replace(/\bcustomer CUST\d{6}/gi, cust.name)
    .replace(/ACC\d{7}/g, `${possessive} account`)
    .replace(/CUST\d{6}/g, cust.name)
    .replace(/\s*\([^)]*rupees[^)]*\)/gi, "")
    .replace(/([\d.]+)\s*lakh rupees/gi, "₹$1 lakh")
    .replace(/([\d,]{5,})\s*rupees/gi, (_m, n: string) => `₹${Number(n.replace(/,/g, "")).toLocaleString("en-IN")}`)
    .replace(/Rs\.?\s*([\d.]+)\s*lakh/gi, "₹$1 lakh")
    .replace(/,\s*2026,/g, ", 2026,");
  out = shiftDateEn(out, shiftDays);
  if (/ACC\d|CUST\d|_RULE/.test(out)) return null;
  return `${out} ${TYPOLOGY_EXPLAIN[typ]!.en}`;
}

function cleanHi(raw: string, cust: Customer, shiftDays: number, typ: Typology): string | null {
  const body = raw
    .trim()
    .replace(/^\s*यहाँ[^:\n]*:\s*/, "")
    .replace(/\s*\n+\s*/g, " ");
  const kept = splitSentences(body, true).filter((s) => !DROP_HI.test(s));
  if (!kept.length || !kept.some((s) => /\d/.test(s))) return null;
  let out = kept.join(" ");
  out = out
    .replace(/खाता\s+(?:संख्या\s+)?ACC\d{7}/g, `${cust.name_hi} का खाता`)
    .replace(/ग्राहक\s+(?:आईडी\s+)?CUST\d{6}/g, cust.name_hi)
    .replace(/ACC\d{7}/g, `${cust.name_hi} का खाता`)
    .replace(/CUST\d{6}/g, cust.name_hi);
  const nm = cust.name_hi;
  out = out
    .replace(new RegExp(`एक ग्राहक,?\\s*(?:ने\\s+)?${nm},?\\s*(?:ने\\s+)?`, "g"), `${nm} ने `)
    .replace(new RegExp(`ग्राहक\\s+${nm}`, "g"), nm)
    .replace(/का खाता (को|में|से|पर|का|की|के)(?=\s)/g, "के खाते $1")
    .replace(/\s*\([^)]*रुपये[^)]*\)/g, "")
    .replace(/जो\s+([\d.,]+)\s+लाख रुपये तक जोड़ते थे/g, "जिनकी कुल राशि ₹$1 लाख थी")
    .replace(/([\d.,]+)\s+लाख रुपये/g, "₹$1 लाख")
    .replace(/\s+ने\s+ने\s+/g, " ने ");
  out = shiftDateHi(out, shiftDays);
  // Mostly-Latin output means translation failed; fall back to the template.
  const latin = (out.match(/[A-Za-z]/g) ?? []).length;
  if (latin > out.length * 0.15 || /ACC\d|CUST\d|_RULE/.test(out)) return null;
  return `${out} ${TYPOLOGY_EXPLAIN[typ]!.hi}`;
}

function fmtDateEn(t: number) {
  const d = new Date(t + IST);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
function fmtDateHi(t: number) {
  const d = new Date(t + IST);
  return `${d.getUTCDate()} ${MONTHS_HI[d.getUTCMonth()]}`;
}

function templateStory(cust: Customer, n: number, amountInr: number, start: number, end: number, typ: Typology) {
  const amt = `₹${lakh(amountInr)} lakh`;
  const possessive = cust.name.endsWith("s") ? `${cust.name}'` : `${cust.name}'s`;
  return {
    en: `${possessive} account at the ${cust.branch} branch in ${cust.city.en} had ${n} transactions worth ${amt} between ${fmtDateEn(start)} and ${fmtDateEn(end)}, 2026. ${TYPOLOGY_EXPLAIN[typ]!.en}`,
    hi: `${cust.name_hi} के ${cust.city.hi} स्थित खाते में ${fmtDateHi(start)} से ${fmtDateHi(end)} 2026 के बीच ₹${lakh(amountInr)} लाख के ${n} लेनदेन हुए। ${TYPOLOGY_EXPLAIN[typ]!.hi}`,
  };
}

/* ───────────────────────── working days ───────────────────────── */
function addWorkingDays(t: number, n: number): number {
  let x = t;
  let added = 0;
  while (added < n) {
    x += DAY;
    const dow = new Date(x + IST).getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return x;
}

function levelOf(score: number): RiskLevelDTO {
  if (score >= 0.85) return 5;
  if (score >= 0.65) return 4;
  if (score >= 0.45) return 3;
  if (score >= 0.25) return 2;
  return 1;
}

const BASE_SCORE: Record<string, number> = {
  MULE_RING: 0.78,
  ACCOUNT_TAKEOVER: 0.8,
  PEP_UNUSUAL_CASH: 0.72,
  HIGH_RISK_SWIFT: 0.74,
  STRUCTURING: 0.76,
  RAPID_PASSTHROUGH: 0.66,
  ROUND_TRIPPING: 0.62,
  DORMANT_REACTIVATION: 0.52,
  INCOME_MISMATCH: 0.46,
};

/* ───────────────────────── transactions ───────────────────────── */
function counterpartyName(r: ReturnType<typeof rng>): string {
  if (r.chance(0.5)) {
    const [l] = r.pick(LAST);
    const [s] = r.pick(BIZ_SUFFIX);
    return `${l} ${s}`;
  }
  const [f] = r.pick(FIRST);
  const [l] = r.pick(LAST);
  return `${f} ${l[0]}.`;
}

function splitAmount(r: ReturnType<typeof rng>, total: number, parts: number, jitter = 0.6): number[] {
  const w = Array.from({ length: parts }, () => 1 + r.float(-jitter, jitter));
  const sum = w.reduce((a, b) => a + b, 0);
  const raw = w.map((x) => Math.round((total * x) / sum / 100) * 100);
  raw[raw.length - 1]! += total - raw.reduce((a, b) => a + b, 0);
  return raw;
}

interface Built {
  txns: TxnDTO[];
  timeline: TimelineEventDTO[];
  facts: ReasonFacts;
}

function buildActivity(
  alertId: string,
  accountId: string,
  cust: Customer,
  typ: Typology,
  n: number,
  total: number,
  start: number,
  end: number,
  createdAt: number,
): Built {
  const r = rng("txn:" + alertId);
  const txns: TxnDTO[] = [];
  const span = Math.max(end - start, DAY);
  const at = (i: number, count: number) => start + (span * (i + 0.5)) / count + r.float(-2, 2) * HOUR;
  const payees = Array.from({ length: 6 }, () => counterpartyName(r));
  const country = r.pick(HIGH_RISK_COUNTRIES);
  const device = `DEV-${(hash(accountId) % 90000) + 10000}`;
  const ip = `49.${hash(accountId) % 250}.${hash(alertId) % 250}.${(hash(cust.name) % 240) + 10}`;
  let txnSeq = 0;
  const push = (t: number, amount: number, channel: TxnDTO["channel"], direction: TxnDTO["direction"], counterparty: string, narration: string, ctry = "IN") => {
    txns.push({
      txn_id: `TXN${String(hash(alertId) % 9_000_000 + 1_000_000)}${String(++txnSeq).padStart(2, "0")}`,
      account_id: accountId,
      txn_ts: iso(Math.min(t, createdAt - 20 * 60_000)),
      amount_inr: Math.max(500, Math.round(amount)),
      channel,
      direction,
      counterparty,
      counterparty_bank: channel === "CASH" ? "—" : ctry !== "IN" ? "Foreign bank" : r.pick(BANKS),
      country: ctry,
      narration,
      device_id: channel === "CASH" ? undefined : device,
      ip_address: channel === "CASH" ? undefined : ip,
    });
  };

  const facts: ReasonFacts = {
    n,
    amountL: `${lakh(total)} L`,
    amountLhi: `${lakh(total)} लाख`,
    days: Math.max(1, Math.round(span / DAY)),
    hours: r.int(2, 6),
    pct: r.int(88, 98),
    k: r.int(3, 6),
    months: r.int(14, 30),
    times: r.int(4, 12),
    minutes: r.int(8, 45),
    country,
    city: r.pick(CITIES.filter((c) => c.en !== cust.city.en)).en,
    cityHi: "",
    branches: r.int(2, 4),
  };
  facts.cityHi = CITIES.find((c) => c.en === facts.city)!.hi;

  const pairs = Math.max(1, Math.floor(n / 2));
  if (n === 1) {
    const one: Record<string, [TxnDTO["channel"], TxnDTO["direction"], string]> = {
      STRUCTURING: ["CASH", "CREDIT", "Cash deposit"],
      PEP_UNUSUAL_CASH: ["CASH", "CREDIT", "Cash deposit"],
      HIGH_RISK_SWIFT: ["SWIFT", "DEBIT", "Import payment"],
      ACCOUNT_TAKEOVER: ["IMPS", "DEBIT", "Transfer"],
      ROUND_TRIPPING: ["NEFT", "DEBIT", "Advance to supplier"],
    };
    const [ch, dir, nar] = one[typ] ?? ["RTGS", "CREDIT", "Funds received"];
    push(at(0, 1), total, ch, dir, ch === "CASH" ? `${cust.city.branches[0]} branch counter` : ch === "SWIFT" ? `${country} Trading Co.` : payees[0]!, nar, ch === "SWIFT" ? country : "IN");
  } else
  switch (typ) {
    case "STRUCTURING":
    case "PEP_UNUSUAL_CASH": {
      const deposits = typ === "STRUCTURING" ? n : Math.max(1, n - 1);
      const amounts =
        typ === "STRUCTURING"
          ? Array.from({ length: deposits }, () => r.int(900_000, 998_000))
          : splitAmount(r, total * (deposits / n), deposits, 0.4);
      const branches = cust.city.branches;
      amounts.forEach((a, i) =>
        push(at(i, n), a, "CASH", "CREDIT", `${branches[i % branches.length]} branch counter`, "Cash deposit"),
      );
      if (typ === "PEP_UNUSUAL_CASH") push(at(n - 1, n), total * (1 / n), "RTGS", "DEBIT", payees[0]!, "Property advance");
      facts.days = Math.max(2, Math.round(span / DAY));
      facts.branches = Math.min(branches.length, deposits);
      break;
    }
    case "RAPID_PASSTHROUGH":
    case "MULE_RING": {
      const ins = splitAmount(r, total / 1.96, pairs, 0.5);
      ins.forEach((a, i) => {
        const t = at(i, pairs);
        const ch = typ === "MULE_RING" ? "UPI" : r.pick(["NEFT", "IMPS", "RTGS"] as const);
        push(t, a, ch, "CREDIT", payees[i % 4]!, typ === "MULE_RING" ? "UPI credit" : "Payment received");
        push(t + (typ === "MULE_RING" ? r.int(4, 28) * 60_000 : r.int(1, 5) * HOUR), a * 0.96, typ === "MULE_RING" ? "IMPS" : "IMPS", "DEBIT", payees[4 + (i % 2)]!, "Transfer");
      });
      if (n % 2 === 1) push(at(pairs, pairs + 1), total * 0.02, "UPI", "DEBIT", payees[5]!, "UPI payment");
      break;
    }
    case "ROUND_TRIPPING": {
      const outs = splitAmount(r, total / 1.97, pairs, 0.3);
      outs.forEach((a, i) => {
        const t = at(i, pairs);
        push(t, a, "NEFT", "DEBIT", payees[i % 3]!, "Advance to supplier");
        push(t + r.int(2, 6) * DAY, a * r.float(0.95, 0.99), "NEFT", "CREDIT", payees[3 + (i % 3)]!, "Refund");
      });
      if (n % 2 === 1) push(at(pairs, pairs + 1), total * 0.03, "IMPS", "DEBIT", payees[2]!, "Charges");
      facts.days = r.int(3, 7);
      break;
    }
    case "HIGH_RISK_SWIFT": {
      const ins = splitAmount(r, total * 0.5, Math.max(1, n - 1), 0.4);
      ins.forEach((a, i) => push(at(i, n), a, "NEFT", "CREDIT", payees[i % 4]!, "Payment received"));
      push(at(n - 1, n), total * 0.5, "SWIFT", "DEBIT", `${country} Trading Co.`, "Import payment", country);
      facts.amountL = `${lakh(total * 0.5)} L`;
      facts.amountLhi = `${lakh(total * 0.5)} लाख`;
      break;
    }
    case "DORMANT_REACTIVATION": {
      const inAmt = total * 0.52;
      push(at(0, n), inAmt, "RTGS", "CREDIT", payees[0]!, "Funds received");
      const outs = splitAmount(r, total - inAmt, Math.max(1, n - 1), 0.5);
      outs.forEach((a, i) => push(at(i + 1, n), a, r.pick(["IMPS", "NEFT"] as const), "DEBIT", payees[1 + (i % 4)]!, "Transfer"));
      facts.amountL = `${lakh(inAmt)} L`;
      facts.amountLhi = `${lakh(inAmt)} लाख`;
      facts.days = r.int(3, 9);
      break;
    }
    case "INCOME_MISMATCH": {
      const credits = Math.max(1, Math.ceil(n * 0.7));
      splitAmount(r, total * 0.75, credits, 0.6).forEach((a, i) => push(at(i, n), a, r.pick(["NEFT", "IMPS", "UPI"] as const), "CREDIT", payees[i % 5]!, "Payment received"));
      splitAmount(r, total * 0.25, Math.max(1, n - credits), 0.5).forEach((a, i) => push(at(credits + i, n), a, "IMPS", "DEBIT", payees[(i + 2) % 6]!, "Transfer"));
      facts.n = credits;
      facts.times = r.int(8, 24);
      break;
    }
    case "ACCOUNT_TAKEOVER":
    default: {
      splitAmount(r, total, n, 0.5).forEach((a, i) => push(end - (n - i) * r.int(6, 20) * 60_000, a, r.pick(["IMPS", "UPI"] as const), "DEBIT", payees[i % 6]!, "Transfer"));
      break;
    }
  }
  txns.sort((a, b) => Date.parse(a.txn_ts) - Date.parse(b.txn_ts));

  /* ── timeline: a few context events + the key transactions + the alert ── */
  const tl: TimelineEventDTO[] = [];
  const first = Date.parse(txns[0]!.txn_ts);
  let eid = 0;
  const ev = (e: Omit<TimelineEventDTO, "id">) => tl.push({ id: `${alertId}-e${++eid}`, ...e });
  if (typ === "ACCOUNT_TAKEOVER") {
    ev({ at: iso(first - facts.minutes * 60_000 - 25 * 60_000), type: "kyc", title: "Mobile number changed", title_hi: "मोबाइल नंबर बदला गया" });
    ev({ at: iso(first - facts.minutes * 60_000), type: "login", title: `Logged in from a new phone in ${facts.city}`, title_hi: `${facts.cityHi} से नए फ़ोन पर लॉगिन`, suspicious: true });
  } else if (typ === "DORMANT_REACTIVATION") {
    ev({ at: iso(first - 3 * HOUR), type: "kyc", title: `Account reactivated after ${facts.months} months`, title_hi: `${facts.months} महीने बाद खाता फिर चालू` });
    ev({ at: iso(first - 2 * HOUR), type: "new_beneficiary", title: `Added payee ${txns.find((t) => t.direction === "DEBIT")?.counterparty ?? payees[1]}`, title_hi: "नया प्राप्तकर्ता जोड़ा" });
  } else if (typ === "MULE_RING" || typ === "RAPID_PASSTHROUGH") {
    ev({ at: iso(first - 5 * HOUR), type: "device_change", title: "Logged in from a phone shared with other accounts", title_hi: "दूसरे खातों के साथ साझा फ़ोन से लॉगिन", suspicious: typ === "MULE_RING" });
  } else if (typ === "HIGH_RISK_SWIFT") {
    ev({ at: iso(first - 4 * HOUR), type: "new_beneficiary", title: `Added overseas payee in ${country}`, title_hi: `${country} में विदेशी प्राप्तकर्ता जोड़ा` });
  }

  const pick = txns.length <= 6 ? txns : [txns[0]!, txns[1]!, ...txns.slice(Math.floor(txns.length / 2), Math.floor(txns.length / 2) + 2), txns[txns.length - 2]!, txns[txns.length - 1]!];
  const suspiciousIdx =
    typ === "STRUCTURING" || typ === "PEP_UNUSUAL_CASH"
      ? Math.min(pick.length - 1, 2)
      : typ === "HIGH_RISK_SWIFT"
        ? pick.findIndex((t) => t.channel === "SWIFT")
        : typ === "RAPID_PASSTHROUGH" || typ === "ROUND_TRIPPING" || typ === "DORMANT_REACTIVATION"
          ? pick.findIndex((t) => t.direction === (typ === "ROUND_TRIPPING" ? "CREDIT" : "DEBIT"))
          : -1;
  pick.forEach((t, i) => {
    const isCash = t.channel === "CASH";
    const type: TimelineEventDTO["type"] = isCash ? "cash_deposit" : t.direction === "CREDIT" ? "transfer_in" : "transfer_out";
    const title = isCash
      ? `Cash deposited at ${t.counterparty.replace(" counter", "")}`
      : t.channel === "SWIFT"
        ? `Sent abroad to ${t.counterparty}`
        : t.direction === "CREDIT"
          ? `Received from ${t.counterparty}`
          : `Sent to ${t.counterparty}`;
    const title_hi = isCash
      ? `${t.counterparty.replace(" branch counter", "")} शाखा में नकद जमा`
      : t.channel === "SWIFT"
        ? `${t.counterparty} को विदेश भेजा`
        : t.direction === "CREDIT"
          ? `${t.counterparty} से पैसा मिला`
          : `${t.counterparty} को पैसा भेजा`;
    ev({ at: t.txn_ts, type, title, title_hi, detail: t.channel === "CASH" ? undefined : t.channel, amount_inr: t.amount_inr, suspicious: i === suspiciousIdx });
  });
  ev({ at: iso(createdAt), type: "alert", title: "Alert raised by KAVACH", title_hi: "KAVACH ने अलर्ट बनाया" });
  tl.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { txns, timeline: tl, facts };
}

/* ───────────────────────── alerts ───────────────────────── */
export type AlertFixture = AlertDTO & AlertDetailExt & { story_en: string; story_hi: string; story_source: "cleaned" | "template"; typology: Typology };

const storyRows = csv("ALERT_STORIES.csv");
const order = [...storyRows].sort((a, b) => hash(a.ALERT_ID!) - hash(b.ALERT_ID!));
const NEW_COUNT = 14;

const alerts: AlertFixture[] = order.map((row, idx) => {
  const id = row.ALERT_ID!;
  const r = rng("alert:" + id);
  const p = parseStory(row.STORY_EN!);
  const typology = detectTypology(p, row.STORY_EN!, id);
  const accountId = p.accountId ?? `ACC00${String(10000 + (hash(id) % 89999))}`;
  const customerId = p.customerId ?? `CUST0${String(10000 + (hash(accountId) % 89999))}`;
  const cust = makeCustomer(customerId, typology);

  // Age: 14 alerts in the last 24h, the rest spread over 30 days, biased recent.
  const ageDays = idx < NEW_COUNT ? r.float(0.05, 0.95) : 1 + 29 * Math.pow(r.next(), 1.3);
  const createdAt = Math.round((AS_OF - ageDays * DAY) / 60_000) * 60_000;
  const windowEnd = createdAt - r.float(1, 6) * HOUR;

  let spanDays = r.int(18, 29);
  let shiftDays = 0;
  if (p.dates.length >= 2) {
    const s = p.dates[0]!;
    const e = p.dates[p.dates.length - 1]!;
    const sT = Date.UTC(2026, s.m, s.d);
    const eT = Date.UTC(2026, e.m, e.d);
    spanDays = Math.max(1, Math.round((eT - sT) / DAY));
    const targetEnd = Date.UTC(new Date(windowEnd + IST).getUTCFullYear(), new Date(windowEnd + IST).getUTCMonth(), new Date(windowEnd + IST).getUTCDate());
    shiftDays = Math.round((targetEnd - eT) / DAY);
  }
  const windowStart = windowEnd - spanDays * DAY;

  let n = p.count && p.count > 0 && p.count <= 24 ? p.count : r.int(6, 15);
  let amount = p.amountInr && p.amountInr > 50_000 ? p.amountInr : r.int(8, 90) * 1e5 + r.int(0, 99) * 1e3;
  if (typology === "STRUCTURING") {
    // Structuring amounts must be n deposits just under ₹10 L; recompute and use the template story.
    n = Math.min(Math.max(n, 3), 6);
  }

  const built = buildActivity(id, accountId, cust, typology, n, amount, windowStart, windowEnd, createdAt);
  const txnTotal = built.txns.reduce((a, t) => a + t.amount_inr, 0);
  if (typology === "STRUCTURING" || Math.abs(txnTotal - amount) > amount * 0.02) {
    amount = txnTotal;
    p.amountInr = undefined;
  }
  n = built.txns.length;
  built.facts.n = typology === "INCOME_MISMATCH" ? built.facts.n : n;

  let en = !p.refusal && p.amountInr ? cleanEn(row.STORY_EN!, cust, shiftDays, typology) : null;
  let hi = en ? cleanHi(row.STORY_HI!, cust, shiftDays, typology) : null;
  let story_source: "cleaned" | "template" = "cleaned";
  if (!en || !hi) {
    const t = templateStory(cust, n, amount, windowStart, windowEnd, typology);
    en = t.en;
    hi = t.hi;
    story_source = "template";
  }

  const score = Math.min(0.99, Math.max(0.12, BASE_SCORE[typology]! + r.float(-0.2, 0.18) + Math.log10(amount / 1e6) * 0.05));
  const risk_level = levelOf(score);
  const severity: Severity = risk_level >= 4 ? "HIGH" : risk_level === 3 ? "MEDIUM" : "LOW";
  const dueAt = addWorkingDays(createdAt, 7);
  const cite = TYPOLOGY_CITATION[typology]!;
  const reasons: ReasonDTO[] = REASONS[typology]!.map(([tpl, w]) => {
    const t = tpl(built.facts);
    return { text: t.en, text_hi: t.hi, weight: round(w + r.float(-0.05, 0.05), 2) };
  });

  return {
    alert_id: id,
    account_id: accountId,
    customer_id: customerId,
    typology,
    severity,
    score: round(score, 3),
    status: "OPEN",
    rule_name: TYPOLOGY_RULE_CODE[typology] ?? "STRUCTURING_RULE",
    citation: `${cite.circular_no} para ${cite.para_no}`,
    created_at: iso(createdAt),
    resolution: null,
    customer_name: cust.name,
    customer_name_hi: cust.name_hi,
    pan: cust.pan,
    amount_inr: amount,
    txn_count: n,
    due_at: iso(dueAt),
    str_filed: false,
    risk_level,
    ring_id: null,
    window_start: iso(windowStart),
    window_end: iso(windowEnd),
    branch: `${cust.branch} (${cust.branch_code})`,
    city: cust.city.en,
    city_hi: cust.city.hi,
    action_required: "STR",
    reasons,
    timeline: built.timeline,
    transactions: built.txns,
    connections: { nodes: [], edges: [] },
    citation_ref: { circular_no: cite.circular_no, para_no: cite.para_no, highlight: cite.highlight },
    story_en: en,
    story_hi: hi,
    story_source,
  };
});

/* ── status, resolution & report filing: keep a realistic workload ── */
{
  const openOverdue = new Set<string>();
  const overdueCandidates = alerts.filter((a) => Date.parse(a.due_at!) < AS_OF).sort((a, b) => b.score - a.score);
  overdueCandidates.slice(0, 4).forEach((a) => openOverdue.add(a.alert_id));
  const dueSoon = alerts
    .filter((a) => {
      const d = Date.parse(a.due_at!) - AS_OF;
      return d > 0 && d <= 48 * HOUR;
    })
    .sort((a, b) => b.score - a.score);
  const keepDueSoon = new Set(dueSoon.slice(0, 3).map((a) => a.alert_id));

  for (const a of alerts) {
    const r = rng("status:" + a.alert_id);
    const age = (AS_OF - Date.parse(a.created_at)) / DAY;
    const due = Date.parse(a.due_at!);
    if (age < 2) a.status = "NEW";
    if (due < AS_OF) {
      if (openOverdue.has(a.alert_id)) a.status = "OPEN";
      else {
        a.status = "CLOSED";
        const tp = r.chance(a.risk_level! >= 4 ? 0.55 : 0.3);
        a.resolution = tp ? "TRUE_POSITIVE" : "FALSE_POSITIVE";
        a.str_filed = tp;
      }
    } else if (due - AS_OF <= 48 * HOUR) {
      if (!keepDueSoon.has(a.alert_id)) {
        a.str_filed = true;
        a.status = r.chance(0.5) ? "CLOSED" : "OPEN";
        if (a.status === "CLOSED") a.resolution = "TRUE_POSITIVE";
      }
    } else if (age > 3 && r.chance(0.12)) {
      a.status = "CLOSED";
      a.resolution = r.chance(0.4) ? "TRUE_POSITIVE" : "FALSE_POSITIVE";
      a.str_filed = a.resolution === "TRUE_POSITIVE";
    }
  }
}

/* ───────────────────────── rings ───────────────────────── */
interface RingFixture {
  ring: RingDTO;
  members: GraphNodeDTO[];
  edges: GraphEdgeDTO[];
  transactions: TxnDTO[];
}
const rings: RingFixture[] = [];
{
  const candidates = alerts
    .filter((a) => a.typology === "MULE_RING" || (a.typology === "RAPID_PASSTHROUGH" && rng("ringpick:" + a.alert_id).chance(0.4)))
    .sort((a, b) => hash(a.alert_id) - hash(b.alert_id));
  const RING_COUNT = 12;
  const groups: AlertFixture[][] = Array.from({ length: RING_COUNT }, () => []);
  candidates.forEach((a, i) => groups[i % RING_COUNT]!.push(a));
  const channels = ["UPI", "IMPS", "cash", "NEFT"];
  const usedRingNames = new Set<string>();

  groups.forEach((group, gi) => {
    if (!group.length) return;
    const r = rng("ring:" + gi);
    const ringId = `RING-${String(1000 + hash("ring" + gi) % 9000)}`;
    const lead = group[0]!;
    const city = CITIES.find((c) => c.en === lead.city)!;
    let channel = r.pick(channels);
    let name = `${city.en} ${channel} ring`;
    for (let k = 0; usedRingNames.has(name) && k < 8; k++) {
      channel = channels[(channels.indexOf(channel) + 1) % channels.length]!;
      name = `${city.en} ${channel} ring`;
    }
    usedRingNames.add(name);
    const channelHi = channel === "cash" ? "नकद" : channel;

    const members: GraphNodeDTO[] = group.map((a) => ({
      id: a.account_id,
      label: a.customer_name!,
      label_hi: a.customer_name_hi,
      risk_level: a.risk_level!,
      kind: "member",
      city: a.city,
      alert_id: a.alert_id,
      money_in_inr: 0,
      money_out_inr: 0,
    }));
    const extra = r.int(1, 4);
    for (let k = 0; k < extra; k++) {
      const acc = `ACC00${String(10000 + (hash(ringId + k) % 89999))}`;
      const cust = makeCustomer(`CUST0${String(10000 + (hash(acc) % 89999))}`, "MULE_RING");
      members.push({ id: acc, label: cust.name, label_hi: cust.name_hi, risk_level: r.pick([2, 3] as const), kind: "member", city: cust.city.en, alert_id: null, money_in_inr: 0, money_out_inr: 0 });
    }
    // Roles: the highest-risk account collects, one or two send the money out, the rest are mules.
    members.sort((a, b) => b.risk_level - a.risk_level || a.id.localeCompare(b.id));
    members.forEach((m, i) => (m.role = i === 0 ? "collector" : i >= members.length - (members.length > 5 ? 2 : 1) ? "exit" : "mule"));
    const collector = members[0]!;
    const exits = members.filter((m) => m.role === "exit");
    const mules = members.filter((m) => m.role === "mule");

    const edges: GraphEdgeDTO[] = [];
    const txns: TxnDTO[] = [];
    const detected = Date.parse(lead.created_at);
    let seq = 0;
    const money = (from: GraphNodeDTO, to: GraphNodeDTO, amount: number) => {
      edges.push({ source: from.id, target: to.id, kind: "sent_money", amount_inr: amount, count: r.int(2, 6) });
      from.money_out_inr! += amount;
      to.money_in_inr! += amount;
      const t = detected - r.float(1, 20) * DAY;
      txns.push({
        txn_id: `TXR${String(hash(ringId) % 900000 + 100000)}${String(++seq).padStart(2, "0")}`,
        account_id: from.id,
        txn_ts: iso(t),
        amount_inr: amount,
        channel: channel === "cash" ? "IMPS" : (channel as TxnDTO["channel"]),
        direction: "DEBIT",
        counterparty: to.label,
        counterparty_bank: r.pick(BANKS),
        country: "IN",
        narration: "Transfer",
      });
    };
    const inflow = r.int(28, 140) * 1e5;
    const mids = mules.length ? mules : exits;
    splitAmount(r, inflow, mids.length, 0.5).forEach((a, i) => money(collector, mids[i]!, a));
    if (mules.length) mules.forEach((m, i) => money(m, exits[i % exits.length]!, Math.round(m.money_in_inr! * r.float(0.9, 0.98))));
    // Shared identifiers: a chain through every member plus a couple of extra links.
    const kinds: GraphEdgeDTO["kind"][] = ["shared_device", "shared_phone", "shared_ip"];
    for (let i = 1; i < members.length; i++) {
      const a = members[i - 1]!;
      const b = members[i]!;
      if (!edges.some((e) => (e.source === a.id && e.target === b.id) || (e.source === b.id && e.target === a.id)))
        edges.push({ source: a.id, target: b.id, kind: r.pick(kinds) });
    }
    if (members.length > 3) edges.push({ source: members[1]!.id, target: members[members.length - 1]!.id, kind: "shared_device" });

    const alerted = members.filter((m) => m.alert_id).length;
    const shared = edges.filter((e) => e.kind !== "sent_money").length;
    const riskScore = Math.min(0.97, 0.45 + alerted * 0.08 + shared * 0.03 + r.float(0, 0.1));
    const conf = riskScore >= 0.75 ? "HIGH" : riskScore >= 0.6 ? "MEDIUM" : "LOW";
    for (const m of members) if (m.alert_id) alerts.find((a) => a.alert_id === m.alert_id)!.ring_id = ringId;
    rings.push({
      ring: {
        ring_id: ringId,
        ring_name: name,
        ring_name_hi: `${city.hi} ${channelHi} समूह`,
        member_count: members.length,
        total_volume_inr: edges.filter((e) => e.kind === "sent_money").reduce((a, e) => a + (e.amount_inr ?? 0), 0),
        risk_score: round(riskScore, 2),
        status: gi % 6 === 5 ? "DISRUPTED" : "ACTIVE",
        confidence: conf,
        speed_hours: round(r.float(0.3, 5), 1),
        detected_at: iso(detected),
        alerted_members: alerted,
        shared_devices: shared,
        city: city.en,
        city_hi: city.hi,
      },
      members,
      edges,
      transactions: txns.sort((a, b) => Date.parse(a.txn_ts) - Date.parse(b.txn_ts)),
    });
  });
  rings.sort((a, b) => (b.ring.risk_score ?? 0) - (a.ring.risk_score ?? 0));
}

/* ── per-alert "who is connected" mini graph ── */
for (const a of alerts) {
  const r = rng("conn:" + a.alert_id);
  const subject: GraphNodeDTO = { id: a.account_id, label: a.customer_name!, label_hi: a.customer_name_hi, risk_level: a.risk_level!, kind: "subject", city: a.city, alert_id: a.alert_id };
  const ring = a.ring_id ? rings.find((x) => x.ring.ring_id === a.ring_id) : undefined;
  if (ring) {
    const near = ring.edges.filter((e) => e.source === a.account_id || e.target === a.account_id).slice(0, 5);
    const ids = new Set(near.map((e) => (e.source === a.account_id ? e.target : e.source)));
    const nodes = ring.members.filter((m) => ids.has(m.id)).map((m) => ({ ...m, kind: "member" as const }));
    a.connections = { nodes: [subject, ...nodes], edges: near };
  } else {
    const outs = a.transactions.filter((t) => t.direction === "DEBIT").slice(0, 2);
    const ins = a.transactions.filter((t) => t.direction === "CREDIT" && t.channel !== "CASH").slice(0, 2);
    const nodes: GraphNodeDTO[] = [subject];
    const edges: GraphEdgeDTO[] = [];
    [...ins, ...outs].forEach((t, i) => {
      const id = `EXT-${hash(t.counterparty) % 99999}`;
      if (nodes.some((n) => n.id === id)) return;
      nodes.push({ id, label: t.counterparty, risk_level: r.pick([1, 2] as const), kind: "external" });
      edges.push(t.direction === "CREDIT" ? { source: id, target: a.account_id, kind: "sent_money", amount_inr: t.amount_inr } : { source: a.account_id, target: id, kind: "sent_money", amount_inr: t.amount_inr });
      void i;
    });
    // Link to one other flagged account through a shared identifier, when it makes sense.
    if (["ACCOUNT_TAKEOVER", "RAPID_PASSTHROUGH", "INCOME_MISMATCH"].includes(a.typology) && r.chance(0.5)) {
      const other = alerts.find((b) => b.alert_id !== a.alert_id && b.city === a.city && !b.ring_id);
      if (other) {
        nodes.push({ id: other.account_id, label: other.customer_name!, label_hi: other.customer_name_hi, risk_level: other.risk_level!, kind: "member", city: other.city, alert_id: other.alert_id });
        edges.push({ source: a.account_id, target: other.account_id, kind: r.pick(["shared_phone", "shared_ip"] as const) });
      }
    }
    a.connections = { nodes, edges };
  }
}

/* ───────────────────────── rules ───────────────────────── */
const candidates = new Map(csv("RULE_CANDIDATES.csv").map((c) => [c.RULE_ID!, c]));
const libRows = csv("RULE_LIBRARY.csv");

function plainFor(r: Record<string, string>): { en: string; hi: string } {
  const sql = r.SQL_TEXT!;
  if (r.TYPOLOGY === "KYC_CDD") return RULE_PLAIN.KYC!;
  if (r.TYPOLOGY === "ROUND_TRIPPING") return RULE_PLAIN.ROUND_TRIPPING!;
  if (r.TYPOLOGY === "INCOME_MISMATCH") return RULE_PLAIN.INCOME_MISMATCH!;
  if (r.TYPOLOGY === "CASH_REPORTING") return RULE_PLAIN.CASH_REPORTING!;
  if (r.TYPOLOGY === "STRUCTURING") return sql.includes("1300000") ? RULE_PLAIN.STRUCTURING_V2! : RULE_PLAIN.STRUCTURING_V1!;
  if (r.TYPOLOGY === "DORMANT_REACTIVATION") return RULE_PLAIN.DORMANT!;
  if (r.TYPOLOGY === "HIGH_RISK_SWIFT") return RULE_PLAIN.HIGH_RISK_SWIFT!;
  if (r.TYPOLOGY === "MULE_RING") return RULE_PLAIN.MULE_RING!;
  return RULE_PLAIN.WIRE_TRANSFER!;
}

function paramsFor(r: Record<string, string>): RuleParamDTO[] {
  const sql = r.SQL_TEXT!;
  const between = sql.match(/BETWEEN (\d+) AND (\d+)/);
  const gte = sql.match(/AMOUNT_INR >= (\d+)/);
  const cnt = sql.match(/COUNT\(\*\) >= (\d+)/);
  const out: RuleParamDTO[] = [];
  if (between)
    out.push({ key: "min_amount", label: "Lowest deposit that counts", label_hi: "गिनी जाने वाली सबसे कम जमा", unit: "inr", value: Number(between[1]), min: 500_000, max: 1_500_000, step: 50_000 });
  if (gte) out.push({ key: "min_amount", label: "Amount limit", label_hi: "राशि सीमा", unit: "inr", value: Number(gte[1]), min: 50_000, max: 2_000_000, step: 50_000 });
  if (cnt) out.push({ key: "min_count", label: "How many times", label_hi: "कितनी बार", unit: "count", value: Number(cnt[1]), min: 2, max: 10, step: 1 });
  return out;
}

const citeParts = (s: string) => {
  const m = s.match(/(KAVACH\/\d{4}\/\d{2})(?:\s+para\s+(\d+))?/);
  return { circular_no: m?.[1] ?? "", para_no: m?.[2] ?? "1" };
};

const rules: Array<RuleDTO & { versions: RuleVersionDTO[] }> = libRows.map((r) => {
  const cand = candidates.get(r.RULE_CANDIDATE_ID!);
  const c = citeParts(r.SOURCE_CITATION!);
  if (r.RULE_ID === "RL-d56abd69-8d77-4b26-bd04-4f5b06b6d0f0" || r.SOURCE_CITATION!.includes("amends")) c.para_no = "2";
  const para = chunk(c.circular_no, c.para_no);
  const plain = plainFor(r);
  const override = Object.entries(REVIEW_OVERRIDES).find(([k]) => r.RULE_ID!.startsWith(k))?.[1];
  const approvedBy = r.STATUS === "APPROVED" ? (r.APPROVED_BY === "smoke_test" || !r.APPROVED_BY ? REVIEWERS[hash(r.RULE_ID!) % 2]! : r.APPROVED_BY) : null;
  const quote = para?.text ?? cleanChunk(cand?.SOURCE_QUOTE ?? "");
  const firstSentence = quote.split(/(?<=\.)\s/)[0] ?? quote;
  const created = r.CREATED_AT ? Date.parse(r.CREATED_AT.replace(" ", "T") + "Z") : AS_OF - 3 * DAY;
  return {
    rule_id: r.RULE_ID!,
    rule_name: r.RULE_NAME!,
    version: Number(r.VERSION),
    typology: r.TYPOLOGY!,
    sql_text: r.SQL_TEXT!,
    status: r.STATUS!,
    source_citation: r.SOURCE_CITATION!,
    created_at: iso(Math.min(created, AS_OF - 2 * DAY)),
    plain_english: plain.en,
    plain_hindi: plain.hi,
    circular_no: c.circular_no,
    para_no: c.para_no,
    source_quote: quote,
    highlight: firstSentence.length > 220 ? firstSentence.slice(0, 220) : firstSentence,
    severity: (cand?.SEVERITY as Severity) || "MEDIUM",
    entity: r.ENTITY!,
    params: paramsFor(r),
    approved_by: approvedBy,
    rejection_reason: r.STATUS === "REJECTED" ? override?.reason ?? "Does not match the cited paragraph." : null,
    versions: [],
  };
});

// Seeded product-tour rule: compiled from KAVACH/2024/04 ¶3 when the tour "uploads" that circular.
{
  const para = chunk("KAVACH/2024/04", "3")!;
  rules.push({
    rule_id: "RL-tour-mule-2024-04-3",
    rule_name: "MULE_RING_KAVACH_2024_04_3",
    version: 1,
    typology: "MULE_RING",
    sql_text:
      "WITH shared AS (\n  SELECT d.DEVICE_ID, ARRAY_AGG(DISTINCT d.ACCOUNT_ID) AS accounts\n  FROM KAVACH_DB.CORE.DEVICES d GROUP BY d.DEVICE_ID\n  HAVING COUNT(DISTINCT d.ACCOUNT_ID) >= 2\n), groups AS (\n  SELECT rm.RING_ID, COUNT(DISTINCT rm.ACCOUNT_ID) AS members, SUM(t.AMOUNT_INR) AS monthly_flow\n  FROM KAVACH_DB.CORE.RING_MEMBERS rm\n  JOIN KAVACH_DB.CORE.TRANSACTIONS t ON t.ACCOUNT_ID = rm.ACCOUNT_ID\n  WHERE t.TXN_TS >= DATEADD('day', -30, CURRENT_TIMESTAMP())\n  GROUP BY rm.RING_ID\n)\nSELECT RING_ID, members, monthly_flow FROM groups\nWHERE members >= 5 AND monthly_flow > 2500000;",
    status: "PENDING_APPROVAL",
    source_citation: "KAVACH/2024/04 para 3",
    created_at: iso(AS_OF - 20 * 60_000),
    plain_english: RULE_PLAIN.MULE_RING_TOUR!.en,
    plain_hindi: RULE_PLAIN.MULE_RING_TOUR!.hi,
    circular_no: "KAVACH/2024/04",
    para_no: "3",
    source_quote: para.text,
    highlight: "5+ accounts sharing 2+ device identifiers process over Rs. 25,00,000 monthly",
    severity: "HIGH",
    entity: "ACCOUNT",
    params: [
      { key: "min_members", label: "Accounts in the group", label_hi: "समूह में खाते", unit: "count", value: 5, min: 3, max: 10, step: 1 },
      { key: "min_monthly_flow", label: "Money moved per month", label_hi: "हर महीने घुमाया गया पैसा", unit: "inr", value: 2_500_000, min: 500_000, max: 10_000_000, step: 500_000 },
    ],
    approved_by: null,
    rejection_reason: null,
    versions: [],
  });
  if (!para.text.includes(rules[rules.length - 1]!.highlight)) throw new Error("tour highlight missing");
}

for (const rule of rules) {
  rule.versions = [
    {
      version: rule.version,
      status: rule.status,
      created_at: rule.created_at,
      approved_by: rule.approved_by ?? null,
      change_summary: rule.version > 1 ? "Limit raised to ₹13 L–₹15 L after the 2025 amendment." : "First version, compiled from the circular.",
      change_summary_hi: rule.version > 1 ? "2025 संशोधन के बाद सीमा ₹13–15 लाख की गई।" : "पहला संस्करण, परिपत्र से बनाया गया।",
      source_citation: rule.source_citation,
    },
  ];
}
// Structuring history: v1 (2024/01 ¶2, superseded) → v2 (2025/01 amendment).
{
  const v1 = rules.find((r) => r.rule_id.startsWith("RL-a43a67c8"));
  const v2 = rules.find((r) => r.rule_id.startsWith("RL-d56abd69"));
  if (v1 && v2) v2.versions = [...v1.versions, ...v2.versions].sort((a, b) => a.version - b.version);
}

/* ── conflicts ── */
const conflicts: ConflictDTO[] = csv("RULE_CONFLICTS.csv").map((c) => {
  const side = (ruleId: string, citation: string) => {
    const rule = rules.find((r) => r.rule_id === ruleId);
    const cp = citeParts(citation);
    return {
      rule_id: ruleId,
      rule_name: rule?.rule_name ?? ruleId,
      citation,
      circular_no: cp.circular_no,
      para_no: cp.para_no,
      clause_text: chunk(cp.circular_no, cp.para_no)?.text ?? "",
      plain_english: rule?.plain_english ?? "",
    };
  };
  const a = side(c.RULE_ID_A!, c.CITATION_A!);
  const b = side(c.RULE_ID_B!, c.CITATION_B!);
  const contradiction = a.circular_no !== b.circular_no && (chunk(a.circular_no, a.para_no)?.is_amendment || chunk(b.circular_no, b.para_no)?.is_amendment);
  return {
    conflict_id: c.CONFLICT_ID!,
    typology: c.TYPOLOGY!,
    entity: c.ENTITY!,
    description: contradiction
      ? "The 2025 amendment changes the limit, but both versions of the check are still switched on."
      : "Both checks look at the same transactions but come from different paragraphs. Keep one, or merge them.",
    status: c.STATUS!,
    detected_at: iso(Math.min(Date.parse(c.DETECTED_AT!.replace(" ", "T") + "Z"), AS_OF - DAY)),
    kind: contradiction ? "contradiction" : "overlap",
    rule_a: a,
    rule_b: b,
  };
});

/* ── rule health ── */
const health: RuleHealthRowDTO[] = rules
  .filter((r) => r.status === "APPROVED" || r.status === "PENDING_APPROVAL")
  .map((r) => {
    const g = rng("health:" + r.rule_id);
    const alerts30 = r.typology === "CASH_REPORTING" ? g.int(180, 420) : r.typology === "KYC_CDD" ? g.int(60, 160) : g.int(8, 60);
    const precision = r.typology === "CASH_REPORTING" ? g.float(0.06, 0.18) : r.typology === "KYC_CDD" ? g.float(0.2, 0.35) : g.float(0.45, 0.82);
    const confirmed = Math.round(alerts30 * precision);
    const verdict: RuleHealthRowDTO["verdict"] = precision < 0.25 ? "noisy" : alerts30 < 10 ? "quiet" : "healthy";
    return {
      rule_id: r.rule_id,
      rule_name: r.rule_name,
      typology: r.typology,
      alerts_30d: alerts30,
      confirmed_30d: confirmed,
      precision: round(precision, 2),
      verdict,
      proposed_fix:
        verdict === "noisy"
          ? r.typology === "CASH_REPORTING"
            ? "Most of these are routine business deposits. Skip customers with a filed Cash Transaction Report this month."
            : "Only flag high-risk customers; medium-risk reminders can go to the branch instead."
          : undefined,
      proposed_fix_hi:
        verdict === "noisy"
          ? r.typology === "CASH_REPORTING"
            ? "इनमें से ज़्यादातर सामान्य व्यापारिक जमा हैं। जिन ग्राहकों की इस महीने नकद लेनदेन रिपोर्ट दाखिल हो चुकी है, उन्हें छोड़ें।"
            : "सिर्फ़ उच्च जोखिम वाले ग्राहकों को चिह्नित करें; मध्यम जोखिम के रिमाइंडर शाखा को भेजें।"
          : undefined,
    };
  });

const evalCoverage = csv("EVAL_TYPOLOGY_COVERAGE.csv").map((r) => ({
  typology: r.TYPOLOGY!,
  fraud_cases: Number(r.TEST_FRAUD_COUNT),
  caught_by_rules: Number(r.RULES_DETECTED),
  caught_in_top_50: Number(r.BLENDED_TOP50),
}));
const evalReport = csv("EVAL_REPORT.csv").find((r) => r.METHOD === "BLENDED")!;

/* ── product tour: a mule-ring alert that is open and due soon ── */
const tourRing = rings.find((r) => r.ring.confidence === "HIGH" && r.members.filter((m) => m.alert_id).length >= 2) ?? rings[0]!;
const tourAlert =
  alerts.find((a) => a.ring_id === tourRing.ring.ring_id && a.status !== "CLOSED" && !a.str_filed) ??
  alerts.find((a) => a.ring_id === tourRing.ring.ring_id)!;
tourAlert.status = "OPEN";
tourAlert.str_filed = false;
tourAlert.resolution = null;

/* ───────────────────────── write ───────────────────────── */
mkdirSync(OUT, { recursive: true });
mkdirSync(STATIC_OUT, { recursive: true });
const write = (dir: string, name: string, data: unknown) => writeFileSync(path.join(dir, name), JSON.stringify(data) + "\n");

write(STATIC_OUT, "reg_chunks.json", chunks);
write(OUT, "alerts.json", alerts);
write(OUT, "rings.json", rings);
write(OUT, "rules.json", rules);
write(OUT, "conflicts.json", conflicts);
write(OUT, "health.json", health);
write(OUT, "meta.json", {
  as_of: iso(AS_OF),
  tour: { alert_id: tourAlert.alert_id, ring_id: tourRing.ring.ring_id, rule_id: "RL-tour-mule-2024-04-3", circular_no: "KAVACH/2024/04" },
  eval: {
    coverage: evalCoverage,
    precision: Number(evalReport.PRECISION_VAL),
    recall: Number(evalReport.RECALL_VAL),
    test_set_size: Number(evalReport.TEST_SET_SIZE),
  },
});

/* ── report ── */
const byTyp = alerts.reduce<Record<string, number>>((acc, a) => ((acc[a.typology] = (acc[a.typology] ?? 0) + 1), acc), {});
const open = alerts.filter((a) => a.status !== "CLOSED");
console.log(`alerts ${alerts.length} (stories cleaned ${alerts.filter((a) => a.story_source === "cleaned").length}, template ${alerts.filter((a) => a.story_source === "template").length})`);
console.log("by typology", byTyp);
console.log(
  `open ${open.length} · new<24h ${alerts.filter((a) => AS_OF - Date.parse(a.created_at) < DAY).length} · overdue ${open.filter((a) => !a.str_filed && Date.parse(a.due_at!) < AS_OF).length} · due48h ${open.filter((a) => !a.str_filed && Date.parse(a.due_at!) >= AS_OF && Date.parse(a.due_at!) - AS_OF <= 48 * HOUR).length}`,
);
console.log(`rings ${rings.length} (${rings.map((r) => r.members.length).join(",")}) · rules ${rules.length} · conflicts ${conflicts.length} · chunks ${chunks.length}`);
console.log(`tour alert ${tourAlert.alert_id} (${tourAlert.customer_name}) ring ${tourRing.ring.ring_name}`);

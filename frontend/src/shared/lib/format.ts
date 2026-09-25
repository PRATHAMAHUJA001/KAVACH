/**
 * Formatting for humans: ₹ in lakh/crore, Indian digit grouping, "12 Sep 2026" dates,
 * and relative deadlines. Pure functions; `useFormat()` binds them to the active language.
 */
export type Lang = "en" | "hi";

const LAKH = 1e5;
const CRORE = 1e7;

const UNITS: Record<Lang, { lakh: string; crore: string }> = {
  en: { lakh: "L", crore: "Cr" },
  hi: { lakh: "लाख", crore: "करोड़" },
};

function trimDecimals(n: number, maxDecimals: number): string {
  const fixed = n.toFixed(maxDecimals);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

/** ₹12.4 L, ₹3.1 Cr, ₹48,500. */
export function formatMoneyCompact(amount: number, lang: Lang = "en"): string {
  const sign = amount < 0 ? "−" : "";
  const abs = Math.abs(amount);
  const u = UNITS[lang];
  if (abs >= CRORE) {
    const v = abs / CRORE;
    return `${sign}₹${trimDecimals(v, v >= 100 ? 0 : 1)} ${u.crore}`;
  }
  if (abs >= LAKH) {
    const v = abs / LAKH;
    return `${sign}₹${trimDecimals(v, v >= 10 ? 1 : 2)} ${u.lakh}`;
  }
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}

/** ₹12,40,500 (exact, Indian grouping, no paise unless present). */
export function formatMoneyExact(amount: number): string {
  const hasPaise = Math.round(amount * 100) % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: hasPaise ? 2 : 0,
  }).format(amount);
}

/** 1,24,500 */
export function formatNumber(n: number, maxDecimals = 0): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: maxDecimals });
}

export function formatPercent(fraction: number, maxDecimals = 0): string {
  return `${trimDecimals(fraction * 100, maxDecimals)}%`;
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_HI = ["जन", "फ़र", "मार्च", "अप्रै", "मई", "जून", "जुल", "अग", "सित", "अक्टू", "नव", "दिस"];

function toDate(d: string | number | Date): Date {
  return d instanceof Date ? d : new Date(d);
}

/** 12 Sep 2026 */
export function formatDate(d: string | number | Date, lang: Lang = "en"): string {
  const date = toDate(d);
  const m = (lang === "hi" ? MONTHS_HI : MONTHS_EN)[date.getMonth()];
  return `${date.getDate()} ${m} ${date.getFullYear()}`;
}

/** 12 Sep */
export function formatDayMonth(d: string | number | Date, lang: Lang = "en"): string {
  const date = toDate(d);
  const m = (lang === "hi" ? MONTHS_HI : MONTHS_EN)[date.getMonth()];
  return `${date.getDate()} ${m}`;
}

/** 14:32 */
export function formatTime(d: string | number | Date): string {
  const date = toDate(d);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** 12 Sep, 14:32 */
export function formatDateTime(d: string | number | Date, lang: Lang = "en"): string {
  return `${formatDayMonth(d, lang)}, ${formatTime(d)}`;
}

export type DeadlineStatus = "ok" | "attention" | "act" | "overdue";

export interface DeadlineInfo {
  status: DeadlineStatus;
  /** Positive = time left, negative = overdue. */
  msRemaining: number;
  /** "2 days", "5 hours", "40 min" — the magnitude only, for sentence templates. */
  span: string;
}

const SPANS: Record<Lang, { d: [string, string]; h: [string, string]; m: [string, string] }> = {
  en: { d: ["day", "days"], h: ["hour", "hours"], m: ["min", "min"] },
  hi: { d: ["दिन", "दिन"], h: ["घंटा", "घंटे"], m: ["मिनट", "मिनट"] },
};

export function formatSpan(ms: number, lang: Lang = "en"): string {
  const abs = Math.abs(ms);
  const s = SPANS[lang];
  const days = Math.floor(abs / 86_400_000);
  if (days >= 1) return `${days} ${days === 1 ? s.d[0] : s.d[1]}`;
  const hours = Math.floor(abs / 3_600_000);
  if (hours >= 1) return `${hours} ${hours === 1 ? s.h[0] : s.h[1]}`;
  const mins = Math.max(1, Math.floor(abs / 60_000));
  return `${mins} ${mins === 1 ? s.m[0] : s.m[1]}`;
}

/** Deadline bands: overdue < 0 ≤ act now < 48h ≤ needs attention < 5 days ≤ on track. */
export function deadlineInfo(dueAt: string | number | Date, now: Date = new Date(), lang: Lang = "en"): DeadlineInfo {
  const ms = toDate(dueAt).getTime() - now.getTime();
  const status: DeadlineStatus =
    ms < 0 ? "overdue" : ms < 48 * 3_600_000 ? "act" : ms < 5 * 86_400_000 ? "attention" : "ok";
  return { status, msRemaining: ms, span: formatSpan(ms, lang) };
}

/** "ROUND_TRIPPING" → "Round tripping" (fallback only — prefer i18n typology labels). */
export function humanizeCode(code: string): string {
  const s = code.replace(/[_-]+/g, " ").trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

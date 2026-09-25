import { delay, HttpResponse } from "msw";
import { formatMoneyCompact } from "@/shared/lib/format";

/** 150–400 ms, like a warm backend. */
export async function latency(min = 150, max = 400) {
  await delay(Math.round(min + Math.random() * (max - min)));
}

export function json<T>(data: T, init?: ResponseInit) {
  return HttpResponse.json(data as never, init);
}

export function notFound(what: string) {
  return HttpResponse.json({ detail: `${what} not found` }, { status: 404 });
}

export function forbidden() {
  return HttpResponse.json({ detail: "Your role has read-only access." }, { status: 403 });
}

export const money = (n: number) => formatMoneyCompact(n, "en");
export const moneyHi = (n: number) => formatMoneyCompact(n, "hi");

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function istDay(t: number): string {
  return new Date(t + 5.5 * HOUR).toISOString().slice(0, 10);
}

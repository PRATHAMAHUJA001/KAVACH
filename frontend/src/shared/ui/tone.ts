export type Tone = "brand" | "ok" | "warn" | "danger" | "info" | "neutral";

export const toneSoft: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-surface-2 text-muted",
};

export const toneText: Record<Tone, string> = {
  brand: "text-brand",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-muted",
};

export const toneBg: Record<Tone, string> = {
  brand: "bg-brand",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-muted",
};

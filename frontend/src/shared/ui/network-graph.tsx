import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import type { RiskLevel } from "./risk-meter";

export type LinkKind = "shared_phone" | "shared_ip" | "shared_device" | "sent_money";

export interface MiniGraphNode {
  id: string;
  label: string;
  riskLevel: RiskLevel;
  kind: "subject" | "member" | "external";
}
export interface MiniGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: LinkKind;
}

const W = 560;
const H = 260;
const MAX_OTHERS = 10;

const NODE_CLS: Record<RiskLevel, string> = {
  1: "fill-ok-soft stroke-ok",
  2: "fill-ok-soft stroke-ok",
  3: "fill-warn-soft stroke-warn",
  4: "fill-danger-soft stroke-danger",
  5: "fill-danger-soft stroke-danger",
};

function short(s: string, n = 16) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * The case file's "Who is connected" preview: the subject in the middle, linked
 * accounts around it, lines for shared phones/devices/IPs (dashed) and money (solid).
 * Deterministic layout, no physics — the full, draggable graph lives on Mule rings.
 */
export function MiniNetworkGraph({
  nodes,
  edges,
  onOpen,
  openLabel,
  className,
}: {
  nodes: MiniGraphNode[];
  edges: MiniGraphEdge[];
  /** Click anywhere → Mule rings. */
  onOpen?: () => void;
  openLabel?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const subject = nodes.find((n) => n.kind === "subject");
  const others = nodes.filter((n) => n !== subject);
  const shown = others.slice(0, MAX_OTHERS);
  const hidden = others.length - shown.length;

  const pos = new Map<string, { x: number; y: number }>();
  if (subject) pos.set(subject.id, { x: W / 2, y: H / 2 - 4 });
  shown.forEach((n, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(shown.length, 1);
    pos.set(n.id, { x: W / 2 + 205 * Math.cos(a), y: H / 2 - 4 + 88 * Math.sin(a) });
  });
  // One line per pair (money wins over shared-device/IP); when busy, only the subject's own links.
  const byPair = new Map<string, MiniGraphEdge>();
  for (const e of edges) {
    if (!pos.has(e.source) || !pos.has(e.target)) continue;
    const key = [e.source, e.target].sort().join("|");
    const prev = byPair.get(key);
    if (!prev || (e.kind === "sent_money" && prev.kind !== "sent_money")) byPair.set(key, e);
  }
  let drawn = [...byPair.values()];
  if (drawn.length > 14 && subject) drawn = drawn.filter((e) => e.source === subject.id || e.target === subject.id);
  const kinds = [...new Set(drawn.map((e) => e.kind))];
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;

  const svg = (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t("graph.summary", { count: others.length })}>
      {drawn.map((e) => {
        const a = pos.get(e.source)!;
        const b = pos.get(e.target)!;
        return (
          <line
            key={e.id}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            className={e.kind === "sent_money" ? "stroke-brand" : "stroke-border-strong"}
            strokeWidth={e.kind === "sent_money" ? 2 : 1.5}
            strokeDasharray={e.kind === "sent_money" ? undefined : "5 4"}
          />
        );
      })}
      {[...(subject ? [subject] : []), ...shown].map((n) => {
        const p = pos.get(n.id)!;
        const r = n.kind === "subject" ? 22 : 15;
        return (
          <g key={n.id}>
            {n.kind === "subject" && <circle cx={p.x} cy={p.y} r={r + 6} className="fill-brand-soft" />}
            {/* Opaque base so edges don't show through the translucent risk fill. */}
            <circle cx={p.x} cy={p.y} r={r} className="fill-surface" />
            <circle cx={p.x} cy={p.y} r={r} strokeWidth={n.kind === "subject" ? 2.5 : 1.75} className={NODE_CLS[n.riskLevel]} />
            <text
              x={p.x}
              // Nodes above the subject get their label on top, clear of the edge running down to it.
              y={n.kind !== "subject" && p.y < H / 2 - 20 ? p.y - r - 8 : p.y + r + 15}
              textAnchor="middle"
              paintOrder="stroke"
              strokeWidth={5}
              strokeLinejoin="round"
              className={cn("stroke-surface text-[12px]", n.kind === "subject" ? "fill-fg font-semibold" : "fill-muted")}
            >
              {short(n.label)}
            </text>
          </g>
        );
      })}
    </svg>
  );

  return (
    <div className={cn("space-y-3", className)}>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={openLabel}
          className="block w-full rounded-xl border border-border bg-surface-2/40 p-2 transition-colors hover:border-border-strong hover:bg-surface-2"
        >
          {svg}
        </button>
      ) : (
        <div className="rounded-xl border border-border bg-surface-2/40 p-2">{svg}</div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-muted">
        {kinds.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <svg width="22" height="6" aria-hidden>
              <line x1="0" y1="3" x2="22" y2="3" className={k === "sent_money" ? "stroke-brand" : "stroke-border-strong"} strokeWidth="2" strokeDasharray={k === "sent_money" ? undefined : "5 4"} />
            </svg>
            {t(`graph.edge.${k}`)}
          </span>
        ))}
        {hidden > 0 && <span>{t("graph.more", { count: hidden })}</span>}
      </div>
      <ul className="sr-only">
        {drawn.map((e) => (
          <li key={e.id}>{t("graph.link", { a: nameOf(e.source), b: nameOf(e.target), kind: t(`graph.edge.${e.kind}`) })}</li>
        ))}
      </ul>
    </div>
  );
}

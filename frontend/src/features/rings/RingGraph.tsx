import { memo, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Background, BaseEdge, Controls, EdgeLabelRenderer, Handle, MarkerType, Position, ReactFlow, useInternalNode, useNodesInitialized, useReactFlow,
  type Edge, type EdgeProps, type InternalNode, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { useFormat } from "@/shared/lib/i18n";
import { useTheme } from "@/shared/lib/theme";
import { prefersReducedMotion } from "@/shared/lib/motion";
import type { Graph, GraphNode } from "@/services/api";

const RISK_CLS: Record<number, string> = {
  1: "border-ok bg-ok-soft",
  2: "border-ok bg-ok-soft",
  3: "border-warn bg-warn-soft",
  4: "border-danger bg-danger-soft",
  5: "border-danger bg-danger-soft",
};
const ROLE_ORDER = { collector: 0, mule: 1, exit: 2 } as const;
/** Node circle diameter (size-11) and the gap between neighbours on the ring. */
const DOT = 44;
const STEP = 200;
const LABELLED_MONEY = 6;
/** How far a line bows out when money also flows back the other way. */
const BEND = 22;

type MemberData = { node: GraphNode; index: number; animate: boolean };
type LinkData = { amount?: number; kinds?: string[]; top?: boolean; bend?: number; hover?: string; tag?: string };

const MemberNode = memo(function MemberNode({ data }: NodeProps<Node<MemberData>>) {
  const { t } = useTranslation();
  const f = useFormat();
  const n = data.node;
  return (
    <Tooltip
      content={
        <div className="space-y-1 text-small">
          <p className="font-semibold">{f.text(n.label)}</p>
          {n.role && <p>{t(`rings.role.${n.role}`)}</p>}
          {n.city && <p className="opacity-80">{n.city}</p>}
          {n.moneyIn != null && <p>{t("rings.moneyIn", { amount: f.money(n.moneyIn) })}</p>}
          {n.moneyOut != null && <p>{t("rings.moneyOut", { amount: f.money(n.moneyOut) })}</p>}
          {n.alertId && <p className="font-medium">{t("rings.hasAlert")}</p>}
        </div>
      }
    >
      <div
        className={cn("relative size-11", data.animate && "anim-enter")}
        style={data.animate ? { animationDelay: `${data.index * 40}ms` } : undefined}
      >
        {/* Lines are drawn centre to centre by LinkEdge; the handles only have to exist. */}
        <Handle type="target" position={Position.Top} className="!top-1/2 !left-1/2 !size-px !min-h-0 !min-w-0 !border-0 !bg-transparent" />
        <span
          className={cn(
            "inline-flex size-11 items-center justify-center rounded-full border-2 text-small font-bold text-fg",
            RISK_CLS[n.riskLevel],
            n.alertId && "ring-4 ring-brand/25",
          )}
        >
          {n.role === "collector" ? "C" : n.role === "exit" ? "E" : ""}
        </span>
        <span className="absolute left-1/2 top-full mt-1 max-w-40 -translate-x-1/2 truncate whitespace-nowrap rounded bg-surface/90 px-1 text-center text-small font-medium text-fg">
          {f.text(n.label)}
        </span>
        <Handle type="source" position={Position.Bottom} className="!top-1/2 !left-1/2 !size-px !min-h-0 !min-w-0 !border-0 !bg-transparent" />
      </div>
    </Tooltip>
  );
});

const nodeTypes = { member: MemberNode };

const centre = (n: InternalNode) => ({
  x: n.internals.positionAbsolute.x + (n.measured.width ?? DOT) / 2,
  y: n.internals.positionAbsolute.y + (n.measured.height ?? DOT) / 2,
});

/** Centre-to-centre line, trimmed at both circles; bows out when a reverse transfer shares the pair. */
function LinkEdge({ id, source, target, markerEnd, style, label, data }: EdgeProps<Edge<LinkData>>) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  if (!s || !t) return null;
  const a = centre(s);
  const b = centre(t);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const bend = data?.bend ?? 0;
  // Control point off the midpoint, perpendicular to the line (a quadratic's midpoint sits at half of it).
  const c = { x: (a.x + b.x) / 2 - ((b.y - a.y) / len) * bend * 2, y: (a.y + b.y) / 2 + ((b.x - a.x) / len) * bend * 2 };
  const toward = (p: { x: number; y: number }, q: { x: number; y: number }, r: number) => {
    const d = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: p.x + ((q.x - p.x) / d) * r, y: p.y + ((q.y - p.y) / d) * r };
  };
  const from = toward(a, c, DOT / 2 + 2);
  const to = toward(b, c, DOT / 2 + (markerEnd ? 4 : 2));
  const path = `M ${from.x} ${from.y} Q ${c.x} ${c.y} ${to.x} ${to.y}`;
  const mid = { x: (from.x + 2 * c.x + to.x) / 4, y: (from.y + 2 * c.y + to.y) / 4 };
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={16} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute max-w-56 rounded-md border border-border bg-surface px-1.5 py-0.5 text-center text-[11px] font-semibold leading-tight text-fg shadow-sm"
            style={{ transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { link: LinkEdge };

const FIT = { padding: 0.3, maxZoom: 1.1 };

/** The built-in fitView can fire before the page transition settles; fit again once nodes are measured. */
function FitWhenReady() {
  const ready = useNodesInitialized();
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!ready) return;
    const id = requestAnimationFrame(() => void fitView(FIT));
    return () => cancelAnimationFrame(id);
  }, [ready, fitView]);
  return null;
}

/**
 * Members on a circle in the order the money travels (collector first, then along the largest
 * transfer out), so a loop reads as a clean polygon and most arrows only reach the next account.
 * Deterministic, so it never jumps.
 */
function layout(nodes: GraphNode[], money: { source: string; target: string; amount?: number }[]) {
  const out = new Map<string, { target: string; amount: number }[]>();
  for (const e of money) out.set(e.source, [...(out.get(e.source) ?? []), { target: e.target, amount: Number(e.amount ?? 0) }]);
  const order: string[] = [];
  const seen = new Set<string>();
  for (const start of nodes) {
    let cur: string | undefined = start.id;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      order.push(cur);
      cur = (out.get(cur) ?? []).filter((x) => !seen.has(x.target)).sort((x, y) => y.amount - x.amount || x.target.localeCompare(y.target))[0]?.target;
    }
  }
  const n = order.length;
  const step = n > 8 ? STEP * 0.75 : STEP;
  const radius = n <= 1 ? 0 : Math.max(step * 0.7, step / (2 * Math.sin(Math.PI / n)));
  const pos = new Map<string, { x: number; y: number }>();
  order.forEach((id, i) => {
    // Start on the left and go clockwise, so the flow reads left → right across the top.
    const angle = Math.PI + (2 * Math.PI * i) / Math.max(1, n);
    pos.set(id, { x: radius * Math.cos(angle) - DOT / 2, y: radius * Math.sin(angle) - DOT / 2 });
  });
  return pos;
}

export type LinkFilter = "money" | "shared" | "both";

export function RingGraph({ graph, height = 520, show = "money" }: { graph: Graph; height?: number; show?: LinkFilter }) {
  const { t } = useTranslation();
  const f = useFormat();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const animate = !prefersReducedMotion();

  const { nodes, edges } = useMemo(() => {
    const sorted = [...graph.nodes].sort((a, b) => (ROLE_ORDER[a.role ?? "mule"] - ROLE_ORDER[b.role ?? "mule"]) || a.id.localeCompare(b.id));
    const moneyEdges = graph.edges.filter((e) => e.kind === "sent_money");
    const pairs = new Set(moneyEdges.map((e) => `${e.source}|${e.target}`));
    const names = new Map(graph.nodes.map((n) => [n.id, f.text(n.label)]));
    const pos = layout(sorted, moneyEdges);
    const nodes: Node<MemberData>[] = sorted.map((n, index) => ({ id: n.id, type: "member", position: pos.get(n.id)!, data: { node: n, index, animate } }));
    // Shared device/IP links collapse to one dashed line per pair; money stays directed.
    const shared = new Map<string, Edge<LinkData>>();
    const money: Edge<LinkData>[] = [];
    for (const e of graph.edges) {
      if (e.kind === "sent_money") {
        money.push({
          id: e.id,
          source: e.source,
          target: e.target,
          markerEnd: { type: MarkerType.ArrowClosed, width: 11, height: 11, color: "var(--chart-1)" },
          style: { stroke: "var(--chart-1)", strokeWidth: 1.75 },
          data: {
            amount: e.amount,
            bend: pairs.has(`${e.target}|${e.source}`) ? BEND : 0,
            tag: e.amount != null ? f.money(Number(e.amount)) : undefined,
            hover: t("rings.edge.transfer", {
              from: names.get(e.source) ?? e.source,
              to: names.get(e.target) ?? e.target,
              amount: e.amount != null ? f.money(Number(e.amount)) : "",
            }),
          },
        });
      } else {
        const key = [e.source, e.target].sort().join("|");
        const prev = shared.get(key);
        const kinds = new Set([...(prev?.data?.kinds ?? []), e.kind]);
        shared.set(key, { id: `shared-${key}`, source: e.source, target: e.target, data: { kinds: [...kinds] }, style: { stroke: "var(--border-strong)", strokeWidth: 1.25, strokeDasharray: "5 4" } });
      }
    }
    const top = new Set([...money].sort((a, b) => Number(b.data?.amount ?? 0) - Number(a.data?.amount ?? 0)).slice(0, LABELLED_MONEY).map((e) => e.id));
    const edges: Edge<LinkData>[] = [...(show === "money" ? [] : shared.values()), ...(show === "shared" ? [] : money)].map((e) => ({ ...e, data: { ...e.data, top: top.has(e.id) } }));
    return { nodes, edges };
  }, [graph, animate, show, f, t]);

  // Lines carry just the amount (the arrow already says who sent it); hovering spells out sender and receiver.
  // In a busy ring the lines recede, and hovering an account brings forward only its own transfers.
  const busy = edges.length > 15;
  const labelled = edges.map((e) => {
    const isMoney = !String(e.id).startsWith("shared-");
    const touches = hoverNode != null && (e.source === hoverNode || e.target === hoverNode);
    const opacity = hoverNode ? (touches ? 1 : 0.08) : busy ? 0.45 : 1;
    const base = { ...e, style: { ...e.style, opacity, transition: "opacity 150ms" } };
    if (e.id === hoverEdge) {
      return { ...base, style: { ...base.style, opacity: 1 }, zIndex: 10, label: isMoney ? e.data?.hover : (e.data?.kinds ?? []).map((k) => t(`graph.edge.${k}`)).join(" · ") };
    }
    const tagged = isMoney && (hoverNode ? touches : e.data?.top);
    return tagged ? { ...base, zIndex: touches ? 5 : 0, label: e.data?.tag } : base;
  });

  return (
    <div style={{ height }} className="relative overflow-hidden rounded-xl border border-border bg-surface-2/30">
      <ReactFlow
        nodes={nodes}
        edges={labelled}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={theme}
        fitView
        fitViewOptions={FIT}
        minZoom={0.3}
        maxZoom={2}
        nodesConnectable={false}
        defaultEdgeOptions={{ type: "link" }}
        proOptions={{ hideAttribution: true }}
        onEdgeMouseEnter={(_, e) => setHoverEdge(e.id)}
        onEdgeMouseLeave={() => setHoverEdge(null)}
        onNodeMouseEnter={(_, n) => setHoverNode(n.id)}
        onNodeMouseLeave={() => setHoverNode(null)}
        onNodeClick={(_, n) => n.data.node.alertId && navigate(`/alerts?case=${encodeURIComponent(n.data.node.alertId)}`)}
        aria-label={t("rings.graphLabel", { count: graph.nodes.length })}
      >
        <Background gap={24} size={1} color="var(--chart-grid)" />
        <Controls showInteractive={false} position="bottom-right" fitViewOptions={FIT} />
        <FitWhenReady />
      </ReactFlow>
      <Legend />
    </div>
  );
}

function Legend() {
  const { t } = useTranslation();
  return (
    <div className="pointer-events-none absolute left-3 top-3 space-y-1.5 rounded-lg border border-border bg-surface/95 px-3 py-2 text-small text-muted shadow-sm">
      <p className="flex items-center gap-2">
        <svg width="24" height="8" aria-hidden>
          <line x1="0" y1="4" x2="18" y2="4" stroke="var(--chart-1)" strokeWidth="2" />
          <path d="M18 0 L24 4 L18 8 Z" fill="var(--chart-1)" />
        </svg>
        {t("rings.legend.money")}
      </p>
      <p className="flex items-center gap-2">
        <svg width="24" height="8" aria-hidden>
          <line x1="0" y1="4" x2="24" y2="4" stroke="var(--border-strong)" strokeWidth="2" strokeDasharray="5 4" />
        </svg>
        {t("rings.legend.shared")}
      </p>
      <p className="flex items-center gap-2">
        <span className="inline-block size-3 rounded-full border-2 border-danger bg-danger-soft" />
        <span className="inline-block size-3 rounded-full border-2 border-warn bg-warn-soft" />
        <span className="inline-block size-3 rounded-full border-2 border-ok bg-ok-soft" />
        {t("rings.legend.risk")}
      </p>
      <p className="flex items-center gap-2">
        <span className="inline-block size-3 rounded-full ring-4 ring-brand/25" />
        {t("rings.legend.alert")}
      </p>
    </div>
  );
}

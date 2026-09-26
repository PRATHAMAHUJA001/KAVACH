import { memo, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
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
const COL = 240;
const ROW = 96;
const MAX_ROWS = 5;
const LABELLED_MONEY = 6;

type MemberData = { node: GraphNode; index: number; animate: boolean };
type LinkData = { amount?: number; kinds?: string[]; top?: boolean };

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
        {/* Handles sit on the circle, so lines end at the account, not at the label box. */}
        <Handle type="target" position={Position.Left} className="!left-0 !size-1 !border-0 !bg-transparent" />
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
        <Handle type="source" position={Position.Right} className="!right-0 !size-1 !border-0 !bg-transparent" />
      </div>
    </Tooltip>
  );
});

const nodeTypes = { member: MemberNode };

/** Collector on the left, mules in the middle, exit on the right; deterministic, so it never jumps. */
function layout(nodes: GraphNode[]) {
  const byRole = { collector: [] as GraphNode[], mule: [] as GraphNode[], exit: [] as GraphNode[] };
  nodes.forEach((n) => byRole[n.role ?? "mule"].push(n));
  const muleCols = Math.max(1, Math.ceil(byRole.mule.length / MAX_ROWS));
  const pos = new Map<string, { x: number; y: number }>();
  const place = (list: GraphNode[], col: number, rows: number) =>
    list.forEach((n, i) => {
      const c = Math.floor(i / rows);
      const r = i % rows;
      const count = Math.min(rows, list.length - c * rows);
      pos.set(n.id, { x: (col + c) * COL, y: (r - (count - 1) / 2) * ROW });
    });
  place(byRole.collector, 0, MAX_ROWS);
  place(byRole.mule, byRole.collector.length ? 1 : 0, MAX_ROWS);
  place(byRole.exit, (byRole.collector.length ? 1 : 0) + muleCols, MAX_ROWS);
  return pos;
}

export type LinkFilter = "money" | "shared" | "both";

export function RingGraph({ graph, height = 520, show = "money" }: { graph: Graph; height?: number; show?: LinkFilter }) {
  const { t } = useTranslation();
  const f = useFormat();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const animate = !prefersReducedMotion();

  const { nodes, edges } = useMemo(() => {
    const sorted = [...graph.nodes].sort((a, b) => (ROLE_ORDER[a.role ?? "mule"] - ROLE_ORDER[b.role ?? "mule"]) || a.id.localeCompare(b.id));
    const pos = layout(sorted);
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
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "var(--chart-1)" },
          style: { stroke: "var(--chart-1)", strokeWidth: 1.75 },
          data: { amount: e.amount },
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
  }, [graph, animate, show]);

  const labelled = edges.map((e) => {
    const isMoney = !String(e.id).startsWith("shared-");
    const show = e.id === hoverEdge || (isMoney && e.data?.top);
    if (!show) return e;
    const label = isMoney
      ? t("rings.edge.sentAmount", { amount: e.data?.amount != null ? f.money(Number(e.data.amount)) : "" })
      : (e.data?.kinds ?? []).map((k) => t(`graph.edge.${k}`)).join(" · ");
    return { ...e, label, labelStyle: { fill: "var(--text)", fontSize: 11, fontWeight: 600 }, labelBgStyle: { fill: "var(--surface)" }, labelBgPadding: [4, 2] as [number, number], labelBgBorderRadius: 4 };
  });

  return (
    <div style={{ height }} className="relative overflow-hidden rounded-xl border border-border bg-surface-2/30">
      <ReactFlow
        nodes={nodes}
        edges={labelled}
        nodeTypes={nodeTypes}
        colorMode={theme}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        nodesConnectable={false}
        defaultEdgeOptions={{ type: "straight" }}
        proOptions={{ hideAttribution: true }}
        onEdgeMouseEnter={(_, e) => setHoverEdge(e.id)}
        onEdgeMouseLeave={() => setHoverEdge(null)}
        onNodeClick={(_, n) => n.data.node.alertId && navigate(`/alerts?case=${encodeURIComponent(n.data.node.alertId)}`)}
        aria-label={t("rings.graphLabel", { count: graph.nodes.length })}
      >
        <Background gap={24} size={1} color="var(--chart-grid)" />
        <Controls showInteractive={false} position="bottom-right" />
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

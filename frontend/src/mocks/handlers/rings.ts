import { http } from "msw";
import type { RingDetailDTO } from "@/services/api/dto";
import { getDb, maskName, mockRole } from "../db";
import { json, latency, notFound } from "../util";

export const ringHandlers = [
  http.get("/api/rings", async ({ request }) => {
    const db = await getDb();
    await latency();
    const u = new URL(request.url).searchParams;
    const page = Math.max(1, Number(u.get("page") ?? 1));
    const size = Math.max(1, Number(u.get("page_size") ?? 20));
    const rows = db.rings.map((r) => r.ring);
    return json({ rings: rows.slice((page - 1) * size, page * size), total: rows.length, page, page_size: size, total_pages: Math.ceil(rows.length / size) });
  }),

  http.get("/api/rings/:id", async ({ params }) => {
    const db = await getDb();
    await latency(200, 450);
    const r = db.rings.find((x) => x.ring.ring_id === params.id);
    if (!r) return notFound("Ring");
    const reviewer = mockRole() === "KAVACH_REVIEWER";
    const body: RingDetailDTO = {
      ring: r.ring,
      members: reviewer ? r.members.map((m) => ({ ...m, label: maskName(m.label), label_hi: maskName(m.label) })) : r.members,
      transactions: reviewer ? r.transactions.map((t) => ({ ...t, counterparty: maskName(t.counterparty) })) : r.transactions,
      edges: r.edges,
    };
    return json(body);
  }),
];

import { expect, test } from "@playwright/test";

/** Every mocked endpoint answers with the right shape, and the shell renders without console errors. */
test("mock backend + shell smoke", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/today");
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();

  const r = await page.evaluate(async () => {
    const j = async (u: string, init?: RequestInit) => {
      const res = await fetch(u, init);
      return { status: res.status, body: await res.json().catch(() => null) };
    };
    const post = (b: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    const home = await j("/api/home");
    const list = await j("/api/alerts?page_size=5");
    const id = list.body.alerts[0].alert_id;
    const detail = await j(`/api/alerts/${id}`);
    const ev = await j(`/api/alerts/${id}/evidence`, { method: "POST" });
    const ver = await j(`/api/alerts/${id}/verify`);
    const rings = await j("/api/rings");
    const ring = await j(`/api/rings/${rings.body.rings[0].ring_id}`);
    const rules = await j("/api/rules");
    const conf = await j("/api/rules/conflicts");
    const health = await j("/api/rules/health");
    const tun = await j("/api/time-machine/rules");
    const rep = await j("/api/time-machine/replay", post({ rule_id: "CORE-STRUCTURING", value: 800000 }));
    const para = await j("/api/circulars/paragraph?circular_no=KAVACH/2024/01&para_no=2");
    const search = await j("/api/search?q=patel");
    const why = await j("/api/why-not/TXN5500123");
    const ask = await fetch("/api/ask?stream=true", post({ question: "Which branches had the most high-risk alerts?" }));
    const sse = await ask.text();
    return {
      home: [home.status, home.body.readiness_score.score, home.body.kpis.new_alerts, home.body.attention.length, home.body.trend.length],
      list: [list.status, list.body.total],
      detail: [detail.status, detail.body.reasons.length, detail.body.timeline.length, !!detail.body.story_en],
      evidence: [ev.status, ev.body.sha256_hash?.length, ev.body.generation_ms > 0],
      verify: [ver.status, ver.body.verified],
      rings: [rings.status, rings.body.total, ring.body.members.length, ring.body.edges.length],
      rules: [rules.status, rules.body.total, conf.body.conflicts.length, health.body.rules.length],
      tm: [tun.body.rules.length, rep.body.proposed.alerts - rep.body.current.alerts, rep.body.proposed.fraud_caught - rep.body.current.fraud_caught, rep.body.proposed.analyst_hours - rep.body.current.analyst_hours],
      para: [para.status, para.body.before?.para_no, para.body.after?.para_no],
      search: [search.status, search.body.results.length],
      why: [why.status, why.body.rules_checked.length],
      ask: [ask.status, (sse.match(/event: text_delta/g) ?? []).length, sse.includes("event: done"), sse.includes('"verified_query":true')],
    };
  });
  console.log(JSON.stringify(r));
  expect(r.evidence[1]).toBe(64);
  expect(r.verify[1]).toBe(true);
  expect(r.tm.slice(1)).toEqual([15, 4, 11]);
  expect(r.ask[2]).toBe(true);
  expect(errors, errors.join("\n")).toEqual([]);
});

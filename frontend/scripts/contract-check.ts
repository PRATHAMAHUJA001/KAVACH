/**
 * Contract check: feeds responses produced by the real FastAPI routers (captured by
 * backend/tests/test_api_*.py into backend/tests/samples/) through the frontend's
 * adapters. Fails if the backend and the UI disagree about field names or types.
 *
 *   cd backend && python3 -m pytest tests -q && cd ../frontend && npm run contract
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import * as A from "../src/services/api/adapters";

const DIR = path.resolve(import.meta.dirname, "../../backend/tests/samples");
const checks: Record<string, (body: never) => string[]> = {
  "home.json": (body) => {
    const h = A.toHome(body);
    const errs: string[] = [];
    if (!(h.readiness.score >= 0 && h.readiness.score <= 100)) errs.push("readiness score out of range");
    if (!h.readiness.reason.hi) errs.push("missing Hindi readiness reason");
    if (!h.kpis) errs.push("kpis missing");
    if (h.trend.length !== 30 || h.trend.some((t) => t.fraud == null)) errs.push("trend must be 30 days with confirmed_fraud");
    if (!h.attention.length || h.attention.some((a) => !a.kind || !a.entityId)) errs.push("attention items malformed");
    if (h.attention.some((a) => (a.kind === "report_overdue" || a.kind === "report_due") && (!a.dueAt || !a.name?.en))) errs.push("report items need due_at and name");
    if (!h.brief?.text.en || !h.brief.text.hi) errs.push("weekly brief missing a language");
    if (!h.asOf) errs.push("as_of missing");
    return errs;
  },
};

let failed = 0;
if (!existsSync(DIR)) {
  console.error(`No samples at ${DIR}. Run the backend tests first.`);
  process.exit(1);
}
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
  const check = checks[file];
  if (!check) {
    console.log(`·  ${file}: no check defined`);
    continue;
  }
  const errs = check(JSON.parse(readFileSync(path.join(DIR, file), "utf8")) as never);
  if (errs.length) {
    failed++;
    console.error(`✗  ${file}\n   - ${errs.join("\n   - ")}`);
  } else console.log(`✓  ${file}`);
}
process.exit(failed ? 1 : 0);

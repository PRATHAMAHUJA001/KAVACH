/**
 * Screenshots of the public pages (landing + sign-in) for the README.
 *
 * These two pages sit outside the app shell and read live data from the backend
 * (deployment stats on the landing page, the persona list on the sign-in page),
 * so they are shot against a real running stack rather than the MSW mocks used
 * by screens.spec.ts.
 *
 *   backend on :8080, `npx vite preview --port 4173`, then:
 *   node e2e/public-shots.mjs
 */
import { chromium } from "@playwright/test";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:4173";
const OUT = path.resolve(process.cwd(), "../docs/screens");

const shots = [
  { name: "landing", url: "/", waitFor: "Turn regulatory circulars" },
  { name: "login", url: "/login", waitFor: "Sign in" },
];

const browser = await chromium.launch();
try {
  for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
      locale: "en-IN",
      timezoneId: "Asia/Kolkata",
    });
    await ctx.addInitScript((t) => {
      localStorage.setItem("kavach.theme", t);
      localStorage.setItem("kavach.lang", "en");
    }, theme);
    const page = await ctx.newPage();
    for (const s of shots) {
      await page.goto(BASE + s.url, { waitUntil: "networkidle" });
      await page.getByText(s.waitFor).first().waitFor({ timeout: 20_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(900);
      const file = path.join(OUT, `${s.name}-1440-${theme}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log("wrote", file);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

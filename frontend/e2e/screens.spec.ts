import { test } from "@playwright/test";
import path from "node:path";
import { SCREENS_DIR, THEMES, VIEWPORTS, setTheme, settle } from "./screens";

/** Visual QA: every page at 1280×800 and 1920×1080, light + dark → docs/screens/. */
const only = process.env.SCREENS_ONLY; // e.g. "styleguide"

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`${vp.name} ${theme}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      test("today", async ({ page }) => {
        test.skip(!!only && only !== "today");
        await setTheme(page, theme);
        await page.goto("/today?role=analyst");
        await page.getByRole("heading", { name: "Needs your attention" }).waitFor();
        await settle(page);
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(SCREENS_DIR, `today-${vp.name}-${theme}.png`), fullPage: true });
        if (vp.name === "1280") {
          await setTheme(page, theme, "hi");
          await page.goto("/today");
          await page.getByRole("heading", { name: "आपका ध्यान चाहिए" }).waitFor();
          await settle(page);
          await page.waitForTimeout(700);
          await page.screenshot({ path: path.join(SCREENS_DIR, `today-hindi-${vp.name}-${theme}.png`), fullPage: true });
        }
      });

      test("alerts", async ({ page }) => {
        test.skip(!!only && only !== "alerts");
        const shot = (name: string, full = false) =>
          page.screenshot({ path: path.join(SCREENS_DIR, `alerts-${name}-${vp.name}-${theme}.png`), fullPage: full });
        await setTheme(page, theme);
        await page.goto("/alerts?role=analyst");
        await page.getByRole("button", { name: /^Open case file for/ }).first().waitFor();
        await settle(page);
        await shot("list", true);

        // Why-not: a near miss, then a flagged transaction.
        await page.getByPlaceholder(/Transaction ID/).fill("TXN5500123");
        await page.getByRole("button", { name: "Check", exact: true }).click();
        await page.getByText("Checks that looked at it").waitFor();
        await settle(page);
        await shot("whynot");
        await page.reload();

        // Case file with connections: pick an alert that belongs to a ring.
        await page.goto("/alerts?role=analyst&typology=MULE_RING");
        await page.getByRole("button", { name: /^Open case file for/ }).first().click();
        await page.getByRole("heading", { name: "Who is connected" }).waitFor();
        await settle(page);
        await shot("case");
        const drawer = page.getByRole("dialog");
        await drawer.getByRole("heading", { name: "Who is connected" }).scrollIntoViewIfNeeded();
        await settle(page);
        await shot("case-connected");

        await drawer.getByRole("button", { name: "Download evidence pack" }).click();
        await drawer.getByText(/Generated in/).waitFor({ timeout: 15_000 });
        await drawer.getByRole("button", { name: "Verify evidence" }).click();
        await drawer.getByText(/Untouched since/).waitFor();
        await drawer.getByRole("heading", { name: "Evidence pack" }).scrollIntoViewIfNeeded();
        await settle(page);
        await shot("case-verified");

        await drawer.getByRole("button", { name: "Create draft report" }).click();
        await page.getByRole("dialog", { name: /Draft suspicious transaction report/ }).getByText(/SUSPICIOUS TRANSACTION REPORT/).waitFor();
        await settle(page);
        await shot("draft");
        await page.keyboard.press("Escape");

        if (vp.name === "1280") {
          await page.goto("/alerts?role=reviewer&typology=MULE_RING");
          await page.getByRole("button", { name: /^Open case file for/ }).first().click();
          await page.getByRole("heading", { name: "Who is connected" }).waitFor();
          await settle(page);
          await shot("reviewer");

          await setTheme(page, theme, "hi");
          await page.goto("/alerts?role=analyst&typology=MULE_RING");
          await page.getByRole("button", { name: /केस फ़ाइल खोलें$/ }).first().click();
          await page.getByRole("heading", { name: "कौन जुड़ा है" }).waitFor();
          await settle(page);
          await shot("hindi");
        }
      });

      test("ask", async ({ page }) => {
        test.skip(!!only && only !== "ask");
        const shot = (name: string, full = false) =>
          page.screenshot({ path: path.join(SCREENS_DIR, `ask-${name}-${vp.name}-${theme}.png`), fullPage: full });
        await setTheme(page, theme);
        await page.goto("/ask?role=analyst");
        await page.getByRole("heading", { name: "Ask anything in plain English." }).waitFor();
        await settle(page);
        await shot("empty");

        await page.getByRole("button", { name: "Which branches had the most high-risk alerts?" }).click();
        await page.getByText("Was this helpful?").waitFor({ timeout: 20_000 });
        await page.getByRole("button", { name: /Show the data/ }).click();
        await settle(page);
        await page.getByRole("button", { name: /Show the data/ }).scrollIntoViewIfNeeded();
        await shot("data");

        await page.getByPlaceholder(/Ask a question/).fill("What does the circular say about cash deposits near the reporting threshold?");
        await page.keyboard.press("Enter");
        await page.getByText("Was this helpful?").nth(1).waitFor({ timeout: 20_000 });
        await settle(page);
        await shot("circular");
      });

      test("rings", async ({ page }) => {
        test.skip(!!only && only !== "rings");
        await setTheme(page, theme);
        await page.goto("/rings?role=analyst");
        await page.locator(".react-flow__node").first().waitFor();
        await settle(page);
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(SCREENS_DIR, `rings-${vp.name}-${theme}.png`), fullPage: true });
        await page.locator(".react-flow__node").nth(2).hover();
        await page.getByRole("tooltip").first().waitFor();
        await page.screenshot({ path: path.join(SCREENS_DIR, `rings-hover-${vp.name}-${theme}.png`) });
      });

      test("rulebook", async ({ page }) => {
        test.skip(!!only && only !== "rulebook");
        const shot = (name: string, full = false) =>
          page.screenshot({ path: path.join(SCREENS_DIR, `rulebook-${name}-${vp.name}-${theme}.png`), fullPage: full });
        await setTheme(page, theme);
        await page.goto("/rulebook?role=analyst");
        await page.getByText("What the check does").waitFor();
        await settle(page);
        await shot("review", true);

        await page.locator('input[type="file"]').setInputFiles({ name: "KAVACH_2024_04.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 demo") });
        await page.getByText("Turning the circular into checks").waitFor();
        await page.waitForTimeout(2600);
        await shot("upload");
        await page.getByRole("button", { name: "Review them" }).click({ timeout: 15_000 });
        await settle(page);
        await shot("upload-review");

        await page.getByRole("tab", { name: /Conflicts/ }).click();
        await page.getByText(/Contradiction|Overlap/).first().waitFor();
        await settle(page);
        await shot("conflicts", true);
        await page.getByRole("tab", { name: "Rule health" }).click();
        await page.getByText("Each rule over the last 30 days").waitFor();
        await settle(page);
        await shot("health", true);
      });

      test("timemachine", async ({ page }) => {
        test.skip(!!only && only !== "timemachine");
        await setTheme(page, theme);
        await page.goto("/time-machine?role=analyst");
        await page.getByRole("slider").waitFor();
        await settle(page);
        await page.screenshot({ path: path.join(SCREENS_DIR, `timemachine-${vp.name}-${theme}.png`), fullPage: true });
        await page.getByRole("slider").focus();
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("ArrowLeft");
        await page.getByRole("button", { name: /Replay last 90 days/ }).click();
        await page.getByText("Review hours").first().waitFor({ timeout: 15_000 });
        await settle(page);
        await page.waitForTimeout(900);
        await page.screenshot({ path: path.join(SCREENS_DIR, `timemachine-result-${vp.name}-${theme}.png`), fullPage: true });
      });

      test("tour", async ({ page }) => {
        test.skip(!!only && only !== "tour");
        test.skip(vp.name !== "1280");
        await setTheme(page, theme);
        await page.goto("/today?role=analyst&tour=1");
        for (let i = 1; i <= 6; i++) {
          await page.getByText(`${i} of 6`).waitFor({ timeout: 15_000 });
          await settle(page);
          await page.screenshot({ path: path.join(SCREENS_DIR, `tour-${i}-${vp.name}-${theme}.png`) });
          if (i < 6) await page.keyboard.press("ArrowRight");
        }
        await page.getByRole("button", { name: "Done" }).click();
        await page.getByText("6 of 6").waitFor({ state: "detached" });
      });

      test("shell", async ({ page }) => {
        test.skip(!!only && only !== "shell");
        const shot = (name: string, full = false) =>
          page.screenshot({ path: path.join(SCREENS_DIR, `shell-${name}-${vp.name}-${theme}.png`), fullPage: full });
        await setTheme(page, theme);
        await page.goto("/today?role=analyst");
        await page.getByRole("heading", { level: 1, name: "Today" }).waitFor();
        await settle(page);
        await shot("base");

        await page.keyboard.press("/");
        await page.getByPlaceholder(/Type a name/).fill("patel");
        await page.getByText("Results").waitFor();
        await settle(page);
        await shot("search");
        await page.keyboard.press("Escape");
        await page.getByRole("dialog").waitFor({ state: "detached" });

        await page.keyboard.press("?");
        await page.getByRole("dialog", { name: "Keyboard shortcuts" }).waitFor();
        await settle(page);
        await shot("shortcuts");
        await page.keyboard.press("Escape");
        await page.getByRole("dialog").waitFor({ state: "detached" });

        await page.getByRole("button", { name: "Collapse sidebar" }).click();
        await settle(page);
        await shot("collapsed");
        await page.getByRole("button", { name: "Expand sidebar" }).click();

        await page.goto("/alerts?role=reviewer");
        await page.getByText(/Read-only access/).waitFor();
        await settle(page);
        await shot("reviewer");
        if (vp.name === "1280") {
          await setTheme(page, theme, "hi");
          await page.goto("/today?role=analyst");
          await page.getByRole("heading", { level: 1, name: "आज" }).waitFor();
          await settle(page);
          await shot("hindi");
          await setTheme(page, theme, "en");
          await page.goto("/today?cold=1");
          await page.getByText("Waking up the secure server…").waitFor();
          await page.waitForTimeout(2500);
          await shot("coldstart");
          await page.evaluate(() => sessionStorage.setItem("kavach.mockCold", "0"));
        }
      });

      test("styleguide", async ({ page }) => {
        test.skip(!!only && only !== "styleguide");
        await setTheme(page, theme);
        await page.goto("/styleguide");
        await settle(page);
        await page.screenshot({ path: path.join(SCREENS_DIR, `styleguide-${vp.name}-${theme}.png`), fullPage: true });

        await page.getByRole("button", { name: "Open a sample case file" }).click();
        await settle(page);
        await page.screenshot({ path: path.join(SCREENS_DIR, `styleguide-casedrawer-${vp.name}-${theme}.png`) });
        await page.keyboard.press("Escape");

        await page.getByRole("button", { name: /Open circular 2024\/01, paragraph 2/ }).first().click();
        await settle(page);
        await page.screenshot({ path: path.join(SCREENS_DIR, `styleguide-citation-${vp.name}-${theme}.png`) });
      });
    });
  }
}

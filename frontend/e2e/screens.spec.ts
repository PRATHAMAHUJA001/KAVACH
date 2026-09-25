import { test } from "@playwright/test";
import path from "node:path";
import { SCREENS_DIR, THEMES, VIEWPORTS, setTheme, settle } from "./screens";

/** Visual QA: every page at 1280×800 and 1920×1080, light + dark → docs/screens/. */
const only = process.env.SCREENS_ONLY; // e.g. "styleguide"

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`${vp.name} ${theme}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

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

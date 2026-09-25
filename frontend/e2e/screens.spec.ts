import { test } from "@playwright/test";
import path from "node:path";
import { SCREENS_DIR, THEMES, VIEWPORTS, setTheme, settle } from "./screens";

/** Visual QA: every page at 1280×800 and 1920×1080, light + dark → docs/screens/. */
const only = process.env.SCREENS_ONLY; // e.g. "styleguide"

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`${vp.name} ${theme}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

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

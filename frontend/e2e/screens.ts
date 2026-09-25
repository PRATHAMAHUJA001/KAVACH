import type { Page } from "@playwright/test";
import path from "node:path";

export const SCREENS_DIR = path.resolve(process.cwd(), "../docs/screens");
export const VIEWPORTS = [
  { name: "1280", width: 1280, height: 800 },
  { name: "1920", width: 1920, height: 1080 },
] as const;
export const THEMES = ["light", "dark"] as const;

export async function setTheme(page: Page, theme: "light" | "dark", lang: "en" | "hi" = "en") {
  await page.addInitScript(
    ([t, l]) => {
      localStorage.setItem("kavach.theme", t);
      localStorage.setItem("kavach.lang", l);
    },
    [theme, lang] as const,
  );
}

export async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
}

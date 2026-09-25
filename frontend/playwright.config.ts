import { defineConfig, devices } from "@playwright/test";

const PORT = 5199;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    reducedMotion: "reduce",
  },
  webServer: {
    command: `VITE_USE_MOCKS=true npx vite --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

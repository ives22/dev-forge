import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: "http://127.0.0.1:1430",
    trace: "on-first-retry"
  },
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 1430 --strictPort",
    url: "http://127.0.0.1:1430",
    reuseExistingServer: true,
    timeout: 120_000
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 920 } } },
    { name: "narrow", use: { ...devices["Desktop Chrome"], viewport: { width: 980, height: 720 } } }
  ]
});

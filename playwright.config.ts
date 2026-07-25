import { defineConfig } from "@playwright/test";

const live = process.env.E2E_LIVE === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: live ? 180_000 : 30_000,
  expect: { timeout: live ? 120_000 : 10_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }]
  ],
  use: {
    baseURL: "http://localhost:5173",
    channel: "chrome",
    headless: process.env.HEADED !== "1",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: [
    ...(live ? [{
      command: "pnpm --filter @rh-chain/api dev",
      url: "http://127.0.0.1:4000/readyz",
      reuseExistingServer: true,
      timeout: 120_000
    }] : []),
    {
      command: "pnpm --filter @rh-chain/web exec vite --host 127.0.0.1 --port 5173",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 120_000
    }
  ]
});

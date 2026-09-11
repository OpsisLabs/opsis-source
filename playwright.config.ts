import { defineConfig } from "@playwright/test";

const live = process.env.E2E_LIVE === "1";
const appPort = process.env.PW_APP_PORT ?? "5173";
const appOrigin = `http://localhost:${appPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: Number(process.env.PW_WORKERS ?? "1"),
  timeout: live ? 180_000 : 30_000,
  expect: { timeout: live ? 120_000 : 10_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }]
  ],
  use: {
    baseURL: appOrigin,
    channel: "chrome",
    headless: process.env.HEADED !== "1",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: [
    ...(live ? [{
      command: "pnpm --filter @rh-chain/api dev",
      url: "http://127.0.0.1:4000/readyz",
      reuseExistingServer: process.env.CHAINSCOUT_FEATURE_PREVIEW !== "1",
      timeout: 120_000
    }] : []),
    {
      command: `VITE_CLOUD_WORKSPACE_ENABLED=true pnpm --filter @rh-chain/web exec vite --host 127.0.0.1 --port ${appPort}`,
      url: appOrigin,
      reuseExistingServer: process.env.CHAINSCOUT_FEATURE_PREVIEW !== "1",
      timeout: 120_000
    }
  ]
});

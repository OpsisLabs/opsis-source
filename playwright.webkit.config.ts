import { defineConfig } from "@playwright/test";

const appPort = process.env.PW_APP_PORT ?? "5173";
const appOrigin = `http://localhost:${appPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: Number(process.env.PW_WORKERS ?? "1"),
  timeout: 45_000,
  expect: { timeout: 12_000 },
  reporter: [["list"]],
  use: {
    baseURL: appOrigin,
    browserName: "webkit",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: `VITE_CLOUD_WORKSPACE_ENABLED=true pnpm --filter @rh-chain/web exec vite --host 127.0.0.1 --port ${appPort}`,
    url: appOrigin,
      reuseExistingServer: process.env.OPSIS_FEATURE_PREVIEW !== "1",
    timeout: 120_000
  }
});

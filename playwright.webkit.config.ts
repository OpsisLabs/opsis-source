import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    browserName: "webkit",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "pnpm --filter @rh-chain/web exec vite --host 127.0.0.1 --port 5173",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 120_000
  }
});

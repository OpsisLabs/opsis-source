import { defineConfig } from "@playwright/test";

const disabledPort = process.env.PW_DISABLED_PORT ?? "5174";
const disabledOrigin = `http://localhost:${disabledPort}`;

const webkit = process.env.PW_BROWSER === "webkit";

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
    baseURL: disabledOrigin,
    browserName: webkit ? "webkit" : "chromium",
    ...(webkit ? {} : { channel: process.env.PW_BROWSER_CHANNEL ?? "chrome" }),
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `VITE_CLOUD_WORKSPACE_ENABLED=false VITE_COLLECTIBLE_CATALOG_ENABLED=false VITE_MARKET_INVENTORY_ENABLED=false VITE_REPLAY_ACTIONS_ENABLED=false VITE_OPEN_DATA_API_ENABLED=false pnpm --filter @rh-chain/web exec vite --host 127.0.0.1 --port ${disabledPort}`,
    url: disabledOrigin,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

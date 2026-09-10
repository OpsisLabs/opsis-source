import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PW_FEATURE_PORT ?? "5383");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid PW_FEATURE_PORT");
const features = [
  { source: "apps/web/src/approvals/ApprovalManager.tsx", flag: "VITE_APPROVAL_MANAGER_ENABLED", file: "e2e/vault.mock.spec.ts", grep: "approval manager" },
  { source: "apps/web/src/simulator/TradeSimulator.tsx", flag: "VITE_TRADE_SIMULATOR_ENABLED", file: "e2e/scout-swap.mock.spec.ts", grep: "trade simulator" },
  { source: "apps/web/src/deals/DealBrief.tsx", flag: "VITE_COLLECTIBLE_DEAL_FINDER_ENABLED", file: "e2e/vault.mock.spec.ts", grep: "deal finder" },
];
const baseEnv = { ...process.env, PW_APP_PORT: String(port), CHAINSCOUT_FEATURE_PREVIEW: "1" };
for (const feature of features) baseEnv[feature.flag] = "false";
for (const engine of ["chromium", "webkit"]) {
  const config = engine === "webkit" ? ["--config", "playwright.webkit.config.ts"] : [];
  for (const feature of features.filter(item => existsSync(join(root, item.source)))) {
    const result = spawnSync("pnpm", ["exec", "playwright", "test", ...config, feature.file, "--grep", feature.grep], {
      cwd: root, stdio: "inherit", env: { ...baseEnv, [feature.flag]: "true" },
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  if (existsSync(join(root, "e2e/deal-preview.mock.spec.ts"))) {
    const result = spawnSync("pnpm", ["exec", "playwright", "test", ...config, "e2e/deal-preview.mock.spec.ts"], {
      cwd: root, stdio: "inherit", env: baseEnv,
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}


import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PW_FEATURE_PORT ?? "5383");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid PW_FEATURE_PORT");
const features = [
  { source: "apps/web/src/opsis/OpsisApp.tsx", flag: "VITE_OPSIS_WORKSPACES_ENABLED", also: ["VITE_EXIT_CHECK_ENABLED", "VITE_SCOUT_WATCH_ENABLED"], file: "e2e/opsis.mock.spec.ts", grep: "opsis preview" },
  { source: "apps/web/src/kol/KolTracker.tsx", flag: "VITE_KOL_TRACKER_ENABLED", file: "e2e/kol-tracker.mock.spec.ts", grep: "kol tracker" },
  { source: "apps/web/src/stress/StressTest.tsx", flag: "VITE_PORTFOLIO_STRESS_TEST_ENABLED", file: "e2e/stress-test.mock.spec.ts", grep: "portfolio stress test" },
  { source: "apps/web/src/situation/SituationRoom.tsx", flag: "VITE_SITUATION_ROOM_ENABLED", file: "e2e/situation-room.mock.spec.ts", grep: "situation room" },
  { source: "apps/web/src/watch/ScoutWatch.tsx", flag: "VITE_SCOUT_WATCH_ENABLED", file: "e2e/scout-watch.mock.spec.ts", grep: "scout watch" },
  { source: "apps/web/src/deals/CardPriceCheck.tsx", flag: "VITE_CARD_PRICE_CHECK_ENABLED", file: "e2e/card-prices.mock.spec.ts", grep: "card price check" },
  { source: "apps/web/src/approvals/ApprovalManager.tsx", flag: "VITE_APPROVAL_MANAGER_ENABLED", file: "e2e/vault.mock.spec.ts", grep: "approval manager" },
  { source: "apps/web/src/simulator/TradeSimulator.tsx", flag: "VITE_TRADE_SIMULATOR_ENABLED", file: "e2e/scout-swap.mock.spec.ts", grep: "trade simulator" },
  { source: "apps/web/src/exit-check/ExitCheck.tsx", flag: "VITE_EXIT_CHECK_ENABLED", file: "e2e/exit-check.mock.spec.ts", grep: "exit check" },
  { source: "apps/web/src/deals/DealBrief.tsx", flag: "VITE_COLLECTIBLE_DEAL_FINDER_ENABLED", file: "e2e/vault.mock.spec.ts", grep: "deal finder" },
  { source: "apps/web/src/trades/BiggestTrades.tsx", flag: "VITE_OBSERVED_TRADES_ENABLED", also: ["VITE_SCOUT_WATCH_ENABLED"], file: "e2e/biggest-trades.mock.spec.ts", grep: "biggest observed trades" },
];
const baseEnv = { ...process.env, VITE_OPSIS_PUBLIC_ACCESS_ENABLED: "false", PW_APP_PORT: String(port), CHAINSCOUT_FEATURE_PREVIEW: "1" };
for (const feature of features) baseEnv[feature.flag] = "false";
for (const engine of ["chromium", "webkit"]) {
  const config = engine === "webkit" ? ["--config", "playwright.webkit.config.ts"] : [];
  const opsisClosed = spawnSync("pnpm", ["exec", "playwright", "test", ...config, "e2e/opsis.mock.spec.ts", "--grep", "closed by default"], { cwd: root, stdio: "inherit", env: baseEnv });
  if (opsisClosed.status !== 0) process.exit(opsisClosed.status ?? 1);
  const publicOpsis = spawnSync("pnpm", ["exec", "playwright", "test", ...config, "e2e/opsis-public.mock.spec.ts", "e2e/opsis-design.mock.spec.ts", "e2e/opsis-guide.mock.spec.ts", "e2e/opsis-wiring.mock.spec.ts", "e2e/opsis-controls.mock.spec.ts", "e2e/opsis-local-scenarios.mock.spec.ts", "e2e/opsis-quant.mock.spec.ts", "e2e/opsis-funding.mock.spec.ts", "e2e/opsis-basis.mock.spec.ts", "e2e/opsis-exit-curve.mock.spec.ts", "e2e/opsis-watch-inbox.mock.spec.ts", "e2e/community.mock.spec.ts", "e2e/opsis-front-door.mock.spec.ts", "e2e/opsis-shell.mock.spec.ts", "e2e/opsis-layout.mock.spec.ts", "e2e/opsis-watch-lab.mock.spec.ts"], {
    cwd: root, stdio: "inherit", env: { ...baseEnv, VITE_OPSIS_WORKSPACES_ENABLED: "true", VITE_OPSIS_PUBLIC_ACCESS_ENABLED: "true", VITE_SCOUT_WATCH_ENABLED: "true", VITE_EXIT_CHECK_ENABLED: "true", VITE_TRADE_SIMULATOR_ENABLED: "true", VITE_PORTFOLIO_STRESS_TEST_ENABLED: "true", VITE_SITUATION_ROOM_ENABLED: "true", VITE_OBSERVED_TRADES_ENABLED: "true" },
  });
  if (publicOpsis.status !== 0) process.exit(publicOpsis.status ?? 1);
  const stressClosed = spawnSync("pnpm", ["exec", "playwright", "test", ...config, "e2e/stress-test.mock.spec.ts", "--grep", "closed by default"], {cwd: root, stdio: "inherit", env: baseEnv});
  if (stressClosed.status !== 0) process.exit(stressClosed.status ?? 1);
  if (existsSync(join(root, "e2e/quant.mock.spec.ts"))) {
    const preserved = spawnSync("pnpm", ["exec", "playwright", "test", ...config, "e2e/quant.mock.spec.ts"], {
      cwd: root, stdio: "inherit", env: baseEnv,
    });
    if (preserved.status !== 0) process.exit(preserved.status ?? 1);
  }
  if (existsSync(join(root, "e2e/card-prices.mock.spec.ts"))) {
    const closed = spawnSync("pnpm", ["exec", "playwright", "test", ...config, "e2e/card-prices.mock.spec.ts", "--grep", "closed by default"], {
      cwd: root, stdio: "inherit", env: baseEnv,
    });
    if (closed.status !== 0) process.exit(closed.status ?? 1);
  }
  if (existsSync(join(root, "e2e/scout-watch.mock.spec.ts"))) {
    const closed = spawnSync("pnpm", ["exec", "playwright", "test", ...config, "e2e/scout-watch.mock.spec.ts", "--grep", "closed by default"], {
      cwd: root, stdio: "inherit", env: baseEnv,
    });
    if (closed.status !== 0) process.exit(closed.status ?? 1);
  }
  if (existsSync(join(root, "e2e/biggest-trades.mock.spec.ts"))) {
    const closed = spawnSync("pnpm", ["exec", "playwright", "test", ...config, "e2e/biggest-trades.mock.spec.ts", "--grep", "closed by default"], {
      cwd: root, stdio: "inherit", env: baseEnv,
    });
    if (closed.status !== 0) process.exit(closed.status ?? 1);
  }
  const kolClosed = spawnSync("pnpm", ["exec", "playwright", "test", ...config, "e2e/kol-tracker.mock.spec.ts", "--grep", "closed by default"], {cwd: root, stdio: "inherit", env: baseEnv});
  if (kolClosed.status !== 0) process.exit(kolClosed.status ?? 1);
  const situationClosed = spawnSync("pnpm", ["exec", "playwright", "test", ...config, "e2e/situation-room.mock.spec.ts", "--grep", "closed by default"], {cwd: root, stdio: "inherit", env: baseEnv});
  if (situationClosed.status !== 0) process.exit(situationClosed.status ?? 1);
  if (existsSync(join(root, "e2e/exit-check.mock.spec.ts"))) {
    const exitClosed = spawnSync("pnpm", ["exec", "playwright", "test", ...config, "e2e/exit-check.mock.spec.ts", "--grep", "closed by default"], { cwd: root, stdio: "inherit", env: baseEnv });
    if (exitClosed.status !== 0) process.exit(exitClosed.status ?? 1);
  }
  for (const feature of features.filter(item => existsSync(join(root, item.source)))) {
    const featureEnv = { ...baseEnv, [feature.flag]: "true" };
    for (const extraFlag of feature.also ?? []) featureEnv[extraFlag] = "true";
    const result = spawnSync("pnpm", ["exec", "playwright", "test", ...config, feature.file, "--grep", feature.grep], {
      cwd: root, stdio: "inherit", env: featureEnv,
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  if (existsSync(join(root, "e2e/biggest-trades.mock.spec.ts"))) {
    const followClosed = spawnSync("pnpm", ["exec", "playwright", "test", ...config, "e2e/biggest-trades.mock.spec.ts", "--grep", "hides the shared follow action"], {
      cwd: root, stdio: "inherit", env: { ...baseEnv, VITE_OBSERVED_TRADES_ENABLED: "true" },
    });
    if (followClosed.status !== 0) process.exit(followClosed.status ?? 1);
  }
  if (existsSync(join(root, "e2e/deal-preview.mock.spec.ts"))) {
    const result = spawnSync("pnpm", ["exec", "playwright", "test", ...config, "e2e/deal-preview.mock.spec.ts"], {
      cwd: root, stdio: "inherit", env: baseEnv,
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

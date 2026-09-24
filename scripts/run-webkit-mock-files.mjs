import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const files = [
  "e2e/private-mode.mock.spec.ts",
  "e2e/scout-swap.mock.spec.ts",
  "e2e/exit-check.mock.spec.ts",
  "e2e/vault.mock.spec.ts",
  "e2e/rwa.mock.spec.ts",
  "e2e/collectibles.mock.spec.ts",
  "e2e/market.mock.spec.ts",
  "e2e/replay.mock.spec.ts",
  "e2e/open-data.mock.spec.ts",
  "e2e/product-navigation.mock.spec.ts",
  "e2e/localization.mock.spec.ts",
  "e2e/launch-hardening.mock.spec.ts",
];

for (const [index, file] of files.entries()) {
  console.log(`\nWebKit mock file ${index + 1}/${files.length}: ${file}\n`);
  const result = spawnSync(
    "pnpm",
    ["exec", "playwright", "test", "--config", "playwright.webkit.config.ts", file],
    {
      cwd: repoRoot,
      env: { ...process.env, VITE_OPEN_DATA_API_ENABLED: "true" },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.signal) {
    process.kill(process.pid, result.signal);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`WebKit mock file failed: ${join(repoRoot, file)}`);
    process.exit(1);
  }
}

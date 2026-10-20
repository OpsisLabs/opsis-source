/** Operator-only live probe. Never imported by startup or tests.
 * From apps/api, with configured feature flags, explorer, dRPC and budget guards:
 * node --import tsx scripts/linked-wallets-probe.ts 0x<token-address>
 * Load environment separately if needed; no flags or spend guards are bypassed.
 */
import { performance } from "node:perf_hooks";
import Redis from "ioredis";
import { loadEnv } from "../src/config/env.js";
import { JsonCache } from "../src/cache/service.js";
import { createRobinhoodRpcSpendBudget } from "../src/chain/robinhood-rpc.js";
import { createLinkedWalletsBudget } from "../src/linked-wallets/budget.js";
import { LinkedWalletsService } from "../src/linked-wallets/service.js";
import { isAddress } from "../src/launches/reader.js";

const token = process.argv[2];
if (!isAddress(token) || /^0x0{40}$/i.test(token))
  throw new Error("Supply a nonzero token address");
const env = loadEnv(process.env);
if (env.ROBINHOOD_RPC_PROVIDER !== "drpc")
  throw new Error("Probe requires the configured dRPC provider");
if (env.RECEIPTS_ENABLED)
  throw new Error(
    "Run the probe with receipts disabled; it does not load signing material",
  );
const redis = env.REDIS_URL
  ? new Redis(env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    })
  : undefined;
try {
  if (redis) await redis.connect();
  const service = new LinkedWalletsService(env, new JsonCache(redis), {
    budget: createLinkedWalletsBudget(env, redis),
    rpcSpend: createRobinhoodRpcSpendBudget(env, redis),
  });
  const started = performance.now();
  const graph = await service.graph(token);
  process.stdout.write(
    JSON.stringify(
      {
        state: graph.state,
        servedFrom: graph.servedFrom,
        anchor: graph.anchor,
        groups: graph.groups,
        coverage: graph.coverage,
        notChecked: graph.notChecked,
        elapsedMs: Math.round(performance.now() - started),
        limits: graph.limits,
      },
      null,
      2,
    ) + "\n",
  );
} catch (error) {
  // Never print raw transport errors, configured endpoints or credentials.
  process.stderr.write(
    JSON.stringify({
      error: (error as { code?: string }).code ?? "PROBE_FAILED",
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  redis?.disconnect();
}

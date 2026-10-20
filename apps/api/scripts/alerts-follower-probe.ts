/** Operator-only live measurement. Never imported by startup or tests.
 * Run from apps/api with configured dRPC environment:
 * node --import tsx scripts/alerts-follower-probe.ts 10
 * Synthetic public addresses only; no database, Redis or Telegram transport.
 */
import { performance } from "node:perf_hooks";
import { loadEnv } from "../src/config/env.js";
import { AlertFollower } from "../src/alerts/follower.js";
import { RpcAlertSource } from "../src/alerts/source.js";
import { AlertCrypto } from "../src/alerts/crypto.js";
import type { AlertStore } from "../src/alerts/store.js";
import type { AlertRule, Delivery } from "../src/alerts/rules.js";
import type { Progress } from "../src/alerts/guards.js";

const polls = Number(process.argv[2] ?? "10");
if (!Number.isInteger(polls) || polls < 1 || polls > 1000)
  throw new Error("Use 1–1000 polls");
const env = loadEnv(process.env);
if (env.ROBINHOOD_RPC_PROVIDER !== "drpc")
  throw new Error("Probe requires the configured dRPC provider");
const now = new Date();
const crypto = new AlertCrypto(
  "probe-encryption-key-".repeat(2),
  "probe-index-key-".repeat(3),
);
const rules: AlertRule[] = [
  {
    id: "sample-rule",
    type: "transfer_above",
    watchedAddress: `0x${"2".repeat(40)}`,
    params: { token: `0x${"1".repeat(40)}`, amount: "100" },
    deliveryChannel: "telegram",
    deliveryRef: crypto.encrypt("12345"),
    deliveryHmac: crypto.index("12345"),
    cooldown: 60,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 30 * 86400000),
    lastFiredAt: null,
    lastObservedMultiplier: null,
    multiplierObservedAt: null,
    lastMultiplierBlockNumber: null,
    lastMultiplierBlockHash: null,
  },
];
const journal: Delivery[] = [];
const store: AlertStore = {
  create: async () => {
    throw new Error("Probe rule set is fixed");
  },
  list: async () => rules,
  active: async () => rules,
  get: async (id) => rules.find((r) => r.id === id) ?? null,
  remove: async () => 0,
  cleanup: async () => 0,
  events: async () => journal.map((r) => ({ ...r })),
  enqueue: async (value) => {
    if (
      journal.some(
        (r) => r.ruleId === value.ruleId && r.eventKey === value.eventKey,
      )
    )
      return false;
    if (journal.length >= 1000) throw new Error("ALERTS_CAPACITY_STOP");
    journal.push({
      ...value,
      id: `sample-delivery-${journal.length}`,
      state: "pending",
    });
    return true;
  },
  claim: async (value) => {
    const row = journal.find((r) => r.id === value.id);
    if (!row || row.state !== "pending") return false;
    row.state = "sent";
    return true;
  },
  claimCorrection: async (id) => {
    const row = journal.find((r) => r.id === id);
    if (!row || row.state !== "orphaned") return false;
    row.state = "corrected";
    return true;
  },
  mark: async (id, state) => {
    const row = journal.find((r) => r.id === id);
    if (row) row.state = state;
  },
  observeMultiplier: async () => {},
};
let progress: Progress | null = null,
  calls = 0,
  reservedUnits = 0;
const source = new RpcAlertSource(
  env,
  {
    reserve: async (units) => {
      // Preserve production method weights; the reported 20 CU/call is an estimate.
      if (reservedUnits + units > 200_000)
        throw new Error("ALERTS_BUDGET_STOP");
      reservedUnits += units;
    },
  },
  {
    reserve: async (n = 1) => {
      if (calls + n > env.ALERTS_DAILY_CALL_BUDGET)
        throw new Error("ALERTS_BUDGET_STOP");
      calls += n;
    },
  },
  async () => {},
);
const follower = new AlertFollower(
  {
    enabled: true,
    mode: "safe",
    explorer: env.ROBINHOOD_EXPLORER_URL,
    dailyCallBudget: env.ALERTS_DAILY_CALL_BUDGET,
  },
  store,
  source,
  {
    acquire: async () => true,
    renew: async () => true,
    release: async () => {},
  },
  {
    load: async () => progress,
    save: async (_mode, value) => {
      progress = value;
    },
  },
  { reserve: () => true, send: async () => {} },
);
const latency: number[] = [];
for (let i = 0; i < polls; i++) {
  const started = performance.now();
  await follower.poll();
  latency.push(performance.now() - started);
  if (follower.stopReason) break;
  if (i + 1 < polls)
    await new Promise((resolve) =>
      setTimeout(resolve, env.ALERTS_POLL_SECONDS * 1000),
    );
}
await follower.stop();
process.stdout.write(
  JSON.stringify(
    {
      polls: latency.length,
      syntheticRules: rules.length,
      perMethodCalls: source.calls,
      perMethodLatencyMs: source.latencyMs,
      pollLatencyMs: latency,
      estimatedComputeUnits:
        Object.values(source.calls).reduce((a, b) => a + b, 0) * 20,
      reservedComputeUnits: reservedUnits,
      stopReason: follower.stopReason,
      note: "20 CU per physical RPC call estimate; excludes other workloads and is not an account charge measurement.",
    },
    null,
    2,
  ) + "\n",
);

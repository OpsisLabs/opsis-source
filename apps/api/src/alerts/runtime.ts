import type Redis from "ioredis";
import type { Env } from "../config/env.js";
import type { RpcSpendBudget } from "../chain/robinhood-rpc.js";
import type { BotApiClient, TelegramBuckets } from "../telegram/service.js";
import { AlertCrypto } from "./crypto.js";
import { RedisAlertStore, checkAlertEvictionPolicy } from "./store.js";
import {
  RedisAlertLease,
  RedisAlertBudget,
  RedisAlertProgress,
} from "./guards.js";
import { RpcAlertSource } from "./source.js";
import { AlertCommands, TelegramAlertSender } from "./telegram.js";
import { AlertFollower } from "./follower.js";
export function createAlertsRuntime(
  env: Env,
  redis: Redis | undefined,
  spend: RpcSpendBudget,
  bot: BotApiClient | undefined,
  dispatch: TelegramBuckets,
) {
  if (!env.ALERTS_ENABLED) return undefined;
  if (!redis || !bot) throw new Error("ALERTS_STORAGE_OR_TELEGRAM_UNAVAILABLE");
  const crypto = new AlertCrypto(
    env.ALERTS_ENCRYPTION_KEY!,
    env.ALERTS_INDEX_KEY!,
  );
  const lease = new RedisAlertLease(redis);
  const store = new RedisAlertStore(redis, crypto, { leaseOwner: lease.owner });
  let follower: AlertFollower;
  const source = new RpcAlertSource(
    env,
    spend,
    new RedisAlertBudget(redis, env.ALERTS_DAILY_CALL_BUDGET),
    () => follower.checkLease(),
  );
  follower = new AlertFollower(
    {
      enabled: true,
      pollMs: env.ALERTS_POLL_SECONDS * 1000,
      dailyCallBudget: env.ALERTS_DAILY_CALL_BUDGET,
      mode: env.ALERTS_BLOCK_TAG,
      explorer: env.ROBINHOOD_EXPLORER_URL,
    },
    store,
    source,
    lease,
    new RedisAlertProgress(redis, lease.owner),
    new TelegramAlertSender(crypto, bot, dispatch),
  );
  return {
    follower,
    status: store.status,
    initialize: async (log: (message: string) => void) => {
      Object.assign(store.status, await checkAlertEvictionPolicy(redis, log));
    },
    commands: new AlertCommands(store, env.ALERTS_INDEX_KEY!),
  };
}

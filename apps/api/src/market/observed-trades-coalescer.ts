import { createHash, randomUUID } from "node:crypto";
import type Redis from "ioredis";
import { AppError } from "../http/errors.js";
import {
  clampWindowBlocks,
  resolvePair,
  type ObservedTradesInput,
  type ObservedTradesResponse,
  type ObservedTradesSource,
} from "./observed-trades.js";

const LOCK_TTL_MS = 60_000;
const RESULT_TTL_MS = 60_000;
const FOLLOWER_TIMEOUT_MS = 55_000;
const POLL_INTERVAL_MS = 40;
const RESULT_HANDOFF_MS = 100;
const LEASE_RENEW_INTERVAL_MS = 20_000;
const MAX_RESULT_BYTES = 512 * 1024;
const LOCK_PREFIX = "rh:observed-trades:lock:v1:";
const RESULT_PREFIX = "rh:observed-trades:result:v1:";

const READ_ACTIVE_RESULT = `
local owner = redis.call("GET", KEYS[1])
if not owner then return "__NO_ACTIVE_LOCK__" end
local payload = redis.call("GET", KEYS[2])
if not payload then return false end
local prefix = owner .. "\\n"
if string.sub(payload, 1, string.len(prefix)) ~= prefix then return false end
return string.sub(payload, string.len(prefix) + 1)
`;
const PUBLISH_ACTIVE_RESULT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
redis.call("SET", KEYS[2], ARGV[2], "PX", ARGV[3])
return 1
`;
const UNLOCK_IF_OWNER = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("DEL", KEYS[1], KEYS[2])
  return 1
end
return 0
`;
const RENEW_IF_OWNER = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return 0
`;

type RedisCoalescer = Pick<Redis, "set" | "eval">;

/** Shares only the result of a currently active operation across API replicas. */
export class RedisObservedTradesCoalescer implements ObservedTradesSource {
  constructor(
    private readonly source: ObservedTradesSource,
    private readonly redis: RedisCoalescer,
    private readonly minBlocks: number,
    private readonly maxBlocks: number,
    private readonly now: () => number = Date.now,
    private readonly pause: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async observe(input: ObservedTradesInput): Promise<ObservedTradesResponse> {
    const digest = keyDigest(input, this.minBlocks, this.maxBlocks);
    const lockKey = `${LOCK_PREFIX}${digest}`;
    const resultKey = `${RESULT_PREFIX}${digest}`;
    const deadline = this.now() + FOLLOWER_TIMEOUT_MS;
    let joinedExistingLock = false;

    while (this.now() < deadline) {
      if (!joinedExistingLock) {
        const owner = randomUUID();
        let acquired: string | null;
        try {
          acquired = await this.redis.set(lockKey, owner, "PX", LOCK_TTL_MS, "NX");
        } catch {
          throw unavailable();
        }
        if (acquired === "OK") return this.runAsOwner(input, lockKey, resultKey, owner);
        joinedExistingLock = true;
      }
      try {
        const payload = await this.redis.eval(READ_ACTIVE_RESULT, 2, lockKey, resultKey);
        if (payload === "__NO_ACTIVE_LOCK__") throw unavailable();
        if (typeof payload === "string") return decodeResult(payload);
        if (payload !== null && payload !== false && payload !== undefined)
          throw new Error("invalid Redis observed-trades result type");
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw unavailable();
      }
      await this.pause(POLL_INTERVAL_MS);
    }
    throw unavailable();
  }

  private async runAsOwner(
    input: ObservedTradesInput,
    lockKey: string,
    resultKey: string,
    owner: string,
  ): Promise<ObservedTradesResponse> {
    let heartbeat = Promise.resolve();
    const renewTimer = setInterval(() => {
      heartbeat = heartbeat.then(async () => {
        try {
          await this.redis.eval(RENEW_IF_OWNER, 1, lockKey, owner, String(LOCK_TTL_MS));
        } catch {
          // If Redis stays unavailable past the lease, cross-replica exclusion is lost.
        }
      });
    }, LEASE_RENEW_INTERVAL_MS);
    renewTimer.unref?.();
    try {
      let response: ObservedTradesResponse;
      try {
        response = await this.source.observe(input);
      } catch (error) {
        await this.publish(lockKey, resultKey, owner, "!failure");
        await this.pause(RESULT_HANDOFF_MS);
        throw error;
      }
      const serialized = JSON.stringify(response);
      if (Buffer.byteLength(serialized, "utf8") <= MAX_RESULT_BYTES) {
        await this.publish(lockKey, resultKey, owner, serialized);
        // Keep the lock alive briefly so followers already polling can observe the
        // result while this operation is still completing its shared response.
        await this.pause(RESULT_HANDOFF_MS);
      } else {
        // Followers must not turn an unshareable response into serial fresh scans.
        await this.publish(lockKey, resultKey, owner, "!failure");
        await this.pause(RESULT_HANDOFF_MS);
      }
      return response;
    } finally {
      clearInterval(renewTimer);
      // A delayed renewal is owner-token guarded and cannot extend a successor's lease.
      // Do not wait here: Redis may leave an eval pending indefinitely.
      try {
        await this.redis.eval(UNLOCK_IF_OWNER, 2, lockKey, resultKey, owner);
      } catch {
        // The bounded lock expires automatically; do not mask the source result.
      }
    }
  }

  private async publish(lockKey: string, resultKey: string, owner: string, payload: string): Promise<void> {
    try {
      await this.redis.eval(
        PUBLISH_ACTIVE_RESULT,
        2,
        lockKey,
        resultKey,
        owner,
        `${owner}\n${payload}`,
        String(RESULT_TTL_MS),
      );
    } catch {
      // The owner has its own result; followers fail closed or retry after unlock.
    }
  }
}

function keyDigest(input: ObservedTradesInput, minBlocks: number, maxBlocks: number): string {
  const pair = resolvePair(input.contract?.trim().toLowerCase());
  const windowBlocks = clampWindowBlocks(input.windowBlocks ?? maxBlocks, minBlocks, maxBlocks);
  const canonical = JSON.stringify({
    chainId: input.chainId,
    base: pair.base.address.toLowerCase(),
    quote: pair.quote.address.toLowerCase(),
    fee: input.fee ?? "all",
    windowBlocks,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function decodeResult(payload: string): ObservedTradesResponse {
  if (payload === "!failure") throw unavailable();
  if (Buffer.byteLength(payload, "utf8") > MAX_RESULT_BYTES) throw unavailable();
  try {
    const value: unknown = JSON.parse(payload);
    if (!isRecord(value) || value.schemaVersion !== 1 ||
      !["observed", "empty"].includes(String(value.state)) ||
      !isRecord(value.chain) || value.chain.id !== 4663 ||
      !isRecord(value.pair) || !isRecord(value.window) ||
      !isRecord(value.coverage) || !isRecord(value.classification) ||
      !Array.isArray(value.observations)) {
      throw new Error("malformed result");
    }
    return value as ObservedTradesResponse;
  } catch {
    throw unavailable();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unavailable(): AppError {
  return new AppError(
    "OBSERVED_TRADES_COALESCER_UNAVAILABLE",
    503,
    "The observed-trades request could not be safely coalesced",
  );
}

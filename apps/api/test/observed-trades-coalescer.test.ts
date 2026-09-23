import { describe, expect, it, vi } from "vitest";
import type { ObservedTradesInput, ObservedTradesResponse, ObservedTradesSource } from "../src/market/observed-trades.js";
import { RedisObservedTradesCoalescer } from "../src/market/observed-trades-coalescer.js";

const response = (id: string): ObservedTradesResponse => ({
  schemaVersion: 1, state: "empty",
  chain: { id: 4663, slug: "robinhood", name: "Robinhood Chain" },
  pair: { base: { address: "0x1", symbol: null, decimals: 18, reviewed: false }, quote: { address: "0x2", symbol: null, decimals: 18, reviewed: false }, pool: "0x3", fee: 500, factory: "0x4", factoryVerified: true },
  window: { fromBlock: 1, toBlock: 1, fromTime: null, toTime: "now", requestedBlocks: 1, blockCount: 1, capped: false, narrowed: false, notes: [] },
  coverage: { poolsRequested: 1, poolVerified: true, logsScanned: 0, matchedLogs: 0, topRows: 0, logCap: 10, blockCap: 50, logCapReached: false, rpcUnits: 1 },
  classification: { method: "uniswap_v3_swap_signed_amounts", transfersUsed: false }, observations: [],
  logIndex: 0, eventSender: null, eventRecipient: null, transactionSender: null, transactionSenderType: "unknown", blockTime: null,
  ...(id ? { marker: id } : {}),
} as ObservedTradesResponse);

class FakeRedis {
  readonly values = new Map<string, string>();
  readonly lockKeys: string[] = [];
  reads = 0;
  fail = false;
  corruptRead: unknown;
  heldOwner?: string;
  stalePayload?: string;
  dropLockAfterRead = false;
  hangRenewal = false;

  async set(key: string, value: string, _px: string, _ttl: number, _nx: string): Promise<string | null> {
    if (this.fail) throw new Error("redis offline");
    this.lockKeys.push(key);
    if (this.heldOwner) {
      this.values.set(key, this.heldOwner);
      if (this.stalePayload) this.values.set(key.replace(":lock:", ":result:"), this.stalePayload);
      return null;
    }
    if (this.corruptRead !== undefined) {
      this.values.set(key, "other-owner");
      return null;
    }
    if (this.values.has(key)) return null;
    this.values.set(key, value);
    return "OK";
  }

  async eval(script: string, _keys: number, lockKey: string, resultKey: string, ...args: string[]): Promise<unknown> {
    if (this.fail) throw new Error("redis offline");
    if (script.includes('PEXPIRE')) {
      if (this.hangRenewal) return new Promise(() => {});
      return this.values.get(lockKey) === resultKey ? 1 : 0;
    }
    if (script.includes('local owner')) {
      this.reads++;
      if (this.corruptRead !== undefined) return this.corruptRead;
      const owner = this.values.get(lockKey);
      if (!owner) return "__NO_ACTIVE_LOCK__";
      const payload = this.values.get(resultKey);
      const prefix = `${owner}\n`;
      const result = payload?.startsWith(prefix) ? payload.slice(prefix.length) : null;
      if (this.dropLockAfterRead) this.values.delete(lockKey);
      return result;
    }
    if (script.includes('ARGV[2]')) {
      if (this.values.get(lockKey) !== args[0]) return 0;
      this.values.set(resultKey, args[1]);
      return 1;
    }
    if (script.includes('DEL')) {
      if (this.values.get(lockKey) === args[0]) {
        this.values.delete(lockKey);
        this.values.delete(resultKey);
      }
      return 1;
    }
    throw new Error("unexpected script");
  }
}

const input: ObservedTradesInput = { chainId: 4663, contract: `0x${"aB".repeat(20)}`, fee: 500, windowBlocks: 100 };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}
function sourceWith(observe: ObservedTradesSource["observe"]): ObservedTradesSource { return { observe }; }
async function waitForReads(redis: FakeRedis, count: number) {
  for (let i = 0; i < 100 && redis.reads < count; i++) await new Promise((resolve) => setTimeout(resolve, 1));
}

describe("RedisObservedTradesCoalescer", () => {
  it("shares one active operation across instances, then captures fresh data", async () => {
    const redis = new FakeRedis();
    const gate = deferred<ObservedTradesResponse>();
    let calls = 0;
    const source = sourceWith(async () => { calls++; return gate.promise; });
    const a = new RedisObservedTradesCoalescer(source, redis as never, 50, 1000);
    const b = new RedisObservedTradesCoalescer(source, redis as never, 50, 1000);
    const first = a.observe(input);
    await Promise.resolve();
    const second = b.observe({ ...input, contract: input.contract!.toLowerCase() });
    await waitForReads(redis, 1);
    gate.resolve(response("first"));
    expect(await first).toMatchObject({ marker: "first" });
    expect(await second).toMatchObject({ marker: "first" });
    expect(calls).toBe(1);
    const third = await b.observe(input);
    expect(third).toMatchObject({ marker: "first" });
    expect(calls).toBe(2);
  });

  it("fails closed for concurrent followers after a winner failure without retrying the source", async () => {
    const redis = new FakeRedis();
    const gate = deferred<ObservedTradesResponse>();
    let calls = 0;
    const source = sourceWith(async () => { calls++; return gate.promise; });
    const a = new RedisObservedTradesCoalescer(source, redis as never, 50, 1000);
    const b = new RedisObservedTradesCoalescer(source, redis as never, 50, 1000);
    const winner = a.observe(input);
    const winnerFailure = expect(winner).rejects.toThrow("provider failed");
    await Promise.resolve();
    const followers = [b.observe(input), b.observe(input), b.observe(input)];
    const followerFailures = followers.map((follower) => expect(follower).rejects.toMatchObject({ statusCode: 503 }));
    await waitForReads(redis, 3);
    gate.reject(new Error("provider failed"));
    await winnerFailure;
    await Promise.all(followerFailures);
    expect(calls).toBe(1);
  });

  it("fails closed on Redis outage without calling the source", async () => {
    const redis = new FakeRedis(); redis.fail = true;
    let calls = 0;
    const coalescer = new RedisObservedTradesCoalescer(sourceWith(async () => { calls++; return response(""); }), redis as never, 50, 1000);
    await expect(coalescer.observe(input)).rejects.toMatchObject({ statusCode: 503 });
    expect(calls).toBe(0);
  });

  it.each(["not-json", "x".repeat(512 * 1024 + 1)])("rejects malformed or oversized follower results", async (payload) => {
    const redis = new FakeRedis();
    redis.corruptRead = payload;
    let calls = 0;
    const coalescer = new RedisObservedTradesCoalescer(sourceWith(async () => { calls++; return response(""); }), redis as never, 50, 1000);
    await expect(coalescer.observe(input)).rejects.toMatchObject({ statusCode: 503 });
    expect(calls).toBe(0);
  });

  it("uses bounded hashed keys from normalized public input", async () => {
    const redis = new FakeRedis();
    const coalescer = new RedisObservedTradesCoalescer(sourceWith(async () => response("")), redis as never, 50, 1000);
    await coalescer.observe(input);
    const first = redis.lockKeys[0]!;
    await coalescer.observe({ ...input, contract: input.contract!.toLowerCase() });
    expect(redis.lockKeys[1]).toBe(first);
    expect(first).toMatch(/^rh:observed-trades:lock:v1:[a-f0-9]{64}$/);
    expect(first).not.toContain(input.contract);
  });

  it("rejects an earlier owner's result after the lock has been replaced", async () => {
    const redis = new FakeRedis();
    redis.heldOwner = "new-owner";
    redis.stalePayload = `old-owner\n${JSON.stringify(response("stale"))}`;
    let now = 0;
    let calls = 0;
    const coalescer = new RedisObservedTradesCoalescer(
      sourceWith(async () => { calls++; return response("fresh"); }),
      redis as never,
      50,
      1000,
      () => now,
      async (ms) => { now += ms; },
    );
    await expect(coalescer.observe(input)).rejects.toMatchObject({ statusCode: 503 });
    expect(calls).toBe(0);
  });

  it("does not let a follower become a new owner after a handoff disappears", async () => {
    const redis = new FakeRedis();
    redis.dropLockAfterRead = true;
    let calls = 0;
    const coalescer = new RedisObservedTradesCoalescer(
      sourceWith(async () => { calls++; return response("fresh"); }),
      redis as never,
      50,
      1000,
    );
    const winner = coalescer.observe(input);
    await winner;
    // Seed another in-progress owner, then remove it during the first follower read.
    const lockKey = redis.lockKeys[0]!;
    redis.values.set(lockKey, "vanished-owner");
    const follower = coalescer.observe(input);
    await expect(follower).rejects.toMatchObject({ statusCode: 503 });
    expect(calls).toBe(1);
  });

  it("fails existing followers instead of rescanning when the winner result is oversized", async () => {
    const redis = new FakeRedis();
    const gate = deferred<ObservedTradesResponse>();
    let calls = 0;
    const source = sourceWith(async () => { calls++; return gate.promise; });
    const a = new RedisObservedTradesCoalescer(source, redis as never, 50, 1000);
    const b = new RedisObservedTradesCoalescer(source, redis as never, 50, 1000);
    const winner = a.observe(input);
    const follower = b.observe(input);
    const followerFailure = expect(follower).rejects.toMatchObject({ statusCode: 503 });
    await waitForReads(redis, 1);
    gate.resolve(response("x".repeat(512 * 1024)));
    await expect(winner).resolves.toMatchObject({ state: "empty" });
    await followerFailure;
    expect(calls).toBe(1);
  });

  it("does not wait indefinitely for a Redis lease renewal", async () => {
    const redis = new FakeRedis();
    redis.hangRenewal = true;
    const timer = vi.spyOn(globalThis, "setInterval").mockImplementation(((callback: TimerHandler) => {
      if (typeof callback === "function") queueMicrotask(callback);
      return 1;
    }) as typeof setInterval);
    try {
      const coalescer = new RedisObservedTradesCoalescer(
        sourceWith(async () => response("fast")),
        redis as never,
        50,
        1000,
        Date.now,
        async () => {},
      );
      await expect(coalescer.observe(input)).resolves.toMatchObject({ state: "empty" });
    } finally {
      timer.mockRestore();
    }
  }, 1000);
});

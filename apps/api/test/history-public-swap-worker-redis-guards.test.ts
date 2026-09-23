import { describe, expect, it, vi } from "vitest";
import { RedisHistoryWorkerLease, RedisRangeAttemptBudget } from "../src/history/public-swap-worker-redis-guards.js";
import type { WorkerRange } from "../src/history/public-swap-capture-worker.js";

const RANGE: WorkerRange = { chainId: 4663, poolAddress: "0x1111111111111111111111111111111111111111", source: "public-rpc", fromBlock: 1n, toBlock: 2n };

class FakeRedis {
  values = new Map<string, string>();
  expiry = new Map<string, number>();
  calls: Array<{ script: string; key: string; args: string[] }> = [];
  fail = false;
  malformed?: unknown;
  constructor(private readonly now = () => Date.now()) {}

  private live(key: string): string | undefined {
    const deadline = this.expiry.get(key);
    if (deadline !== undefined && deadline <= this.now()) { this.values.delete(key); this.expiry.delete(key); }
    return this.values.get(key);
  }

  async set(key: string, value: string, mode: string, ttl: number, condition: string): Promise<string | null> {
    if (this.fail) throw new Error("redis offline");
    if (mode !== "PX" || condition !== "NX") throw new Error("unexpected set arguments");
    if (this.live(key) !== undefined) return null;
    this.values.set(key, value); this.expiry.set(key, this.now() + ttl);
    return this.malformed === undefined ? "OK" : this.malformed as string;
  }

  async eval(script: string, keyCount: number, key: string, ...args: string[]): Promise<unknown> {
    if (this.fail) throw new Error("redis offline");
    if (keyCount !== 1) throw new Error("expected one key");
    this.calls.push({ script, key, args });
    if (this.malformed !== undefined) return this.malformed;
    if (script.includes("PEXPIRE")) {
      if (this.live(key) !== args[0]) return 0;
      this.expiry.set(key, this.now() + Number(args[1]));
      return 1;
    }
    if (script.includes('return redis.call("DEL", KEYS[1])')) {
      if (this.live(key) !== args[0]) return 0;
      this.values.delete(key); this.expiry.delete(key); return 1;
    }
    if (script.includes('redis.call("INCR", KEYS[1])')) {
      const current = Number(this.live(key) ?? 0);
      const cap = Number(args[0]);
      if (current >= cap) return 0;
      const next = current + 1;
      this.values.set(key, String(next));
      if (next === 1) this.expiry.set(key, this.now() + Number(args[1]) * 1000);
      return 1;
    }
    throw new Error("unknown script");
  }
}

describe("public Swap worker Redis guards", () => {
  it("acquires a UUID lease once and uses owner-safe renewal and release", async () => {
    const redis = new FakeRedis();
    const lease = new RedisHistoryWorkerLease(redis as never, 5_000);
    const owner = await lease.acquire("public-swap-capture-worker:4663");
    expect(owner).toMatch(/^[0-9a-f-]{36}$/i);
    expect(redis.calls).toHaveLength(0);
    expect(await lease.confirm("public-swap-capture-worker:4663", owner!)).toBe(true);
    expect(redis.calls[0]?.args).toEqual([owner, "5000"]);
    await lease.release("public-swap-capture-worker:4663", owner!);
    expect(await lease.confirm("public-swap-capture-worker:4663", owner!)).toBe(false);
  });

  it("does not acquire on contention or Redis/malformed SET responses", async () => {
    const redis = new FakeRedis(); const first = new RedisHistoryWorkerLease(redis);
    expect(await first.acquire("same-key")).toMatch(/^[0-9a-f-]{36}$/i);
    expect(await first.acquire("same-key")).toBeNull();
    const offline = new FakeRedis(); offline.fail = true;
    expect(await new RedisHistoryWorkerLease(offline).acquire("key")).toBeNull();
    const malformed = new FakeRedis(); malformed.malformed = "QUEUED";
    expect(await new RedisHistoryWorkerLease(malformed).acquire("key")).toBeNull();
  });

  it("rejects mismatched owner operations and confirms lease expiry", async () => {
    let time = 1000; const redis = new FakeRedis(() => time); const lease = new RedisHistoryWorkerLease(redis, 100);
    const owner = await lease.acquire("key");
    expect(await lease.confirm("key", "00000000-0000-4000-8000-000000000000")).toBe(false);
    await lease.release("key", "00000000-0000-4000-8000-000000000000");
    expect(await lease.confirm("key", owner!)).toBe(true);
    time += 101;
    expect(await lease.confirm("key", owner!)).toBe(false);
  });

  it("renews only for the owner and fails closed on malformed or unavailable Redis results", async () => {
    const redis = new FakeRedis(); const lease = new RedisHistoryWorkerLease(redis);
    const owner = await lease.acquire("key");
    redis.malformed = "bad";
    await expect(lease.confirm("key", owner!)).rejects.toThrow("Malformed");
    redis.malformed = undefined; redis.fail = true;
    await expect(lease.confirm("key", owner!)).rejects.toThrow("offline");
  });

  it("atomically caps UTC-day RANGE-ATTEMPT reservations and uses next-day expiry plus buffer", async () => {
    const now = new Date("2026-09-23T23:59:30.000Z"); const redis = new FakeRedis(() => now.getTime());
    const budget = new RedisRangeAttemptBudget(redis as never, 2, () => now);
    expect(await budget.reserve({ kind: "RANGE-ATTEMPT", range: RANGE })).toBe(true);
    expect(await budget.reserve({ kind: "RANGE-ATTEMPT", range: RANGE })).toBe(true);
    expect(await budget.reserve({ kind: "RANGE-ATTEMPT", range: RANGE })).toBe(false);
    expect(redis.calls.map((call) => call.key)).toEqual(Array(3).fill("rh:public-swap-history-range-attempt:v1:2026-09-23"));
    expect(redis.calls[0]?.args).toEqual(["2", String(30 + 3600)]);
    expect(redis.values.get(redis.calls[0]!.key)).toBe("2");
  });

  it("starts a new day key and throws on Redis errors or malformed budget replies", async () => {
    let now = new Date("2026-09-23T23:59:59.000Z"); const redis = new FakeRedis(() => now.getTime());
    const budget = new RedisRangeAttemptBudget(redis as never, 1, () => now);
    expect(await budget.reserve({ kind: "RANGE-ATTEMPT", range: RANGE })).toBe(true);
    now = new Date("2026-09-24T00:00:00.000Z");
    expect(await budget.reserve({ kind: "RANGE-ATTEMPT", range: RANGE })).toBe(true);
    expect(redis.calls[0]?.key).not.toBe(redis.calls[1]?.key);
    redis.fail = true;
    await expect(budget.reserve({ kind: "RANGE-ATTEMPT", range: RANGE })).rejects.toThrow("unavailable");
    const malformed = new FakeRedis(); malformed.malformed = "bad";
    await expect(new RedisRangeAttemptBudget(malformed as never, 1).reserve({ kind: "RANGE-ATTEMPT", range: RANGE })).rejects.toThrow("unavailable");
  });

  it("validates explicit safe configuration", () => {
    const redis = new FakeRedis();
    expect(() => new RedisHistoryWorkerLease(redis as never, 0)).toThrow("positive");
    for (const cap of [0, 1.5, 1001, Number.POSITIVE_INFINITY]) expect(() => new RedisRangeAttemptBudget(redis as never, cap)).toThrow("1 to 1000");
  });
});

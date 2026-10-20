import { describe, expect, it, vi } from "vitest";
import { AlertRedisFake } from "./support/alerts-redis.js";
import { AlertCrypto } from "../src/alerts/crypto.js";
import {
  RedisAlertStore,
  ALERTS_PREFIX,
  RULE_TTL,
  checkAlertEvictionPolicy,
  describeAlertsStorage,
} from "../src/alerts/store.js";
import {
  RedisAlertLease,
  RedisAlertBudget,
  RedisAlertProgress,
  LEASE_KEY,
} from "../src/alerts/guards.js";
import { AlertCommands } from "../src/alerts/telegram.js";
const crypto = new AlertCrypto("e".repeat(32), "i".repeat(32));
const input = {
  type: "transfer_above" as const,
  watchedAddress: `0x${"2".repeat(40)}`,
  params: { token: `0x${"1".repeat(40)}`, amount: "100" },
};
const now = new Date("2026-10-20T12:00:00Z");

describe("Redis alert key layout with an in-memory command fake", () => {
  it("stores encrypted references and lookup digest; native absolute TTLs bound every index and journal", async () => {
    const redis = new AlertRedisFake(+now),
      store = new RedisAlertStore(redis as never, crypto, {
        now: () => new Date(redis.time),
      });
    const rule = await store.create(input, "12345", now);
    const ruleKey = `${ALERTS_PREFIX}rule:${rule.id}`,
      chatKey = `${ALERTS_PREFIX}chat:${crypto.index("12345")}`;
    expect(
      crypto.decrypt(JSON.parse(redis.values.get(ruleKey)!).deliveryRef),
    ).toBe("12345");
    expect(redis.values.get(ruleKey)).not.toContain("12345");
    expect(redis.expiry.get(ruleKey)).toBe(+now + RULE_TTL);
    expect(redis.expiry.get(chatKey)).toBe(+now + RULE_TTL);
    expect(redis.expiry.get(`${ALERTS_PREFIX}active`)).toBe(+now + RULE_TTL);
    expect(redis.sets.get(chatKey)).toEqual(new Set([rule.id]));
    expect(await store.list("12345", now)).toEqual([rule]);
    expect(
      await store.enqueue({
        ruleId: rule.id,
        eventKey: "public-event:1",
        blockNumber: 10n,
        blockHash: `0x${"a".repeat(64)}`,
        mode: "safe",
        payload: {
          token: input.params.token,
          amount: "101",
          tx: null,
          detail: "Sample public event",
        },
      }),
    ).toBe(true);
    const [event] = await store.events();
    expect(event!.blockNumber).toBe(10n);
    expect(
      redis.values.get(`${ALERTS_PREFIX}journal:${event!.id}`),
    ).not.toMatch(/deliveryRef|deliveryHmac|chat/);
    expect(redis.expiry.get(`${ALERTS_PREFIX}journal:${event!.id}`)).toBe(
      +rule.expiresAt,
    );
    expect(redis.expiry.get(`${ALERTS_PREFIX}journals:${rule.id}`)).toBe(
      +rule.expiresAt,
    );
    expect(await store.remove("67890", rule.id)).toBe(0);
    expect(await store.remove("12345")).toBe(1);
    expect(redis.values.size + redis.sets.size + redis.sorted.size).toBe(0);
    expect(
      redis.operations.every(
        ([, count, prefix]) => count === 1 && prefix === ALERTS_PREFIX,
      ),
    ).toBe(true);
    expect(String(redis.operations[0]![0])).toContain("PEXPIREAT");
    expect(String(redis.operations[0]![0])).toContain("KEEPTTL");
  });
  it("cleans stale chat IDs and active members, and keeps the latest chat expiry", async () => {
    const redis = new AlertRedisFake(+now),
      store = new RedisAlertStore(redis as never, crypto);
    const first = await new RedisAlertStore(redis as never, crypto, {
      ttlMs: 10,
    }).create(input, "12345", now);
    const last = await store.create(input, "12345", now);
    redis.time += 10;
    expect(await store.get(first.id, new Date(redis.time))).toBeNull();
    expect(
      (await store.list("12345", new Date(redis.time))).map((r) => r.id),
    ).toEqual([last.id]);
    expect((await store.active(new Date(redis.time))).map((r) => r.id)).toEqual(
      [last.id],
    );
    expect(
      redis.expiry.get(`${ALERTS_PREFIX}chat:${crypto.index("12345")}`),
    ).toBe(+last.expiresAt);
    redis.time = +last.expiresAt;
    expect(await store.active(new Date(redis.time))).toEqual([]);
    expect(await store.list("12345", new Date(redis.time))).toEqual([]);
  });
  it("rejects retention over 30 days and serializes the chat limit in one script call", async () => {
    const redis = new AlertRedisFake(+now),
      store = new RedisAlertStore(redis as never, crypto);
    expect(
      () =>
        new RedisAlertStore(redis as never, crypto, { ttlMs: RULE_TTL + 1 }),
    ).toThrow("ALERTS_TTL_INVALID");
    for (let i = 0; i < 3; i++) await store.create(input, "12345", now);
    await expect(store.create(input, "12345", now)).rejects.toThrow(
      "ALERTS_RULE_LIMIT",
    );
    expect(
      redis.operations.filter((call) => call[3] === "create"),
    ).toHaveLength(4);
  });
  it("namespaces lease, UTC-day budget, cursor and recent hashes with bounded TTLs", async () => {
    const redis = {
      set: vi.fn(async () => "OK"),
      eval: vi.fn(async () => 1),
      get: vi.fn(async () => null),
    };
    const lease = new RedisAlertLease(redis as never);
    await lease.acquire();
    await lease.renew();
    await lease.release();
    await new RedisAlertBudget(redis as never, 100, () => now).reserve();
    const progress = new RedisAlertProgress(redis as never, lease.owner);
    await progress.load("safe");
    await progress.save("safe", {
      cursor: "10",
      recent: [{ number: "10", hash: `0x${"a".repeat(64)}` }],
    });
    expect(redis.set.mock.calls[0]?.[0]).toBe(LEASE_KEY);
    expect(LEASE_KEY).toBe(`${ALERTS_PREFIX}lease`);
    expect(redis.get).toHaveBeenCalledWith(`${ALERTS_PREFIX}cursor:safe`);
    expect(
      redis.eval.mock.calls.some((call) =>
        call.includes(`${ALERTS_PREFIX}budget:2026-10-20`),
      ),
    ).toBe(true);
    expect(String(redis.eval.mock.calls.at(-1)?.[0])).toContain('"EX",2592000');
  });
});

describe("Redis eviction policy admission", () => {
  it.each(["allkeys-lru", "volatile-lru", "allkeys-lfu", "volatile-ttl"])(
    "degrades for %s and only blocks creation",
    async (policy) => {
      const config = vi.fn(async () => ["maxmemory-policy", policy]),
        log = vi.fn();
      const status = await checkAlertEvictionPolicy({ config } as never, log);
      expect(config.mock.calls[0]).toEqual(["GET", "maxmemory-policy"]);
      expect(status).toMatchObject({
        state: "degraded",
        reason: "REDIS_EVICTION_POLICY",
        config: { readable: true, maxmemoryPolicy: policy },
      });
      const redis = new AlertRedisFake(+now),
        store = new RedisAlertStore(redis as never, crypto);
      const rule = await store.create(input, "12345", now);
      Object.assign(store.status, status);
      const commands = new AlertCommands(store, "s".repeat(32), () => now);
      expect(
        await commands.execute(
          `/alert approval ${input.watchedAddress}`,
          67890,
          false,
        ),
      ).toContain("REDIS_EVICTION_POLICY");
      expect(await store.list("12345", now)).toHaveLength(1);
      expect(await store.remove("12345", rule.id)).toBe(1);
      expect(log).not.toHaveBeenCalled();
    },
  );
  it("accepts noeviction; logs a fixed message and continues if CONFIG is disabled", async () => {
    const log = vi.fn();
    expect(
      await checkAlertEvictionPolicy(
        {
          config: vi.fn(async () => ["maxmemory-policy", "noeviction"]),
        } as never,
        log,
      ),
    ).toMatchObject({ state: "ready", reason: null });
    expect(
      await checkAlertEvictionPolicy(
        {
          config: vi.fn(async () => {
            throw new Error("untrusted provider payload");
          }),
        } as never,
        log,
      ),
    ).toMatchObject({
      state: "ready",
      reason: null,
      config: { readable: false, maxmemoryPolicy: null },
    });
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).not.toContain("untrusted provider payload");
  });
});

describe("Redis persistence admission and the status line", () => {
  const configFrom = (values: Record<string, string>) =>
    vi.fn(async (_op: string, key: string) => {
      if (!(key in values)) throw new Error("disabled");
      return [key, values[key]];
    });
  it("degrades when neither AOF nor RDB snapshots are on", async () => {
    const status = await checkAlertEvictionPolicy(
      {
        config: configFrom({
          "maxmemory-policy": "noeviction",
          appendonly: "no",
          save: "",
        }),
      } as never,
      vi.fn(),
    );
    expect(status).toEqual({
      state: "degraded",
      reason: "REDIS_PERSISTENCE_OFF",
      config: {
        readable: true,
        maxmemoryPolicy: "noeviction",
        appendonly: "no",
        save: "",
      },
    });
    expect(describeAlertsStorage(status)).toBe(
      'Redis check: maxmemory-policy=noeviction; appendonly=no; save=""',
    );
  });
  it.each([
    [{ appendonly: "yes", save: "" }],
    [{ appendonly: "no", save: "3600 1 300 100 60 10000" }],
  ])("is ready with noeviction and persistence %j", async (persistence) => {
    const status = await checkAlertEvictionPolicy(
      {
        config: configFrom({ "maxmemory-policy": "noeviction", ...persistence }),
      } as never,
      vi.fn(),
    );
    expect(status.state).toBe("ready");
    expect(describeAlertsStorage(status)).toContain(
      `appendonly=${persistence.appendonly}`,
    );
  });
  it("reports unreadable persistence settings without degrading", async () => {
    const status = await checkAlertEvictionPolicy(
      { config: configFrom({ "maxmemory-policy": "noeviction" }) } as never,
      vi.fn(),
    );
    expect(status.state).toBe("ready");
    expect(describeAlertsStorage(status)).toBe(
      "Redis check: maxmemory-policy=noeviction; appendonly=unreadable; save=unreadable",
    );
    expect(describeAlertsStorage(undefined)).toBe("Redis check: not run");
    expect(
      describeAlertsStorage({
        state: "ready",
        reason: null,
        config: { readable: false, maxmemoryPolicy: null, appendonly: null, save: null },
      }),
    ).toBe("Redis check: REDIS_CONFIG_UNREADABLE");
  });
  it("refuses new rules in Telegram when persistence is off", async () => {
    const redis = new AlertRedisFake(+now),
      store = new RedisAlertStore(redis as never, crypto);
    Object.assign(store.status, {
      state: "degraded",
      reason: "REDIS_PERSISTENCE_OFF",
    });
    const commands = new AlertCommands(store, "s".repeat(32), () => now);
    expect(
      await commands.execute(`/alert approval ${input.watchedAddress}`, 67890, false),
    ).toContain("Alerts degraded: REDIS_PERSISTENCE_OFF");
  });
});

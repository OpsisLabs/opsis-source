import Redis from "ioredis";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AlertCrypto } from "../src/alerts/crypto.js";
import {
  RedisAlertStore,
  ALERTS_PREFIX,
  RULE_TTL,
  checkAlertEvictionPolicy,
} from "../src/alerts/store.js";
import { AlertCommands } from "../src/alerts/telegram.js";
import {
  RedisAlertLease,
  RedisAlertProgress,
  LEASE_KEY,
} from "../src/alerts/guards.js";
import { AlertFollower } from "../src/alerts/follower.js";
import type { Delivery } from "../src/alerts/rules.js";

const url = process.env.ALERTS_IT_REDIS_URL;
// Explicit disposable loopback Redis 7, DB 15 only. Never flush another database.
if (url) {
  const parsed = new URL(url);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
    parsed.protocol !== "redis:" ||
    parsed.pathname !== "/15"
  )
    throw new Error(
      "Alerts integration requires disposable loopback Redis DB 15",
    );
}
const crypto = new AlertCrypto("e".repeat(32), "i".repeat(32));
const input = {
  type: "approval_unverified" as const,
  watchedAddress: `0x${"2".repeat(40)}`,
  params: {},
};
const hash = `0x${"a".repeat(64)}`;
const notice = (
  id: string,
  eventKey = "sample-event",
): Omit<Delivery, "id" | "state"> => ({
  ruleId: id,
  eventKey,
  blockNumber: 1n,
  blockHash: hash,
  mode: "safe",
  payload: {
    token: input.watchedAddress,
    amount: "1",
    detail: "Sample public event",
    tx: null,
  },
});
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!url)("alerts real disposable Redis 7 integration", () => {
  let redis: Redis;
  let store: RedisAlertStore;
  let ownsStore = false;
  const clear = async () => {
    const keys = await redis.keys(`${ALERTS_PREFIX}*`);
    if (keys.length) await redis.del(...keys);
  };
  beforeAll(async () => {
    redis = new Redis(url!, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    expect(await redis.dbsize(), "integration Redis DB must be empty").toBe(0);
    expect(await redis.info("server")).toMatch(
      /redis_version:(?:[7-9]|[1-9][0-9]+)\./,
    );
    ownsStore = true;
  });
  beforeEach(async () => {
    await clear();
    store = new RedisAlertStore(redis, crypto);
  });
  afterAll(async () => {
    if (redis) {
      if (ownsStore) await clear();
      await redis.quit();
    }
  });

  it("commands create/list/stop/delete-my-data remove journals and every index atomically", async () => {
    let time = Date.now();
    const commands = new AlertCommands(
      store,
      "s".repeat(32),
      () => new Date(time),
    );
    expect(
      await commands.execute(
        `/alert approval ${input.watchedAddress}`,
        12345,
        false,
      ),
    ).toContain("created");
    const [rule] = await store.list("12345", new Date());
    expect(await commands.execute("/alerts", 12345, false)).toContain(rule!.id);
    expect(crypto.decrypt(rule!.deliveryRef)).toBe("12345");
    expect(await redis.get(`${ALERTS_PREFIX}rule:${rule!.id}`)).not.toContain(
      '"deliveryRef":"12345"',
    );
    await store.enqueue(notice(rule!.id));
    expect(await store.remove("67890", rule!.id)).toBe(0);
    expect(
      await commands.execute(`/alerts stop ${rule!.id}`, 12345, false),
    ).toContain("1 alert");
    expect(await redis.keys(`${ALERTS_PREFIX}*`)).toEqual([]);
    time += 1000;
    await commands.execute(
      `/alert approval ${input.watchedAddress}`,
      12345,
      false,
    );
    expect(await commands.execute("/alerts stop all", 12345, false)).toContain(
      "1 alert",
    );
    time += 1000;
    await commands.execute(
      `/alert approval ${input.watchedAddress}`,
      12345,
      false,
    );
    expect(
      await commands.execute("/alerts delete-my-data", 12345, false),
    ).toContain("deleted");
    expect(await redis.keys(`${ALERTS_PREFIX}*`)).toEqual([]);
  });
  it("native TTL deletes rule, journal and indexes while no follower runs; firing never extends it", async () => {
    store = new RedisAlertStore(redis, crypto, { ttlMs: 700 });
    const now = new Date();
    const rule = await store.create(input, "12345", now);
    await store.enqueue(notice(rule.id));
    const [event] = await store.events();
    const ttl = await redis.pttl(`${ALERTS_PREFIX}rule:${rule.id}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(700);
    expect(await store.claim(event!, new Date())).toBe(true);
    await store.observeMultiplier(rule.id, "2", new Date(), {
      number: 1n,
      hash,
    });
    expect(
      await redis.pttl(`${ALERTS_PREFIX}rule:${rule.id}`),
    ).toBeLessThanOrEqual(ttl);
    await sleep(750);
    expect(await redis.keys(`${ALERTS_PREFIX}*`)).toEqual([]);
  });
  it("chat index expires at its latest rule; stale rule IDs are cleaned from chat and active indexes", async () => {
    const first = await new RedisAlertStore(redis, crypto, {
      ttlMs: 700,
    }).create(input, "12345", new Date());
    const last = await store.create(input, "12345", new Date());
    expect(
      await redis.pttl(`${ALERTS_PREFIX}chat:${crypto.index("12345")}`),
    ).toBeGreaterThan(RULE_TTL - 1000);
    await redis.del(`${ALERTS_PREFIX}rule:${first.id}`);
    expect((await store.list("12345", new Date())).map((r) => r.id)).toEqual([
      last.id,
    ]);
    expect(
      await redis.smembers(`${ALERTS_PREFIX}chat:${crypto.index("12345")}`),
    ).toEqual([last.id]);
    expect((await store.active(new Date())).map((r) => r.id)).toEqual([
      last.id,
    ]);
    await store.remove("12345");
    expect(await redis.keys(`${ALERTS_PREFIX}*`)).toEqual([]);
  });
  it("concurrent creates enforce exactly three per chat", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        store.create(input, "12345", new Date()),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(
      results
        .filter((r) => r.status === "rejected")
        .every((r) => r.reason.message === "ALERTS_RULE_LIMIT"),
    ).toBe(true);
    expect(await store.remove("12345")).toBe(3);
  });
  it("the global 1,000-rule stop is atomic under concurrent creation across chats", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 1010 }, (_, i) =>
        store.create(input, String(i + 1), new Date()),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1000);
    expect(
      results
        .filter((r) => r.status === "rejected")
        .every((r) => r.reason.message === "ALERTS_CAPACITY_STOP"),
    ).toBe(true);
    expect(await store.active(new Date())).toHaveLength(1000);
    await store.remove("1");
    await expect(
      store.create(input, "2000", new Date()),
    ).resolves.toBeDefined();
  }, 30_000);
  it("journal dedupe and claims are atomic, contain no recipient, and survive a store restart", async () => {
    const rule = await store.create(input, "12345", new Date());
    const results = await Promise.all(
      Array.from({ length: 10 }, () => store.enqueue(notice(rule.id))),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    const restarted = new RedisAlertStore(redis, crypto);
    const [event] = await restarted.events();
    const raw = await redis.get(`${ALERTS_PREFIX}journal:${event!.id}`);
    expect(raw).not.toMatch(/deliveryRef|deliveryHmac|chat/);
    expect(
      await redis.pttl(`${ALERTS_PREFIX}journal:${event!.id}`),
    ).toBeLessThanOrEqual(
      (await redis.pttl(`${ALERTS_PREFIX}rule:${rule.id}`)) + 5,
    );
    const claims = await Promise.all([
      store.claim(event!, new Date()),
      restarted.claim(event!, new Date()),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await store.remove("12345");
    expect(await restarted.events()).toEqual([]);
  });
  it("two followers race: only lease holder sends, expiry permits takeover and stale claims fail", async () => {
    const first = new RedisAlertLease(redis),
      second = new RedisAlertLease(redis);
    const firstStore = new RedisAlertStore(redis, crypto, {
      leaseOwner: first.owner,
    });
    const secondStore = new RedisAlertStore(redis, crypto, {
      leaseOwner: second.owner,
    });
    const rule = await store.create(input, "12345", new Date());
    await store.enqueue(notice(rule.id));
    const sender = { reserve: () => true, send: vi.fn(async () => {}) };
    const source = {
      block: vi.fn(async () => ({ number: 1n, hash })),
      logs: vi.fn(async () => []),
      multiplier: vi.fn(),
    };
    const make = (lease: RedisAlertLease, storage: RedisAlertStore) =>
      new AlertFollower(
        { enabled: true, mode: "safe", explorer: "https://explorer.example" },
        storage,
        source,
        lease,
        new RedisAlertProgress(redis, lease.owner),
        sender,
      );
    const a = make(first, firstStore),
      b = make(second, secondStore);
    try {
      await Promise.all([a.poll(), b.poll()]);
      expect(sender.send).toHaveBeenCalledOnce();
      const firstOwns = (await redis.get(LEASE_KEY)) === first.owner;
      const winner = firstOwns ? first : second,
        loser = firstOwns ? second : first;
      await redis.pexpire(LEASE_KEY, 20);
      await sleep(40);
      await store.enqueue(notice(rule.id, "gap:2:3"));
      await (firstOwns ? b : a).poll();
      expect(sender.send).toHaveBeenCalledTimes(2);
      expect(await redis.get(LEASE_KEY)).toBe(loser.owner);
      expect(await winner.renew()).toBe(false);
      await (firstOwns ? a : b).poll();
      expect(sender.send).toHaveBeenCalledTimes(2);
      await winner.release();
      expect(await loser.renew()).toBe(true);
      await expect(
        new RedisAlertProgress(redis, winner.owner).save("safe", {
          cursor: "2",
          recent: [],
        }),
      ).rejects.toThrow("ALERTS_LEASE_LOST");
      await store.enqueue(notice(rule.id, "gap:4:5"));
      const pending = (await store.events()).find(
        (e) => e.state === "pending",
      )!;
      expect(
        await (firstOwns ? firstStore : secondStore).claim(pending, new Date()),
      ).toBe(false);
      expect(
        await (firstOwns ? secondStore : firstStore).claim(pending, new Date()),
      ).toBe(true);
    } finally {
      await a.stop();
      await b.stop();
    }
  });
  it("reads the real eviction policy, degrades/refuses creation for unsafe policy, allows list/delete", async () => {
    const log = vi.fn();
    const result = await checkAlertEvictionPolicy(redis, log);
    const policy = (await redis.config("GET", "maxmemory-policy")) as string[];
    expect(result.reason).toBe(
      policy[1] === "noeviction" ? null : "REDIS_EVICTION_POLICY",
    );
    const rule = await store.create(input, "12345", new Date());
    Object.assign(
      store.status,
      await checkAlertEvictionPolicy(
        {
          config: vi.fn(async () => ["maxmemory-policy", "allkeys-lru"]),
        } as never,
        log,
      ),
    );
    await expect(store.create(input, "67890", new Date())).rejects.toThrow(
      "REDIS_EVICTION_POLICY",
    );
    expect((await store.list("12345", new Date()))[0]?.id).toBe(rule.id);
    expect(await store.remove("12345")).toBe(1);
  });
});

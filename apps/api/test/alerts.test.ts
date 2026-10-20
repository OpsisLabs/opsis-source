import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbi,
  toHex,
  toEventSelector,
} from "viem";
import { AlertCrypto } from "../src/alerts/crypto.js";
import {
  ruleSchema,
  matchRule,
  type AlertRule,
  type Delivery,
  type Event,
  type RuleInput,
  type Anchor,
} from "../src/alerts/rules.js";
import {
  RedisAlertStore,
  ALERTS_PREFIX,
  checkAlertEvictionPolicy,
  RULE_TTL,
  type AlertStore,
} from "../src/alerts/store.js";
import { AlertFollower } from "../src/alerts/follower.js";
import {
  RedisAlertLease,
  RedisAlertBudget,
  RedisAlertProgress,
  type Progress,
} from "../src/alerts/guards.js";
import {
  AlertCommands,
  TelegramAlertSender,
  formatDelivery,
} from "../src/alerts/telegram.js";
import {
  RpcAlertSource,
  APPROVAL_TOPIC,
  TRANSFER_TOPIC,
  AlertRangeError,
  rangeError,
} from "../src/alerts/source.js";
import { TelegramBuckets, telegramRoutes } from "../src/telegram/service.js";
import { BlockscoutProvider } from "../src/chain/blockscout.js";
import { loadEnv } from "../src/config/env.js";
import { buildApp } from "../src/app.js";
import { installErrorHandler } from "../src/http/errors.js";

const token = `0x${"1".repeat(40)}`;
const wallet = `0x${"2".repeat(40)}`;
const other = `0x${"3".repeat(40)}`;
const pool = `0x${"4".repeat(40)}`;
const hash = `0x${"a".repeat(64)}`;
const replacement = `0x${"b".repeat(64)}`;
const txHash = `0x${"c".repeat(64)}`;
const epoch = Date.parse("2026-10-20T12:00:00.000Z");
const crypto = new AlertCrypto("e".repeat(32), "i".repeat(32));
const transfer = ruleSchema.parse({
  type: "transfer_above",
  watchedAddress: wallet,
  params: { token, amount: "100" },
});
const event: Event = {
  type: "transfer_above",
  number: 10n,
  hash,
  tx: txHash,
  logIndex: 1,
  token,
  amount: "101",
  from: wallet,
  to: other,
};
const config = (changes = {}) =>
  loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    CLOUD_WORKSPACE_ENABLED: "false",
    ...changes,
  });
const enabledConfig = (changes = {}) =>
  config({
    ALERTS_ENABLED: "true",
    ALERTS_ENCRYPTION_KEY: "e".repeat(32),
    ALERTS_INDEX_KEY: "i".repeat(32),
    REDIS_URL: "redis://localhost:6379",
    TELEGRAM_BOT_ENABLED: "true",
    TELEGRAM_BOT_TOKEN: `123456:${"t".repeat(32)}`,
    TELEGRAM_WEBHOOK_SECRET: "s".repeat(32),
    ...changes,
  });
afterEach(() => vi.restoreAllMocks());

// State-machine fake: production repository serialization is tested separately.
class MemoryStore implements AlertStore {
  rows: AlertRule[] = [];
  journal: Delivery[] = [];
  sequence = 0;
  async create(input: RuleInput, reference: string, now: Date) {
    await this.cleanup(now);
    if ((await this.list(reference, now)).length >= 3)
      throw new Error("ALERTS_RULE_LIMIT");
    const row: AlertRule = {
      ...ruleSchema.parse(input),
      id: `rule-${++this.sequence}`,
      deliveryChannel: "telegram",
      deliveryRef: crypto.encrypt(reference),
      deliveryHmac: crypto.index(reference),
      cooldown: 60,
      createdAt: now,
      expiresAt: new Date(now.getTime() + RULE_TTL),
      lastFiredAt: null,
      lastObservedMultiplier: null,
      multiplierObservedAt: null,
      lastMultiplierBlockNumber: null,
      lastMultiplierBlockHash: null,
    };
    this.rows.push(row);
    return row;
  }
  async list(reference: string, now: Date) {
    return this.rows.filter(
      (row) =>
        row.deliveryHmac === crypto.index(reference) && row.expiresAt > now,
    );
  }
  async active(now: Date) {
    return this.rows
      .filter((row) => row.expiresAt > now)
      .map((row) => ({ ...row }));
  }
  async get(id: string, now: Date) {
    return (
      this.rows.find((row) => row.id === id && row.expiresAt > now) ?? null
    );
  }
  async remove(reference: string, id?: string) {
    const selected = this.rows.filter(
      (row) =>
        row.deliveryHmac === crypto.index(reference) && (!id || row.id === id),
    );
    this.rows = this.rows.filter((row) => !selected.includes(row));
    this.journal = this.journal.filter(
      (item) => !selected.some((row) => row.id === item.ruleId),
    );
    return selected.length;
  }
  async cleanup(now: Date) {
    const expired = this.rows
      .filter((row) => row.expiresAt <= now)
      .slice(0, 100);
    this.rows = this.rows.filter((row) => !expired.includes(row));
    this.journal = this.journal.filter(
      (item) => !expired.some((row) => row.id === item.ruleId),
    );
    return expired.length;
  }
  async events() {
    return this.journal.map((row) => ({ ...row }));
  }
  async enqueue(value: Omit<Delivery, "id" | "state">) {
    if (
      this.journal.some(
        (item) =>
          item.ruleId === value.ruleId && item.eventKey === value.eventKey,
      )
    )
      return false;
    this.journal.push({
      ...value,
      id: `delivery-${++this.sequence}`,
      state: "pending",
    });
    return true;
  }
  async mark(id: string, state: Delivery["state"]) {
    const row = this.journal.find((row) => row.id === id);
    if (row) row.state = state;
  }
  async claimCorrection(id: string) {
    const row = this.journal.find(
      (row) => row.id === id && row.state === "orphaned",
    );
    if (!row) return false;
    row.state = "corrected";
    return true;
  }
  async claim(value: Delivery, now: Date) {
    const rule = await this.get(value.ruleId, now);
    const row = this.journal.find((row) => row.id === value.id);
    if (
      !rule ||
      !row ||
      row.state !== "pending" ||
      (!value.eventKey.startsWith("gap:") &&
        rule.lastFiredAt &&
        now.getTime() - rule.lastFiredAt.getTime() < rule.cooldown * 1000)
    )
      return false;
    rule.lastFiredAt = now;
    row.state = "sent";
    return true;
  }
  async observeMultiplier(
    id: string,
    value: string | null,
    now: Date,
    anchor?: Anchor,
  ) {
    const rule = this.rows.find((row) => row.id === id)!;
    rule.lastObservedMultiplier = value;
    rule.multiplierObservedAt = now;
    if (anchor || value === null) {
      rule.lastMultiplierBlockNumber = anchor?.number ?? null;
      rule.lastMultiplierBlockHash = anchor?.hash ?? null;
    }
  }
}
async function fixture(mode: "safe" | "latest" = "safe", input = transfer) {
  let time = epoch;
  let head = 10n;
  const hashes = new Map<bigint, string>();
  const store = new MemoryStore();
  const rule = await store.create(input, "12345", new Date(time));
  let logs: Event[] = [event];
  let owner = false;
  let progress: Progress | null = null;
  const lease = {
    acquire: vi.fn(async () => {
      if (owner) return false;
      owner = true;
      return true;
    }),
    renew: vi.fn(async () => owner),
    release: vi.fn(async () => {
      owner = false;
    }),
  };
  const source = {
    block: vi.fn(async (tag: string | bigint) => ({
      number: typeof tag === "bigint" ? tag : head,
      hash: hashes.get(typeof tag === "bigint" ? tag : head) ?? hash,
    })),
    logs: vi.fn(async (_rules, from: bigint, to: bigint) =>
      logs.filter((log) => log.number >= from && log.number <= to),
    ),
    multiplier: vi.fn(async () => "1000"),
  };
  const checkpoint = {
    load: vi.fn(async () => progress),
    save: vi.fn(async (_mode: string, value: Progress) => {
      progress = value;
    }),
  };
  const sender = { reserve: vi.fn(() => true), send: vi.fn(async () => {}) };
  const follower = new AlertFollower(
    {
      enabled: true,
      mode,
      explorer: "https://explorer.example",
      now: () => new Date(time),
      maxBlocks: 1000,
    },
    store,
    source,
    lease,
    checkpoint,
    sender,
  );
  return {
    store,
    rule,
    lease,
    source,
    sender,
    checkpoint,
    follower,
    hashes,
    advance: (ms: number) => {
      time += ms;
    },
    head: (n: bigint) => {
      head = n;
    },
    logs: (rows: Event[]) => {
      logs = rows;
    },
    now: () => new Date(time),
  };
}

describe("schemas and deterministic matchers", () => {
  it.each(["0", "100", "101", "9007199254740993000000000000000000000000"])(
    "exact transfer threshold %s",
    (amount) => {
      expect(Boolean(matchRule(transfer, { ...event, amount }))).toBe(
        BigInt(amount) > 100n,
      );
    },
  );
  it("matches received transfers and rejects another token or wallet", () => {
    expect(
      matchRule(transfer, { ...event, from: other, to: wallet }),
    ).not.toBeNull();
    expect(matchRule(transfer, { ...event, token: other })).toBeNull();
    expect(
      matchRule(transfer, { ...event, from: other, to: other }),
    ).toBeNull();
  });
  it.each(["-1", "1.0", "1e18", "01", String(2n ** 256n)])(
    "rejects invalid integer %s",
    (amount) =>
      expect(
        ruleSchema.safeParse({ ...transfer, params: { token, amount } })
          .success,
      ).toBe(false),
  );
  it("normalizes addresses and rejects extra/private fields", () => {
    expect(
      ruleSchema.parse({
        ...transfer,
        watchedAddress: wallet.toUpperCase().replace("0X", "0x"),
      }).watchedAddress,
    ).toBe(wallet);
    expect(ruleSchema.safeParse({ ...transfer, label: "sample" }).success).toBe(
      false,
    );
    expect(
      ruleSchema.safeParse({
        ...transfer,
        params: { token, amount: "1", usd: "1" },
      }).success,
    ).toBe(false);
  });
  it.each(["verified", "unverified", "unknown"] as const)(
    "approval verification %s",
    (verification) => {
      const rule = ruleSchema.parse({
        type: "approval_unverified",
        watchedAddress: wallet,
        params: {},
      });
      const approval: Event = {
        ...event,
        type: "approval_unverified",
        owner: wallet,
        spender: other,
        verification,
      };
      const match = matchRule(rule, approval);
      expect(Boolean(match)).toBe(verification !== "verified");
      if (verification === "unknown") {
        expect(match?.detail).toContain("verification unknown");
        expect(match?.detail).not.toContain("unverified");
      }
      expect(matchRule(rule, { ...approval, amount: "0" })).toBeNull();
      expect(matchRule(rule, { ...approval, owner: other })).toBeNull();
    },
  );
  it.each(["99", "100", "101"])(
    "swap threshold %s in token0 raw units",
    (amount) => {
      const rule = ruleSchema.parse({
        type: "large_swap",
        watchedAddress: pool,
        params: { amount: "100", tokenSide: 0 },
      });
      expect(
        Boolean(
          matchRule(rule, { ...event, type: "large_swap", pool, amount }),
        ),
      ).toBe(BigInt(amount) > 100n);
      expect(
        matchRule(rule, { ...event, type: "large_swap", pool: other, amount }),
      ).toBeNull();
    },
  );
  it.each([null, "1000", "999"])("multiplier baseline %s", (previous) => {
    const rule = ruleSchema.parse({
      type: "multiplier_scheduled",
      watchedAddress: token,
      params: {},
    });
    expect(
      Boolean(
        matchRule(rule, {
          ...event,
          type: "multiplier_scheduled",
          previous,
          amount: "1000",
        }),
      ),
    ).toBe(previous === "999");
  });
});

describe("encrypted storage and deletion", () => {
  it("uses random nonces, authenticates ciphertext and separates the lookup index", () => {
    const first = crypto.encrypt("12345");
    const second = crypto.encrypt("12345");
    expect(first).not.toBe(second);
    expect(crypto.decrypt(first)).toBe("12345");
    expect(first).not.toContain("12345");
    expect(crypto.index("12345")).toBe(crypto.index("12345"));
    expect(crypto.index("12345")).not.toContain("12345");
    const damaged = Buffer.from(first, "base64url");
    damaged[16] = damaged[16]! ^ 1;
    expect(() => crypto.decrypt(damaged.toString("base64url"))).toThrow(
      "ALERTS_DECRYPT_FAILED",
    );
    expect(() => new AlertCrypto("x", "y")).toThrow();
    expect(() => new AlertCrypto("x".repeat(32), "x".repeat(32))).toThrow();
  });

  it("expires rules and their journals and never dispatches expired recipients", async () => {
    const f = await fixture();
    await f.follower.poll();
    expect(f.store.journal).toHaveLength(1);
    f.advance(RULE_TTL);
    await f.follower.poll();
    expect(f.store.rows).toHaveLength(0);
    expect(f.store.journal).toHaveLength(0);
    expect(f.sender.send).not.toHaveBeenCalled();
  });
});

describe("bounded follower", () => {
  it("queues once, deduplicates repeated logs and persists cooldown across follower instances", async () => {
    const f = await fixture();
    f.logs([event, event]);
    await f.follower.poll();
    expect(f.follower.counters.duplicates).toBe(1);
    expect(f.sender.send).not.toHaveBeenCalled();
    await f.follower.poll();
    expect(f.sender.send).toHaveBeenCalledOnce();
    f.head(11n);
    f.logs([{ ...event, number: 11n, logIndex: 2 }]);
    await f.follower.poll();
    await f.follower.poll();
    expect(f.sender.send).toHaveBeenCalledOnce();
    expect(f.store.journal[1]?.state).toBe("skipped");
    f.advance(60_000);
    f.head(12n);
    f.logs([{ ...event, number: 12n, logIndex: 3 }]);
    await f.follower.poll();
    await f.follower.poll();
    expect(f.sender.send).toHaveBeenCalledTimes(2);
  });
  it("does not deliver a latest block replaced while pending and corrects an already sent one once", async () => {
    const f = await fixture("latest");
    await f.follower.poll();
    f.hashes.set(10n, replacement);
    f.logs([]);
    await f.follower.poll();
    expect(f.sender.send).not.toHaveBeenCalled();
    expect(f.store.journal[0]?.state).toBe("skipped");
    const sent = await fixture("latest");
    await sent.follower.poll();
    await sent.follower.poll();
    expect(sent.sender.send).toHaveBeenCalledOnce();
    sent.hashes.set(10n, replacement);
    sent.logs([]);
    await sent.follower.poll();
    await sent.follower.poll();
    expect(sent.sender.send).toHaveBeenCalledTimes(2);
    expect(sent.sender.send.mock.calls[1]?.[1]).toContain(
      "Correction for rule",
    );
    expect(sent.store.journal[0]?.state).toBe("corrected");
  });
  it("defers a correction under the Telegram dispatch cap", async () => {
    const f = await fixture("latest");
    await f.follower.poll();
    await f.follower.poll();
    f.hashes.set(10n, replacement);
    f.logs([]);
    f.sender.reserve.mockReturnValue(false);
    await f.follower.poll();
    expect(f.store.journal[0]?.state).toBe("orphaned");
    f.sender.reserve.mockReturnValue(true);
    await f.follower.poll();
    expect(f.sender.send).toHaveBeenCalledTimes(2);
  });
  it("rechecks immediately before delivery and drops a block replaced at that check", async () => {
    const f = await fixture("latest");
    await f.follower.poll();
    let checks = 0;
    f.source.block.mockImplementation(async (tag) => ({
      number: typeof tag === "bigint" ? tag : 10n,
      hash: typeof tag === "bigint" && ++checks > 1 ? replacement : hash,
    }));
    await f.follower.poll();
    expect(f.sender.send).not.toHaveBeenCalled();
  });
  it("safe mode reads only through the safe block and caps catch-up ranges", async () => {
    const f = await fixture();
    await f.follower.poll();
    expect(f.source.block.mock.calls[0]?.[0]).toBe("safe");
    expect(f.source.logs).toHaveBeenCalledWith(expect.anything(), 10n, 10n);
    f.head(3010n);
    f.logs([]);
    await f.follower.poll();
    expect(f.source.logs).toHaveBeenLastCalledWith(
      expect.anything(),
      11n,
      1010n,
    );
    expect(f.follower.counters.lag).toBe(2000);
    expect(
      f.source.block.mock.calls
        .filter(([tag]) => typeof tag === "bigint")
        .every(([tag]) => tag <= 3010n),
    ).toBe(true);
  });
  it("checks lease ownership before sending and another replica cannot poll", async () => {
    const f = await fixture();
    await f.follower.poll();
    const contender = new AlertFollower(
      { enabled: true, mode: "safe", explorer: "https://explorer.example" },
      f.store,
      f.source,
      f.lease,
      f.checkpoint,
      f.sender,
    );
    await contender.poll();
    expect(f.source.logs).toHaveBeenCalledOnce();
    f.lease.renew.mockResolvedValue(false);
    await f.follower.poll();
    expect(f.sender.send).not.toHaveBeenCalled();
    await f.follower.stop();
  });
  it("stops on daily or shared monthly budgets and does no further reads", async () => {
    for (const reason of [
      "ALERTS_BUDGET_STOP",
      "PROVIDER_MONTHLY_BUDGET_EXCEEDED",
      "PROVIDER_SPEND_GUARD_UNAVAILABLE",
    ]) {
      const f = await fixture();
      f.source.block.mockRejectedValue(new Error(reason));
      await f.follower.poll();
      await f.follower.poll();
      expect(f.follower.stopReason).toBe("budget");
      expect(f.follower.counters.budgetStops).toBe(1);
      expect(f.source.block).toHaveBeenCalledOnce();
      expect(f.lease.release).toHaveBeenCalledOnce();
    }
  });
  it("backs off provider errors without persisting an error payload", async () => {
    const f = await fixture();
    f.source.block.mockRejectedValueOnce(new Error("provider failure"));
    await f.follower.poll();
    await f.follower.poll();
    expect(f.source.block).toHaveBeenCalledOnce();
    f.advance(3000);
    await f.follower.poll();
    expect(f.source.logs).toHaveBeenCalledOnce();
    expect(f.follower.stopReason).toBeNull();
  });
  it("polls multiplier rules at most once per minute, establishes a baseline and detects a later change", async () => {
    const rule = ruleSchema.parse({
      type: "multiplier_scheduled",
      watchedAddress: token,
      params: {},
    });
    const f = await fixture("safe", rule);
    f.logs([]);
    await f.follower.poll();
    await f.follower.poll();
    expect(f.source.multiplier).toHaveBeenCalledOnce();
    expect(f.store.journal).toHaveLength(0);
    f.advance(60_000);
    f.source.multiplier.mockResolvedValue("1001");
    await f.follower.poll();
    await f.follower.poll();
    expect(f.source.multiplier).toHaveBeenCalledTimes(2);
    expect(f.sender.send).toHaveBeenCalledOnce();
    expect(f.store.journal[0]?.payload.tx).toBeNull();
  });
  it("persists multiplier failure cadence and resets an orphaned baseline", async () => {
    const rule = ruleSchema.parse({
      type: "multiplier_scheduled",
      watchedAddress: token,
      params: {},
    });
    const f = await fixture("latest", rule);
    f.logs([]);
    f.source.multiplier.mockRejectedValueOnce(new Error("provider"));
    await f.follower.poll();
    f.advance(3000);
    await f.follower.poll();
    expect(f.source.multiplier).toHaveBeenCalledOnce();
    f.advance(60_000);
    await f.follower.poll();
    f.hashes.set(10n, replacement);
    await f.follower.poll();
    expect(f.store.rows[0]?.lastObservedMultiplier).toBeNull();
    expect(f.sender.send).not.toHaveBeenCalled();
  });
  it("flags off: explicit poll and start do not acquire a lease or read state", async () => {
    const f = await fixture();
    const follower = new AlertFollower(
      { enabled: false, mode: "safe", explorer: "https://explorer.example" },
      f.store,
      f.source,
      f.lease,
      f.checkpoint,
      f.sender,
    );
    expect(follower.start()).toBe(false);
    await follower.poll();
    expect(f.lease.acquire).not.toHaveBeenCalled();
    expect(f.source.block).not.toHaveBeenCalled();
  });
  it("deletion removes pending delivery state before the next dispatch", async () => {
    const f = await fixture();
    await f.follower.poll();
    await f.store.remove("12345");
    await f.follower.poll();
    expect(f.sender.send).not.toHaveBeenCalled();
    expect(f.store.journal).toHaveLength(0);
  });
});

describe("Telegram commands and transport", () => {
  it.each([
    [`/alert transfer ${token} ${wallet} 100`, "transfer_above"],
    [`/alert approval ${wallet}`, "approval_unverified"],
    [`/alert swap ${pool} 100`, "large_swap"],
    [`/alert multiplier ${token}`, "multiplier_scheduled"],
  ])(
    "creates %s with expiry and encrypted reference",
    async (command, type) => {
      const store = new MemoryStore();
      const commands = new AlertCommands(store, "s", () => new Date(epoch));
      const response = await commands.execute(command, 12345, false);
      expect(response).toContain("rule-1");
      expect(response).toContain("2026-11-19T12:00:00.000Z");
      expect(store.rows[0]?.type).toBe(type);
      expect(store.rows[0]?.deliveryRef).not.toBe("12345");
    },
  );
  it("lists, stops one/all, restricts ownership and deletes all data for one chat", async () => {
    let now = epoch;
    const store = new MemoryStore();
    const commands = new AlertCommands(store, "s", () => new Date(now));
    expect(await commands.execute("/alerts", 12345, false)).toBe(
      "No active alert rules.",
    );
    for (let i = 0; i < 3; i++) {
      await commands.execute(`/alert approval ${wallet}`, 12345, false);
      now += 3000;
    }
    expect(
      await commands.execute(`/alert approval ${wallet}`, 12345, false),
    ).toContain("Limit: 3");
    expect(await commands.execute("/alerts", 12345, false)).toContain("rule-1");
    expect(await commands.execute("/alerts stop rule-1", 54321, false)).toBe(
      "0 alert rule(s) deleted.",
    );
    expect(await commands.execute("/alerts stop rule-1", 12345, false)).toBe(
      "1 alert rule(s) deleted.",
    );
    expect(await commands.execute("/alerts stop all", 12345, false)).toBe(
      "2 alert rule(s) deleted.",
    );
    now += 3000;
    await commands.execute(`/alert approval ${wallet}`, 12345, false);
    await store.create(transfer, "54321", new Date(now));
    const row = store.rows[0]!;
    await store.enqueue({
      ruleId: row.id,
      eventKey: "sample",
      blockNumber: 10n,
      blockHash: hash,
      mode: "safe",
      payload: { token, amount: "1", tx: txHash, detail: "sample" },
    });
    expect(
      await commands.execute("/alerts delete-my-data", 12345, false),
    ).toContain("deleted");
    expect(store.journal).toHaveLength(0);
    expect(await store.list("54321", new Date(now))).toHaveLength(1);
  });
  it("limits creation by chat/group and rejects malformed commands", async () => {
    let now = epoch;
    const store = new MemoryStore();
    const commands = new AlertCommands(store, "s", () => new Date(now));
    await commands.execute(`/alert approval ${wallet}`, -12345, true);
    now += 1000;
    expect(
      await commands.execute(`/alert approval ${wallet}`, -12345, true),
    ).toContain("rate limit");
    now += 2000;
    expect(
      await commands.execute(`/alert approval ${wallet}`, -12345, true),
    ).toContain("created");
    expect(
      await commands.execute(
        `/alert transfer ${token} ${wallet} 1.2`,
        54321,
        false,
      ),
    ).toContain("Invalid alert");
    expect(await commands.execute("/alerts stop", 54321, false)).toContain(
      "Commands:",
    );
    expect(commands.accepts("/alertness")).toBe(false);
    expect(commands.accepts("/alerts@sample_bot")).toBe(true);
  });
  it("extends authenticated webhook without card reads and preserves dispatch limits", async () => {
    const store = new MemoryStore();
    const cards = { card: vi.fn() };
    const client = { sendMessage: vi.fn(async () => {}) };
    const app = Fastify();
    installErrorHandler(app);
    await telegramRoutes(
      app,
      enabledConfig(),
      cards as never,
      client,
      new AlertCommands(store, "s"),
    );
    const request = {
      method: "POST" as const,
      url: "/v1/telegram/webhook",
      payload: {
        update_id: 1,
        message: {
          text: `/alert transfer ${token} ${wallet} 100`,
          chat: { id: 12345, type: "private", username: "sample-user" },
        },
      },
    };
    try {
      expect((await app.inject(request)).statusCode).toBe(404);
      expect(store.rows).toHaveLength(0);
      const headers = { "x-telegram-bot-api-secret-token": "s".repeat(32) };
      expect((await app.inject({ ...request, headers })).statusCode).toBe(200);
      expect(store.rows).toHaveLength(1);
      expect(client.sendMessage).toHaveBeenCalledOnce();
      await app.inject({ ...request, headers });
      expect(store.rows).toHaveLength(1);
      expect(cards.card).not.toHaveBeenCalled();
      expect(JSON.stringify(store.rows)).not.toContain("sample-user");
    } finally {
      await app.close();
    }
  });
  it("flags off exposes no Telegram route and no implicit follower/provider calls", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const app = await buildApp(config());
    try {
      expect(
        app.hasRoute({ method: "POST", url: "/v1/telegram/webhook" }),
      ).toBe(false);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/telegram/webhook",
            payload: {},
          })
        ).statusCode,
      ).toBe(404);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it("alert commands stay ignored when only the card bot is enabled", async () => {
    const env = enabledConfig({ ALERTS_ENABLED: "false" });
    const cards = { card: vi.fn() };
    const bot = { sendMessage: vi.fn() };
    const app = Fastify();
    await telegramRoutes(app, env, cards as never, bot);
    try {
      await app.inject({
        method: "POST",
        url: "/v1/telegram/webhook",
        headers: { "x-telegram-bot-api-secret-token": "s".repeat(32) },
        payload: {
          message: {
            text: `/alert approval ${wallet}`,
            chat: { id: 12345, type: "private" },
          },
        },
      });
      expect(bot.sendMessage).not.toHaveBeenCalled();
      expect(cards.card).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it("delivers factual escaped messages via the existing client and shared buckets", async () => {
    const f = await fixture();
    await f.follower.poll();
    const delivery = f.store.journal[0]!;
    const text = formatDelivery(f.rule, delivery, "https://explorer.example");
    expect(text).toContain("mode safe block");
    expect(text).toContain("Not investment advice");
    expect(text).toContain(`/tx/${txHash}`);
    expect(text).not.toMatch(/buy|swap links|recommended|guaranteed/);
    const client = { sendMessage: vi.fn(async () => {}) };
    const sender = new TelegramAlertSender(
      crypto,
      client,
      new TelegramBuckets("s", () => epoch),
    );
    expect(sender.reserve(f.rule)).toBe(true);
    expect(sender.reserve(f.rule)).toBe(false);
    await sender.send(f.rule, text);
    expect(client.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: 12345,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }),
    );
  });
});

describe("startup validation", () => {
  it("defaults off with safe source and no required keys", () => {
    const env = config();
    expect(env.ALERTS_ENABLED).toBe(false);
    expect(env.ALERTS_BLOCK_TAG).toBe("safe");
    expect(env.ALERTS_DAILY_CALL_BUDGET).toBe(10_000);
  });
  it("accepts separately configured keys and latest mode", () =>
    expect(enabledConfig({ ALERTS_BLOCK_TAG: "latest" }).ALERTS_ENABLED).toBe(
      true,
    ));
  it.each([
    { TELEGRAM_BOT_ENABLED: "false" },
    { TELEGRAM_BOT_TOKEN: "" },
    { TELEGRAM_WEBHOOK_SECRET: "short" },
    { ALERTS_ENCRYPTION_KEY: "" },
    { ALERTS_INDEX_KEY: "short" },
    { ALERTS_INDEX_KEY: "e".repeat(32) },
    { REDIS_URL: "" },
    { ALERTS_BLOCK_TAG: "finalized" },
    { ALERTS_DAILY_CALL_BUDGET: "0" },
    { ROBINHOOD_CHAIN_ID: "1" },
  ])("fails closed on invalid alert configuration %j", (changes) =>
    expect(() => enabledConfig(changes)).toThrow(),
  );
});

describe("Redis coordination and budgets", () => {
  it("atomic lease NX prevents a second owner; ownership is checked on renewal/release", async () => {
    let owner: string | null = null;
    const redis = {
      set: vi.fn(async (_key, value) => {
        if (owner) return null;
        owner = value;
        return "OK";
      }),
      eval: vi.fn(async (script, _count, _key, value) => {
        if (owner !== value) return 0;
        if (script.includes("DEL")) {
          owner = null;
          return 1;
        }
        return 1;
      }),
    };
    const one = new RedisAlertLease(redis as never);
    const two = new RedisAlertLease(redis as never);
    expect(await one.acquire()).toBe(true);
    expect(await two.acquire()).toBe(false);
    expect(await two.renew()).toBe(false);
    await two.release();
    expect(await one.renew()).toBe(true);
    await one.release();
    expect(await two.acquire()).toBe(true);
    expect(redis.set.mock.calls[0]?.slice(2)).toEqual(["PX", 60000, "NX"]);
  });
  it("daily calls reserve before dispatch and Redis failure stops rather than falling back", async () => {
    const redis = {
      eval: vi
        .fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(-1)
        .mockRejectedValueOnce(new Error("unavailable")),
    };
    const budget = new RedisAlertBudget(
      redis as never,
      1,
      () => new Date(epoch),
    );
    await budget.reserve();
    await expect(budget.reserve()).rejects.toThrow("ALERTS_BUDGET_STOP");
    await expect(budget.reserve()).rejects.toThrow("ALERTS_BUDGET_STOP");
    expect(redis.eval.mock.calls[0]?.[2]).toBe(
      "opsis:alerts:v1:budget:2026-10-20",
    );
  });
  it("checkpoint writes fail closed after lease loss", async () => {
    const progress = new RedisAlertProgress(
      { get: vi.fn(async () => null), eval: vi.fn(async () => 0) } as never,
      "owner",
    );
    expect(await progress.load("safe")).toBeNull();
    await expect(
      progress.save("safe", { cursor: "10", recent: [] }),
    ).rejects.toThrow("ALERTS_LEASE_LOST");
  });
});

describe("RPC filters and decoder reuse", () => {
  it("bounds transfer address/topics filters and decodes exact raw quantities", async () => {
    const abi = parseAbi([
      "event Transfer(address indexed from, address indexed to, uint256 value)",
    ]);
    const raw = {
      address: token,
      blockHash: hash,
      blockNumber: "0xa",
      transactionHash: txHash,
      logIndex: "0x1",
      data: encodeAbiParameters([{ type: "uint256" }], [101n]),
      topics: encodeEventTopics({ abi, args: { from: wallet, to: other } }),
    };
    const http = {
      requestJson: vi.fn(async (_url, init) => {
        const body = JSON.parse(init.body);
        return { id: 1, result: body.method === "eth_getLogs" ? [raw] : null };
      }),
    };
    const budget = { reserve: vi.fn(async () => {}) };
    const lease = vi.fn(async () => {});
    const source = new RpcAlertSource(
      config(),
      { reserve: vi.fn() },
      budget,
      lease,
      http,
    );
    const store = new MemoryStore();
    const rule = await store.create(transfer, "12345", new Date(epoch));
    const events = await source.logs([rule], 10n, 10n);
    expect(events[0]).toMatchObject({
      type: "transfer_above",
      amount: "101",
      from: wallet,
      to: other,
    });
    expect(http.requestJson).toHaveBeenCalledTimes(2);
    expect(budget.reserve).toHaveBeenCalledTimes(2);
    const filters = http.requestJson.mock.calls.map(
      ([, init]) => JSON.parse(init.body).params[0],
    );
    expect(filters[0]).toMatchObject({
      address: [token],
      fromBlock: "0xa",
      toBlock: "0xa",
      topics: [TRANSFER_TOPIC, [`0x${wallet.slice(2).padStart(64, "0")}`]],
    });
    expect(filters[1].topics[1]).toBeNull();
    await expect(source.logs([rule], 0n, 50_000n)).rejects.toThrow(
      "ALERTS_RANGE_INVALID",
    );
  });
  it("uses the correct ERC-20 approval topic and rejects missing/wrong block results", async () => {
    expect(APPROVAL_TOPIC).toBe(
      toEventSelector("Approval(address,address,uint256)"),
    );
    const http = {
      requestJson: vi.fn(async () => ({
        id: 1,
        result: { number: "0xb", hash },
      })),
    };
    const source = new RpcAlertSource(
      config(),
      { reserve: vi.fn() },
      { reserve: vi.fn(async () => {}) },
      async () => {},
      http,
    );
    await expect(source.block(10n)).rejects.toThrow("ALERTS_BLOCK_MISMATCH");
    http.requestJson.mockResolvedValueOnce({
      id: 1,
      error: { code: -1 },
    } as never);
    await expect(source.block("safe")).rejects.toThrow();
  });
  it.each([
    {},
    { is_verified: "false" },
    { is_verified: false },
    { is_verified: true },
    { is_verified: false, is_verified_via_eth_bytecode_db: true },
  ])("explorer verification is explicit for %j", async (body) => {
    const explorer = new BlockscoutProvider(config(), {
      requestJson: vi.fn(async () => body),
    });
    expect(await explorer.sourceVerification(other)).toBe(
      body.is_verified === true || body.is_verified_via_eth_bytecode_db === true
        ? "verified"
        : body.is_verified === false
          ? "unverified"
          : "unknown",
    );
  });
  it("unavailable verification stays unknown", async () => {
    const explorer = new BlockscoutProvider(config(), {
      requestJson: vi.fn(async () => {
        throw new Error("provider");
      }),
    });
    expect(await explorer.sourceVerification(other)).toBe("unknown");
  });
});

it("runs at most one process loop and stops its timer cleanly", async () => {
  const f = await fixture();
  const other = await fixture();
  try {
    expect(f.follower.start()).toBe(true);
    expect(other.follower.start()).toBe(false);
    await vi.waitFor(() => expect(f.source.logs).toHaveBeenCalledOnce());
    expect(other.source.block).not.toHaveBeenCalled();
  } finally {
    await f.follower.stop();
    await other.follower.stop();
  }
});
it("reuses journal and checkpoint after restart without a duplicate delivery", async () => {
  const f = await fixture("latest");
  await f.follower.poll();
  await f.follower.poll();
  await f.follower.stop();
  const restarted = new AlertFollower(
    {
      enabled: true,
      mode: "latest",
      explorer: "https://explorer.example",
      now: f.now,
    },
    f.store,
    f.source,
    f.lease,
    f.checkpoint,
    f.sender,
  );
  await restarted.poll();
  expect(f.sender.send).toHaveBeenCalledOnce();
  f.hashes.set(10n, replacement);
  f.logs([]);
  await restarted.poll();
  expect(f.sender.send).toHaveBeenCalledTimes(2);
  await restarted.stop();
});
it("does not retry an ambiguous send and still cleans expired data after a budget stop", async () => {
  const f = await fixture();
  await f.follower.poll();
  f.sender.send.mockRejectedValueOnce(new Error("ambiguous transport"));
  await f.follower.poll();
  f.advance(3000);
  await f.follower.poll();
  expect(f.sender.send).toHaveBeenCalledOnce();
  f.source.block.mockRejectedValueOnce(new Error("ALERTS_BUDGET_STOP"));
  await f.follower.poll();
  expect(f.follower.stopReason).toBe("budget");
  const calls = f.source.block.mock.calls.length;
  f.advance(RULE_TTL);
  await f.follower.poll();
  expect(f.store.rows).toHaveLength(0);
  expect(f.store.journal).toHaveLength(0);
  expect(f.source.block).toHaveBeenCalledTimes(calls);
});
it("reuses observed-trades Swap decoding and verifies the canonical Uniswap factory pool", async () => {
  const { OBSERVED_TRADES_FACTORY, OBSERVED_TRADES_SWAP_TOPIC } =
    await import("../src/market/observed-trades.js");
  const swapAbi = parseAbi([
    "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
  ]);
  const raw = {
    address: pool,
    blockHash: hash,
    blockNumber: "0xa",
    transactionHash: txHash,
    logIndex: "0x1",
    topics: encodeEventTopics({
      abi: swapAbi,
      args: { sender: wallet, recipient: other },
    }),
    data: encodeAbiParameters(
      [
        { type: "int256" },
        { type: "int256" },
        { type: "uint160" },
        { type: "uint128" },
        { type: "int24" },
      ],
      [-101n, 200n, 1n, 1n, 0],
    ),
  };
  const reads = [
    encodeAbiParameters([{ type: "address" }], [OBSERVED_TRADES_FACTORY]),
    encodeAbiParameters([{ type: "address" }], [token]),
    encodeAbiParameters([{ type: "address" }], [other]),
    encodeAbiParameters([{ type: "uint24" }], [3000]),
    encodeAbiParameters([{ type: "address" }], [pool]),
  ];
  const http = {
    requestJson: vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      return {
        id: 1,
        result: body.method === "eth_getLogs" ? [raw] : reads.shift(),
      };
    }),
  };
  const store = new MemoryStore();
  const rule = await store.create(
    ruleSchema.parse({
      type: "large_swap",
      watchedAddress: pool,
      params: { amount: "100", tokenSide: 0 },
    }),
    "12345",
    new Date(epoch),
  );
  const source = new RpcAlertSource(
    config(),
    { reserve: vi.fn() },
    { reserve: vi.fn(async () => {}) },
    async () => {},
    http,
  );
  expect(await source.logs([rule], 10n, 10n)).toMatchObject([
    { type: "large_swap", pool, token, amount: "101" },
  ]);
  expect(
    JSON.parse(http.requestJson.mock.calls[0]![1].body).params[0],
  ).toMatchObject({ address: [pool], topics: [OBSERVED_TRADES_SWAP_TOPIC] });
  const denied = {
    requestJson: vi.fn(async (_url, init) => ({
      id: 1,
      result:
        JSON.parse(init.body).method === "eth_getLogs"
          ? [raw]
          : encodeAbiParameters([{ type: "address" }], [other]),
    })),
  };
  await expect(
    new RpcAlertSource(
      config(),
      { reserve: vi.fn() },
      { reserve: vi.fn(async () => {}) },
      async () => {},
      denied,
    ).logs([rule], 10n, 10n),
  ).rejects.toThrow("ALERTS_POOL_UNVERIFIED");
});
it("does not dispatch a physical RPC call after the alerts daily budget refuses", async () => {
  const rpc = { requestJson: vi.fn() };
  const spend = { reserve: vi.fn() };
  const source = new RpcAlertSource(
    config(),
    spend,
    {
      reserve: vi.fn(async () => {
        throw new Error("ALERTS_BUDGET_STOP");
      }),
    },
    async () => {},
    rpc,
  );
  await expect(source.block("safe")).rejects.toThrow("ALERTS_BUDGET_STOP");
  expect(rpc.requestJson).not.toHaveBeenCalled();
  expect(spend.reserve).not.toHaveBeenCalled();
});
it("bounds log response size and exposes no raw provider payload", async () => {
  const http = {
    requestJson: vi.fn(async () => ({ id: 1, result: Array(1001).fill({}) })),
  };
  const source = new RpcAlertSource(
    config(),
    { reserve: vi.fn() },
    { reserve: vi.fn(async () => {}) },
    async () => {},
    http,
  );
  const f = await fixture();
  await expect(source.logs([f.rule], 10n, 10n)).rejects.toThrow();
});

it("polls the multiplier type once a minute and shares a token read across rules", async () => {
  const rule = ruleSchema.parse({
    type: "multiplier_scheduled",
    watchedAddress: token,
    params: {},
  });
  const f = await fixture("safe", rule);
  f.logs([]);
  await f.store.create(rule, "54321", f.now());
  await f.follower.poll();
  expect(f.source.multiplier).toHaveBeenCalledOnce();
  f.advance(3000);
  await f.store.create(rule, "67890", f.now());
  await f.follower.poll();
  expect(f.source.multiplier).toHaveBeenCalledOnce();
  f.advance(60_000);
  await f.follower.poll();
  expect(f.source.multiplier).toHaveBeenCalledTimes(2);
});
it("reads newUIMultiplier through stock-engine ABI and exact registry/onchain identity", async () => {
  const uid = `0x${"d".repeat(64)}`;
  const registry = {
    assets: [
      {
        id: uid.toUpperCase().replace("0X", "0x"),
        tokenSymbol: "SAMPLE",
        tokenName: "Sample stock",
        tokenDecimals: 18,
        currentMultiplier: "1",
        deployments: [{ chainId: 4663, contractAddress: token }],
      },
    ],
  };
  const values = [
    encodeAbiParameters([{ type: "bytes32" }], [uid]),
    encodeAbiParameters([{ type: "string" }], ["SAMPLE"]),
    encodeAbiParameters([{ type: "uint8" }], [18]),
    encodeAbiParameters([{ type: "uint256" }], [1001n]),
  ];
  const rpc = {
    requestJson: vi.fn(async () => ({ id: 1, result: values.shift() })),
  };
  const http = { requestJson: vi.fn(async () => registry) };
  const budget = { reserve: vi.fn(async () => {}) };
  const source = new RpcAlertSource(
    config(),
    { reserve: vi.fn() },
    budget,
    async () => {},
    rpc,
    http,
  );
  expect(await source.multiplier(token, { number: 10n, hash })).toBe("1001");
  expect(budget.reserve).toHaveBeenCalledTimes(5);
  expect(
    rpc.requestJson.mock.calls.every(
      ([, init]) => JSON.parse(init.body).params[1] === "0xa",
    ),
  ).toBe(true);
  await expect(source.multiplier(other, { number: 10n, hash })).rejects.toThrow(
    "ALERTS_STOCK_IDENTITY_UNKNOWN",
  );
});
it.each(["unknown", "unverified", "verified"] as const)(
  "enriches approval events through the explorer path: %s",
  async (verification) => {
    vi.spyOn(
      BlockscoutProvider.prototype,
      "sourceVerification",
    ).mockResolvedValue(verification);
    const abi = parseAbi([
      "event Approval(address indexed owner, address indexed spender, uint256 value)",
    ]);
    const raw = {
      address: token,
      blockHash: hash,
      blockNumber: "0xa",
      transactionHash: txHash,
      logIndex: "0x1",
      topics: encodeEventTopics({
        abi,
        args: { owner: wallet, spender: other },
      }),
      data: encodeAbiParameters([{ type: "uint256" }], [101n]),
    };
    const rpc = {
      requestJson: vi.fn(async (_url, init) => ({
        id: 1,
        result: JSON.parse(init.body).method === "eth_getLogs" ? [raw] : "0x01",
      })),
    };
    const source = new RpcAlertSource(
      config(),
      { reserve: vi.fn() },
      { reserve: vi.fn(async () => {}) },
      async () => {},
      rpc,
    );
    const store = new MemoryStore();
    const rule = await store.create(
      ruleSchema.parse({
        type: "approval_unverified",
        watchedAddress: wallet,
        params: {},
      }),
      "12345",
      new Date(epoch),
    );
    const events = await source.logs([rule], 10n, 10n);
    expect(events[0]).toMatchObject({
      verification,
      type: "approval_unverified",
      amount: "101",
    });
    if (verification === "unknown")
      expect(matchRule(rule, events[0]!)?.detail).toContain(
        "verification unknown",
      );
  },
);
it("refuses approval notifications for EOAs and refuses source reads after lease loss", async () => {
  const verify = vi.spyOn(BlockscoutProvider.prototype, "sourceVerification");
  const abi = parseAbi([
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
  ]);
  const raw = {
    address: token,
    blockHash: hash,
    blockNumber: "0xa",
    transactionHash: txHash,
    logIndex: "0x1",
    topics: encodeEventTopics({ abi, args: { owner: wallet, spender: other } }),
    data: encodeAbiParameters([{ type: "uint256" }], [101n]),
  };
  const rpc = {
    requestJson: vi.fn(async (_url, init) => ({
      id: 1,
      result: JSON.parse(init.body).method === "eth_getLogs" ? [raw] : "0x",
    })),
  };
  const store = new MemoryStore();
  const rule = await store.create(
    ruleSchema.parse({
      type: "approval_unverified",
      watchedAddress: wallet,
      params: {},
    }),
    "12345",
    new Date(epoch),
  );
  expect(
    await new RpcAlertSource(
      config(),
      { reserve: vi.fn() },
      { reserve: vi.fn(async () => {}) },
      async () => {},
      rpc,
    ).logs([rule], 10n, 10n),
  ).toEqual([]);
  expect(verify).not.toHaveBeenCalled();
  rpc.requestJson.mockClear();
  const budget = { reserve: vi.fn(async () => {}) };
  await expect(
    new RpcAlertSource(
      config(),
      { reserve: vi.fn() },
      budget,
      async () => {
        throw new Error("ALERTS_LEASE_LOST");
      },
      rpc,
    ).block("safe"),
  ).rejects.toThrow("ALERTS_LEASE_LOST");
  expect(rpc.requestJson).not.toHaveBeenCalled();
  expect(budget.reserve).not.toHaveBeenCalled();
});
it("publishes bounded alert counters and lag without address/recipient metric labels", async () => {
  const { installMetrics } = await import("../src/observability/metrics.js");
  const app = Fastify();
  await installMetrics(app);
  const f = await fixture();
  try {
    f.logs([event, event]);
    await f.follower.poll();
    await f.follower.poll();
    const metrics = (await app.inject({ method: "GET", url: "/metrics" })).body;
    expect(metrics).toContain(
      'rh_chain_alerts_total{event="polls",reason="none"} 2',
    );
    expect(metrics).toContain(
      'rh_chain_alerts_total{event="duplicates",reason="none"} 1',
    );
    expect(metrics).toContain(
      'rh_chain_alerts_total{event="deliveries",reason="none"} 1',
    );
    expect(metrics).toContain("rh_chain_alerts_lag_blocks 0");
    expect(metrics).not.toContain(wallet);
    expect(metrics).not.toContain("12345");
  } finally {
    await app.close();
  }
});

it("does not read or deliver queued blocks above a regressed safe head", async () => {
  const f = await fixture();
  await f.follower.poll();
  f.head(9n);
  f.source.block.mockClear();
  await f.follower.poll();
  expect(f.sender.send).not.toHaveBeenCalled();
  expect(f.source.block.mock.calls).toEqual([["safe"]]);
});
it("records capacity separately from provider-budget exhaustion", async () => {
  const f = await fixture();
  vi.spyOn(f.store, "active").mockRejectedValue(
    new Error("ALERTS_CAPACITY_STOP"),
  );
  await f.follower.poll();
  expect(f.follower.stopReason).toBe("capacity");
  expect(f.follower.counters.budgetStops).toBe(0);
  expect(f.source.block).not.toHaveBeenCalled();
});

describe("Pass B Telegram-only bounds", () => {
  it("zero active rules does no RPC while still cleaning up and holding the lease", async () => {
    const f = await fixture();
    await f.store.remove("12345");
    const cleanup = vi.spyOn(f.store, "cleanup");
    await f.follower.poll();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(f.source.block).not.toHaveBeenCalled();
    expect(f.source.logs).not.toHaveBeenCalled();
    expect(f.source.multiplier).not.toHaveBeenCalled();
    await f.follower.stop();
  });
  it("walks a downtime gap in ranges of at most 50,000 and preserves progress", async () => {
    const f = await fixture();
    f.logs([]);
    const follower = new AlertFollower(
      { enabled: true, mode: "safe", explorer: "https://explorer.example" },
      f.store,
      f.source,
      f.lease,
      f.checkpoint,
      f.sender,
    );
    await follower.poll();
    f.head(120010n);
    await follower.poll();
    await follower.poll();
    await follower.poll();
    expect(f.source.logs.mock.calls.map(([, from, to]) => [from, to])).toEqual([
      [10n, 10n],
      [11n, 50010n],
      [50011n, 100010n],
      [100011n, 120010n],
    ]);
    expect(follower.counters.lag).toBe(0);
    await follower.stop();
  });
  it.each([
    {
      code: 22,
      message:
        "eth_getLogs range over 100000 blocks is not supported on robinhood, request a narrower fromBlock/toBlock range",
    },
    { code: -32602, message: "range over 250 blocks" },
    { code: -32005, message: "block range limit exceeded" },
  ])("recognises provider range denial $code", (value) => {
    expect(rangeError(value)).toBeInstanceOf(AlertRangeError);
  });
  it.each([
    { code: -32005, message: "rate limit: range over 100 blocks" },
    { code: -32602, message: "request timeout" },
    { code: -32602, message: "invalid argument" },
  ])("does not shrink for non-range errors: $message", (value) =>
    expect(rangeError(value)).toBeNull(),
  );
  it("shrinks a denied chunk to the stated maximum and retries under budget", async () => {
    const f = await fixture();
    f.logs([]);
    await f.follower.poll();
    f.head(3010n);
    f.source.logs.mockRejectedValueOnce(new AlertRangeError(250));
    await f.follower.poll();
    expect(f.source.logs).toHaveBeenLastCalledWith(
      expect.anything(),
      11n,
      260n,
    );
    await f.follower.poll();
    expect(f.source.logs).toHaveBeenLastCalledWith(
      expect.anything(),
      261n,
      510n,
    );
    await f.follower.stop();
  });
  it("timeouts back off without shrinking the chunk", async () => {
    const f = await fixture();
    f.logs([]);
    await f.follower.poll();
    f.head(3010n);
    f.source.logs.mockRejectedValueOnce(new Error("timeout"));
    await f.follower.poll();
    await f.follower.poll();
    expect(f.source.logs).toHaveBeenCalledTimes(2);
    f.advance(3000);
    await f.follower.poll();
    expect(f.source.logs).toHaveBeenLastCalledWith(
      expect.anything(),
      11n,
      1010n,
    );
    await f.follower.stop();
  });
  it("records an uncatchable gap before advancing and sends its durable Telegram notice", async () => {
    const f = await fixture();
    f.logs([]);
    const follower = new AlertFollower(
      {
        enabled: true,
        mode: "safe",
        maxBlocks: 1000,
        dailyCallBudget: 5,
        explorer: "https://explorer.example",
      },
      f.store,
      f.source,
      f.lease,
      f.checkpoint,
      f.sender,
    );
    await follower.poll();
    f.head(5010n);
    await follower.poll();
    expect(f.checkpoint.save).toHaveBeenLastCalledWith(
      "safe",
      expect.objectContaining({
        cursor: "5010",
        gap: { state: "gap", from: "11", to: "5010" },
      }),
    );
    expect(f.store.journal[0]?.eventKey).toBe("gap:11:5010");
    expect(f.source.logs).toHaveBeenCalledOnce();
    await follower.poll();
    expect(f.sender.send).toHaveBeenCalledOnce();
    expect(f.sender.send.mock.calls[0]?.[1]).toContain(
      "blocks 11–5010 were not checked",
    );
    await follower.poll();
    expect(f.sender.send).toHaveBeenCalledOnce();
    await follower.stop();
  });
  it("two followers racing for the same lease send pending deliveries only once", async () => {
    const f = await fixture();
    await f.follower.poll();
    await f.follower.stop();
    const contender = new AlertFollower(
      { enabled: true, mode: "safe", explorer: "https://explorer.example" },
      f.store,
      f.source,
      f.lease,
      f.checkpoint,
      f.sender,
    );
    await Promise.all([f.follower.poll(), contender.poll()]);
    expect(f.sender.send).toHaveBeenCalledOnce();
    await f.follower.stop();
    await contender.stop();
  });
  it.each(["2", "61", "3.5"])("rejects invalid poll seconds %s", (value) =>
    expect(() => config({ ALERTS_POLL_SECONDS: value })).toThrow(),
  );
  it("enabled alerts need Redis and Telegram, without a DATABASE_URL", () => {
    expect(enabledConfig({ DATABASE_URL: "" }).ALERTS_ENABLED).toBe(true);
  });
  it("provider per-minute rate limits back off rather than becoming a permanent budget stop", async () => {
    const f = await fixture();
    f.logs([]);
    f.source.block.mockRejectedValueOnce(new Error("PROVIDER_BUDGET_EXCEEDED"));
    await f.follower.poll();
    await f.follower.poll();
    expect(f.follower.stopReason).toBeNull();
    expect(f.source.block).toHaveBeenCalledOnce();
    f.advance(3000);
    await f.follower.poll();
    expect(f.source.logs).toHaveBeenCalledOnce();
    await f.follower.stop();
  });
  it("a pending gap notice can dispatch after a budget stop without any further RPC", async () => {
    const f = await fixture();
    f.logs([]);
    const follower = new AlertFollower(
      {
        enabled: true,
        mode: "safe",
        maxBlocks: 1000,
        dailyCallBudget: 5,
        explorer: "https://explorer.example",
      },
      f.store,
      f.source,
      f.lease,
      f.checkpoint,
      f.sender,
    );
    await follower.poll();
    f.head(5010n);
    await follower.poll();
    follower.stopReason = "budget";
    f.source.block.mockClear();
    await follower.poll();
    expect(f.sender.send).toHaveBeenCalledOnce();
    expect(f.source.block).not.toHaveBeenCalled();
    await follower.stop();
  });
  it("poll seconds default to 3 and accept both bounds", () => {
    expect(config().ALERTS_POLL_SECONDS).toBe(3);
    expect(config({ ALERTS_POLL_SECONDS: "60" }).ALERTS_POLL_SECONDS).toBe(60);
  });
  it("turns a JSON-RPC code 22 into a bounded error and counts physical methods", async () => {
    const f = await fixture();
    const source = new RpcAlertSource(
      config(),
      { reserve: vi.fn() },
      { reserve: vi.fn(async () => {}) },
      async () => {},
      {
        requestJson: vi.fn(async () => ({
          id: 1,
          error: { code: 22, message: "range over 250 blocks" },
        })),
      },
    );
    await expect(source.logs([f.rule], 1n, 1000n)).rejects.toMatchObject({
      limit: 250,
    });
    expect(source.calls).toEqual({ eth_getLogs: 1 });
    expect(source.latencyMs.eth_getLogs).toBeGreaterThanOrEqual(0);
  });
  it.each(["/privacy", "/privacy en", "/privacy zh", "/privacy@sample_bot zh"])(
    "webhook replies to %s without a provider read, including when alerts are off",
    async (command) => {
      const app = Fastify();
      const cards = { card: vi.fn() },
        client = { sendMessage: vi.fn(async () => {}) };
      await telegramRoutes(
        app,
        enabledConfig({ ALERTS_ENABLED: "false" }),
        cards as never,
        client,
      );
      try {
        const result = await app.inject({
          method: "POST",
          url: "/v1/telegram/webhook",
          headers: { "x-telegram-bot-api-secret-token": "s".repeat(32) },
          payload: {
            message: { text: command, chat: { id: 12345, type: "private" } },
          },
        });
        expect(result.statusCode).toBe(200);
        expect(cards.card).not.toHaveBeenCalled();
        const text = client.sendMessage.mock.calls[0]?.[0].text;
        expect(text).toContain(
          command.endsWith(" zh") ? "磁盘快照" : "disk snapshots",
        );
        expect(text!.length).toBeLessThanOrEqual(4096);
        expect(text).toContain("/alerts delete-my-data");
      } finally {
        await app.close();
      }
    },
  );
});

it("exposes per-method physical alert RPC attempts in existing workload metrics", async () => {
  const { installMetrics } = await import("../src/observability/metrics.js");
  const { ProviderHttpClient } = await import("../src/chain/provider-http.js");
  const app = Fastify();
  await installMetrics(app);
  const transport = new ProviderHttpClient(
    {
      maxRetries: 0,
      backoffMs: 0,
      timeoutMs: 1000,
      circuitFailureThreshold: 5,
      circuitResetMs: 1000,
      requestBudgetPerMinute: 100,
      providerName: "alerts",
      rpcWorkload: "alerts",
    },
    {
      fetch: vi.fn(async (_url, init) => {
        const method = JSON.parse(String(init?.body)).method;
        return new Response(
          JSON.stringify({
            id: 1,
            result: method === "eth_getLogs" ? [] : { number: "0xa", hash },
          }),
        );
      }),
      now: Date.now,
      sleep: async () => {},
    },
  );
  const source = new RpcAlertSource(
    config(),
    { reserve: vi.fn() },
    { reserve: async () => {} },
    async () => {},
    transport,
  );
  try {
    const f = await fixture();
    await source.block("safe");
    await source.logs([f.rule], 10n, 10n);
    const metrics = (await app.inject({ method: "GET", url: "/metrics" })).body;
    expect(metrics).toContain(
      'rh_chain_rpc_workload_subcalls_total{workload="alerts",method="eth_getBlockByNumber"} 1',
    );
    expect(metrics).toContain(
      'rh_chain_rpc_workload_subcalls_total{workload="alerts",method="eth_getLogs"} 2',
    );
  } finally {
    await app.close();
  }
});

it("the capability status reports Redis eviction degradation while existing alerts stay enabled", async () => {
  const { opsisRoutes } = await import("../src/routes/opsis.js");
  const app = Fastify();
  await opsisRoutes(
    app,
    enabledConfig({
      OPSIS_WORKSPACES_ENABLED: "true",
      OPSIS_PUBLIC_ACCESS_ENABLED: "true",
    }),
    () => ({ state: "degraded", reason: "REDIS_EVICTION_POLICY" }),
  );
  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/private/opsis/access",
    });
    expect(response.statusCode).toBe(200);
    const row = response
      .json()
      .manifest.capabilities.find((r) => r.id === "alerts");
    expect(row.enabled).toBe(true);
    expect(row.scope).toBe("Opt-in alerts in Telegram");
    expect(row.limits).toContain("Degraded: REDIS_EVICTION_POLICY");
    expect(row.limits).toContain("Alerts can be lost if the Redis store resets");
    expect(row.limits).toContain("Redis check: not run");
  } finally {
    await app.close();
  }
});

it("catch-up estimates count deduplicated filters rather than duplicate chat rules", async () => {
  const f = await fixture();
  f.logs([]);
  const follower = new AlertFollower(
    {
      enabled: true,
      mode: "safe",
      maxBlocks: 1000,
      dailyCallBudget: 100,
      explorer: "https://explorer.example",
    },
    f.store,
    f.source,
    f.lease,
    f.checkpoint,
    f.sender,
  );
  await follower.poll();
  for (let i = 0; i < 99; i++)
    await f.store.create(transfer, String(10000 + i), f.now());
  f.head(10010n);
  await follower.poll();
  expect(f.source.logs).toHaveBeenLastCalledWith(expect.anything(), 11n, 1010n);
  expect(f.store.journal).toHaveLength(0);
  await follower.stop();
});

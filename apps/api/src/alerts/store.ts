import { createHash, randomUUID } from "node:crypto";
import type Redis from "ioredis";
import {
  ruleSchema,
  type AlertRule,
  type Delivery,
  type RuleInput,
  type Anchor,
} from "./rules.js";
import { AlertCrypto } from "./crypto.js";
import { ALERTS_PREFIX, ALERTS_SCRIPT } from "./redis-scripts.js";
export { ALERTS_PREFIX } from "./redis-scripts.js";
export const RULE_TTL = 30 * 86_400_000;
export interface AlertStore {
  create(input: RuleInput, reference: string, now: Date): Promise<AlertRule>;
  list(reference: string, now: Date): Promise<AlertRule[]>;
  active(now: Date): Promise<AlertRule[]>;
  get(id: string, now: Date): Promise<AlertRule | null>;
  remove(reference: string, id?: string): Promise<number>;
  cleanup(now: Date): Promise<number>;
  events(): Promise<Delivery[]>;
  enqueue(delivery: Omit<Delivery, "id" | "state">): Promise<boolean>;
  claimCorrection(id: string): Promise<boolean>;
  mark(id: string, state: Delivery["state"]): Promise<void>;
  claim(delivery: Delivery, now: Date): Promise<boolean>;
  observeMultiplier(
    id: string,
    value: string | null,
    now: Date,
    anchor?: Anchor,
  ): Promise<void>;
}
export type AlertsRedisConfig = {
  readable: boolean;
  maxmemoryPolicy: string | null;
  appendonly: string | null;
  save: string | null;
};
export type AlertsStorageStatus = {
  state: "ready" | "degraded";
  reason: "REDIS_EVICTION_POLICY" | "REDIS_PERSISTENCE_OFF" | null;
  config?: AlertsRedisConfig;
};
async function configValue(redis: Pick<Redis, "config">, key: string) {
  const result = (await redis.config("GET", key)) as string[];
  if (
    !Array.isArray(result) ||
    result.length !== 2 ||
    result[0] !== key ||
    typeof result[1] !== "string"
  )
    throw new Error();
  return result[1];
}
/**
 * CONFIG may be disabled by the host. Do not log its error payload or change settings.
 * Eviction of alert keys, or a store without AOF or RDB persistence, degrades alerts:
 * new rules are refused, existing rules can still be listed and deleted.
 */
export async function checkAlertEvictionPolicy(
  redis: Pick<Redis, "config">,
  log: (message: string) => void,
): Promise<AlertsStorageStatus> {
  const config: AlertsRedisConfig = {
    readable: true,
    maxmemoryPolicy: null,
    appendonly: null,
    save: null,
  };
  try {
    config.maxmemoryPolicy = await configValue(redis, "maxmemory-policy");
  } catch {
    config.readable = false;
    log(
      "Alerts: Redis maxmemory-policy is unreadable; continuing without policy verification.",
    );
    return { state: "ready", reason: null, config };
  }
  try {
    config.appendonly = await configValue(redis, "appendonly");
    config.save = await configValue(redis, "save");
  } catch {
    config.appendonly = null;
    config.save = null;
  }
  if (config.maxmemoryPolicy !== "noeviction")
    return { state: "degraded", reason: "REDIS_EVICTION_POLICY", config };
  if (config.appendonly === "no" && config.save === "")
    return { state: "degraded", reason: "REDIS_PERSISTENCE_OFF", config };
  return { state: "ready", reason: null, config };
}
/** One line for the status row: the startup Redis check, readable by operators. */
export function describeAlertsStorage(status: AlertsStorageStatus | undefined) {
  const c = status?.config;
  if (!c) return "Redis check: not run";
  if (!c.readable) return "Redis check: REDIS_CONFIG_UNREADABLE";
  return `Redis check: maxmemory-policy=${c.maxmemoryPolicy}; appendonly=${c.appendonly ?? "unreadable"}; save=${c.save === null ? "unreadable" : JSON.stringify(c.save)}`;
}
const json = (value: unknown) =>
  JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? String(item) : item,
  );
function decodeRule(value: string): AlertRule {
  const row = JSON.parse(value);
  if (row.deliveryChannel !== "telegram")
    throw new Error("ALERTS_RULE_INVALID");
  return {
    ...row,
    ...ruleSchema.parse({
      type: row.type,
      watchedAddress: row.watchedAddress,
      params: row.params,
    }),
    createdAt: new Date(row.createdAt),
    expiresAt: new Date(row.expiresAt),
    lastFiredAt: row.lastFiredAt === null ? null : new Date(row.lastFiredAt),
    multiplierObservedAt:
      row.multiplierObservedAt === null
        ? null
        : new Date(row.multiplierObservedAt),
    lastMultiplierBlockNumber:
      row.lastMultiplierBlockNumber === null
        ? null
        : BigInt(row.lastMultiplierBlockNumber),
  };
}
function decodeDelivery(value: string): Delivery {
  const row = JSON.parse(value);
  return { ...row, blockNumber: BigInt(row.blockNumber) };
}
export class RedisAlertStore implements AlertStore {
  readonly status: AlertsStorageStatus = { state: "ready", reason: null };
  constructor(
    private readonly redis: Pick<Redis, "eval" | "get" | "mget">,
    private readonly crypto: AlertCrypto,
    private readonly options: {
      ttlMs?: number;
      now?: () => Date;
      leaseOwner?: string;
    } = {},
  ) {
    if (
      options.ttlMs !== undefined &&
      (!Number.isSafeInteger(options.ttlMs) ||
        options.ttlMs < 1 ||
        options.ttlMs > RULE_TTL)
    )
      throw new Error("ALERTS_TTL_INVALID");
  }
  private now() {
    return this.options.now?.() ?? new Date();
  }
  private async run(op: string, ...args: (string | number)[]) {
    const result = await this.redis.eval(
      ALERTS_SCRIPT,
      1,
      ALERTS_PREFIX,
      op,
      ...args,
    );
    if (typeof result === "string" && result.startsWith("ALERTS_"))
      throw new Error(result);
    return result;
  }
  async create(
    input: RuleInput,
    reference: string,
    now: Date,
  ): Promise<AlertRule> {
    if (this.status.reason) throw new Error(this.status.reason);
    const row: AlertRule = {
      ...ruleSchema.parse(input),
      id: randomUUID(),
      deliveryChannel: "telegram",
      deliveryRef: this.crypto.encrypt(reference),
      deliveryHmac: this.crypto.index(reference),
      cooldown: 60,
      createdAt: now,
      expiresAt: new Date(now.getTime() + (this.options.ttlMs ?? RULE_TTL)),
      lastFiredAt: null,
      lastObservedMultiplier: null,
      multiplierObservedAt: null,
      lastMultiplierBlockNumber: null,
      lastMultiplierBlockHash: null,
    };
    await this.run(
      "create",
      json({ ...row, createdAt: +row.createdAt, expiresAt: +row.expiresAt }),
      +now,
    );
    return row;
  }
  async list(reference: string, now: Date) {
    const ids = (await this.run(
      "list",
      this.crypto.index(reference),
    )) as string[];
    return (await Promise.all(ids.map((id) => this.get(id, now))))
      .filter((row): row is AlertRule => row !== null)
      .sort((a, b) => +a.createdAt - +b.createdAt);
  }
  async active(now: Date) {
    const ids = (await this.run("active", +now)) as string[];
    if (ids.length > 1000) throw new Error("ALERTS_CAPACITY_STOP");
    return (await Promise.all(ids.map((id) => this.get(id, now)))).filter(
      (row): row is AlertRule => row !== null,
    );
  }
  async get(id: string, now: Date) {
    const raw = await this.redis.get(`${ALERTS_PREFIX}rule:${id}`);
    if (!raw) return null;
    const row = decodeRule(raw);
    return row.expiresAt > now ? row : null;
  }
  async remove(reference: string, id?: string) {
    return Number(
      await this.run("remove", this.crypto.index(reference), id ?? ""),
    );
  }
  async cleanup(now: Date) {
    return Number(await this.run("cleanup", +now));
  }
  async events() {
    const ids = (await this.run("events", +this.now())) as string[];
    if (ids.length > 1000) throw new Error("ALERTS_CAPACITY_STOP");
    if (!ids.length) return [];
    return (
      await this.redis.mget(...ids.map((id) => `${ALERTS_PREFIX}journal:${id}`))
    )
      .filter((v): v is string => v !== null)
      .map(decodeDelivery);
  }
  async enqueue(value: Omit<Delivery, "id" | "state">) {
    const id = `${value.ruleId}:${createHash("sha256").update(value.eventKey).digest("hex")}`;
    return (
      Number(
        await this.run(
          "enqueue",
          json({ ...value, id, state: "pending" }),
          +this.now(),
        ),
      ) === 1
    );
  }
  async claimCorrection(id: string) {
    return (
      Number(
        await this.run(
          "correct",
          id,
          +this.now(),
          this.options.leaseOwner ?? "",
        ),
      ) === 1
    );
  }
  async mark(id: string, state: Delivery["state"]) {
    await this.run("mark", id, state);
  }
  async claim(value: Delivery, now: Date) {
    return (
      Number(
        await this.run("claim", value.id, +now, this.options.leaseOwner ?? ""),
      ) === 1
    );
  }
  async observeMultiplier(
    id: string,
    value: string | null,
    now: Date,
    anchor?: Anchor,
  ) {
    await this.run(
      "observe",
      id,
      json({
        lastObservedMultiplier: value,
        multiplierObservedAt: +now,
        ...(anchor
          ? {
              lastMultiplierBlockNumber: String(anchor.number),
              lastMultiplierBlockHash: anchor.hash,
            }
          : value === null
            ? { lastMultiplierBlockNumber: null, lastMultiplierBlockHash: null }
            : {}),
      }),
    );
  }
}

import { randomUUID } from "node:crypto";
import type Redis from "ioredis";
import { ALERTS_PREFIX } from "./redis-scripts.js";
export interface AlertLease {
  acquire(): Promise<boolean>;
  renew(): Promise<boolean>;
  release(): Promise<void>;
}
export const LEASE_KEY = `${ALERTS_PREFIX}lease`;
export class RedisAlertLease implements AlertLease {
  readonly owner = randomUUID();
  constructor(private readonly redis: Pick<Redis, "set" | "eval">) {}
  async acquire() {
    return (
      (await this.redis.set(LEASE_KEY, this.owner, "PX", 60_000, "NX")) === "OK"
    );
  }
  async renew() {
    return (
      Number(
        await this.redis.eval(
          'if redis.call("GET",KEYS[1]) == ARGV[1] then return redis.call("PEXPIRE",KEYS[1],60000) end return 0',
          1,
          LEASE_KEY,
          this.owner,
        ),
      ) === 1
    );
  }
  async release() {
    await this.redis.eval(
      'if redis.call("GET",KEYS[1]) == ARGV[1] then return redis.call("DEL",KEYS[1]) end return 0',
      1,
      LEASE_KEY,
      this.owner,
    );
  }
}
export interface AlertBudget {
  reserve(calls?: number): Promise<void>;
}
export class RedisAlertBudget implements AlertBudget {
  constructor(
    private readonly redis: Pick<Redis, "eval">,
    private readonly limit: number,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async reserve(calls = 1) {
    if (!Number.isSafeInteger(calls) || calls < 1)
      throw new Error("ALERTS_BUDGET_STOP");
    const now = this.now();
    const ttl =
      Math.ceil(
        (Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() + 1,
        ) -
          now.getTime()) /
          1000,
      ) + 3600;
    try {
      const result = await this.redis.eval(
        'local n=tonumber(redis.call("GET",KEYS[1]) or "0"); if n+tonumber(ARGV[1])>tonumber(ARGV[2]) then return -1 end; redis.call("SET",KEYS[1],n+tonumber(ARGV[1]),"EX",ARGV[3]); return n+tonumber(ARGV[1])',
        1,
        `${ALERTS_PREFIX}budget:${now.toISOString().slice(0, 10)}`,
        calls,
        this.limit,
        ttl,
      );
      if (
        !Number.isSafeInteger(Number(result)) ||
        Number(result) < calls ||
        Number(result) > this.limit
      )
        throw new Error();
    } catch {
      throw new Error("ALERTS_BUDGET_STOP");
    }
  }
}
export type Progress = {
  gap?: { state: "gap"; from: string; to: string };
  multiplierAt?: number;
  cursor: string;
  recent: Array<{ number: string; hash: string }>;
};
export interface AlertProgress {
  load(mode: string): Promise<Progress | null>;
  save(mode: string, progress: Progress): Promise<void>;
}
export class RedisAlertProgress implements AlertProgress {
  constructor(
    private readonly redis: Pick<Redis, "get" | "eval">,
    private readonly owner: string,
  ) {}
  async load(mode: string): Promise<Progress | null> {
    const value = await this.redis.get(`${ALERTS_PREFIX}cursor:${mode}`);
    return value ? (JSON.parse(value) as Progress) : null;
  }
  async save(mode: string, progress: Progress) {
    const result = await this.redis.eval(
      'if redis.call("GET",KEYS[1]) ~= ARGV[1] then return 0 end; redis.call("SET",KEYS[2],ARGV[2],"EX",2592000); return 1',
      2,
      LEASE_KEY,
      `${ALERTS_PREFIX}cursor:${mode}`,
      this.owner,
      JSON.stringify(progress),
    );
    if (Number(result) !== 1) throw new Error("ALERTS_LEASE_LOST");
  }
}

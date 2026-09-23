import type Redis from "ioredis";
import { describe, expect, it, vi } from "vitest";
import { RedisMonthlyRpcUnitBudget } from "../src/chain/rpc-unit-budget.js";

function fakeRedis() {
  const values = new Map<string, number>();
  const evalMock = vi.fn(async (_script: string, _keys: number, key: string, rawUnits: string, rawLimit: string) => {
    const units = Number(rawUnits);
    const limit = Number(rawLimit);
    const current = values.get(key) ?? 0;
    if (current + units > limit) return [-1, current];
    values.set(key, current + units);
    return [current + units, limit - current - units];
  });
  return { redis: { eval: evalMock } as unknown as Pick<Redis, "eval">, evalMock, values };
}

describe("shared monthly RPC unit budget", () => {
  it("atomically reserves weighted batch members across instances and stops at the cap", async () => {
    const { redis, values } = fakeRedis();
    const config = [redis, "reviewed-account", 7, { eth_call: 2, eth_getLogs: 3 }] as const;
    const first = new RedisMonthlyRpcUnitBudget(...config);
    const second = new RedisMonthlyRpcUnitBudget(...config);
    const outcomes = await Promise.all([
      first.reserve(["eth_call", "eth_getLogs"]),
      second.reserve(["eth_call"]),
      first.reserve(["eth_call"]),
    ]);
    expect(outcomes.map((result) => result.outcome)).toEqual(["reserved", "reserved", "exhausted"]);
    expect([...values.values()]).toEqual([7]);
  });

  it("refuses unknown and malformed method sets before Redis without pretending they are free", async () => {
    const { redis, evalMock } = fakeRedis();
    const budget = new RedisMonthlyRpcUnitBudget(redis, "account", 10, { eth_call: 2 });
    await expect(budget.reserve([])).resolves.toEqual({ outcome: "unmetered" });
    await expect(budget.reserve(["eth_unknown"])).resolves.toEqual({ outcome: "unmetered" });
    await expect(budget.reserve(Array(101).fill("eth_call"))).resolves.toEqual({ outcome: "unmetered" });
    expect(evalMock).not.toHaveBeenCalled();
  });

  it("uses UTC month windows and fails closed when Redis cannot reserve", async () => {
    const { redis, evalMock, values } = fakeRedis();
    let now = new Date("2026-09-30T23:59:59.000Z");
    const budget = new RedisMonthlyRpcUnitBudget(redis, "account", 2, { eth_call: 2 }, () => now);
    expect((await budget.reserve(["eth_call"])).outcome).toBe("reserved");
    expect((await budget.reserve(["eth_call"])).outcome).toBe("exhausted");
    now = new Date("2026-10-01T00:00:00.000Z");
    expect((await budget.reserve(["eth_call"])).outcome).toBe("reserved");
    expect([...values.keys()]).toEqual([
      "rh:rpc-account-budget:account:2026-09",
      "rh:rpc-account-budget:account:2026-10",
    ]);
    evalMock.mockRejectedValueOnce(new Error("Redis unavailable"));
    await expect(budget.reserve(["eth_call"])).resolves.toEqual({ outcome: "unavailable" });
  });
});

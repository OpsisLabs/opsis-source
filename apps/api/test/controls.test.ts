import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import {
  ControlsService,
  controlSlot,
  decodeReading,
} from "../src/controls/service.js";
import { controlsRoutes } from "../src/routes/controls.js";
import { loadEnv } from "../src/config/env.js";
import { installErrorHandler } from "../src/http/errors.js";
import { RobinhoodRpcHttp, createRobinhoodRpcSpendBudget, robinhoodRpcEndpoint } from "../src/chain/robinhood-rpc.js";
const now = Date.parse("2026-09-22T00:00:00Z"),
  hash = `0x${"a".repeat(64)}`,
  contract = `0x${"1".repeat(40)}`;
const word = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const env = loadEnv({
  NODE_ENV: "test",
  OPSIS_WORKSPACES_ENABLED: "true",
  TOKEN_CONTROLS_ENABLED: "true",
});
function fixture(
  override: (method: string, params: unknown[], call: number) => unknown = () =>
    undefined,
) {
  const seen: { method: string; params: unknown[] }[] = [];
  const budget = { consume: vi.fn(async () => {}) };
  const rpc = {
    requestJson: vi.fn(async (_url: string, init?: RequestInit) => {
      const { method, params, id } = JSON.parse(String(init?.body));
      seen.push({ method, params });
      const custom = override(method, params, id);
      if (custom !== undefined) return { id, ...(custom as object) };
      return {
        id,
        result:
          method === "eth_chainId"
            ? "0x1237"
            : method === "eth_getBlockByNumber"
              ? {
                  number: "0x20",
                  timestamp: `0x${(now / 1000).toString(16)}`,
                  hash,
                }
              : method === "eth_getCode"
                ? "0x1234"
                : word(method === "eth_call" ? 1 : 0),
      };
    }),
  };
  return {
    service: new ControlsService(env, budget, rpc, () => now),
    seen,
    budget,
  };
}
describe("bounded standard controls", () => {
  it("uses one block, exact slots and no inferred mint permissions", async () => {
    const f = fixture();
    const r = await f.service.check(contract);
    expect(r.readings.paused).toEqual({ state: "observed", value: "true" });
    expect(r.coverage.unknown).toContain("mint_permissions");
    expect(f.budget.consume).toHaveBeenCalledWith(10);
    expect(f.seen).toHaveLength(9);
    expect(
      f.seen
        .filter((x) =>
          ["eth_call", "eth_getStorageAt", "eth_getCode"].includes(x.method),
        )
        .every((x) => x.params.at(-1) === "0x20"),
    ).toBe(true);
    expect(controlSlot("implementation")).toBe(
      "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
    );
  });
  it("keeps revert and malformed responses unknown; false is not absence of a pause control", async () => {
    expect(decodeReading(word(0), true)).toEqual({
      state: "observed",
      value: "false",
    });
    expect(decodeReading(word(2), true).state).toBe("unknown");
    expect(decodeReading("0x", false).state).toBe("unknown");
    const f = fixture((m) =>
      m === "eth_call" ? { error: { code: 3 } } : undefined,
    );
    expect((await f.service.check(contract)).readings.owner).toEqual({
      state: "unknown",
      reason: "reverted",
    });
  });
  it("rejects wrong chain, changed anchor, stale block and provider errors", async () => {
    for (const override of [
      (m: string) => (m === "eth_chainId" ? { result: "0x1" } : undefined),
      (m: string, _p: unknown[], n: number) =>
        m === "eth_getBlockByNumber" && n > 2
          ? { result: { hash: word(3) } }
          : undefined,
      (m: string) =>
        m === "eth_getBlockByNumber"
          ? { result: { number: "0x20", hash, timestamp: "0x1" } }
          : undefined,
      (m: string) =>
        m === "eth_call" ? { error: { code: -32000 } } : undefined,
    ])
      await expect(
        fixture(override).service.check(contract),
      ).rejects.toMatchObject({ statusCode: 503 });
  });
  it("fails before RPC when shared budget is exhausted", async () => {
    const f = fixture();
    f.budget.consume.mockRejectedValueOnce(new Error("exhausted"));
    await expect(f.service.check(contract)).rejects.toThrow("exhausted");
    expect(f.seen).toHaveLength(0);
  });
  it("no-code is not a control-free ERC20 verdict", async () => {
    const f = fixture((m) =>
      m === "eth_getCode" ? { result: "0x" } : undefined,
    );
    const r = await f.service.check(contract);
    expect(r.hasCode).toBe(false);
    expect(r.readings.owner.state).toBe("unknown");
    expect(f.seen.some((x) => x.method === "eth_call")).toBe(false);
  });
  it("hides disabled endpoint before source work and rejects extra/private input", async () => {
    const service = { check: vi.fn(async () => ({})) };
    const app = Fastify();
    installErrorHandler(app);
    await controlsRoutes(
      app,
      { ...env, TOKEN_CONTROLS_ENABLED: false },
      service,
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/private/opsis/controls",
          payload: { contract },
        })
      ).statusCode,
    ).toBe(404);
    expect(service.check).not.toHaveBeenCalled();
    await app.close();
    const enabled = Fastify();
    installErrorHandler(enabled);
    await controlsRoutes(enabled, env, service);
    expect(
      (
        await enabled.inject({
          method: "POST",
          url: "/v1/private/opsis/controls",
          payload: { contract, note: "private" },
        })
      ).statusCode,
    ).toBe(400);
    expect(service.check).not.toHaveBeenCalled();
    await enabled.close();
  });
});

describe("standard controls on the admitted dRPC transport", () => {
  it("sends all nine allowlisted reads to the dRPC URL and reports the drpc source", async () => {
    const key = "test-drpc-key-0123456789abcdef";
    const drpcEnv = loadEnv({
      NODE_ENV: "test",
      OPSIS_WORKSPACES_ENABLED: "true",
      TOKEN_CONTROLS_ENABLED: "true",
      ROBINHOOD_RPC_PROVIDER: "drpc",
      DRPC_API_KEY: key,
    });
    const f = fixture();
    const inner = { requestJson: vi.fn((url: string, init?: RequestInit) => f.service["rpc"].requestJson(url, init)) };
    const transport = new RobinhoodRpcHttp(robinhoodRpcEndpoint(drpcEnv), inner, createRobinhoodRpcSpendBudget(drpcEnv), key);
    const service = new ControlsService(drpcEnv, { consume: vi.fn(async () => {}) }, transport, () => now);

    const result = await service.check(contract);

    expect(result.source).toBe("drpc");
    expect(new Set(inner.requestJson.mock.calls.map(([url]) => url))).toEqual(new Set(["https://lb.drpc.live/robinhood"]));
    expect(f.seen.map((x) => x.method)).toContain("eth_getStorageAt");
    expect(f.seen).toHaveLength(9);
    expect(JSON.stringify(result)).not.toContain(key);
  });
});

describe("opt-in computation receipts", () => {
  it("keeps disabled responses byte-identical even when receipt=1", async () => {
    const app = Fastify(); installErrorHandler(app);
    const source = fixture();
    await controlsRoutes(app, env, source.service);
    const plain = await app.inject({ method: "POST", url: "/v1/private/opsis/controls", payload: { contract } });
    const asked = await app.inject({ method: "POST", url: "/v1/private/opsis/controls?receipt=1", payload: { contract } });
    expect(plain.statusCode).toBe(200); expect(asked.statusCode).toBe(200); expect(asked.body).toBe(plain.body); expect(asked.json()).not.toHaveProperty("receipt");
    await app.close();
  });
  it("signs actual per-request RPC evidence without an extra provider read", async () => {
    const { ReceiptService } = await import("../src/receipts/service.js");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { keccak256, recoverAddress } = await import("viem");
    const { canonicalize, canonicalBytes, sha256, verifyReceipt } = await import("@rh-chain/shared");
    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const keys = [{ address: account.address, validFrom: "2026-09-01T00:00:00.000Z", validTo: null }];
    const receipts = new ReceiptService({ address: account.address, signDigest: (hash) => account.sign({ hash }) }, keys, "a".repeat(40), () => now);
    const app = Fastify(); installErrorHandler(app); const source = fixture();
    await controlsRoutes(app, { ...env, RECEIPTS_ENABLED: true }, source.service, receipts);
    const plain = await app.inject({ method: "POST", url: "/v1/private/opsis/controls", payload: { contract } });
    expect(plain.json()).not.toHaveProperty("receipt"); source.seen.length = 0;
    const asked = await app.inject({ method: "POST", url: "/v1/private/opsis/controls?receipt=1", payload: { contract } });
    expect(asked.statusCode).toBe(200); const result = asked.json(); const { receipt, ...outputs } = result;
    expect(outputs).toEqual(plain.json()); expect(source.seen).toHaveLength(9); expect(receipt.rpcCalls).toHaveLength(9); expect(receipt.sources).toHaveLength(9);
    expect(receipt.rpcCalls[0]).toEqual({ method: "eth_chainId", paramsSha256: await sha256(canonicalBytes([])) });
    expect(receipt.sources[0].responseSha256).toBe(await sha256(canonicalBytes({ id: 1, result: "0x1237" })));
    expect(receipt.outputs).toEqual(outputs); expect(receipt.block.number).toBe("32"); expect(receipt.timestamp).toBeUndefined();
    expect((await verifyReceipt(canonicalize(receipt), keys, { keccak256, recoverAddress })).valid).toBe(true);
    await app.close();
  });
  it("refuses receipts when signer/evidence is missing", async () => {
    const app = Fastify(); installErrorHandler(app); const source = fixture();
    await controlsRoutes(app, { ...env, RECEIPTS_ENABLED: true }, source.service);
    expect((await app.inject({ method: "POST", url: "/v1/private/opsis/controls?receipt=1", payload: { contract } })).statusCode).toBe(503);
    expect(source.seen).toHaveLength(0); await app.close();
  });
});

it("refuses missing receipt evidence or signer failure instead of returning an unsigned result", async () => {
  const { ReceiptService } = await import("../src/receipts/service.js");
  const outputs = await fixture().service.check(contract);
  const signer = { address: `0x${"22".repeat(20)}`, signDigest: vi.fn().mockRejectedValue(new Error("fixture signer unavailable")) };
  const receipts = new ReceiptService(signer, [{ address: signer.address, validFrom: "2026-09-01T00:00:00.000Z", validTo: null }], "a".repeat(40), () => now);
  for (const service of [{ check: vi.fn(async () => outputs) }, fixture().service]) {
    const app = Fastify(); installErrorHandler(app); await controlsRoutes(app, { ...env, RECEIPTS_ENABLED: true }, service, receipts);
    const response = await app.inject({ method: "POST", url: "/v1/private/opsis/controls?receipt=1", payload: { contract } });
    expect(response.statusCode).toBe(503); expect(response.json()).not.toHaveProperty("receipt"); expect(response.body).not.toContain("signer unavailable"); await app.close();
  }
});

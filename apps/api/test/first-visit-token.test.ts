import { describe, expect, it } from "vitest";
import { encodeAbiParameters, stringToHex } from "viem";
import { loadEnv } from "../src/config/env.js";
import { AlchemyProvider } from "../src/chain/alchemy.js";
import { ChainEntityResolver } from "../src/chain/resolver.js";
import { decodeErc20Metadata } from "../src/chain/erc20-metadata.js";

const address = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const uint = (value: bigint) => encodeAbiParameters([{ type: "uint256" }], [value]);
const string = (value: string) => encodeAbiParameters([{ type: "string" }], [value]);
const env = loadEnv({ NODE_ENV: "test", ENABLE_PUBLIC_RPC_FALLBACK: "true" });

function harness(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const rpc = new AlchemyProvider(env, { async requestJson(_url, init) {
    const request = JSON.parse(String(init?.body));
    calls.push(request.method);
    if (request.method === "eth_getCode") return { result: overrides.code ?? "0x60016000" };
    if (request.method === "eth_getBalance") return { result: "0x0" };
    const fields: Record<string, string> = { "0x06fdde03": "name", "0x95d89b41": "symbol", "0x313ce567": "decimals", "0x18160ddd": "totalSupply" };
    const field = fields[request.params[0].data]!;
    if (overrides[field] instanceof Error) return { error: { message: "RPC error" } };
    const defaults: Record<string, unknown> = { name: string("Wrapped Ether"), symbol: string("WETH"), decimals: uint(18n), totalSupply: uint(123456789n) };
    return { result: field in overrides ? overrides[field] : defaults[field] };
  } });
  const unavailable = async () => { throw new Error("explorer 403"); };
  const resolver = new ChainEntityResolver(env, undefined, undefined, {
    alchemy: rpc,
    blockscout: { name: "blockscout", isConfigured: () => true, getTransaction: unavailable, getAddressSummary: unavailable,
      getToken: unavailable, getContract: unavailable },
    goldrush: { name: "goldrush", isConfigured: () => false, getAddressSummary: async () => [] }
  });
  return { resolver, calls };
}

describe("first visit Auto token recognition", () => {
  it("recognises WETH-like string getters with the explicit token facts and only four probe calls", async () => {
    const auto = harness();
    const explicit = harness();
    const result = await auto.resolver.resolveWithSources("unknown", address, { privateMode: true });
    const token = await explicit.resolver.resolveWithSources("token", address, { privateMode: true });
    expect(result.entity.type).toBe("token");
    expect({ ...result.entity.facts, sourceIds: undefined }).toEqual({ ...token.entity.facts, sourceIds: undefined });
    expect(result.entity.facts).toMatchObject({ name: "Wrapped Ether", symbol: "WETH", decimals: 18, totalSupply: "123456789",
      holderCoverage: "unavailable", activityCoverage: "unavailable", metadataCoverage: "rpc_partial" });
    expect(auto.calls).toHaveLength(6);
    expect(auto.calls.filter((method) => method === "eth_getCode")).toHaveLength(1);
    expect(explicit.calls).toHaveLength(5);
  });

  it("accepts bytes32 strings, strips controls, and permits one valid name or symbol", async () => {
    const { resolver } = harness({ name: "0x", symbol: stringToHex("W\u0000ETH\u007f", { size: 32 }) });
    const result = await resolver.resolveWithSources("unknown", address, { privateMode: true });
    expect(result.entity.type).toBe("token");
    expect(result.entity.facts).toMatchObject({ name: null, symbol: "WETH", decimals: 18 });
  });

  it.each([
    ["decimals too large", { decimals: uint(37n) }],
    ["not uint8", { decimals: uint(256n) }],
    ["malformed decimals", { decimals: "0x12" }],
    ["empty names", { name: string(""), symbol: string(" \n ") }],
    ["non-token", { name: "0x", symbol: "0x", decimals: "0x", totalSupply: "0x" }],
    ["probe RPC error", { totalSupply: new Error("unavailable") }],
    ["overlong names", { name: string("n".repeat(65)), symbol: string("s".repeat(65)) }]
  ])("keeps a contract when %s", async (_label, overrides) => {
    const { resolver, calls } = harness(overrides);
    const result = await resolver.resolveWithSources("unknown", address, { privateMode: true });
    expect(result.entity.type).toBe("contract");
    expect(result.entity.facts).not.toHaveProperty("metadataCoverage");
    expect(calls).toHaveLength(6);
  });

  it("keeps the explicit token path's partial metadata on a getter error", async () => {
    const { resolver } = harness({ totalSupply: new Error("unavailable") });
    const result = await resolver.resolveWithSources("token", address, { privateMode: true });
    expect(result.entity.type).toBe("token");
    expect(result.entity.facts).toMatchObject({ symbol: "WETH", decimals: 18, totalSupply: null, metadataCoverage: "rpc_partial" });
  });

  it("does not probe an explicitly requested contract", async () => {
    const { resolver, calls } = harness();
    expect((await resolver.resolveWithSources("contract", address, { privateMode: true })).entity.type).toBe("contract");
    expect(calls).toEqual(["eth_getCode", "eth_getBalance"]);
  });

  it("reuses the existing public resolution cache", async () => {
    const { resolver, calls } = harness();
    await resolver.resolveWithSources("unknown", address);
    await resolver.resolveWithSources("unknown", address);
    expect(calls).toHaveLength(6);
  });
});

describe("bounded ERC-20 strings", () => {
  it("accepts up to 64 printable Unicode characters and rejects invalid encodings", () => {
    expect(decodeErc20Metadata("symbol", string("例".repeat(64)))).toBe("例".repeat(64));
    expect(decodeErc20Metadata("symbol", stringToHex("demo0", { size: 32 }))).toBe("demo0");
    expect(decodeErc20Metadata("name", `0x${"ff".repeat(32)}`)).toBeNull();
    expect(decodeErc20Metadata("name", `${string("demo")}00`)).toBeNull();
    expect(decodeErc20Metadata("symbol", uint(0n))).toBeNull();
  });
});

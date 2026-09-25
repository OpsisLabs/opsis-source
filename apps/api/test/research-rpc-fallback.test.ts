import { describe, expect, it } from "vitest";
import { encodeAbiParameters } from "viem";
import { loadEnv } from "../src/config/env.js";
import { AlchemyProvider } from "../src/chain/alchemy.js";
import { ChainEntityResolver } from "../src/chain/resolver.js";
import { normalizeEntity } from "../src/chain/normalize.js";
import type { ChainProvider, SourceDocumentInput } from "../src/chain/types.js";

const address = "0x0000000000000000000000000000000000000042";
const code = "0x6001600055";
const now = "2026-09-24T00:00:00.000Z";
const env = loadEnv({ NODE_ENV: "test", ENABLE_PUBLIC_RPC_FALLBACK: "true" });

function doc(entityType: "token", method: string, result: unknown, query?: string, field?: string): SourceDocumentInput {
  return { id: `${method}-${field ?? "code"}`, provider: "robinhood-public-rpc", chainId: 4663,
    entityType, entityValue: address, requestUrl: "https://rpc.mainnet.chain.robinhood.com",
    responseJson: { method, result, ...(query ? { query } : {}), ...(field ? { field } : {}) }, fetchedAt: now };
}

const stringResult = (value: string) => encodeAbiParameters([{ type: "string" }], [value]);
const uintResult = (value: bigint) => encodeAbiParameters([{ type: "uint256" }], [value]);

function rpcProvider(results: Record<string, unknown>) {
  return new AlchemyProvider(env, {
    async requestJson(_url, init) {
      const request = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      if (request.method === "eth_getCode") return { result: results.code ?? code };
      const data = (request.params[0] as { data: string }).data;
      const field = ({ "0x06fdde03": "name", "0x95d89b41": "symbol", "0x313ce567": "decimals", "0x18160ddd": "totalSupply" } as Record<string, string>)[data];
      if (Object.prototype.hasOwnProperty.call(results, field)) return { result: results[field] };
      return { result: field === "name" ? stringResult("Example Token") : field === "symbol" ? stringResult("EX") : field === "decimals" ? uintResult(18n) : uintResult(1_000n) };
    }
  });
}

function explorer(getToken: () => Promise<SourceDocumentInput[]>): ChainProvider {
  return { name: "blockscout", isConfigured: () => true, getTransaction: async () => [], getAddressSummary: async () => [],
    getToken, getContract: async () => [] };
}

function resolver(blockscout: ChainProvider, alchemy: AlchemyProvider | Record<string, unknown>) {
  const rpc = alchemy as AlchemyProvider & { name: string; getTransaction: () => Promise<SourceDocumentInput[]>; getAddressSummary: () => Promise<SourceDocumentInput[]>; getAllowances: () => Promise<SourceDocumentInput[]> };
  return new ChainEntityResolver(env, undefined, undefined, {
    blockscout,
    alchemy: { name: rpc.name ?? "robinhood-public-rpc", getTransaction: rpc.getTransaction ?? (async () => []),
      getAddressSummary: rpc.getAddressSummary ?? (async () => []), getAllowances: rpc.getAllowances ?? (async () => []),
      getTokenMetadataSample: rpc.getTokenMetadataSample?.bind(rpc) },
    goldrush: { name: "goldrush", isConfigured: () => false, getAddressSummary: async () => [] }
  });
}

describe("Private Mode explicit token RPC fallback", () => {
  it("returns partial getter evidence after Blockscout failure", async () => {
    const result = await resolver(explorer(async () => { throw new Error("blockscout 403"); }), rpcProvider({}))
      .resolveWithSources("token", address, { privateMode: true });
    expect(result.entity.facts).toMatchObject({ name: "Example Token", symbol: "EX", decimals: 18,
      totalSupply: "1000", metadataCoverage: "rpc_partial", holderCoverage: "unavailable",
      activityCoverage: "unavailable", verified: null, proxy: null,
      blockRelation: "independent_samples_not_same_block_anchored" });
    expect(result.entity.facts).not.toHaveProperty("recentTransfers");
    expect(result.providerDestinations).toEqual(["blockscout", "robinhood-public-rpc"]);
  });

  it("keeps failed and malformed getters unknown while allowing enough valid evidence", async () => {
    const malformedName = "0x" + "00".repeat(32);
    const result = await resolver(explorer(async () => { throw new Error("403"); }), rpcProvider({ name: malformedName, decimals: "0x12" }))
      .resolveWithSources("token", address, { privateMode: true });
    expect(result.entity.facts).toMatchObject({ name: null, symbol: "EX", decimals: null, totalSupply: "1000", metadataCoverage: "rpc_partial" });
  });

  it("keeps missing or reverted getter values unknown", async () => {
    const docs = await rpcProvider({ name: null, symbol: null, decimals: null, totalSupply: null }).getTokenMetadataSample(address);
    const facts = normalizeEntity(4663, "token", address, docs).facts;
    expect(facts).toMatchObject({ name: null, symbol: null, decimals: null, totalSupply: null,
      metadataCoverage: "rpc_insufficient", holders: null, verified: null, proxy: null });
  });

  it("retains Blockscout failure when getter evidence is insufficient", async () => {
    const provider = rpcProvider({ name: "0x12", symbol: "0x12", decimals: "0x12", totalSupply: "0x12" });
    await expect(resolver(explorer(async () => { throw new Error("original Blockscout 403"); }), provider)
      .resolveWithSources("token", address, { privateMode: true })).rejects.toThrow("original Blockscout 403");
  });

  it.each(["0x", `0xef0100${address.slice(2)}`])("does not use empty or delegated code as token evidence (%s)", async (invalidCode) => {
    const provider = rpcProvider({ code: invalidCode });
    await expect(provider.getTokenMetadataSample(address)).resolves.toEqual([]);
  });

  it("keeps Blockscout success unchanged and never invokes fallback outside Private Mode", async () => {
    const explorerToken = { name: "Indexed", symbol: "IDX", decimals: "6", total_supply: "42" };
    const blockscout = explorer(async () => [{ id: "indexed", provider: "blockscout", chainId: 4663,
      entityType: "token", entityValue: address, requestUrl: "https://robinhoodchain.blockscout.com/api/v2/tokens/example",
      responseJson: explorerToken, fetchedAt: now }]);
    let fallbackCalls = 0;
    const rpc = rpcProvider({});
    const original = rpc.getTokenMetadataSample.bind(rpc);
    rpc.getTokenMetadataSample = async (value: string) => { fallbackCalls++; return original(value); };
    const resolved = await resolver(blockscout, rpc).resolveWithSources("token", address, { privateMode: true });
    expect(resolved.entity.facts.name).toBe("Indexed");
    expect(fallbackCalls).toBe(0);
    await expect(resolver(explorer(async () => { throw new Error("403"); }), rpc)
      .resolveWithSources("token", address)).rejects.toThrow("403");
    expect(fallbackCalls).toBe(0);
  });
});

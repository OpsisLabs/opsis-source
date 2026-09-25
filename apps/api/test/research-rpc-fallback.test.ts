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

const txHash = `0x${"ab".repeat(32)}`;
const blockHash = `0x${"cd".repeat(32)}`;

function transactionRpc(results: { transaction: unknown; receipt: unknown }) {
  return new AlchemyProvider(env, {
    async requestJson(_url, init) {
      const request = JSON.parse(String(init?.body)) as { method: string };
      return { result: request.method === "eth_getTransactionByHash" ? results.transaction : results.receipt };
    }
  });
}

function transactionExplorer(getTransaction: () => Promise<SourceDocumentInput[]>): ChainProvider {
  return { name: "blockscout", isConfigured: () => true, getTransaction, getAddressSummary: async () => [],
    getToken: async () => [], getContract: async () => [] };
}

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
    alchemy: { name: rpc.name ?? "robinhood-public-rpc", isConfigured: () => true, getTransaction: rpc.getTransaction?.bind(rpc) ?? (async () => []),
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

describe("Research transaction RPC fallback correlation", () => {
  const transaction = { hash: txHash, from: address, to: address, value: "0x1", blockHash, blockNumber: "0x2a" };
  const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const indexed = (who: string) => `0x${"0".repeat(24)}${who.slice(2)}`;
  const transferLog = { address, topics: [transferTopic, indexed(address), indexed(`0x${"00".repeat(19)}43`)],
    data: `0x${"00".repeat(31)}09`, logIndex: "0x0" };
  const receipt = { transactionHash: txHash, status: "0x1", blockHash, blockNumber: "0x2a", gasUsed: "0x5208", logs: [] as unknown[] };

  it("accepts a hash and block matched transaction/receipt pair", async () => {
    const provider = transactionRpc({ transaction, receipt });
    const docs = await provider.getTransaction(txHash);
    const facts = normalizeEntity(4663, "transaction", txHash, docs).facts;
    expect(facts).toMatchObject({ hash: txHash, status: "0x1", blockHash, transactionEvidenceCoverage: "rpc_pair_block_matched",
      observationFinality: "current_not_final" });
    expect(facts.failureDetail).toBeUndefined();
  });

  it("extracts only strict Transfer-shaped receipt observations", async () => {
    const docs = await transactionRpc({ transaction, receipt: { ...receipt, logs: [transferLog] } }).getTransaction(txHash);
    expect(normalizeEntity(4663, "transaction", txHash, docs).facts).toMatchObject({
      receiptTransferEvents: [{ emitter: address, from: address, to: `0x${"00".repeat(19)}43`, rawAmount: "9", logIndex: "0" }],
      receiptTransferCoverage: "complete"
    });
  });

  it("does not double-show duplicate indexes or accept unknown removed flags", async () => {
    const docs = await transactionRpc({ transaction, receipt: { ...receipt, logs: [transferLog,
      { ...transferLog, data: `0x${"00".repeat(31)}0a` }, { ...transferLog, logIndex: "0x1", removed: "false" }] } }).getTransaction(txHash);
    expect(normalizeEntity(4663, "transaction", txHash, docs).facts).toMatchObject({
      receiptTransferEvents: [{ rawAmount: "9", logIndex: "0" }], receiptTransferCoverage: "partial"
    });
  });

  it.each([
    ["failed", { ...receipt, status: "0x0", logs: [transferLog] }, "unavailable"],
    ["pending", { ...receipt, blockHash: null, logs: [transferLog] }, "unavailable"],
    ["null logs", { ...receipt, logs: null }, "unavailable"],
    ["over cap", { ...receipt, logs: Array.from({ length: 65 }, () => transferLog) }, "capped"]
  ])("reports %s receipt coverage", async (_label, rcpt, coverage) => {
    const docs = await transactionRpc({ transaction: _label === "pending" ? null : transaction, receipt: rcpt }).getTransaction(txHash);
    const facts = normalizeEntity(4663, "transaction", txHash, docs).facts;
    expect(facts.receiptTransferCoverage).toBe(coverage);
    expect(facts.receiptTransferEvents).toEqual([]);
  });

  it("keeps valid observations while marking ambiguous malformed logs partial", async () => {
    const docs = await transactionRpc({ transaction, receipt: { ...receipt, logs: [transferLog, {},
      { ...transferLog, topics: [transferTopic, "0x1234", transferLog.topics[2]] }] } }).getTransaction(txHash);
    expect(normalizeEntity(4663, "transaction", txHash, docs).facts).toMatchObject({
      receiptTransferEvents: [{ emitter: address }], receiptTransferCoverage: "partial"
    });
  });

  it.each([
    ["transaction hash", { ...transaction, hash: `0x${"ef".repeat(32)}` }, receipt],
    ["receipt hash", transaction, { ...receipt, transactionHash: `0x${"ef".repeat(32)}` }],
    ["block hash", transaction, { ...receipt, blockHash: `0x${"ef".repeat(32)}` }],
    ["block number", transaction, { ...receipt, blockNumber: "0x2b" }],
    ["missing transaction hash", { from: address }, receipt],
    ["malformed transaction hash", { ...transaction, hash: "0x1234" }, receipt],
    ["missing receipt hash", transaction, { status: "0x1" }],
    ["malformed receipt hash", transaction, { ...receipt, transactionHash: "0x1234" }],
    ["non-object transaction result", "malformed", receipt],
    ["array receipt result", transaction, [receipt]],
    ["null transaction inclusion contradiction", { ...transaction, blockHash: null }, receipt],
    ["malformed block hash", transaction, { ...receipt, blockHash: "0x1234" }],
    ["malformed block number", transaction, { ...transaction, blockNumber: "42" }, { ...receipt, blockNumber: "42" }]
  ])("rejects a mismatched %s without returning RPC documents", async (_label, tx, rcpt) => {
    await expect(transactionRpc({ transaction: tx, receipt: rcpt }).getTransaction(txHash))
      .rejects.toThrow("RPC_TRANSACTION_RESPONSE_MISMATCH");
  });

  it("keeps pending or missing inclusion evidence explicitly partial and unknown", async () => {
    const docs = await transactionRpc({ transaction: { ...transaction, blockHash: null, blockNumber: null }, receipt: null })
      .getTransaction(txHash);
    expect(normalizeEntity(4663, "transaction", txHash, docs).facts).toMatchObject({
      hash: txHash, transactionEvidenceCoverage: "partial", observationFinality: "unknown"
    });
  });

  it("accepts a receipt-only result as partial evidence", async () => {
    const docs = await transactionRpc({ transaction: null, receipt }).getTransaction(txHash);
    expect(normalizeEntity(4663, "transaction", txHash, docs).facts).toMatchObject({
      hash: txHash, status: "0x1", transactionEvidenceCoverage: "partial", observationFinality: "current_not_final"
    });
  });

  const indexedData = { hash: txHash, status: "success", from: address, to: address, value: "1", block_number: "42", block_hash: blockHash };
  function indexedDoc(value: Record<string, unknown> = indexedData): SourceDocumentInput {
    const blockscoutDoc: SourceDocumentInput = { id: "indexed-tx", provider: "blockscout", chainId: 4663,
      entityType: "transaction", entityValue: txHash, requestUrl: "https://robinhoodchain.blockscout.com/api/v2/transactions/example",
      responseJson: value, fetchedAt: now };
    return blockscoutDoc;
  }

  it("accepts matching cross-provider evidence and normalizes decimal/hex quantities", async () => {
    const result = await resolver(transactionExplorer(async () => [indexedDoc()]), transactionRpc({ transaction, receipt }))
      .resolveWithSources("transaction", txHash);
    expect(result.sources.map((source) => source.provider)).toEqual(["blockscout", "robinhood-public-rpc", "robinhood-public-rpc"]);
  });

  it("unwraps Blockscout address objects while comparing participants", async () => {
    const objectAddresses = { ...indexedData, from: { hash: address }, to: { hash: `0x${address.slice(2).toUpperCase()}` } };
    await expect(resolver(transactionExplorer(async () => [indexedDoc(objectAddresses)]), transactionRpc({ transaction, receipt }))
      .resolveWithSources("transaction", txHash)).resolves.toBeDefined();
    for (const field of ["from", "to"] as const) {
      const mismatch = { ...objectAddresses, [field]: { hash: `0x${"00".repeat(19)}43` } };
      await expect(resolver(transactionExplorer(async () => [indexedDoc(mismatch)]), transactionRpc({ transaction, receipt }))
        .resolveWithSources("transaction", txHash)).rejects.toThrow("conflicting evidence");
    }
  });

  it.each([
    ["hash", { ...indexedData, hash: `0x${"ef".repeat(32)}` }, transaction, receipt],
    ["malformed hash", { ...indexedData, hash: "0x1234" }, transaction, receipt],
    ["block hash", { ...indexedData, block_hash: `0x${"ef".repeat(32)}` }, transaction, receipt],
    ["block number", { ...indexedData, block_number: "43" }, transaction, receipt],
    ["status", { ...indexedData, status: "failed" }, transaction, receipt],
    ["value", { ...indexedData, value: "2" }, transaction, receipt],
    ["from", { ...indexedData, from: `0x${"00".repeat(19)}43` }, transaction, receipt],
    ["to", { ...indexedData, to: `0x${"00".repeat(19)}43` }, transaction, receipt],
    ["pending inclusion", { ...indexedData, block_hash: null, block_number: null }, transaction, receipt]
  ])("fails closed on conflicting cross-provider %s", async (_field, indexedValue, tx, rcpt) => {
    await expect(resolver(transactionExplorer(async () => [indexedDoc(indexedValue as Record<string, unknown>)]), transactionRpc({ transaction: tx, receipt: rcpt }))
      .resolveWithSources("transaction", txHash)).rejects.toThrow("conflicting evidence");
  });

  it("allows absent optional fields and preserves one-provider fallback", async () => {
    const rpc = transactionRpc({ transaction, receipt });
    const result = await resolver(transactionExplorer(async () => [indexedDoc({ hash: txHash })]), rpc).resolveWithSources("transaction", txHash);
    expect(result.sources).toHaveLength(3);
    const fallback = await resolver(transactionExplorer(async () => { throw new Error("explorer unavailable"); }), rpc)
      .resolveWithSources("transaction", txHash);
    expect(fallback.sources.map((source) => source.provider)).toEqual(["robinhood-public-rpc", "robinhood-public-rpc"]);
  });

  it("does not make additional RPC requests for consistency checks", async () => {
    let requestCount = 0;
    const rpc = new AlchemyProvider(env, { async requestJson(_url, init) {
      requestCount++;
      const request = JSON.parse(String(init?.body)) as { method: string };
      return { result: request.method === "eth_getTransactionByHash" ? transaction : receipt };
    } });
    await resolver(transactionExplorer(async () => [indexedDoc()]), rpc).resolveWithSources("transaction", txHash);
    expect(requestCount).toBe(2);
  });
});

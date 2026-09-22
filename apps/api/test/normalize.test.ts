import { describe, expect, it } from "vitest";
import { formatUnits, normalizeEntity } from "../src/chain/normalize.js";
import type { SourceDocumentInput } from "../src/chain/types.js";
import transaction from "./fixtures/blockscout-transaction.json";
import transfers from "./fixtures/blockscout-token-transfers.json";
import internalTransactions from "./fixtures/blockscout-internal-transactions.json";
import logs from "./fixtures/blockscout-logs.json";
import address from "./fixtures/blockscout-address.json";
import walletTransactions from "./fixtures/blockscout-transactions.json";
import tokenBalances from "./fixtures/blockscout-token-balances.json";
import rawTrace from "./fixtures/blockscout-raw-trace.json";
import stateChanges from "./fixtures/blockscout-state-changes.json";

const hash = transaction.hash;

function source(path: string, responseJson: unknown): SourceDocumentInput {
  return {
    id: path,
    provider: "blockscout",
    chainId: 4663,
    entityType: "transaction",
    entityValue: hash,
    requestUrl: `https://example.test/api/v2/transactions/${hash}${path}`,
    responseJson,
    fetchedAt: "2026-07-10T00:00:00.000Z"
  };
}

describe("transaction normalization", () => {
  it("distinguishes balance, code and sampled-token citations without exposing API URLs", () => {
    const docs = [
      { method: "eth_getBalance", result: "0x1" },
      { method: "eth_getCode", result: "0x" },
      { method: "eth_call", query: "reviewedTokenBalanceSample", result: { items: [], contractsChecked: 12 } },
    ].map((responseJson, i) => ({ ...source(String(i), responseJson), provider: "robinhood", entityType: "wallet" as const, requestUrl: "https://rpc.example.test?apikey=must-not-leak" }));
    const result = normalizeEntity(4663, "wallet", hash, docs);
    expect(result.citations.map(item => item.description)).toEqual([
      "Native ETH balance · robinhood", "Contract code / account delegation · robinhood",
      "Limited reviewed-token balance sample (not all holdings) · robinhood",
    ]);
    expect(JSON.stringify(result.citations)).not.toContain("must-not-leak");
  });
  it("normalizes decoded methods, transfers, internal calls, and events", () => {
    const normalized = normalizeEntity(4663, "transaction", hash, [
      source("", transaction),
      source("/token-transfers", transfers),
      source("/internal-transactions", internalTransactions),
      source("/logs", logs),
      source("/raw-trace", rawTrace),
      source("/state-changes", stateChanges)
    ]);

    expect(normalized.facts).toMatchObject({
      hash,
      status: "ok",
      from: "0x0000000000000000000000000000000000000001",
      to: "0x0000000000000000000000000000000000000002",
      method: "transfer",
      methodId: "0xa9059cbb",
      internalTransactionFailure: false
    });
    expect(normalized.facts.tokenTransfers).toEqual([
      expect.objectContaining({ tokenSymbol: "FIX", rawValue: "1250000000000000000", formattedValue: "1.25" })
    ]);
    expect(normalized.facts.internalTransactions).toHaveLength(1);
    expect(normalized.facts.events).toEqual([
      expect.objectContaining({ methodId: "0xddf252ad", signature: expect.stringContaining("Transfer") })
    ]);
    expect(normalized.facts.rawTrace).toEqual(rawTrace);
    expect(normalized.facts.stateChanges).toEqual(stateChanges.items);
    expect([...new Set(normalized.citations.map((citation) => citation.url))]).toEqual([
      `https://robinhoodchain.blockscout.com/tx/${hash}`
    ]);
  });

  it("formats integer units without floating-point loss", () => {
    expect(formatUnits("1000000000000000001", "18")).toBe("1.000000000000000001");
    expect(formatUnits("1", 6)).toBe("0.000001");
    expect(formatUnits("10", 0)).toBe("10");
  });

  it("ignores scalar Blockscout result fields while reading RPC objects", () => {
    const normalized = normalizeEntity(4663, "transaction", hash, [
      source("", { ...transaction, result: "success", created_contract: null }),
      {
        ...source("/rpc", {
          method: "eth_getTransactionReceipt",
          result: { status: "0x1", contractAddress: null }
        }),
        provider: "alchemy",
        requestUrl: "https://rpc.mainnet.chain.robinhood.com"
      }
    ]);

    expect(normalized.facts.status).toBe(transaction.status);
    expect(normalized.facts.contractAddress).toBeNull();
  });

  it("does not present an RPC operation name as the called contract method", () => {
    const normalized = normalizeEntity(4663, "transaction", hash, [
      {
        ...source("/rpc-transaction", {
          method: "eth_getTransactionByHash",
          result: { hash, from: transaction.from.hash, to: transaction.to.hash, value: "0x0" }
        }),
        provider: "alchemy",
        requestUrl: "https://rpc.mainnet.chain.robinhood.com"
      },
      {
        ...source("/rpc-receipt", {
          method: "eth_getTransactionReceipt",
          result: { status: "0x1", gasUsed: "0x3074c", contractAddress: null }
        }),
        provider: "alchemy",
        requestUrl: "https://rpc.mainnet.chain.robinhood.com"
      }
    ]);

    expect(normalized.facts).toMatchObject({
      hash,
      status: "0x1",
      gasUsed: "0x3074c"
    });
    expect(normalized.facts.method).toBeUndefined();
  });

  it("decodes transaction input from a verified contract ABI when provider decoding is absent", () => {
    const recipient = "0x0000000000000000000000000000000000000003";
    const rawInput = `0xa9059cbb${recipient.slice(2).padStart(64, "0")}${"5".padStart(64, "0")}`;
    const undecoded = { ...transaction, method: null, decoded_input: null, raw_input: rawInput };
    const abi = [{
      type: "function",
      name: "transfer",
      stateMutability: "nonpayable",
      inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
      outputs: [{ name: "", type: "bool" }]
    }];

    const normalized = normalizeEntity(4663, "transaction", hash, [
      source("", undecoded),
      source(`/smart-contracts/${transaction.to.hash}`, { abi })
    ]);

    expect(normalized.facts.method).toBe("transfer");
    expect(normalized.facts.decodedInput).toMatchObject({
      method_id: "0xa9059cbb",
      decoding_source: "local_contract_abi",
      parameters: [
        { name: "to", type: "address", value: recipient },
        { name: "amount", type: "uint256", value: "5" }
      ]
    });
  });
});

describe("wallet normalization", () => {
  it("summarizes failures, large movements, approvals, transfers, and balances", () => {
    const wallet = address.hash;
    const walletSource = (path: string, responseJson: unknown): SourceDocumentInput => ({
      id: `wallet-${path || "info"}`,
      provider: "blockscout",
      chainId: 4663,
      entityType: "wallet",
      entityValue: wallet,
      requestUrl: `https://example.test/api/v2/addresses/${wallet}${path}`,
      responseJson,
      fetchedAt: "2026-07-10T00:00:00.000Z"
    });
    const normalized = normalizeEntity(4663, "wallet", wallet, [
      walletSource("", address),
      walletSource("/transactions", walletTransactions),
      walletSource("/token-transfers", transfers),
      walletSource("/internal-transactions", internalTransactions),
      walletSource("/token-balances", tokenBalances),
      {
        ...walletSource("/allowance", {}),
        provider: "alchemy",
        responseJson: {
          method: "eth_call",
          owner: wallet,
          token: "0x0000000000000000000000000000000000000010",
          spender: "0x0000000000000000000000000000000000000099",
          query: "allowance",
          result: `0x${"f".repeat(64)}`
        }
      }
    ]);

    expect(normalized.facts.transactionsFetched).toBe(2);
    expect(normalized.facts.failedTransactions).toHaveLength(1);
    expect(normalized.facts.highValueMovements).toHaveLength(1);
    expect(normalized.facts.approvalTransactions).toEqual([
      expect.objectContaining({
        spender: "0x0000000000000000000000000000000000000099",
        unlimited: true,
        currentAllowanceRaw: "115792089237316195423570985008687907853269984665640564039457584007913129639935",
        currentAllowanceConfirmed: true,
        currentlyActive: true,
        currentUnlimited: true
      })
    ]);
    expect(normalized.facts.tokenBalances).toEqual([
      expect.objectContaining({ tokenSymbol: "FIX", formattedValue: "2.5" })
    ]);
    expect([...new Set(normalized.citations.map((citation) => citation.url))]).toEqual([
      `https://robinhoodchain.blockscout.com/address/${wallet}`
    ]);
    expect(normalized.riskNotes).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: "high", title: "Active unlimited token approval found" }),
      expect.objectContaining({ severity: "info", title: "Token approval activity found" }),
      expect.objectContaining({ severity: "info", title: "High-value native movement found" })
    ]));
  });

  it("does not flag a failed approval as granted", () => {
    const wallet = address.hash;
    const failedApproval = {
      items: [
        {
          ...walletTransactions.items[0],
          status: "error"
        }
      ]
    };
    const normalized = normalizeEntity(4663, "wallet", wallet, [
      {
        id: "wallet-info",
        provider: "blockscout",
        chainId: 4663,
        entityType: "wallet",
        entityValue: wallet,
        requestUrl: `https://example.test/api/v2/addresses/${wallet}`,
        responseJson: address,
        fetchedAt: "2026-07-10T00:00:00.000Z"
      },
      {
        id: "wallet-transactions",
        provider: "blockscout",
        chainId: 4663,
        entityType: "wallet",
        entityValue: wallet,
        requestUrl: `https://example.test/api/v2/addresses/${wallet}/transactions`,
        responseJson: failedApproval,
        fetchedAt: "2026-07-10T00:00:00.000Z"
      }
    ]);

    expect(normalized.facts.approvalTransactions).toEqual([]);
    expect(normalized.riskNotes).toEqual([]);
  });

  it("reports unverified, proxy, and recent-deployment contract signals", () => {
    const contract = "0x0000000000000000000000000000000000000020";
    const normalized = normalizeEntity(4663, "contract", contract, [{
      id: "contract-info",
      provider: "blockscout",
      chainId: 4663,
      entityType: "contract",
      entityValue: contract,
      requestUrl: `https://example.test/api/v2/smart-contracts/${contract}`,
      responseJson: { is_verified: false, is_proxy: true, creation_timestamp: new Date().toISOString() },
      fetchedAt: new Date().toISOString()
    }]);

    expect(normalized.riskNotes.map((note) => note.title)).toEqual(expect.arrayContaining([
      "Contract is not verified in available source data",
      "Proxy contract detected",
      "Recently deployed contract"
    ]));
  });

  it("keeps RPC-only contract metadata unknown and exposes sampled code and balance", () => {
    const contract = "0x0000000000000000000000000000000000000021";
    const normalized = normalizeEntity(4663, "contract", contract, [
      {
        id: "code", provider: "robinhood-public-rpc", chainId: 4663,
        entityType: "wallet", entityValue: contract, requestUrl: "https://rpc.example.test",
        responseJson: { method: "eth_getCode", result: "0x6001" }, fetchedAt: "2026-09-22T00:00:00.000Z"
      },
      {
        id: "balance", provider: "robinhood-public-rpc", chainId: 4663,
        entityType: "wallet", entityValue: contract, requestUrl: "https://rpc.example.test",
        responseJson: { method: "eth_getBalance", result: "0x0" }, fetchedAt: "2026-09-22T00:00:01.000Z"
      }
    ]);
    expect(normalized.facts).toMatchObject({
      verified: null, abiAvailable: null, proxy: null,
      codePresent: true, nativeBalanceEth: "0",
      observationFinality: "not_anchored",
      blockRelation: "independent_samples_not_same_block_anchored",
      sourceCoverage: "unavailable", holderCoverage: "unavailable", activityCoverage: "unavailable"
    });
    expect(normalized.facts.recentInteractions).toBeUndefined();
  });

  it("distinguishes an empty indexed window from no indexed source", () => {
    const contract = "0x0000000000000000000000000000000000000022";
    const base = {
      id: "metadata", provider: "blockscout", chainId: 4663,
      entityType: "contract" as const, entityValue: contract,
      requestUrl: `https://example.test/api/v2/smart-contracts/${contract}`,
      responseJson: { is_verified: true }, fetchedAt: "2026-09-22T00:00:00.000Z"
    };
    const empty = normalizeEntity(4663, "contract", contract, [
      base,
      { ...base, id: "transactions", requestUrl: `https://example.test/api/v2/addresses/${contract}/transactions`, responseJson: { items: [] } },
      { ...base, id: "holders", requestUrl: `https://example.test/api/v2/tokens/${contract}/holders`, responseJson: { items: [] } }
    ]);
    const absent = normalizeEntity(4663, "contract", contract, [base]);
    expect(empty.facts).toMatchObject({ activityCoverage: "indexed_window", holderCoverage: "indexed_window", recentInteractions: [], recentMethods: [] });
    expect(absent.facts).toMatchObject({ activityCoverage: "unavailable", holderCoverage: "unavailable" });
    expect(absent.facts.recentInteractions).toBeUndefined();
    expect(absent.facts.recentMethods).toBeUndefined();
  });

  it("does not treat malformed RPC code as deployed code", () => {
    const contract = "0x0000000000000000000000000000000000000023";
    const normalized = normalizeEntity(4663, "contract", contract, [{
      id: "code", provider: "robinhood-public-rpc", chainId: 4663,
      entityType: "wallet", entityValue: contract, requestUrl: "https://rpc.example.test",
      responseJson: { method: "eth_getCode", result: "0x600" }, fetchedAt: "2026-09-22T00:00:00.000Z"
    }]);
    expect(normalized.facts.codePresent).toBeUndefined();
    expect(normalized.facts.observation).toBeUndefined();
  });
});

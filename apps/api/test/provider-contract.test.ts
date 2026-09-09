import { describe, expect, it } from "vitest";
import { encodeFunctionResult, type Abi } from "viem";
import { AlchemyProvider } from "../src/chain/alchemy.js";
import { BlockscoutProvider } from "../src/chain/blockscout.js";
import type { ProviderHttp } from "../src/chain/provider-http.js";
import { loadEnv } from "../src/config/env.js";
import addressFixture from "./fixtures/blockscout-address.json";
import transactionsFixture from "./fixtures/blockscout-transactions.json";
import alchemyFixture from "./fixtures/alchemy-transaction.json";
import transactionFixture from "./fixtures/blockscout-transaction.json";
import transferFixture from "./fixtures/blockscout-token-transfers.json";
import internalFixture from "./fixtures/blockscout-internal-transactions.json";
import logsFixture from "./fixtures/blockscout-logs.json";
import balancesFixture from "./fixtures/blockscout-token-balances.json";
import rawTraceFixture from "./fixtures/blockscout-raw-trace.json";
import stateChangesFixture from "./fixtures/blockscout-state-changes.json";

class FixtureHttp implements ProviderHttp {
  readonly requests: Array<{ url: string; init?: RequestInit }> = [];

  async requestJson(url: string, init?: RequestInit): Promise<unknown> {
    this.requests.push({ url, init });
    if (url.includes("/token-transfers")) return transferFixture;
    if (url.includes("/token-balances")) return balancesFixture;
    if (url.includes("/internal-transactions")) return internalFixture;
    if (url.endsWith("/logs")) return logsFixture;
    if (url.endsWith("/raw-trace")) return rawTraceFixture;
    if (url.includes("/state-changes")) return stateChangesFixture;
    if (url.includes("/addresses/") && url.includes("/transactions")) return transactionsFixture;
    if (url.includes("/transactions/")) return transactionFixture;
    if (url.includes("/addresses/")) return addressFixture;
    const method = JSON.parse(String(init?.body)).method as string;
    return {
      result:
        method === "eth_getTransactionReceipt"
          ? alchemyFixture.receipt
          : method === "eth_call"
            ? `0x${"f".repeat(64)}`
            : alchemyFixture.transaction
    };
  }
}

describe("provider fixture contracts", () => {
  it("returns the transaction summary without starting stalled optional enrichment", async () => {
    const requests: string[] = [];
    const http: ProviderHttp = {
      async requestJson(url) {
        requests.push(url);
        if (new URL(url).pathname.endsWith(`/transactions/${transactionFixture.hash}`)) return transactionFixture;
        return new Promise(() => {});
      }
    };
    const provider = new BlockscoutProvider(loadEnv({ NODE_ENV: "test" }), http);
    const sources = await provider.getTransaction(transactionFixture.hash, { detail: "summary" });
    expect(sources.map(source => source.responseJson)).toEqual([transactionFixture]);
    expect(requests).toHaveLength(1);
  });

  it("does not turn failed transaction summary retrieval into empty evidence", async () => {
    const provider = new BlockscoutProvider(loadEnv({ NODE_ENV: "test" }), {
      async requestJson() { throw new Error("provider timed out"); }
    });
    await expect(provider.getTransaction(transactionFixture.hash, { detail: "summary" }))
      .rejects.toThrow("provider timed out");
  });

  it("maps Blockscout address endpoints into source documents", async () => {
    const http = new FixtureHttp();
    const provider = new BlockscoutProvider(loadEnv({ NODE_ENV: "test" }), http);
    const address = addressFixture.hash;

    const sources = await provider.getAddressSummary(address);

    expect(sources).toHaveLength(5);
    expect(sources[0]?.responseJson).toEqual(addressFixture);
    expect(sources[1]?.responseJson).toEqual(transactionsFixture);
    expect(sources[2]?.responseJson).toEqual(transferFixture);
    expect(sources[3]?.responseJson).toEqual(internalFixture);
    expect(sources[4]?.responseJson).toEqual(balancesFixture);
    expect(http.requests.map((request) => request.url)).toEqual([
      `https://robinhoodchain.blockscout.com/api/v2/addresses/${address}`,
      `https://robinhoodchain.blockscout.com/api/v2/addresses/${address}/transactions`,
      `https://robinhoodchain.blockscout.com/api/v2/addresses/${address}/token-transfers`,
      `https://robinhoodchain.blockscout.com/api/v2/addresses/${address}/internal-transactions`,
      `https://robinhoodchain.blockscout.com/api/v2/addresses/${address}/token-balances`
    ]);
  });

  it("uses a bounded parallel address snapshot for the privacy-first response", async () => {
    const http = new FixtureHttp();
    const provider = new BlockscoutProvider(loadEnv({ NODE_ENV: "test" }), http);
    const address = addressFixture.hash;

    const sources = await provider.getAddressSummary(address, { detail: "summary", limit: 25 });

    expect(sources.map((source) => source.responseJson)).toEqual([
      addressFixture,
      transactionsFixture,
      balancesFixture
    ]);
    expect(http.requests.map((request) => request.url)).toEqual([
      `https://robinhoodchain.blockscout.com/api/v2/addresses/${address}`,
      `https://robinhoodchain.blockscout.com/api/v2/addresses/${address}/transactions`,
      `https://robinhoodchain.blockscout.com/api/v2/addresses/${address}/token-balances`
    ]);
  });

  it("maps Alchemy transaction methods into source documents", async () => {
    const http = new FixtureHttp();
    const env = loadEnv({ NODE_ENV: "test", ALCHEMY_ROBINHOOD_RPC_URL: "https://alchemy.test" });
    const provider = new AlchemyProvider(env, http);

    const sources = await provider.getTransaction(alchemyFixture.transaction.hash);

    expect(sources).toHaveLength(2);
    expect(sources.map((source) => (source.responseJson as { method: string }).method)).toEqual([
      "eth_getTransactionByHash",
      "eth_getTransactionReceipt"
    ]);
    expect(provider.name).toBe("alchemy");
  });

  it("truthfully identifies the official public RPC fallback used by Private Mode", async () => {
    const http = new FixtureHttp();
    const env = loadEnv({ NODE_ENV: "test", ENABLE_PUBLIC_RPC_FALLBACK: "true" });
    const provider = new AlchemyProvider(env, http);

    const sources = await provider.getAddressSummary(addressFixture.hash);

    expect(provider.name).toBe("robinhood-public-rpc");
    expect(sources).toHaveLength(2);
    expect(sources.every((source) => source.provider === "robinhood-public-rpc")).toBe(true);
    expect(http.requests).toHaveLength(2);
    expect(http.requests.every((request) => request.url === env.ROBINHOOD_PUBLIC_RPC_URL)).toBe(true);
  });

  it("reads a bounded reviewed token sample through one read-only multicall", async () => {
    const balanceAbi = [{
      type: "function", name: "balanceOf", stateMutability: "view",
      inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }]
    }] as const satisfies Abi;
    const aggregateAbi = [{
      type: "function", name: "aggregate3", stateMutability: "payable",
      inputs: [{ name: "calls", type: "tuple[]", components: [
        { name: "target", type: "address" }, { name: "allowFailure", type: "bool" }, { name: "callData", type: "bytes" }
      ] }],
      outputs: [{ name: "returnData", type: "tuple[]", components: [
        { name: "success", type: "bool" }, { name: "returnData", type: "bytes" }
      ] }]
    }] as const satisfies Abi;
    const returns = Array.from({ length: 12 }, (_, index) => ({
      success: true,
      returnData: encodeFunctionResult({
        abi: balanceAbi,
        functionName: "balanceOf",
        result: index === 2 ? 1250000000000000000n : 0n
      })
    }));
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const http: ProviderHttp = {
      async requestJson(url, init) {
        requests.push({ url, init });
        return {
          result: encodeFunctionResult({ abi: aggregateAbi, functionName: "aggregate3", result: returns })
        };
      }
    };
    const env = loadEnv({ NODE_ENV: "test", ENABLE_PUBLIC_RPC_FALLBACK: "true" });
    const provider = new AlchemyProvider(env, http);

    const sources = await provider.getReviewedAssetBalances(addressFixture.hash);

    expect(requests).toHaveLength(1);
    const request = JSON.parse(String(requests[0]?.init?.body)) as { method: string; params: Array<{ to: string; data: string }> };
    expect(request.method).toBe("eth_call");
    expect(request.params[0]?.to.toLowerCase()).toBe("0xca11bde05977b3631167028862be2a173976ca11");
    expect(sources).toHaveLength(1);
    expect(sources[0]?.responseJson).toMatchObject({
      method: "eth_call",
      query: "reviewedTokenBalanceSample",
      contractsChecked: 12,
      items: [{ token: { symbol: "AAPL", decimals: 18 }, value: "1250000000000000000" }]
    });
  });

  it("reads and documents current allowances without exposing RPC credentials", async () => {
    const http = new FixtureHttp();
    const env = loadEnv({ NODE_ENV: "test", ALCHEMY_ROBINHOOD_RPC_URL: "https://alchemy.test/v2/private-key" });
    const provider = new AlchemyProvider(env, http);
    const owner = addressFixture.hash;
    const token = "0x0000000000000000000000000000000000000010";
    const spender = "0x0000000000000000000000000000000000000099";

    const sources = await provider.getAllowances(owner, [{ token, spender, method: "approve" }]);

    expect(sources).toHaveLength(1);
    expect(sources[0]?.requestUrl).not.toContain("private-key");
    expect(sources[0]?.responseJson).toMatchObject({ method: "eth_call", owner, token, spender, query: "allowance" });
    const request = JSON.parse(String(http.requests[0]?.init?.body)) as { method: string; params: Array<{ data: string }> };
    expect(request.method).toBe("eth_call");
    expect(request.params[0]?.data).toBe(`0xdd62ed3e${owner.slice(2).padStart(64, "0")}${spender.slice(2).padStart(64, "0")}`);
  });

  it("collects Blockscout transaction evidence endpoints", async () => {
    const http = new FixtureHttp();
    const provider = new BlockscoutProvider(loadEnv({ NODE_ENV: "test" }), http);

    const sources = await provider.getTransaction(transactionFixture.hash);

    expect(sources).toHaveLength(6);
    expect(sources.map((source) => source.responseJson)).toEqual([
      transactionFixture,
      transferFixture,
      internalFixture,
      logsFixture,
      rawTraceFixture,
      stateChangesFixture
    ]);
  });

  it("follows Blockscout cursors within the configured page cap", async () => {
    const address = addressFixture.hash;
    const http: ProviderHttp = {
      async requestJson(url) {
        if (url.includes("/transactions?") && url.includes("items_count=1")) {
          return { items: [{ hash: "0xpage2" }], next_page_params: null };
        }
        if (url.includes("/transactions")) {
          return { items: [{ hash: "0xpage1" }], next_page_params: { items_count: 1, index: 1 } };
        }
        if (url.includes("/token-balances")) return [];
        if (url.includes("/token-transfers") || url.includes("/internal-transactions")) {
          return { items: [], next_page_params: null };
        }
        return addressFixture;
      }
    };
    const provider = new BlockscoutProvider(loadEnv({ NODE_ENV: "test", BLOCKSCOUT_MAX_PAGES: "2" }), http);

    const sources = await provider.getAddressSummary(address);
    const pages = sources.filter((source) => source.requestUrl?.includes("/transactions"));

    expect(pages).toHaveLength(2);
    expect(pages.map((source) => (source.responseJson as { items: Array<{ hash: string }> }).items[0]?.hash)).toEqual([
      "0xpage1",
      "0xpage2"
    ]);

    const limitedSources = await provider.getAddressSummary(address, { limit: 25 });
    expect(limitedSources.filter((source) => source.requestUrl?.includes("/transactions"))).toHaveLength(1);
  });
});

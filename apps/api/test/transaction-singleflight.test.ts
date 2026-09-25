import { describe, expect, it, vi } from "vitest";
import { AlchemyProvider } from "../src/chain/alchemy.js";
import type { ProviderHttp } from "../src/chain/provider-http.js";
import { loadEnv } from "../src/config/env.js";

const hash = (suffix: string) => `0x${suffix.padStart(64, "0")}`;
const blockHash = hash("f");

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

function transactionResponses(requestJson: ProviderHttp["requestJson"] = async (_url, init) => {
  const body = JSON.parse(String(init?.body)) as { method: string; params: string[] };
  const txHash = body.params[0]!;
  return { result: body.method === "eth_getTransactionByHash"
    ? { hash: txHash, blockHash, blockNumber: "0x2" }
    : { transactionHash: txHash, blockHash, blockNumber: "0x2" } };
}) {
  const http: ProviderHttp = { requestJson: vi.fn(requestJson) };
  const provider = new AlchemyProvider(
    loadEnv({ NODE_ENV: "test", ALCHEMY_ROBINHOOD_RPC_URL: "https://alchemy.test" }), http
  );
  return { http, provider };
}

describe("Alchemy transaction in-flight deduplication", () => {
  it("shares one transaction and receipt pair among concurrent identical hashes", async () => {
    const gate = deferred();
    const { http, provider } = transactionResponses(async (_url, init) => {
      await gate.promise;
      return JSON.parse(String(init?.body)).method === "eth_getTransactionByHash"
        ? { result: { hash: hash("a"), blockHash, blockNumber: "0x2" } }
        : { result: { transactionHash: hash("a"), blockHash, blockNumber: "0x2" } };
    });

    const requests = Array.from({ length: 12 }, () => provider.getTransaction(hash("a").toUpperCase().replace("0X", "0x")));
    await Promise.resolve();
    expect(http.requestJson).toHaveBeenCalledTimes(2);
    gate.release();
    const results = await Promise.all(requests);
    expect(results).toHaveLength(12);
    expect(results.every((result) => result.map((doc) => doc.id).join(":") === results[0]!.map((doc) => doc.id).join(":"))).toBe(true);
    expect(results[0]?.map((doc) => (doc.responseJson as { method: string }).method)).toEqual([
      "eth_getTransactionByHash", "eth_getTransactionReceipt"
    ]);
  });

  it("starts a fresh pair after completion and keeps different hashes separate", async () => {
    const { http, provider } = transactionResponses();
    await provider.getTransaction(hash("a"));
    await provider.getTransaction(hash("a"));
    await provider.getTransaction(hash("b"));
    expect(http.requestJson).toHaveBeenCalledTimes(6);
  });

  it("clears failed in-flight work so a later call retries", async () => {
    let attempts = 0;
    const { http, provider } = transactionResponses(async (_url, init) => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary provider failure");
      const body = JSON.parse(String(init?.body)) as { method: string; params: string[] };
      return { result: body.method === "eth_getTransactionByHash"
        ? { hash: body.params[0], blockHash, blockNumber: "0x2" }
        : { transactionHash: body.params[0], blockHash, blockNumber: "0x2" } };
    });
    await expect(provider.getTransaction(hash("c"))).rejects.toThrow("temporary provider failure");
    await expect(provider.getTransaction(hash("c"))).resolves.toHaveLength(2);
    expect(http.requestJson).toHaveBeenCalledTimes(4);
  });

  it("does not retain more than 64 pending hashes and still coalesces existing keys", async () => {
    const gate = deferred();
    const { http, provider } = transactionResponses(async (_url, init) => {
      await gate.promise;
      const body = JSON.parse(String(init?.body)) as { method: string; params: string[] };
      return { result: body.method === "eth_getTransactionByHash"
        ? { hash: body.params[0], blockHash, blockNumber: "0x2" }
        : { transactionHash: body.params[0], blockHash, blockNumber: "0x2" } };
    });
    const pending = Array.from({ length: 65 }, (_, index) => provider.getTransaction(hash(index.toString(16).padStart(2, "0"))));
    const duplicate = provider.getTransaction(hash("00"));
    await Promise.resolve();
    expect(http.requestJson).toHaveBeenCalledTimes(130);
    gate.release();
    await Promise.all([...pending, duplicate]);
  });
});

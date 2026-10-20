import { describe, expect, it, vi } from "vitest";
import { decodeFunctionData, encodeFunctionResult, parseAbi } from "viem";
import {
  chainlinkAbi,
  readChainlinkUsd,
  usdgUsdFeed,
} from "../src/rwa/chainlink.js";
import { stockPairUsdPrice } from "../src/rwa/service.js";
import { LaunchReader } from "../src/launches/reader.js";
import { loadEnv } from "../src/config/env.js";

const block = "0x3039",
  seconds = 1792454400;
const stock = "0x5e81213613b6b86eab4c6c50d718d34359459786";
const uid = `0x${"ab".repeat(32)}` as const;
const feed = "0x1111111111111111111111111111111111111111";
const stockAbi = parseAbi([
  "function uid() view returns (bytes32)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function oraclePaused() view returns (bool)",
]);
function fixture(
  options: {
    answer?: bigint;
    updatedAt?: number;
    answeredInRound?: bigint;
    decimals?: number;
    description?: string;
    paused?: boolean;
    wrongUid?: boolean;
  } = {},
) {
  const read = vi.fn(async (_method: string, params: unknown[]) => {
    const call = params[0] as { to: string; data: `0x${string}` };
    if (call.to === stock) {
      const name = decodeFunctionData({
        abi: stockAbi,
        data: call.data,
      }).functionName;
      return encodeFunctionResult({
        abi: stockAbi,
        functionName: name,
        result: {
          uid: options.wrongUid ? `0x${"cd".repeat(32)}` : uid,
          symbol: "TTWO",
          decimals: 18,
          oraclePaused: options.paused ?? false,
        }[name] as never,
      });
    }
    const name = decodeFunctionData({
      abi: chainlinkAbi,
      data: call.data,
    }).functionName;
    return encodeFunctionResult({
      abi: chainlinkAbi,
      functionName: name,
      result: {
        description:
          options.description ??
          (call.to === usdgUsdFeed.proxyAddress
            ? "USDG / USD"
            : "Robinhood TTWO / USD"),
        decimals: options.decimals ?? 8,
        latestRoundData: [
          2n,
          options.answer ?? 50_000_000n,
          0n,
          BigInt(options.updatedAt ?? seconds),
          options.answeredInRound ?? 2n,
        ],
      }[name] as never,
    });
  });
  const document = vi.fn(async (url: string) =>
    url.endsWith("/assets")
      ? {
          assets: [
            {
              id: uid,
              tokenSymbol: "TTWO",
              tokenName: "Take-Two Interactive Software • Robinhood Token",
              tokenDecimals: 18,
              currentMultiplier: "5",
              pendingMultiplier: "",
              deployments: [{ contractAddress: stock, chainId: 4663 }],
            },
          ],
        }
      : [
          {
            name: "Robinhood TTWO / USD",
            proxyAddress: feed,
            heartbeat: 86400,
            decimals: 8,
            docs: {
              baseAsset: "TTWO",
              quoteAsset: "USD",
              blockchainName: "Robinhood",
              feedType: "primaryTokenizedPrice",
            },
          },
        ],
  );
  return { read, document };
}
describe("launch pair conversion from existing engines", () => {
  it("reads USDG / USD at the supplied anchor with 8 decimals and no peg assumption", async () => {
    const f = fixture();
    const price = await readChainlinkUsd(f.read, block, seconds, usdgUsdFeed);
    expect(price).toMatchObject({
      priceUsd: "0.5",
      anchored: true,
      source: expect.stringContaining(
        "Chainlink USDG / USD (0x61b7e5650328764b076a108eff5fa7282a1b9ad2)",
      ),
    });
    expect(f.read).toHaveBeenCalledTimes(3);
    expect(
      f.read.mock.calls.every(
        ([method, params]) =>
          method === "eth_call" &&
          (params[0] as any).to === usdgUsdFeed.proxyAddress &&
          params[1] === block,
      ),
    ).toBe(true);
  });
  it.each([
    { answer: 0n },
    { answer: -1n },
    { updatedAt: seconds - 86401 },
    { updatedAt: seconds + 1 },
    { answeredInRound: 1n },
    { decimals: 18 },
    { description: "Other / USD" },
  ])("refuses an invalid USDG conversion: %o", async (options) => {
    await expect(
      readChainlinkUsd(fixture(options).read, block, seconds, usdgUsdFeed),
    ).rejects.toThrow();
  });
  it("reuses exact Stock Token deployment and per-token feed discovery without multiplying again", async () => {
    const f = fixture({ answer: 200_00000000n, updatedAt: seconds - 3600 });
    const price = await stockPairUsdPrice(
      stock,
      f.document,
      f.read,
      block,
      seconds,
    );
    expect(price).toMatchObject({
      priceUsd: "200",
      decimals: 18,
      symbol: "TTWO",
      maxAgeSeconds: 86400,
      source: expect.stringContaining("multiplier already included"),
    });
    expect(f.document).toHaveBeenCalledTimes(2);
    expect(f.read.mock.calls.every(([, params]) => params[1] === block)).toBe(
      true,
    );
    expect(JSON.stringify(f.document.mock.calls)).not.toContain("/prices/");
    expect(
      await stockPairUsdPrice(
        "0x2222222222222222222222222222222222222222",
        f.document,
        f.read,
        block,
        seconds,
      ),
    ).toBeNull();
  });
  it.each([
    { paused: true },
    { wrongUid: true },
    { updatedAt: seconds - 86401 },
  ])(
    "refuses Stock Token identity, pause or stale feed evidence: %o",
    async (options) => {
      const f = fixture(options);
      await expect(
        stockPairUsdPrice(stock, f.document, f.read, block, seconds),
      ).rejects.toThrow();
    },
  );
  it("reserves document reads within the launch cap and records their receipt hashes separately from RPC calls", async () => {
    const budget = { consume: vi.fn(async () => {}) },
      f = fixture();
    const reader = new LaunchReader(
      loadEnv({ NODE_ENV: "test" }),
      budget,
      2,
      () => seconds * 1000,
    );
    const http = { requestJson: f.document };
    await reader.document(http, "https://api.robinhood.com/rhj/assets");
    expect(reader.calls).toBe(0);
    expect(reader.documentCalls).toBe(1);
    expect(budget.consume).toHaveBeenCalledWith(1);
    expect(reader.evidence.sources[0]).toMatchObject({
      id: "launch-document-1",
      responseSha256: expect.stringMatching(/^0x[0-9a-f]{64}$/),
    });
    await expect(
      reader.document(http, "https://api.robinhood.com/rhj/assets"),
    ).rejects.toThrow("Read cap reached");
    expect(http.requestJson).toHaveBeenCalledTimes(1);
  });
});

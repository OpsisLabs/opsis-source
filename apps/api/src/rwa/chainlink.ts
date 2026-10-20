import {
  decodeFunctionResult,
  encodeFunctionData,
  formatUnits,
  parseAbi,
  type Address,
  type Hex,
} from "viem";

export const chainlinkAbi = parseAbi([
  "function description() view returns (string)",
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
]);
export type AnchoredRead = (
  method: string,
  params: unknown[],
) => Promise<unknown>;
export type UsdFeed = {
  proxyAddress: string;
  name: string;
  decimals: number;
  heartbeat: number;
};
// Supplied Stock Token Desk feed review; no peg assumption. A conservative
// 24-hour sizing age limit is used here, not a claimed feed heartbeat.
export const usdgUsdFeed: UsdFeed = {
  proxyAddress: "0x61b7e5650328764b076a108eff5fa7282a1b9ad2",
  name: "USDG / USD",
  decimals: 8,
  heartbeat: 86_400,
};

/** Shared on-chain conversion: exact decimal strings, at the caller's anchor. */
/** Chainlink ETH / USD on Robinhood Chain 4663 (reference data directory, checked 20 October 2026). */
export const ethUsdFeed: UsdFeed = {
  proxyAddress: "0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9",
  name: "ETH / USD",
  decimals: 8,
  heartbeat: 86_400,
};
export async function readChainlinkUsd(
  read: AnchoredRead,
  block: string,
  seconds: number,
  feed: UsdFeed,
) {
  const call = async (
    functionName: "description" | "decimals" | "latestRoundData",
  ) =>
    decodeFunctionResult({
      abi: chainlinkAbi,
      functionName,
      data: (await read("eth_call", [
        {
          to: feed.proxyAddress as Address,
          data: encodeFunctionData({ abi: chainlinkAbi, functionName }),
        },
        block,
      ])) as Hex,
    });
  const description = await call("description"),
    decimals = await call("decimals"),
    round = await call("latestRoundData");
  if (
    description !== feed.name ||
    decimals !== feed.decimals ||
    !Array.isArray(round)
  )
    throw new Error("Pair feed identity unavailable");
  const [roundId, answer, , updatedAt, answeredInRound] =
    round as readonly bigint[];
  if (
    answer! <= 0n ||
    updatedAt! <= 0n ||
    updatedAt! > BigInt(seconds) ||
    BigInt(seconds) - updatedAt! > BigInt(feed.heartbeat) ||
    answeredInRound! < roundId!
  )
    throw new Error("Pair feed unavailable or stale");
  return {
    priceUsd: formatUnits(answer!, feed.decimals),
    observedAt: new Date(Number(updatedAt) * 1000).toISOString(),
    source: `Chainlink ${feed.name} (${feed.proxyAddress}), block ${BigInt(block)}`,
    maxAgeSeconds: feed.heartbeat,
    anchored: true as const,
  };
}

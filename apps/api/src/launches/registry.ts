import {
  decodeEventLog,
  parseAbiItem,
  toEventSelector,
  type Address,
  type Hex,
} from "viem";

// Versioned review input supplied for this preparation; no provider was queried.
export const registryVersion = "launch-registry/1";
export const reviewDate = "2026-10-20";
export const events = {
  pons: parseAbiItem(
    "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)",
  ),
  graduation: parseAbiItem(
    "event PoolGraduated(address indexed token, uint256 positionId, uint256 tokenAmount, uint256 pairTokenAmount)",
  ),
  long: parseAbiItem(
    "event LaunchCreated(address indexed poolOrHook, address indexed asset, address indexed numeraire, address poolInitializer, address launcher, bytes32 tickerKey, uint48 deployedAt, uint48 reservedUntil, string normalizedTicker)",
  ),
  launcher: parseAbiItem("event TokenCreated(address indexed token)"),
  instant: parseAbiItem(
    "event TokenLaunched(bytes32 indexed poolId, address indexed token, address indexed finalPositionRecipient, (address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key)",
  ),
  v3: parseAbiItem(
    "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)",
  ),
  v4: parseAbiItem(
    "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
  ),
  v4Swap: parseAbiItem(
    "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
  ),
  v3Mint: parseAbiItem(
    "event Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)",
  ),
  v4Liquidity: parseAbiItem(
    "event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)",
  ),
  transfer: parseAbiItem(
    "event Transfer(address indexed from, address indexed to, uint256 value)",
  ),
};
export type AdapterId = "pons" | "long" | "launcher" | "instant" | "v3" | "v4";
const supplied =
  "Founder-supplied chain review, 20 October 2026; explorer contract names and decoded events. Not independently queried in preparation.";
// Conservative lower bounds: deployment/earliest-event heights have not been
// independently verified. Genesis avoids excluding older evidence; call caps
// still bound scans. Replace only with reviewed deployment evidence.
export const longHistoryDeploymentBlock = 0;
export const registry = {
  pons: {
    deploymentBlock: 0,
    label: "Pons",
    address: "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e",
    source:
      "Third-party indexer and explorer contract names; unconfirmed by the launchpad",
    confirmation: "unconfirmed by the launchpad",
  },
  long: {
    deploymentBlock: 0,
    label: "Long",
    address: "0x1eef016f22a943abc7dd11422edee9d235942104",
    source: `${supplied} Pool hook: DopplerHookInitializer; PoolManager Initialize observed 20 October 2026 and Whetstone Doppler deployments (https://github.com/whetstoneresearch/doppler).`,
    confirmation: "supplied chain review",
  },
  launcher: {
    deploymentBlock: 0,
    label: "Uniswap Liquidity Launcher (includes pools.trade)",
    address: "0x0000ffffbe8efe702c8703ae3477ff5de3d319c0",
    source: `${supplied} Launcher v3.2.0; frontend identity is not distinguishable on chain.`,
    confirmation: "supplied chain review",
  },
  instant: {
    deploymentBlock: 0,
    label: "Uniswap Liquidity Launcher (includes pools.trade)",
    address: "0x7c48dde3b447381f4d986334679b3afc7f2d35c2",
    source: supplied,
    confirmation: "supplied chain review",
  },
  v3: {
    deploymentBlock: 0,
    label: "Uniswap v3",
    address: "0x1f7d7550b1b028f7571e69a784071f0205fd2efa",
    source: `${supplied} Standard Uniswap v3 factory ABI.`,
    confirmation: "supplied chain review",
  },
  v4: {
    deploymentBlock: 0,
    label: "Uniswap v4",
    address: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
    source: `${supplied} Standard Uniswap v4 PoolManager ABI.`,
    confirmation: "supplied chain review",
  },
} as const;
export const related = {
  ponsHook: "0xe5e702641ea86f4ae6cc3cdaed2b886f976be044",
  ponsLocker: "0x267444d099b10fb5ed7c3cc7b7c767adca574952",
  ponsV1: "0xa5aab3f0c6eeadf30ef1d3eb997108e976351feb",
  longPoolHook: "0x4e3468951d49f2eea976ed0d6e75ffcb44a9a544",
  longHistory: "0x22e99278308b393ea1260859b181ad7e78f5eeed",
} as const;
export const adapters = Object.keys(registry) as AdapterId[];
export const topic = (event: keyof typeof events): Hex =>
  toEventSelector(events[event]);
export const addressTopic = (address: string): Hex =>
  `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
export type ChainLog = {
  address: Address;
  topics: [Hex, ...Hex[]];
  data: Hex;
  blockNumber: Hex;
  blockHash: Hex;
  transactionHash: Hex;
  transactionIndex: Hex;
  logIndex: Hex;
  removed?: boolean;
};
export type Point = {
  blockNumber: number;
  blockHash: string;
  timestamp: string;
  transactionHash: string;
  logIndex: number;
};
export type Launch = {
  adapter: AdapterId;
  token: string;
  launchpad: string;
  factory: string;
  deployer: string | null;
  pool: string | null;
  curve: string | null;
  pairToken: string | null;
  poolId: string | null;
  fee?: number;
  poolGraduated?: boolean;
  poolKey?: import("./sell-test.js").PoolKey;
  hook: string | null;
  finalPositionRecipient: string | null;
  created: Point;
  t0: Point | null;
  t0Rule: string;
  confirmation: string;
  registryVersion: string;
  sourceNote: string;
  reviewDate: string;
  unknownReasons: Record<string, string>;
};
export function decode(
  log: ChainLog,
  event: keyof typeof events,
): Record<string, unknown> {
  return decodeEventLog({
    abi: [events[event]],
    topics: log.topics,
    data: log.data,
    strict: true,
  }).args as Record<string, unknown>;
}
const lower = (v: unknown) => String(v).toLowerCase();
export function decodeLaunch(
  id: AdapterId,
  log: ChainLog,
  point: Point,
  token?: string,
): Launch {
  if (
    !(
      [
        registry[id].address,
        ...(id === "long" ? [related.longHistory] : []),
      ] as readonly string[]
    ).includes(log.address.toLowerCase()) ||
    log.removed
  )
    throw new Error("Unregistered event source");
  const a = decode(log, id);
  const asset =
    id === "long"
      ? a.asset
      : id === "v3"
        ? a.token0
        : id === "v4"
          ? a.currency0
          : a.token;
  const other = id === "v3" ? a.token1 : id === "v4" ? a.currency1 : null;
  const selected =
    token && other && lower(other) === token.toLowerCase() ? other : asset;
  return {
    ...(id === "v3" ? { fee: Number(a.fee) } : {}),
    ...(id === "v4"
      ? {
          poolKey: {
            currency0: lower(a.currency0) as Address,
            currency1: lower(a.currency1) as Address,
            fee: Number(a.fee),
            tickSpacing: Number(a.tickSpacing),
            hooks: lower(a.hooks) as Address,
          },
        }
      : {}),
    ...(id === "instant"
      ? { poolKey: a.key as import("./sell-test.js").PoolKey }
      : {}),
    adapter: id,
    token: lower(selected),
    launchpad: registry[id].label,
    factory: log.address.toLowerCase(),
    deployer: a.deployer
      ? lower(a.deployer)
      : a.launcher
        ? lower(a.launcher)
        : null,
    curve: id === "pons" ? lower(a.curve) : null,
    pool: id === "v3" ? lower(a.pool) : null,
    pairToken:
      id === "pons"
        ? lower(a.pairToken)
        : id === "long"
          ? lower(a.numeraire)
          : other
            ? lower(selected) === lower(asset)
              ? lower(other)
              : lower(asset)
            : id === "instant"
              ? (() => {
                  const k = a.key as { currency0: string; currency1: string };
                  return lower(k.currency0) === lower(selected)
                    ? lower(k.currency1)
                    : lower(k.currency0);
                })()
              : null,
    poolId:
      id === "instant" ? lower(a.poolId) : id === "v4" ? lower(a.id) : null,
    hook:
      id === "long" ? lower(a.poolOrHook) : id === "v4" ? lower(a.hooks) : null,
    finalPositionRecipient:
      id === "instant" ? lower(a.finalPositionRecipient) : null,
    created: point,
    t0: ["pons", "long", "instant"].includes(id) ? point : null,
    t0Rule:
      id === "pons"
        ? "Curve trading opens at TokenLaunched; graduated pool trading needs PoolGraduated and Pons-hook Initialize."
        : id === "long" || id === "instant"
          ? "Launch transaction creates the pool and adds liquidity; T0 is its block."
          : id === "launcher"
            ? "TokenCreated alone does not establish trading start."
            : "T0 is the first positive liquidity add, not pool creation.",
    confirmation: registry[id].confirmation,
    registryVersion,
    sourceNote: registry[id].source,
    reviewDate,
    unknownReasons: {
      ...(!a.deployer && !a.launcher
        ? { deployer: "This event does not identify a deployer or launcher" }
        : {}),
      ...(!["pons", "long", "instant"].includes(id)
        ? {
            t0:
              id === "launcher"
                ? "TokenCreated does not establish trading start"
                : "First positive liquidity add not established",
          }
        : {}),
    },
  };
}

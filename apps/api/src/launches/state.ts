import {
  decodeFunctionResult,
  encodeFunctionData,
  parseAbi,
  encodeAbiParameters,
  keccak256,
  type Hex,
} from "viem";
import { LaunchReader, hex, unavailable } from "./reader.js";
import { keyParameters, type PoolKey } from "./sell-test.js";
export const stateView = "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b";
const slotAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
]);
export const poolIdFor = (key: PoolKey) =>
  keccak256(encodeAbiParameters(keyParameters, [key]));
export async function initialized(
  r: LaunchReader,
  poolId: string,
  block: number,
) {
  const raw = await r.read(
    "eth_call",
    [
      {
        to: stateView,
        data: encodeFunctionData({
          abi: slotAbi,
          functionName: "getSlot0",
          args: [poolId as Hex],
        }),
      },
      hex(block),
    ],
    true,
  );
  if (raw === null) throw unavailable();
  try {
    return (
      decodeFunctionResult({
        abi: slotAbi,
        functionName: "getSlot0",
        data: raw as Hex,
      })[0] > 0n
    );
  } catch {
    throw unavailable();
  }
}
export async function hasCode(r: LaunchReader, address: string, block: number) {
  const code = await r.read("eth_getCode", [address, hex(block)]);
  if (typeof code !== "string" || !/^0x(?:[0-9a-f]{2})*$/i.test(code))
    throw unavailable();
  return code !== "0x";
}
// Requires a persistent state transition, such as code deployment or pool initialization.
// Callers first check the upper bound; at most 28 historical observations.
export async function firstBlock(
  from: number,
  to: number,
  present: (block: number) => Promise<boolean>,
) {
  let calls = 0;
  while (from < to) {
    if (++calls > 28) throw unavailable("BUDGET_EXHAUSTED");
    const mid = Math.floor((from + to) / 2);
    if (await present(mid)) to = mid;
    else from = mid + 1;
  }
  return from;
}

const v3LiquidityAbi = parseAbi([
  "function liquidity() view returns (uint128)",
]);
const v4LiquidityAbi = parseAbi([
  "function getLiquidity(bytes32 poolId) view returns (uint128)",
]);
export async function liquid(
  r: LaunchReader,
  pool: string,
  poolId: string | null,
  block: number,
) {
  const abi = poolId ? v4LiquidityAbi : v3LiquidityAbi;
  const raw = await r.read(
    "eth_call",
    [
      {
        to: poolId ? stateView : pool,
        data: poolId
          ? encodeFunctionData({
              abi: v4LiquidityAbi,
              functionName: "getLiquidity",
              args: [poolId as Hex],
            })
          : encodeFunctionData({
              abi: v3LiquidityAbi,
              functionName: "liquidity",
            }),
      },
      hex(block),
    ],
    true,
  );
  if (raw === null) return false;
  try {
    return (
      BigInt(
        decodeFunctionResult({
          abi,
          functionName: poolId ? "getLiquidity" : "liquidity",
          data: raw as Hex,
        }) as bigint,
      ) > 0n
    );
  } catch {
    throw unavailable();
  }
}

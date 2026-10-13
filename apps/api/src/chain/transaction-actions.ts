import { encodeAbiParameters, toEventSelector, toFunctionSelector, type Address } from "viem";
import { UNISWAP_V3_FACTORY, EXIT_CHECK_FEE_TIERS } from "../exit-check/constants.js";
import { OBSERVED_TRADES_SWAP_TOPIC } from "../market/observed-trades.js";
import { REVIEWED_ROBINHOOD_ASSET_SAMPLE } from "./reviewed-assets.js";
import { decodeErc20Metadata } from "./erc20-metadata.js";

export const RESEARCH_MAX_RPC_SUBCALLS = 24;
export type TokenRef = { address: string; symbol: string | null; decimals: number | null };
type Leg = { token: TokenRef; rawAmount: string; amount: string | null };
export type DecodedAction =
  | { kind: "erc20_transfer"; logIndex: number; token: TokenRef; from: string; to: string; rawAmount: string; amount: string | null }
  | { kind: "erc20_approval"; logIndex: number; token: TokenRef; owner: string; spender: string; rawAmount: string; amount: string | null; unlimited: boolean }
  | { kind: "uniswap_v3_swap"; logIndex: number; pool: string; feeBps: number | null; sold: Leg; bought: Leg; sender: string; recipient: string };
export type DecodedReceipt = { decodedActions: DecodedAction[]; decodeCoverage: "decoded" | "partial" | "none" };
type ReadCall = (to: string, data: string, block: string) => Promise<unknown>;
type Pool = { token0: string; token1: string; feeBps: number };
const transferTopic = toEventSelector("Transfer(address,address,uint256)");
const approvalTopic = toEventSelector("Approval(address,address,uint256)");
const addressPattern = /^0x[\da-f]{40}$/i;
const wordPattern = /^0x[\da-f]{64}$/i;
const quantityPattern = /^0x(?:0|[1-9a-f][\da-f]*)$/i;
const indexedAddressPattern = /^0x0{24}[\da-f]{40}$/i;

export function exactTokenAmount(raw: bigint, decimals: number | null): string | null {
  if (decimals === null) return null;
  const scale = 10n ** BigInt(decimals);
  const fraction = (raw % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${raw / scale}${fraction ? `.${fraction}` : ""}`;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function callAddress(value: unknown): string | null {
  if (typeof value !== "string" || !indexedAddressPattern.test(value)) return null;
  const address = `0x${value.slice(-40).toLowerCase()}`;
  return /^0x0+$/.test(address) ? null : address;
}
function signedWord(word: string): bigint {
  const value = BigInt(`0x${word}`);
  return value >= 2n ** 255n ? value - 2n ** 256n : value;
}

// As in observed trades and Exit Check, the factory must return this exact
// pool for its ordered token pair and standard fee tier, at the receipt block.
async function verifyPool(pool: string, block: string, read: ReadCall): Promise<Pool | null> {
  const token0 = callAddress(await read(pool, toFunctionSelector("token0()"), block));
  const token1 = callAddress(await read(pool, toFunctionSelector("token1()"), block));
  const feeRaw = await read(pool, toFunctionSelector("fee()"), block);
  if (!token0 || !token1 || BigInt(token0) >= BigInt(token1)
    || typeof feeRaw !== "string" || !wordPattern.test(feeRaw)) return null;
  const fee = BigInt(feeRaw);
  if (!EXIT_CHECK_FEE_TIERS.some((tier) => BigInt(tier) === fee)) return null;
  const data = toFunctionSelector("getPool(address,address,uint24)") + encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint24" }],
    [token0 as Address, token1 as Address, Number(fee)]
  ).slice(2);
  if (callAddress(await read(UNISWAP_V3_FACTORY, data, block)) !== pool) return null;
  return { token0, token1, feeBps: Number(fee) / 100 };
}

export async function decodeReceiptActions(rawReceipt: unknown, read: ReadCall): Promise<DecodedReceipt> {
  const receipt = record(rawReceipt);
  const decodedActions: DecodedAction[] = [];
  if (!Array.isArray(receipt.logs) || typeof receipt.blockNumber !== "string" || !quantityPattern.test(receipt.blockNumber)
    || typeof receipt.blockHash !== "string" || !wordPattern.test(receipt.blockHash)
    || typeof receipt.transactionHash !== "string" || !wordPattern.test(receipt.transactionHash)
    || !["0x0", "0x1"].includes(String(receipt.status))) return { decodedActions, decodeCoverage: "none" };
  const block = receipt.blockNumber;
  let partial = false;
  const tokens = new Map<string, TokenRef>();
  const pools = new Map<string, Pool | null>();
  const indexes = new Set<number>();
  const metadata = async (address: string): Promise<TokenRef> => {
    const cached = tokens.get(address);
    if (cached) return cached;
    const token: TokenRef = { address, symbol: null, decimals: null };
    if (tokens.size >= 6) { partial = true; return token; }
    tokens.set(address, token);
    const reviewed = REVIEWED_ROBINHOOD_ASSET_SAMPLE.find((asset) => asset.address.toLowerCase() === address);
    if (reviewed) return Object.assign(token, { symbol: reviewed.symbol, decimals: reviewed.decimals });
    try {
      const symbol = decodeErc20Metadata("symbol", await read(address, toFunctionSelector("symbol()"), block));
      if (typeof symbol === "string") token.symbol = symbol;
      const decimals = decodeErc20Metadata("decimals", await read(address, toFunctionSelector("decimals()"), block));
      if (typeof decimals === "number" && decimals <= 36) token.decimals = decimals;
    } catch { partial = true; }
    if (token.symbol === null || token.decimals === null) partial = true;
    return token;
  };
  const leg = async (address: string, amount: bigint): Promise<Leg> => {
    const token = await metadata(address);
    return { token, rawAmount: amount.toString(), amount: exactTokenAmount(amount, token.decimals) };
  };
  // The response byte cap also bounds the receipt; stop processing once the
  // action cap is reached, without spending on later logs or metadata.
  for (const entry of receipt.logs) {
    if (decodedActions.length >= 40) { partial = true; break; }
    const log = record(entry);
    const topics = log.topics;
    if (typeof log.address !== "string" || !addressPattern.test(log.address)
      || !Array.isArray(topics) || topics.length !== 3 || !topics.every((topic) => typeof topic === "string" && wordPattern.test(topic))
      || !indexedAddressPattern.test(topics[1]) || !indexedAddressPattern.test(topics[2])
      || (log.removed !== undefined && log.removed !== false)
      || typeof log.logIndex !== "string" || !quantityPattern.test(log.logIndex)
      || typeof log.data !== "string" || !/^0x[\da-f]*$/i.test(log.data)) { partial = true; continue; }
    const logIndex = Number(BigInt(log.logIndex));
    if (!Number.isSafeInteger(logIndex) || indexes.has(logIndex)) { partial = true; continue; }
    indexes.add(logIndex);
    if (["blockHash", "transactionHash"].some((field) => log[field] !== undefined
      && String(log[field]).toLowerCase() !== String(receipt[field]).toLowerCase())
      || (log.blockNumber !== undefined && (typeof log.blockNumber !== "string" || !quantityPattern.test(log.blockNumber)
        || BigInt(log.blockNumber) !== BigInt(block)))
      || (log.transactionIndex !== undefined && (typeof log.transactionIndex !== "string" || !quantityPattern.test(log.transactionIndex)
        || (receipt.transactionIndex !== undefined && log.transactionIndex !== receipt.transactionIndex)))) { partial = true; continue; }
    const address = log.address.toLowerCase();
    const first = `0x${topics[1].slice(-40).toLowerCase()}`;
    const second = `0x${topics[2].slice(-40).toLowerCase()}`;
    const topic = topics[0].toLowerCase();
    if ((topic === transferTopic || topic === approvalTopic) && wordPattern.test(log.data)) {
      const raw = BigInt(log.data);
      const token = await metadata(address);
      const common = { logIndex, token, rawAmount: raw.toString(), amount: exactTokenAmount(raw, token.decimals) };
      decodedActions.push(topic === transferTopic
        ? { kind: "erc20_transfer", ...common, from: first, to: second }
        : { kind: "erc20_approval", ...common, owner: first, spender: second, unlimited: raw >= 2n ** 255n });
    } else if (topic === OBSERVED_TRADES_SWAP_TOPIC && log.data.length === 322) {
      const words = log.data.slice(2).match(/.{64}/g)!;
      const amount0 = signedWord(words[0]!);
      const amount1 = signedWord(words[1]!);
      const tick = signedWord(words[4]!);
      if (amount0 === 0n || amount1 === 0n || (amount0 > 0n) === (amount1 > 0n)
        || BigInt(`0x${words[2]}`) >= 2n ** 160n || BigInt(`0x${words[3]}`) >= 2n ** 128n
        || tick < -(2n ** 23n) || tick >= 2n ** 23n) { partial = true; continue; }
      if (!pools.has(address)) {
        try { pools.set(address, await verifyPool(address, block, read)); }
        catch { pools.set(address, null); }
      }
      const pool = pools.get(address);
      if (!pool) { partial = true; continue; }
      const sold = await leg(amount0 > 0n ? pool.token0 : pool.token1, amount0 > 0n ? amount0 : amount1);
      const bought = await leg(amount0 < 0n ? pool.token0 : pool.token1, amount0 < 0n ? -amount0 : -amount1);
      decodedActions.push({ kind: "uniswap_v3_swap", logIndex, pool: address, feeBps: pool.feeBps, sold, bought, sender: first, recipient: second });
    } else { partial = true; }
  }
  return { decodedActions, decodeCoverage: decodedActions.length === 0 ? "none" : partial ? "partial" : "decoded" };
}

import { randomBytes } from "node:crypto";
import {
  encodeAbiParameters,
  encodeFunctionData,
  parseAbi,
  parseAbiParameters,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { REVIEWED_ASSETS } from "@rh-chain/shared";
import { thousandDollarAmount } from "../cards/service.js";
import { parseExitAmount } from "../exit-check/math.js";
import { AppError } from "../http/errors.js";
import { events, type Launch } from "./registry.js";
import { decodeEventLog } from "viem";
import {
  LaunchReader,
  ReadCap,
  TimeLimit,
  hex,
  type Header,
} from "./reader.js";

// Supplied official-deployment review, 20 October 2026; no live verification here.
export const sellContracts = {
  v3Router: "0xcaf681a66d020601342297493863e78c959e5cb2",
  v4Router: "0x8876789976decbfcbbbe364623c63652db8c0904",
  permit2: "0x000000000022d473030f116ddee9f6b43ac78ba3",
  manager: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
  multicall3: "0xca11bde05977b3631167028862be2a173976ca11",
} as const;
export const nativeCurrency = "0x0000000000000000000000000000000000000000";
export const multicallAbi = parseAbi([
  "function getEthBalance(address addr) view returns (uint256)",
]);
const erc20 = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function deposit() payable",
]);
const permit = parseAbi([
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
export const v3Abi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256)",
]);
export const routerAbi = parseAbi([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
]);
export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};
export const keyParameters = parseAbiParameters(
  "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)",
);
const singleParameters = parseAbiParameters(
  "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
);
export function encodeV4Swap(
  key: PoolKey,
  input: Address,
  amount: bigint,
  deadline: bigint,
): Hex {
  if (
    amount <= 0n ||
    amount >= 2n ** 128n ||
    ![key.currency0.toLowerCase(), key.currency1.toLowerCase()].includes(
      input.toLowerCase(),
    )
  )
    throw new Error("Unsupported swap input");
  const zeroForOne = key.currency0.toLowerCase() === input.toLowerCase();
  const output = zeroForOne ? key.currency1 : key.currency0;
  // Universal Router V4_SWAP (0x10); v4-periphery Actions 0x06/0x0c/0x0f.
  // SETTLE_ALL pays native currency from the router's msg.value balance (no
  // Permit2 pull); TAKE_ALL sends native output to the execute caller.
  const params = [
    encodeAbiParameters(singleParameters, [
      {
        poolKey: key,
        zeroForOne,
        amountIn: amount,
        amountOutMinimum: 0n,
        hookData: "0x",
      },
    ]),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [input, amount]),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [output, 0n]),
  ];
  return encodeFunctionData({
    abi: routerAbi,
    functionName: "execute",
    args: [
      "0x10",
      [
        encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), [
          "0x060c0f",
          params,
        ]),
      ],
      deadline,
    ],
  });
}
export type Ratio = { numerator: string; denominator: string; decimal: string };
export function ratio(n: bigint, d: bigint): Ratio {
  if (d <= 0n) throw new Error("Invalid ratio denominator");
  const sign = n < 0n ? "-" : "",
    abs = n < 0n ? -n : n;
  return {
    numerator: n.toString(),
    denominator: d.toString(),
    decimal: `${sign}${abs / d}.${(((abs % d) * 1_000_000n) / d).toString().padStart(6, "0")}`,
  };
}
type Tax =
  | {
      state: "available";
      sentRaw: string;
      receivedRaw: string;
      inferredTax: Ratio;
      basis: string;
    }
  | { state: "unknown"; reason: string };
type SimLog = { address: string; topics: [Hex, ...Hex[]]; data: Hex };
type SimCall = {
  status: Hex;
  returnData: Hex;
  logs: SimLog[];
  error?: { code?: number; message?: string; data?: Hex };
};
type SimBlock = { calls: SimCall[] };
type Call = {
  from: Address;
  to: Address;
  data: Hex;
  gas: Hex;
  gasPrice: Hex;
  value?: Hex;
};
export type SellResult = {
  notionalUsd: string;
  delaySeconds: number;
  label: string;
  pairToken: string | null;
  conversionSource: string | null;
} & (
  | { state: "unavailable"; reason: string }
  | { state: "sell reverted"; revertData: Hex; buyTax: Tax }
  | {
      state: "available";
      spentRaw: string;
      boughtRaw: string;
      receivedRaw: string;
      roundTripCost: Ratio;
      buyTax: Tax;
      sellTax: Tax;
    }
);
export type SellTest = {
  methodVersion: "launch-sell-test/1";
  label: string;
  results: SellResult[];
  limitations: string[];
  conversion?: Price;
};
export type Price = {
  priceUsd: string;
  decimals: number;
  observedAt: string;
  source: string;
  symbol?: string;
  anchored?: boolean;
  maxAgeSeconds?: number;
};
const unavailableReason = (e: unknown) =>
  e instanceof TimeLimit
    ? "TIME_LIMIT"
    : e instanceof ReadCap
      ? "Launch-card RPC subcall budget reached"
      : e instanceof AppError
        ? String(
            (e.details as { reason?: string } | undefined)?.reason ?? e.code,
          )
        : "Simulation response unavailable or malformed";
const uint = (data: unknown): bigint => {
  if (typeof data !== "string" || !/^0x[0-9a-f]{64}$/i.test(data))
    throw new Error("Invalid balance result");
  return BigInt(data);
};
function tax(
  logs: SimLog[],
  token: string,
  sender: string,
  recipient: string,
): Tax {
  let sent = 0n,
    received = 0n;
  try {
    for (const log of logs) {
      if (log.address.toLowerCase() !== token.toLowerCase()) continue;
      // Ignore other events emitted by the token; malformed Transfer logs refuse inference.
      if (
        log.topics[0]?.toLowerCase() !==
        keccak256(new TextEncoder().encode("Transfer(address,address,uint256)"))
      )
        continue;
      const { args } = decodeEventLog({
        abi: [events.transfer],
        ...log,
        strict: true,
      });
      if (args.from.toLowerCase() === sender.toLowerCase()) sent += args.value;
      if (args.to.toLowerCase() === recipient.toLowerCase())
        received += args.value;
    }
  } catch {
    return {
      state: "unknown",
      reason: "Token Transfer logs could not be decoded",
    };
  }
  if (sent <= 0n || received > sent)
    return {
      state: "unknown",
      reason:
        "Token Transfer logs do not establish comparable sent and received amounts",
    };
  return {
    state: "available",
    sentRaw: sent.toString(),
    receivedRaw: received.toString(),
    inferredTax: ratio(sent - received, sent),
    basis:
      "Inferred from the token's own Transfer logs; logs are self-reported and do not establish balance changes independently",
  };
}
async function simulate(
  r: LaunchReader,
  anchor: Header,
  blocks: unknown[],
  counts: number[],
): Promise<SimBlock[]> {
  const raw = await r.read("eth_simulateV1", [
    { blockStateCalls: blocks, validation: false, traceTransfers: false },
    hex(anchor.number),
  ]);
  if (!Array.isArray(raw) || raw.length !== counts.length)
    throw new Error("Invalid simulated blocks");
  raw.forEach((block: SimBlock, i) => {
    if (!Array.isArray(block?.calls) || block.calls.length !== counts[i])
      throw new Error("Invalid simulated calls");
    for (const c of block.calls)
      if (
        !["0x0", "0x1"].includes(c.status) ||
        !/^0x(?:[0-9a-f]{2})*$/i.test(c.returnData) ||
        !Array.isArray(c.logs)
      )
        throw new Error("Invalid simulated result");
  });
  return raw;
}
export async function runSellTest(
  r: LaunchReader,
  anchor: Header,
  launch: Launch | undefined,
  priceSource: (pair: string) => Promise<Price | null>,
  disabledReason?: string,
): Promise<SellTest> {
  const label = `Simulation at block ${anchor.number}; behaviour can change.`;
  const base = {
    methodVersion: "launch-sell-test/1" as const,
    label,
    limitations: [
      "Synthetic account, empty hook data and overridden funding; simulation does not execute a transaction.",
      "Round-trip cost includes pool fees, price movement and token effects; native gas costs are separate and are not included. Simulated gas price and base fee are zero.",
      "Token logs are self-reported. Time overrides test this anchored state, not future market conditions.",
      "USD conversion has its own source time; on-chain feeds use the stated anchor, all conversions on this card use its stated anchor.",
    ],
  };
  let conversion: Price | undefined;
  const refuse = (reason: string): SellTest => ({
    ...base,
    ...(conversion ? { conversion } : {}),
    results: [100, 1000, 10000].flatMap((n) =>
      [0, 3600, 86400].map((delaySeconds) => ({
        notionalUsd: String(n),
        delaySeconds,
        label,
        pairToken: launch?.pairToken ?? null,
        conversionSource: conversion?.source ?? null,
        state: "unavailable" as const,
        reason,
      })),
    ),
  });
  if (disabledReason) return refuse(disabledReason);
  if (!launch) return refuse("Launch or pool is unknown");
  if (r.calls + r.documentCalls >= r.maxCalls - 1)
    return refuse("Launch-card RPC subcall budget reached");
  if (launch.adapter === "pons" && !launch.poolGraduated)
    return refuse(
      "Pons token remains on its curve; curve sell testing is outside this version",
    );
  if (!launch.pairToken || (!launch.pool && !launch.poolKey))
    return refuse("Unsupported or unidentified pool type");
  const pair = launch.pairToken.toLowerCase() as Address,
    token = launch.token as Address;
  const weth = REVIEWED_ASSETS.WETH.address.toLowerCase(),
    usdg = REVIEWED_ASSETS.USDG.address.toLowerCase();
  const native = pair === nativeCurrency;
  const key = launch.poolKey;
  if (native && !key) return refuse("Native ETH requires a v4 pool key");
  if (
    key &&
    (keccak256(encodeAbiParameters(keyParameters, [key])).toLowerCase() !==
      launch.poolId ||
      ![key.currency0.toLowerCase(), key.currency1.toLowerCase()].includes(
        token.toLowerCase(),
      ) ||
      ![key.currency0.toLowerCase(), key.currency1.toLowerCase()].includes(
        pair,
      ))
  )
    return refuse(
      "Pool key does not match the observed pool ID and currencies",
    );
  if (!key && launch.fee === undefined) return refuse("v3 fee is unknown");
  let pricing = true;
  let price: Price, actor: Address, slot: Hex | undefined;
  try {
    const resolvedPrice = await priceSource(pair);
    if (!resolvedPrice) return refuse("Unsupported pair token");
    price = resolvedPrice;
    conversion = price;
    pricing = false;
    if (
      !Number.isFinite(Date.parse(price.observedAt)) ||
      r.now() - Date.parse(price.observedAt) >
        (price.maxAgeSeconds ?? 60) * 1000 ||
      Date.parse(price.observedAt) > r.now() ||
      !Number.isInteger(price.decimals) ||
      price.decimals < 0 ||
      price.decimals > 36 ||
      ((native || pair === weth || pair === usdg) &&
        price.decimals !==
          REVIEWED_ASSETS[pair === usdg ? "USDG" : "WETH"].decimals)
    )
      return refuse("Pair USD conversion unavailable or stale");
    actor = `0x${randomBytes(20).toString("hex")}`;
    const block = hex(anchor.number);
    const [nonce, code, nativeBalance] = await Promise.all([
      r.read("eth_getTransactionCount", [actor, block]),
      r.read("eth_getCode", [actor, block]),
      r.read("eth_getBalance", [actor, block]),
    ]);
    if (nonce !== "0x0" || code !== "0x" || nativeBalance !== "0x0")
      return refuse("Synthetic account is not unused at the anchor");
    const balanceData = encodeFunctionData({
      abi: erc20,
      functionName: "balanceOf",
      args: [actor],
    });
    const balances = await Promise.all(
      (native ? [token] : [pair, token]).map((asset) =>
        r.read("eth_call", [{ to: asset, data: balanceData }, block]),
      ),
    );
    if (balances.some((balance) => uint(balance) !== 0n))
      return refuse("Synthetic account already holds tokens at the anchor");
    if (!native && pair !== weth) {
      // Verify storage through the same simulation path used by the swaps.
      // Every candidate starts afresh at the anchor; never infer a layout.
      const marker = 123456789n;
      for (let i = 0; i < 16; i++) {
        const candidate = keccak256(
          encodeAbiParameters(parseAbiParameters("address,uint256"), [
            actor,
            BigInt(i),
          ]),
        );
        const probe = await simulate(
          r,
          anchor,
          [
            {
              stateOverrides: {
                [pair]: {
                  stateDiff: { [candidate]: toHex(marker, { size: 32 }) },
                },
              },
              blockOverrides: {
                time: hex(anchor.seconds + 1),
                baseFeePerGas: "0x0",
              },
              calls: [
                {
                  from: actor,
                  to: pair,
                  data: balanceData,
                  gas: "0x4c4b40",
                  gasPrice: "0x0",
                },
              ],
            },
          ],
          [1],
        );
        const result = probe[0]!.calls[0]!;
        if (result.status === "0x1" && uint(result.returnData) === marker) {
          slot = candidate;
          break;
        }
      }
      if (!slot) return refuse("pair-token funding unsupported");
    }
  } catch (e) {
    return refuse(
      pricing &&
        e instanceof Error &&
        !(
          e instanceof AppError ||
          e instanceof ReadCap ||
          e instanceof TimeLimit
        )
        ? `Pair USD price unavailable: ${e.message}`
        : unavailableReason(e),
    );
  }
  const results: SellResult[] = [];
  let terminal: string | undefined;
  const failure = (e: unknown) => {
    const reason = unavailableReason(e);
    if (
      e instanceof ReadCap ||
      (e instanceof AppError && /BUDGET|LIMIT|UNSUPPORTED/.test(e.code))
    )
      terminal = reason;
    return reason;
  };
  const router = key ? sellContracts.v4Router : sellContracts.v3Router;
  const source = key ? sellContracts.manager : launch.pool!;
  const call = (to: Address, data: Hex, value?: bigint): Call => ({
    from: actor,
    to,
    data,
    gas: "0x4c4b40",
    gasPrice: "0x0",
    ...(value === undefined ? {} : { value: toHex(value) }),
  });
  const balance = (asset: Address) =>
    call(
      asset === nativeCurrency ? sellContracts.multicall3 : asset,
      encodeFunctionData({
        abi: asset === nativeCurrency ? multicallAbi : erc20,
        functionName: asset === nativeCurrency ? "getEthBalance" : "balanceOf",
        args: [actor],
      }),
    );
  const approve = (asset: Address): Call[] => [
    call(
      asset,
      encodeFunctionData({
        abi: erc20,
        functionName: "approve",
        args: [key ? sellContracts.permit2 : router, 2n ** 256n - 1n],
      }),
    ),
    ...(key
      ? [
          call(
            sellContracts.permit2,
            encodeFunctionData({
              abi: permit,
              functionName: "approve",
              args: [asset, router, 2n ** 160n - 1n, 2 ** 48 - 1],
            }),
          ),
        ]
      : []),
  ];
  const swap = (input: Address, output: Address, amount: bigint) =>
    call(
      router,
      key
        ? encodeV4Swap(key, input, amount, BigInt(anchor.seconds + 172800))
        : encodeFunctionData({
            abi: v3Abi,
            functionName: "exactInputSingle",
            args: [
              {
                tokenIn: input,
                tokenOut: output,
                fee: launch.fee!,
                recipient: actor,
                amountIn: amount,
                amountOutMinimum: 0n,
                sqrtPriceLimitX96: 0n,
              },
            ],
          }),
      input === nativeCurrency ? amount : undefined,
    );
  for (const n of [100, 1000, 10000]) {
    let prefix: Call[], spent: bigint, bought: bigint;
    const item = (delaySeconds: number) => ({
      notionalUsd: String(n),
      delaySeconds,
      label,
      pairToken: pair,
      conversionSource: price.source,
    });
    try {
      if (terminal) throw new AppError(terminal, 503, terminal);
      const amount = thousandDollarAmount(price.priceUsd, price.decimals, n);
      if (!amount)
        throw new AppError(
          "PAIR_CONVERSION_UNAVAILABLE",
          503,
          "Pair conversion unavailable",
        );
      spent = parseExitAmount(amount, price.decimals);
      prefix = [
        ...(native ? [balance(pair)] : []),
        ...(pair === weth
          ? [
              call(
                pair,
                encodeFunctionData({ abi: erc20, functionName: "deposit" }),
                spent,
              ),
            ]
          : []),
        ...(native ? [] : approve(pair)),
        swap(pair, token, spent),
        balance(token),
        balance(pair),
      ];
      const funding = {
        [actor]: { balance: toHex(spent + 10n ** 22n) },
        ...(slot
          ? { [pair]: { stateDiff: { [slot]: toHex(spent, { size: 32 }) } } }
          : {}),
      };
      const buyBlock = {
        stateOverrides: funding,
        blockOverrides: { time: hex(anchor.seconds + 1), baseFeePerGas: "0x0" },
        calls: prefix,
      };
      const probe = (
        await simulate(r, anchor, [buyBlock], [prefix.length])
      )[0]!;
      if (probe.calls.some((c) => c.status !== "0x1"))
        throw new AppError(
          "BUY_OR_FUNDING_REVERTED",
          503,
          "Buy or funding reverted",
        );
      bought = uint(probe.calls.at(-2)!.returnData);
      const pairAfterBuy = uint(probe.calls.at(-1)!.returnData);
      if (
        bought <= 0n ||
        (native
          ? uint(probe.calls[0]!.returnData) - pairAfterBuy !== spent
          : pairAfterBuy !== 0n)
      )
        throw new AppError(
          "INCOMPLETE_BUY",
          503,
          "Buy did not consume the stated pair input",
        );
      for (const delay of [0, 3600, 86400]) {
        try {
          if (terminal) throw new AppError(terminal, 503, terminal);
          // Replay the prefix to retain its real state, then sell in the next simulated block.
          // A second balance read verifies replay consistency before using its measured amount.
          const suffix = [
            ...(native ? [balance(pair)] : []),
            ...approve(token),
            swap(token, pair, bought),
            balance(pair),
            balance(token),
          ];
          const blocks = await simulate(
            r,
            anchor,
            [
              buyBlock,
              {
                blockOverrides: {
                  time: hex(anchor.seconds + 1 + Math.max(1, delay)),
                  baseFeePerGas: "0x0",
                },
                calls: suffix,
              },
            ],
            [prefix.length, suffix.length],
          );
          if (
            blocks[0]!.calls.some((c) => c.status !== "0x1") ||
            uint(blocks[0]!.calls.at(-2)!.returnData) !== bought ||
            uint(blocks[0]!.calls.at(-1)!.returnData) !== pairAfterBuy ||
            (native &&
              uint(blocks[0]!.calls[0]!.returnData) - pairAfterBuy !== spent)
          )
            throw new Error("Buy replay differs");
          const buyTax = tax(
            blocks[0]!.calls.at(-3)!.logs,
            token,
            source,
            actor,
          );
          const sell = blocks[1]!.calls.at(-3)!;
          if (blocks[1]!.calls.slice(0, -3).some((c) => c.status !== "0x1"))
            throw new AppError(
              "TOKEN_APPROVAL_REVERTED",
              503,
              "Token approval reverted",
            );
          if (sell.status === "0x0") {
            results.push({
              ...item(delay),
              state: "sell reverted",
              revertData: sell.error?.data ?? sell.returnData,
              buyTax,
            });
            continue;
          }
          if (
            blocks[1]!.calls.slice(-2).some((c) => c.status !== "0x1") ||
            uint(blocks[1]!.calls.at(-1)!.returnData) !== 0n
          )
            throw new AppError(
              "INCOMPLETE_SELL",
              503,
              "Sell did not consume the token balance",
            );
          const pairBeforeSell = native
            ? uint(blocks[1]!.calls[0]!.returnData)
            : 0n;
          if (native && pairBeforeSell !== pairAfterBuy)
            throw new Error("Native balance replay differs");
          const received =
            uint(blocks[1]!.calls.at(-2)!.returnData) - pairBeforeSell;
          if (received < 0n) throw new Error("Invalid native proceeds");
          results.push({
            ...item(delay),
            state: "available",
            spentRaw: spent.toString(),
            boughtRaw: bought.toString(),
            receivedRaw: received.toString(),
            roundTripCost: ratio(spent - received, spent),
            buyTax,
            sellTax: tax(sell.logs, token, actor, source),
          });
        } catch (e) {
          results.push({
            ...item(delay),
            state: "unavailable",
            reason: failure(e),
          });
        }
      }
    } catch (e) {
      results.push(
        ...[0, 3600, 86400].map((delay) => ({
          ...item(delay),
          state: "unavailable" as const,
          reason: failure(e),
        })),
      );
    }
  }
  return { ...base, conversion: price, results };
}

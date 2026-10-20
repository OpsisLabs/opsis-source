import { z } from "zod";
import {
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  parseAbi,
  toHex,
  toEventSelector,
  type Hex,
} from "viem";
import type { Env } from "../config/env.js";
import {
  createRobinhoodRpcHttp,
  robinhoodRpcEndpoint,
  type RpcSpendBudget,
} from "../chain/robinhood-rpc.js";
import {
  createProviderHttp,
  type ProviderHttp,
} from "../chain/provider-http.js";
import { BlockscoutProvider } from "../chain/blockscout.js";
import { stockAbi, findStockAsset } from "../rwa/service.js";
import {
  decodeObservedSwap,
  OBSERVED_TRADES_FACTORY,
  OBSERVED_TRADES_SWAP_TOPIC,
} from "../market/observed-trades.js";
import {
  addressSchema,
  type AlertRule,
  type Anchor,
  type BlockMode,
  type Event,
} from "./rules.js";
import type { AlertBudget } from "./guards.js";
export class AlertRangeError extends Error {
  constructor(readonly limit?: number) {
    super("ALERTS_RPC_RANGE");
  }
}
/** Only range denials change the range; upstream payloads never leave this boundary. */
export function rangeError(value: unknown): AlertRangeError | null {
  if (!value || typeof value !== "object") return null;
  const { code, message } = value as { code?: unknown; message?: unknown };
  if (
    typeof message !== "string" ||
    /rate|timeout|timed out|too many requests/i.test(message)
  )
    return null;
  const match = /range over\s+([\d,]+)\s+blocks/i.exec(message);
  if (
    code !== 22 &&
    !match &&
    !(
      [-32602, -32005].includes(Number(code)) &&
      /range|blocks?.*(?:limit|maximum)|(?:limit|maximum).*blocks?/i.test(
        message,
      )
    )
  )
    return null;
  const n = match ? Number(match[1]!.replaceAll(",", "")) : undefined;
  return new AlertRangeError(n && Number.isSafeInteger(n) ? n : undefined);
}

export interface AlertSource {
  block(tag: BlockMode | bigint): Promise<Anchor>;
  logs(rules: AlertRule[], from: bigint, to: bigint): Promise<Event[]>;
  multiplier(address: string, anchor: Anchor): Promise<string>;
}
const transferAbi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
const approvalAbi = parseAbi([
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
]);
export const TRANSFER_TOPIC = toEventSelector(transferAbi[0]);
export const APPROVAL_TOPIC = toEventSelector(approvalAbi[0]);
const hash = z
  .string()
  .regex(/^0x[0-9a-f]{64}$/i)
  .transform((value) => value.toLowerCase());
const hex = z.string().regex(/^0x[0-9a-f]+$/i);
const rawLog = z.object({
  address: addressSchema,
  blockHash: hash,
  blockNumber: hex,
  transactionHash: hash,
  logIndex: hex,
  data: z.string().regex(/^0x[0-9a-f]*$/i),
  topics: z.array(hash).max(4),
  removed: z.boolean().optional(),
});
const poolAbi = parseAbi([
  "function factory() view returns (address)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function getPool(address,address,uint24) view returns (address)",
]);
const topicAddress = (address: string) =>
  `0x${address.slice(2).padStart(64, "0")}`;
const batches = <T>(values: T[]): T[][] =>
  Array.from({ length: Math.ceil(values.length / 20) }, (_, index) =>
    values.slice(index * 20, index * 20 + 20),
  );
const unique = (values: string[]) => [...new Set(values)];
export function alertLogFilters(
  rules: AlertRule[],
): Array<Record<string, unknown>> {
  const filters: Array<Record<string, unknown>> = [];
  const transfers = rules.filter((rule) => rule.type === "transfer_above");
  for (const tokens of batches(
    unique(
      transfers.map((rule) =>
        rule.type === "transfer_above" ? rule.params.token : "",
      ),
    ),
  )) {
    for (const owners of batches(
      unique(
        transfers
          .filter(
            (rule) =>
              rule.type === "transfer_above" &&
              tokens.includes(rule.params.token),
          )
          .map((rule) => topicAddress(rule.watchedAddress)),
      ),
    )) {
      filters.push(
        { address: tokens, topics: [TRANSFER_TOPIC, owners] },
        { address: tokens, topics: [TRANSFER_TOPIC, null, owners] },
      );
    }
  }
  for (const owners of batches(
    unique(
      rules
        .filter((rule) => rule.type === "approval_unverified")
        .map((rule) => topicAddress(rule.watchedAddress)),
    ),
  ))
    filters.push({ topics: [APPROVAL_TOPIC, owners] });
  for (const pools of batches(
    unique(
      rules
        .filter((rule) => rule.type === "large_swap")
        .map((rule) => rule.watchedAddress),
    ),
  ))
    filters.push({ address: pools, topics: [OBSERVED_TRADES_SWAP_TOPIC] });
  return filters;
}
export class RpcAlertSource implements AlertSource {
  readonly calls: Record<string, number> = {};
  readonly latencyMs: Record<string, number> = {};
  private readonly rpc: ProviderHttp;
  private readonly explorer: BlockscoutProvider;
  private readonly publicHttp: ProviderHttp;
  private readonly endpoint: string;
  constructor(
    env: Env,
    spend: RpcSpendBudget,
    private readonly budget: AlertBudget,
    private readonly checkLease: () => Promise<void>,
    rpc?: ProviderHttp,
    publicHttp?: ProviderHttp,
  ) {
    const oneAttempt = { ...env, PROVIDER_MAX_RETRIES: 0 };
    this.rpc =
      rpc ??
      createRobinhoodRpcHttp(oneAttempt, {
        providerName: "alerts",
        spend,
        client: { maxRetries: 0, rpcWorkload: "alerts" },
      });
    this.publicHttp =
      publicHttp ?? createProviderHttp(oneAttempt, "alerts-public-source");
    this.explorer = new BlockscoutProvider(oneAttempt);
    this.endpoint = robinhoodRpcEndpoint(env).url;
  }
  private async call(method: string, params: unknown[]): Promise<unknown> {
    await this.checkLease();
    await this.budget.reserve();
    this.calls[method] = (this.calls[method] ?? 0) + 1;
    const started = performance.now();
    let response: unknown;
    try {
      response = await this.rpc.requestJson(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
    } finally {
      this.latencyMs[method] =
        (this.latencyMs[method] ?? 0) + performance.now() - started;
    }
    if (response && typeof response === "object" && "error" in response) {
      const error = (response as { error: unknown }).error;
      if (method === "eth_getLogs") {
        const range = rangeError(error);
        if (range) throw range;
      }
      throw new Error("ALERTS_RPC_UNAVAILABLE");
    }
    const parsed = z
      .object({ id: z.literal(1), result: z.unknown() })
      .parse(response);
    if (!("result" in parsed)) throw new Error("ALERTS_RPC_UNAVAILABLE");
    return parsed.result;
  }
  async block(tag: BlockMode | bigint): Promise<Anchor> {
    const value = z
      .object({ number: hex, hash })
      .parse(
        await this.call("eth_getBlockByNumber", [
          typeof tag === "bigint" ? toHex(tag) : tag,
          false,
        ]),
      );
    const number = BigInt(value.number);
    if (typeof tag === "bigint" && number !== tag)
      throw new Error("ALERTS_BLOCK_MISMATCH");
    return { number, hash: value.hash };
  }
  private async read(
    address: string,
    abi: typeof poolAbi | typeof stockAbi,
    functionName: (typeof poolAbi | typeof stockAbi)[number]["name"],
    block: bigint,
    args?: readonly unknown[],
  ) {
    const data = encodeFunctionData({ abi, functionName, args } as Parameters<
      typeof encodeFunctionData
    >[0]);
    const value = await this.call("eth_call", [
      { to: address, data },
      toHex(block),
    ]);
    if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value))
      throw new Error("ALERTS_READ_INVALID");
    return decodeFunctionResult({ abi, functionName, data: value as Hex });
  }
  async multiplier(address: string, anchor: Anchor): Promise<string> {
    await this.checkLease();
    await this.budget.reserve();
    const registry = await this.publicHttp.requestJson(
      "https://api.robinhood.com/rhj/assets",
      { redirect: "error" },
    );
    const asset = findStockAsset(registry, address);
    if (!asset) throw new Error("ALERTS_STOCK_IDENTITY_UNKNOWN");
    const uid = await this.read(address, stockAbi, "uid", anchor.number);
    const symbol = await this.read(address, stockAbi, "symbol", anchor.number);
    const decimals = await this.read(
      address,
      stockAbi,
      "decimals",
      anchor.number,
    );
    if (
      typeof uid !== "string" ||
      uid.toLowerCase() !== asset.id.toLowerCase() ||
      symbol !== asset.symbol ||
      decimals !== asset.decimals
    )
      throw new Error("ALERTS_STOCK_IDENTITY_MISMATCH");
    const value = await this.read(
      address,
      stockAbi,
      "newUIMultiplier",
      anchor.number,
    );
    if (typeof value !== "bigint") throw new Error("ALERTS_MULTIPLIER_UNKNOWN");
    return String(value);
  }
  async logs(rules: AlertRule[], from: bigint, to: bigint): Promise<Event[]> {
    if (from < 0n || to < from || to - from >= 50_000n)
      throw new Error("ALERTS_RANGE_INVALID");
    const filters = alertLogFilters(rules);
    const events: Event[] = [];
    const pools = new Map<string, string>();
    const approvals = new Map<
      string,
      "verified" | "unverified" | "unknown" | "eoa"
    >();
    let count = 0;
    for (const filter of filters) {
      const logs = z
        .array(rawLog)
        .max(1000)
        .parse(
          await this.call("eth_getLogs", [
            { ...filter, fromBlock: toHex(from), toBlock: toHex(to) },
          ]),
        );
      count += logs.length;
      if (count > 1000) throw new Error("ALERTS_LOG_CAP");
      for (const log of logs) {
        if (log.removed) continue;
        const number = BigInt(log.blockNumber);
        const index = Number(BigInt(log.logIndex));
        if (number < from || number > to || !Number.isSafeInteger(index))
          throw new Error("ALERTS_LOG_INVALID");
        const common = {
          number,
          hash: log.blockHash,
          tx: log.transactionHash,
          logIndex: index,
          token: log.address,
        };
        const topics = log.topics as [Hex, ...Hex[]];
        if (log.topics[0] === TRANSFER_TOPIC && log.topics.length === 3) {
          const {
            from: sender,
            to: recipient,
            value,
          } = decodeEventLog({
            abi: transferAbi,
            data: log.data as Hex,
            topics,
          }).args;
          events.push({
            ...common,
            type: "transfer_above",
            from: sender.toLowerCase(),
            to: recipient.toLowerCase(),
            amount: String(value),
          });
        } else if (
          log.topics[0] === APPROVAL_TOPIC &&
          log.topics.length === 3
        ) {
          const { owner, spender, value } = decodeEventLog({
            abi: approvalAbi,
            data: log.data as Hex,
            topics,
          }).args;
          if (
            !rules.some(
              (rule) =>
                rule.type === "approval_unverified" &&
                rule.watchedAddress === owner.toLowerCase(),
            ) ||
            value === 0n
          )
            continue;
          const target = spender.toLowerCase();
          if (!approvals.has(target)) {
            const code = await this.call("eth_getCode", [
              target,
              toHex(number),
            ]);
            if (typeof code !== "string" || !/^0x(?:[0-9a-f]{2})*$/i.test(code))
              throw new Error("ALERTS_CODE_UNKNOWN");
            if (code === "0x") approvals.set(target, "eoa");
            else {
              await this.checkLease();
              await this.budget.reserve();
              approvals.set(
                target,
                await this.explorer.sourceVerification(target),
              );
            }
          }
          const verification = approvals.get(target)!;
          if (verification !== "eoa")
            events.push({
              ...common,
              type: "approval_unverified",
              owner: owner.toLowerCase(),
              spender: target,
              verification,
              amount: String(value),
            });
        } else if (
          log.topics[0] === OBSERVED_TRADES_SWAP_TOPIC &&
          rules.some(
            (rule) =>
              rule.type === "large_swap" && rule.watchedAddress === log.address,
          )
        ) {
          if (!pools.has(log.address)) {
            const factory = await this.read(
              log.address,
              poolAbi,
              "factory",
              number,
            );
            if (
              typeof factory !== "string" ||
              factory.toLowerCase() !== OBSERVED_TRADES_FACTORY
            )
              throw new Error("ALERTS_POOL_UNVERIFIED");
            const token0 = await this.read(
              log.address,
              poolAbi,
              "token0",
              number,
            );
            const token1 = await this.read(
              log.address,
              poolAbi,
              "token1",
              number,
            );
            const fee = await this.read(log.address, poolAbi, "fee", number);
            const canonical = await this.read(
              OBSERVED_TRADES_FACTORY,
              poolAbi,
              "getPool",
              number,
              [token0, token1, fee],
            );
            if (
              typeof canonical !== "string" ||
              canonical.toLowerCase() !== log.address ||
              typeof token0 !== "string"
            )
              throw new Error("ALERTS_POOL_UNVERIFIED");
            pools.set(log.address, token0.toLowerCase());
          }
          const args = decodeObservedSwap(log.data as Hex, topics);
          events.push({
            ...common,
            type: "large_swap",
            pool: log.address,
            token: pools.get(log.address)!,
            amount: String(args.amount0 < 0n ? -args.amount0 : args.amount0),
          });
        }
      }
    }
    return events;
  }
}

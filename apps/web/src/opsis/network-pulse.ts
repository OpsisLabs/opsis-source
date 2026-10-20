import { retryAfterSeconds } from "../dashboard/http";
import type { Capabilities } from "./model";

export const pulseReasons = {
  unavailable: ["RPC read unavailable", "RPC 读取不可用"],
  malformed_response: ["RPC response could not be validated", "无法验证 RPC 响应"],
  budget_limited: ["RPC budget refused this refresh", "RPC 预算拒绝本次刷新"],
  stale_feed: ["Feed update is older than 24 hours", "喂价更新时间已超过 24 小时"],
  latest_unavailable: ["Latest block unavailable for this comparison", "缺少最新区块，无法比较"],
  inconsistent_blocks: ["Block observations are inconsistent", "区块观测不一致"],
  coordination_unavailable: ["Shared refresh unavailable; no extra read started", "共享刷新不可用；未启动额外读取"],
} satisfies Record<string, [string, string]>;
export type PulseValue<T> = { value: T; reason: null } | { value: null; reason: keyof typeof pulseReasons };
type PulseBlock = { number: string; hash: string; timestamp: string };
export type NetworkPulse = {
  chainId: 4663;
  observedAt: string;
  source: { rpc: "drpc" | "robinhood-public-rpc"; feed: string };
  latestBlock: PulseValue<PulseBlock>;
  latestAgeSeconds: PulseValue<number>;
  safeBlock: PulseValue<PulseBlock>;
  safeLagBlocks: PulseValue<string>;
  safeLagSeconds: PulseValue<number>;
  gasPriceGwei: PulseValue<string>;
  ethUsd: PulseValue<string>;
  ethUsdUpdatedAt: PulseValue<string>;
  rpcLatencyMs: PulseValue<number>;
};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown) => typeof value === "string" && /^(0|[1-9]\d{0,77})$/.test(value);
const decimal = (value: unknown) => typeof value === "string" && /^(0|[1-9]\d{0,77})(\.\d{1,18})?$/.test(value);
const timestamp = (value: unknown) => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
const nonnegative = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function parseNetworkPulse(value: unknown): NetworkPulse {
  if (!record(value) || value.chainId !== 4663 || !timestamp(value.observedAt) || !record(value.source) || !["drpc", "robinhood-public-rpc"].includes(String(value.source.rpc)) || typeof value.source.feed !== "string" || !/^0x[0-9a-f]{40}$/i.test(value.source.feed)) throw new Error("Invalid pulse");
  const block = (item: unknown) => record(item) && integer(item.number) && typeof item.hash === "string" && /^0x[0-9a-f]{64}$/i.test(item.hash) && timestamp(item.timestamp);
  const fields = {
    latestBlock: block, latestAgeSeconds: nonnegative, safeBlock: block,
    safeLagBlocks: integer, safeLagSeconds: nonnegative, gasPriceGwei: decimal,
    ethUsd: (item: unknown) => decimal(item) && /[1-9]/.test(String(item)),
    ethUsdUpdatedAt: timestamp, rpcLatencyMs: nonnegative,
  };
  for (const [key, validate] of Object.entries(fields)) {
    const field = value[key];
    if (!record(field) || (field.value === null ? typeof field.reason !== "string" || !Object.hasOwn(pulseReasons, field.reason) : field.reason !== null || !validate(field.value))) throw new Error("Invalid pulse");
  }
  return value as NetworkPulse;
}

export function networkPulseEnabled(capabilities: Capabilities): boolean {
  return capabilities.networkPulse === true && (!capabilities.manifest || capabilities.manifest.capabilities.some(row => row.id === "networkPulse" && row.enabled));
}
export function shouldRefreshPulse(enabled: boolean, visible: boolean, pending: boolean, nextReadAt: number, now: number): boolean {
  return enabled && visible && !pending && now >= nextReadAt;
}
export class NetworkPulseError extends Error {
  readonly status: number;
  readonly retryAfter: number;
  constructor(status: number, retryAfter: number) {
    super("Pulse unavailable");
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
export async function fetchNetworkPulse(key: string, signal: AbortSignal): Promise<NetworkPulse> {
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ""}/v1/private/opsis/network-pulse`, {
    credentials: "omit", cache: "no-store", signal,
    headers: key ? { authorization: `Preview ${key}` } : {},
  });
  if (!response.ok) throw new NetworkPulseError(response.status, retryAfterSeconds(response.headers.get("retry-after")) ?? 30);
  return parseNetworkPulse(await response.json());
}

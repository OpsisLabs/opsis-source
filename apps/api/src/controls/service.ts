import { canonicalBytes, sha256, type ReceiptBody } from "@rh-chain/shared";
import { keccak256, stringToHex } from "viem";
import type { ControlReading, TokenControls } from "@rh-chain/shared";
import type { Env } from "../config/env.js";
import type { ProviderHttp } from "../chain/provider-http.js";
import {
  createRobinhoodRpcHttp,
  robinhoodRpcEndpoint,
  type RobinhoodRpcEndpoint,
  type RpcSpendBudget,
} from "../chain/robinhood-rpc.js";
import type { PortfolioBudget } from "../portfolio/budget.js";
import { AppError } from "../http/errors.js";

const WORD = /^0x[0-9a-fA-F]{64}$/;
const HASH = WORD;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX = /^0x(?:[0-9a-fA-F]{2})*$/;
// ERC-1967, https://eips.ethereum.org/EIPS/eip-1967 . Empty slots are
// observations only; custom proxy patterns and spoofed getters remain unknown.
export const controlSlot = (name: string) =>
  `0x${(BigInt(keccak256(stringToHex(`eip1967.proxy.${name}`))) - 1n).toString(16).padStart(64, "0")}`;
const unavailable = () =>
  new AppError(
    "CONTROLS_UNAVAILABLE",
    503,
    "Contract controls could not be verified at one current block",
  );
export type ControlsEvidence = { rpcCalls: ReceiptBody["rpcCalls"]; sources: ReceiptBody["sources"] };
export interface ControlsSource {
  check(contract: string, evidence?: ControlsEvidence): Promise<TokenControls>;
}
export class ControlsService implements ControlsSource {
  private readonly rpc: ProviderHttp;
  private readonly rpcEndpoint: RobinhoodRpcEndpoint;
  constructor(
    private readonly env: Env,
    private readonly budget: PortfolioBudget,
    rpc?: ProviderHttp,
    private readonly now: () => number = Date.now,
    rpcSpend?: RpcSpendBudget,
    private readonly anchoredRead?: (method: string, params: unknown[], optional?: boolean) => Promise<unknown>,
  ) {
    this.rpcEndpoint = robinhoodRpcEndpoint(env);
    this.rpc =
      rpc ??
      createRobinhoodRpcHttp(env, {
        providerName: "controls-rpc",
        spend: rpcSpend,
        client: {
          maxRetries: 0,
          backoffMs: 1,
          circuitFailureThreshold: 3,
          circuitResetMs: 60_000,
          maxConcurrency: 1,
          maxResponseBytes: 100_000,
          rpcWorkload: "controls",
        },
      });
  }
  async checkAt(input: string, anchor: { blockNumber: number; blockHash: string; timestamp?: string }, evidence?: ControlsEvidence): Promise<TokenControls> {
    return this.check(input, evidence, anchor);
  }
  async check(input: string, evidence?: ControlsEvidence, anchor?: { blockNumber: number; blockHash: string; timestamp?: string }): Promise<TokenControls> {
    if (!ADDRESS.test(input) || /^0x0{40}$/i.test(input))
      throw new AppError(
        "INVALID_CONTRACT",
        400,
        "Enter a nonzero contract address",
      );
    const contract = input.toLowerCase();
    // Ten fixed public-RPC reads total, reserved before provider work, shared
    // with the existing portfolio daily ledger (no additional daily allowance).
    if (!this.anchoredRead) await this.budget.consume(10);
    let calls = 0;
    const read = async (
      method: string,
      params: unknown[],
      optional = false,
    ): Promise<unknown> => {
      const id = ++calls;
      if (id > 10) throw unavailable();
      if (this.anchoredRead) return this.anchoredRead(method, params, optional);
      let payload: unknown;
      try {
        payload = await this.rpc.requestJson(
          this.rpcEndpoint.url,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
          },
        );
      } catch {
        throw unavailable();
      }
      if (evidence) {
        const endpoint = new URL(this.rpcEndpoint.url);
        if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.protocol !== "https:") throw unavailable();
        evidence.rpcCalls.push({ method, paramsSha256: await sha256(canonicalBytes(params)) });
        evidence.sources.push({ id: `rpc-${id}`, provider: this.rpcEndpoint.id, url: endpoint.origin, fetchedAt: new Date(this.now()).toISOString(), responseSha256: await sha256(canonicalBytes(payload)) });
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw unavailable();
      const response = payload as {
        id?: unknown;
        error?: { code?: unknown };
        result?: unknown;
      };
      if (response.id !== id) throw unavailable();
      if (response.error) {
        // Only an explicit EVM revert is a per-field unknown. HTTP/rate-limit,
        // generic RPC/server and budget errors fail the entire observation.
        if (optional && response.error.code === 3) return null;
        throw unavailable();
      }
      return response.result;
    };
    if (!this.anchoredRead && (await read("eth_chainId", [])) !== "0x1237") throw unavailable();
    const start = this.now();
    const rawBlock = this.anchoredRead && anchor ? { number: `0x${anchor.blockNumber.toString(16)}`, hash: anchor.blockHash, timestamp: `0x${Math.floor(Date.parse(anchor.timestamp!) / 1000).toString(16)}` } : await read("eth_getBlockByNumber", [anchor ? `0x${anchor.blockNumber.toString(16)}` : "latest", false]);
    if (!rawBlock || typeof rawBlock !== "object") throw unavailable();
    const block = rawBlock as {
      number?: unknown;
      hash?: unknown;
      timestamp?: unknown;
    };
    const number = parseHex(block.number),
      timestamp = parseHex(block.timestamp);
    if (
      (anchor !== undefined && (block.hash !== anchor.blockHash || number !== anchor.blockNumber)) ||
      number === null ||
      timestamp === null ||
      typeof block.hash !== "string" ||
      !HASH.test(block.hash) ||
      (!anchor && Math.abs(start - timestamp * 1000) > 60_000)
    )
      throw unavailable();
    const code = await read("eth_getCode", [contract, block.number]);
    if (typeof code !== "string" || !HEX.test(code)) throw unavailable();
    const hasCode = code !== "0x";
    const unknown: ControlReading = { state: "unknown", reason: "malformed" };
    const readings: TokenControls["readings"] = {
      owner: unknown,
      paused: unknown,
      implementation: unknown,
      admin: unknown,
      beacon: unknown,
    };
    if (hasCode) {
      const ownerRead = () => read("eth_call", [{ to: contract, data: "0x8da5cb5b" }, block.number], true);
      const pausedRead = () => read("eth_call", [{ to: contract, data: "0x5c975abb" }, block.number], true);
      const [owner, paused] = this.anchoredRead ? await Promise.all([ownerRead(), pausedRead()]) : [await ownerRead(), await pausedRead()];
      readings.owner = decodeReading(owner, false); readings.paused = decodeReading(paused, true);
      const keys = ["implementation", "admin", "beacon"] as const;
      const storage = async (key: typeof keys[number]) => { readings[key] = decodeReading(await read("eth_getStorageAt", [contract, controlSlot(key), block.number]), false); };
      if (this.anchoredRead) await Promise.all(keys.map(storage));
      else for (const key of keys) await storage(key);
    }
    const endBlock = this.anchoredRead ? { hash: anchor?.blockHash } : (await read("eth_getBlockByNumber", [
      block.number,
      false,
    ])) as { hash?: unknown } | null;
    const end = this.now();
    if (endBlock?.hash !== block.hash || end < start || end - start >= 30_000)
      throw unavailable();
    return {
      kind: "observed",
      chainId: 4663,
      contract,
      hasCode,
      anchor: {
        blockNumber: number,
        blockHash: block.hash,
        timestamp: new Date(timestamp * 1000).toISOString(),
        finality: "current_not_final",
      },
      observedAt: new Date(start).toISOString(),
      expiresAt: new Date(start + 30_000).toISOString(),
      source: this.rpcEndpoint.id,
      methodVersion: "controls-v1",
      readings,
      coverage: {
        state: "partial",
        rpcCalls: calls,
        unknown: [
          "mint_permissions",
          "transfer_fees",
          "custom_roles",
          "other_proxy_patterns",
          "holder_concentration",
        ],
      },
    };
  }
}
function parseHex(value: unknown): number | null {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return null;
  const parsed = Number(BigInt(value));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
export function decodeReading(value: unknown, bool: boolean): ControlReading {
  if (value === null) return { state: "unknown", reason: "reverted" };
  if (typeof value !== "string" || !WORD.test(value))
    return { state: "unknown", reason: "malformed" };
  if (bool)
    return BigInt(value) <= 1n
      ? { state: "observed", value: BigInt(value) === 1n ? "true" : "false" }
      : { state: "unknown", reason: "malformed" };
  return /^0x0{24}/i.test(value)
    ? { state: "observed", value: `0x${value.slice(-40).toLowerCase()}` }
    : { state: "unknown", reason: "malformed" };
}

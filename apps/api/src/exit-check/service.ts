import { decodeFunctionResult, encodeFunctionData, type Abi, type Hex } from "viem";
import { z } from "zod";
import { JsonCache } from "../cache/service.js";
import type { Env } from "../config/env.js";
import { ProviderRequestError, type ProviderHttp } from "../chain/provider-http.js";
import {
  createRobinhoodRpcHttp,
  robinhoodRpcEndpoint,
  type RobinhoodRpcEndpoint,
  type RobinhoodRpcProviderId,
  type RpcSpendBudget
} from "../chain/robinhood-rpc.js";
import { AppError } from "../http/errors.js";
import { createExitCheckBudget, type ExitCheckBudget } from "./budget.js";
import {
  EXIT_CHECK_CHAIN_ID,
  EXIT_CHECK_DEAD_ADDRESS,
  EXIT_CHECK_FEE_TIERS,
  EXIT_CHECK_FRESHNESS_MS,
  EXIT_CHECK_LIMITATIONS,
  EXIT_CHECK_OUTPUTS,
  EXIT_CHECK_OUTPUT_SYMBOLS,
  EXIT_CHECK_ZERO_ADDRESS,
  UNISWAP_MULTICALL3,
  UNISWAP_QUOTER_V2,
  UNISWAP_V3_FACTORY,
  type ExitCheckOutputSymbol
} from "./constants.js";
import {
  ExitCheckInputError,
  assertAmountSyntax,
  canonicalExitAmount,
  feeAmountRaw,
  formatBps,
  formatExitUnits,
  isBoundarySqrtPrice,
  parseExitAmount,
  priceImpactBps,
  spotAmountOutRaw
} from "./math.js";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const MAX_DECIMALS = 36;

const factoryAbi = [{
  type: "function",
  name: "getPool",
  stateMutability: "view",
  inputs: [{ name: "tokenA", type: "address" }, { name: "tokenB", type: "address" }, { name: "fee", type: "uint24" }],
  outputs: [{ name: "pool", type: "address" }]
}] as const satisfies Abi;

const poolAbi = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" }
    ]
  },
  { type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint128" }] }
] as const satisfies Abi;

const quoterAbi = [{
  type: "function",
  name: "quoteExactInputSingle",
  stateMutability: "nonpayable",
  inputs: [{
    name: "params",
    type: "tuple",
    components: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "fee", type: "uint24" },
      { name: "sqrtPriceLimitX96", type: "uint160" }
    ]
  }],
  outputs: [
    { name: "amountOut", type: "uint256" },
    { name: "sqrtPriceX96After", type: "uint160" },
    { name: "initializedTicksCrossed", type: "uint32" },
    { name: "gasEstimate", type: "uint256" }
  ]
}] as const satisfies Abi;

const multicall3Abi = [{
  type: "function",
  name: "aggregate3",
  stateMutability: "payable",
  inputs: [{
    name: "calls",
    type: "tuple[]",
    components: [
      { name: "target", type: "address" },
      { name: "allowFailure", type: "bool" },
      { name: "callData", type: "bytes" }
    ]
  }],
  outputs: [{
    name: "returnData",
    type: "tuple[]",
    components: [
      { name: "success", type: "bool" },
      { name: "returnData", type: "bytes" }
    ]
  }]
}] as const satisfies Abi;

const erc20DecimalsAbi = [{
  type: "function",
  name: "decimals",
  stateMutability: "view",
  inputs: [],
  outputs: [{ name: "", type: "uint8" }]
}] as const satisfies Abi;

export type ExitCheckRequest = {
  token: string;
  amount: string;
  outputToken?: ExitCheckOutputSymbol;
};

export type ExitCheckPool = { fee: number; pool: string };
export type ExitCheckPoolResult = ExitCheckPool & { amountOut: string; amountOutDisplay: string };

export type ExitCheckResponse = {
  schemaVersion: 1;
  supported: boolean;
  reason: "ok" | "no_v3_pool" | "unknown_decimals" | "quote_failed";
  chain: { id: 4663; name: "Robinhood Chain" };
  input: { contract: string; symbol: string | null; decimals: number; amount: string; rawAmount: string };
  output: { symbol: ExitCheckOutputSymbol; address: string; decimals: number } | null;
  quote: {
    pool: ExitCheckPool;
    amountOut: string;
    amountOutDisplay: string;
    spotAmountOut: string;
    spotAmountOutDisplay: string;
    priceImpactBps: string | null;
    priceImpactPercent: string | null;
    feeTier: number;
    feePercent: string;
    feeAmount: string;
    feeAmountDisplay: string;
    activeLiquidity: string;
    fullExecutionProven: false;
  } | null;
  coverage: {
    feeTiersTested: number[];
    poolsFound: ExitCheckPool[];
    poolsQuoted: ExitCheckPoolResult[];
    poolsFailed: Array<ExitCheckPool & { reason: string }>;
    poolsMissing: number[];
    poolsDiscoveryFailed: number[];
  };
  anchor: { tag: "latest"; blockNumber: number; blockHash: string; timestamp: string; fetchedAt: string };
  quotedAt: string;
  expiresAt: string;
  freshForMs: number;
  quoteIsNotSellabilityProof: true;
  limitations: string[];
  provider: { name: RobinhoodRpcProviderId; cached: boolean };
};

type Dependencies = {
  rpc: ProviderHttp;
  budget: ExitCheckBudget;
  now: () => Date;
};

type RpcRequest = { jsonrpc: "2.0"; id: string; method: string; params: unknown[] };
type RpcResponse = { id?: string; result?: unknown; error?: unknown };

export interface ExitCheckSource {
  quote(request: ExitCheckRequest): Promise<ExitCheckResponse>;
}

export class ExitCheckService implements ExitCheckSource {
  private readonly dependencies: Dependencies;
  private readonly rpcEndpoint: RobinhoodRpcEndpoint;
  private readonly inflight = new Map<string, Promise<ExitCheckResponse>>();

  constructor(
    private readonly env: Env,
    private readonly cache: JsonCache = new JsonCache(undefined, 15),
    dependencies?: Partial<Dependencies> & { rpcSpend?: RpcSpendBudget }
  ) {
    this.rpcEndpoint = robinhoodRpcEndpoint(env);
    this.dependencies = {
      rpc: dependencies?.rpc ?? createRobinhoodRpcHttp(env, {
        providerName: "exit-check-rpc",
        spend: dependencies?.rpcSpend,
        client: { maxRetries: 0, backoffMs: 1, circuitFailureThreshold: 3, circuitResetMs: 60_000, maxConcurrency: 1 }
      }),
      budget: dependencies?.budget ?? createExitCheckBudget(env),
      now: dependencies?.now ?? (() => new Date())
    };
  }

  async quote(request: ExitCheckRequest): Promise<ExitCheckResponse> {
    const outputSymbol = request.outputToken ?? "WETH";
    if (!EXIT_CHECK_OUTPUT_SYMBOLS.includes(outputSymbol)) {
      throw new AppError("EXIT_CHECK_INVALID_OUTPUT", 400, "Choose WETH or USDG as the estimated output token");
    }
    const token = request.token.trim().toLowerCase();
    if (!ADDRESS_PATTERN.test(token)) throw new AppError("EXIT_CHECK_INVALID_TOKEN", 400, "Provide a complete token contract address");
    const outputAsset = EXIT_CHECK_OUTPUTS[outputSymbol];
    if (token === outputAsset.address.toLowerCase()) {
      throw new AppError("EXIT_CHECK_INVALID_TOKEN", 400, "The input token and output token must be different");
    }
    if (token === EXIT_CHECK_ZERO_ADDRESS || token === EXIT_CHECK_DEAD_ADDRESS) {
      throw new AppError("EXIT_CHECK_INVALID_TOKEN", 400, "The zero and dead addresses are not tokens");
    }

    // Structural validation happens before canonicalization/cache so a
    // malformed string like "0.001.0" can never alias a cached valid amount.
    try {
      assertAmountSyntax(request.amount);
    } catch {
      throw new AppError("EXIT_CHECK_INVALID_AMOUNT", 400, "Enter a positive decimal amount");
    }

    const canonicalRequest = { token, outputSymbol, amount: canonicalExitAmount(request.amount) };
    const key = `exit-check:${EXIT_CHECK_CHAIN_ID}:${token}:${outputSymbol}:${canonicalRequest.amount}`;
    const cached = await this.cache.get<ExitCheckResponse>(key);
    if (cached && Date.parse(cached.expiresAt) > this.dependencies.now().getTime()) {
      return { ...cached, provider: { ...cached.provider, cached: true } };
    }
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const operation = this.fetchAndNormalize(canonicalRequest, canonicalRequest.amount)
      .then(async (quote) => {
        await this.cache.set(key, quote, 15);
        return quote;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, operation);
    return operation;
  }

  private async fetchAndNormalize(
    request: { token: string; outputSymbol: ExitCheckOutputSymbol; amount: string },
    rawAmountInput: string
  ): Promise<ExitCheckResponse> {
    const { token, outputSymbol } = request;
    const outputAsset = EXIT_CHECK_OUTPUTS[outputSymbol];

    let units = 0;
    const consume = async (value: number): Promise<void> => {
      if (units + value > this.env.EXIT_CHECK_MAX_RPC_SUBCALLS) {
        throw new AppError("EXIT_CHECK_RPC_LIMIT_EXCEEDED", 503, "This check exceeded its RPC safety limit");
      }
      units += value;
      await this.dependencies.budget.consume(value);
    };

    // Capture the real block anchor first and pin every later read to it.
    const anchor = await this.latestBlock(consume);

    const reviewedInput = Object.values(EXIT_CHECK_OUTPUTS).find((asset) => asset.address.toLowerCase() === token);
    let decimals: number;
    let symbol: string | null;

    if (reviewedInput) {
      decimals = reviewedInput.decimals;
      symbol = reviewedInput.symbol;
    } else {
      const identity = await this.readTokenIdentity(token, anchor.blockHex, consume);
      if (identity.kind === "not_a_contract") {
        throw new AppError("EXIT_CHECK_INVALID_TOKEN", 400, "No token contract code exists at that address");
      }
      if (identity.kind === "unknown_decimals") {
        return this.unsupportedResponse({
          token, outputSymbol, symbol: null, decimals: 0, amount: rawAmountInput, anchor,
          reason: "unknown_decimals",
          coverage: {
            feeTiersTested: [],
            poolsFound: [],
            poolsQuoted: [],
            poolsFailed: [],
            poolsMissing: [],
            poolsDiscoveryFailed: []
          },
          consume
        });
      }
      decimals = identity.decimals;
      symbol = null;
    }

    let amountInRaw: bigint;
    try {
      amountInRaw = parseExitAmount(rawAmountInput, decimals);
    } catch (error) {
      if (error instanceof ExitCheckInputError) {
        throw new AppError("EXIT_CHECK_INVALID_AMOUNT", 400, `Enter a positive amount with no more than ${decimals} decimal places`);
      }
      throw error;
    }

    const discovery = await this.findPools(token, outputAsset.address, anchor.blockHex, consume);
    const pools = discovery.pools;
    // A revert or malformed factory read is a discovery failure, not proof that
    // no pool exists. Fail closed when no pool was confirmed and any read failed.
    if (pools.length === 0 && discovery.discoveryFailed.length > 0) {
      throw new AppError("EXIT_CHECK_POOL_DISCOVERY_FAILED", 503, "Some factory pool reads failed; no absence of a pool is claimed");
    }

    if (pools.length === 0) {
      return this.finalize({
        token, outputSymbol, symbol, decimals, amount: rawAmountInput, amountInRaw, anchor,
        coverage: {
          feeTiersTested: [...EXIT_CHECK_FEE_TIERS],
          poolsFound: [],
          poolsQuoted: [],
          poolsFailed: [],
          poolsMissing: [...EXIT_CHECK_FEE_TIERS],
          poolsDiscoveryFailed: []
        },
        best: null,
        reason: "no_v3_pool",
        consume
      });
    }

    const zeroForOne = zeroForOneFor(token, outputAsset.address);
    const state = await this.readPoolState(pools, zeroForOne, anchor.blockHex, consume);
    const quoteCalls = state.available.map((pool) => this.quoterCall(pool, token, outputAsset.address, amountInRaw));
    let quoteResults: Array<{ success: boolean; returnData: Hex }> = [];
    if (quoteCalls.length > 0) {
      const raw = await this.rpcEthCall(this.aggregate3(quoteCalls), anchor.blockHex, consume);
      quoteResults = this.decodeAggregate3(raw, quoteCalls.length);
    }

    const poolsQuoted: ExitCheckPoolResult[] = [];
    const poolsFailed: Array<ExitCheckPool & { reason: string }> = state.failed;
    state.available.forEach((pool, index) => {
      const result = quoteResults[index];
      if (!result?.success) {
        poolsFailed.push({ fee: pool.fee, pool: pool.pool, reason: revertReason(result?.returnData) });
        return;
      }
      try {
        const decoded = decodeFunctionResult({ abi: quoterAbi, functionName: "quoteExactInputSingle", data: result.returnData });
        const amountOut = decoded[0] as bigint;
        const sqrtPriceX96After = decoded[1] as bigint;
        if (amountOut <= 0n) throw new Error("zero output");
        // A quote that ends on a V3 price boundary may have only partially
        // filled, so it is excluded rather than shown as a full execution.
        if (isBoundarySqrtPrice(sqrtPriceX96After)) {
          poolsFailed.push({ fee: pool.fee, pool: pool.pool, reason: "price_boundary_reached" });
          return;
        }
        poolsQuoted.push({ fee: pool.fee, pool: pool.pool, amountOut: amountOut.toString(), amountOutDisplay: formatExitUnits(amountOut, outputAsset.decimals) });
      } catch {
        poolsFailed.push({ fee: pool.fee, pool: pool.pool, reason: "decode_failed" });
      }
    });

    let best: { pool: ExitCheckPool; amountOut: bigint; state: (typeof state.available)[number] } | null = null;
    for (const quoted of poolsQuoted) {
      const poolState = state.available.find((candidate) => candidate.pool === quoted.pool);
      if (!poolState) continue;
      const amountOut = BigInt(quoted.amountOut);
      if (!best || amountOut > best.amountOut) best = { pool: quoted, amountOut, state: poolState };
    }

    return this.finalize({
      token, outputSymbol, symbol, decimals, amount: rawAmountInput, amountInRaw, anchor,
      coverage: {
        feeTiersTested: [...EXIT_CHECK_FEE_TIERS],
        poolsFound: pools,
        poolsQuoted: poolsQuoted.map(({ fee, pool, amountOut, amountOutDisplay }) => ({ fee, pool, amountOut, amountOutDisplay })),
        poolsFailed,
        poolsMissing: EXIT_CHECK_FEE_TIERS.filter((fee) => !pools.some((pool) => pool.fee === fee) && !discovery.discoveryFailed.includes(fee)),
        poolsDiscoveryFailed: discovery.discoveryFailed
      },
      best,
      reason: best ? "ok" : "quote_failed",
      consume
    });
  }

  private async finalize(input: {
    token: string;
    outputSymbol: ExitCheckOutputSymbol;
    symbol: string | null;
    decimals: number;
    amount: string;
    amountInRaw: bigint;
    anchor: ExitCheckAnchor;
    coverage: ExitCheckResponse["coverage"];
    best: { pool: ExitCheckPool; amountOut: bigint; state: { fee: number; pool: string; sqrtPriceX96: bigint; liquidity: bigint; zeroForOne: boolean } } | null;
    reason: ExitCheckResponse["reason"];
    consume: (units: number) => Promise<void>;
  }): Promise<ExitCheckResponse> {
    await this.assertAnchorUnchanged(input.anchor, input.consume);
    const outputAsset = EXIT_CHECK_OUTPUTS[input.outputSymbol];
    const now = this.dependencies.now().getTime();
    // Freshness starts at anchor capture, not at response completion, so a
    // slow request can still expire instead of presenting an old block as fresh.
    if (now - input.anchor.capturedAtMs >= EXIT_CHECK_FRESHNESS_MS) {
      throw new AppError("EXIT_CHECK_STALE", 503, "The captured block is already older than the freshness window; run the check again");
    }
    let quote: ExitCheckResponse["quote"] = null;
    if (input.best) {
      const spotAmountOut = spotAmountOutRaw({
        amountInRaw: input.amountInRaw,
        sqrtPriceX96: input.best.state.sqrtPriceX96,
        zeroForOne: input.best.state.zeroForOne
      });
      const impactBps = priceImpactBps({ spotAmountOut, quotedAmountOut: input.best.amountOut });
      const feeAmount = feeAmountRaw(input.amountInRaw, input.best.pool.fee);
      quote = {
        pool: { fee: input.best.pool.fee, pool: input.best.pool.pool },
        amountOut: input.best.amountOut.toString(),
        amountOutDisplay: formatExitUnits(input.best.amountOut, outputAsset.decimals),
        spotAmountOut: spotAmountOut.toString(),
        spotAmountOutDisplay: formatExitUnits(spotAmountOut, outputAsset.decimals),
        priceImpactBps: impactBps === null ? null : impactBps.toString(),
        priceImpactPercent: impactBps === null ? null : formatBps(impactBps),
        feeTier: input.best.pool.fee,
        feePercent: formatBps(BigInt(input.best.pool.fee) / 100n),
        feeAmount: feeAmount.toString(),
        feeAmountDisplay: formatExitUnits(feeAmount, input.decimals),
        activeLiquidity: input.best.state.liquidity.toString(),
        fullExecutionProven: false
      };
    }
    return {
      schemaVersion: 1,
      supported: input.reason === "ok",
      reason: input.reason,
      chain: { id: EXIT_CHECK_CHAIN_ID, name: "Robinhood Chain" },
      input: {
        contract: input.token,
        symbol: input.symbol,
        decimals: input.decimals,
        amount: canonicalExitAmount(input.amount),
        rawAmount: input.amountInRaw.toString()
      },
      output: input.reason === "ok" ? { symbol: input.outputSymbol, address: outputAsset.address, decimals: outputAsset.decimals } : null,
      quote,
      coverage: input.coverage,
      anchor: responseAnchor(input.anchor),
      quotedAt: new Date(input.anchor.capturedAtMs).toISOString(),
      expiresAt: new Date(input.anchor.capturedAtMs + EXIT_CHECK_FRESHNESS_MS).toISOString(),
      freshForMs: EXIT_CHECK_FRESHNESS_MS,
      quoteIsNotSellabilityProof: true,
      limitations: [...EXIT_CHECK_LIMITATIONS],
      provider: { name: this.rpcEndpoint.id, cached: false }
    };
  }

  private async unsupportedResponse(input: {
    token: string;
    outputSymbol: ExitCheckOutputSymbol;
    symbol: string | null;
    decimals: number;
    amount: string;
    reason: "unknown_decimals";
    coverage: ExitCheckResponse["coverage"];
    anchor: ExitCheckAnchor;
    consume: (units: number) => Promise<void>;
  }): Promise<ExitCheckResponse> {
    await this.assertAnchorUnchanged(input.anchor, input.consume);
    const now = this.dependencies.now().getTime();
    if (now - input.anchor.capturedAtMs >= EXIT_CHECK_FRESHNESS_MS) {
      throw new AppError("EXIT_CHECK_STALE", 503, "The captured block is already older than the freshness window; run the check again");
    }
    return {
      schemaVersion: 1,
      supported: false,
      reason: input.reason,
      chain: { id: EXIT_CHECK_CHAIN_ID, name: "Robinhood Chain" },
      input: { contract: input.token, symbol: input.symbol, decimals: input.decimals, amount: canonicalExitAmount(input.amount), rawAmount: "0" },
      output: null,
      quote: null,
      coverage: input.coverage,
      anchor: responseAnchor(input.anchor),
      quotedAt: new Date(input.anchor.capturedAtMs).toISOString(),
      expiresAt: new Date(input.anchor.capturedAtMs + EXIT_CHECK_FRESHNESS_MS).toISOString(),
      freshForMs: EXIT_CHECK_FRESHNESS_MS,
      quoteIsNotSellabilityProof: true,
      limitations: [...EXIT_CHECK_LIMITATIONS],
      provider: { name: this.rpcEndpoint.id, cached: false }
    };
  }

  private async readTokenIdentity(
    token: string,
    blockHex: string,
    consume: (units: number) => Promise<void>
  ): Promise<{ kind: "ok"; decimals: number } | { kind: "not_a_contract" } | { kind: "unknown_decimals" }> {
    await consume(2);
    const responses = await this.rpcBatch([
      { jsonrpc: "2.0", id: "code", method: "eth_getCode", params: [token, blockHex] },
      { jsonrpc: "2.0", id: "decimals", method: "eth_call", params: [{ to: token, data: "0x313ce567" }, blockHex] }
    ]);
    const codeResponse = responses.get("code");
    // A missing, errored, or malformed code response is a provider problem, not
    // evidence that no contract exists. Only a true empty code result means the
    // address has no contract.
    if (!codeResponse || codeResponse.error !== undefined) {
      throw new AppError("EXIT_CHECK_PROVIDER_UNAVAILABLE", 503, "The token code read did not return a usable result");
    }
    const code = codeResponse.result;
    if (typeof code !== "string" || !/^0x[0-9a-fA-F]*$/.test(code)) {
      throw new AppError("EXIT_CHECK_PROVIDER_UNAVAILABLE", 503, "The token code read returned a malformed result");
    }
    if (code === "0x" || /^0x0*$/.test(code)) return { kind: "not_a_contract" };

    const decimalsResponse = responses.get("decimals");
    if (!decimalsResponse) {
      throw new AppError("EXIT_CHECK_PROVIDER_UNAVAILABLE", 503, "The token decimals read did not return a usable result");
    }
    // A revert or empty result from decimals() means the contract exists but
    // does not expose readable ERC-20 decimals, so quoting fails closed.
    const decimalsRaw = decimalsResponse.result;
    if (decimalsResponse.error !== undefined || typeof decimalsRaw !== "string" || !/^0x[0-9a-fA-F]+$/.test(decimalsRaw)) {
      return { kind: "unknown_decimals" };
    }
    try {
      const decimals = Number(BigInt(decimalsRaw));
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) return { kind: "unknown_decimals" };
      return { kind: "ok", decimals };
    } catch {
      return { kind: "unknown_decimals" };
    }
  }

  private async findPools(
    token: string,
    outputToken: string,
    blockHex: string,
    consume: (units: number) => Promise<void>
  ): Promise<{ pools: ExitCheckPool[]; discoveryFailed: number[] }> {
    const calls = EXIT_CHECK_FEE_TIERS.map((fee) => ({
      target: UNISWAP_V3_FACTORY as `0x${string}`,
      allowFailure: true,
      callData: encodeFunctionData({ abi: factoryAbi, functionName: "getPool", args: [token as `0x${string}`, outputToken as `0x${string}`, fee] })
    }));
    const raw = await this.rpcEthCall(this.aggregate3(calls), blockHex, consume);
    const decoded = this.decodeAggregate3(raw, calls.length);
    const pools: ExitCheckPool[] = [];
    const discoveryFailed: number[] = [];
    decoded.forEach((result, index) => {
      const fee = EXIT_CHECK_FEE_TIERS[index]!;
      if (!result.success) {
        discoveryFailed.push(fee);
        return;
      }
      try {
        const pool = decodeFunctionResult({ abi: factoryAbi, functionName: "getPool", data: result.returnData });
        if (typeof pool !== "string" || !ADDRESS_PATTERN.test(pool)) throw new Error("malformed pool address");
        if (/^0x0*$/.test(pool)) return;
        pools.push({ fee, pool: pool.toLowerCase() });
      } catch {
        discoveryFailed.push(fee);
      }
    });
    return { pools, discoveryFailed };
  }

  private async readPoolState(
    pools: ExitCheckPool[],
    zeroForOne: boolean,
    blockHex: string,
    consume: (units: number) => Promise<void>
  ): Promise<{
    available: Array<{ fee: number; pool: string; sqrtPriceX96: bigint; liquidity: bigint; zeroForOne: boolean }>;
    failed: Array<ExitCheckPool & { reason: string }>;
  }> {
    const calls = pools.flatMap((pool) => [
      { target: pool.pool as `0x${string}`, allowFailure: true, callData: encodeFunctionData({ abi: poolAbi, functionName: "slot0" }) },
      { target: pool.pool as `0x${string}`, allowFailure: true, callData: encodeFunctionData({ abi: poolAbi, functionName: "liquidity" }) }
    ]);
    const raw = await this.rpcEthCall(this.aggregate3(calls), blockHex, consume);
    const decoded = this.decodeAggregate3(raw, calls.length);
    const available: Array<{ fee: number; pool: string; sqrtPriceX96: bigint; liquidity: bigint; zeroForOne: boolean }> = [];
    const failed: Array<ExitCheckPool & { reason: string }> = [];
    pools.forEach((pool, index) => {
      const slot0 = decoded[index * 2];
      const liquidity = decoded[index * 2 + 1];
      if (!slot0?.success || !liquidity?.success) {
        failed.push({ ...pool, reason: "state_unavailable" });
        return;
      }
      try {
        const slot = decodeFunctionResult({ abi: poolAbi, functionName: "slot0", data: slot0.returnData });
        const active = decodeFunctionResult({ abi: poolAbi, functionName: "liquidity", data: liquidity.returnData });
        const sqrtPriceX96 = slot[0] as bigint;
        if (sqrtPriceX96 <= 0n) throw new Error("zero price");
        available.push({
          fee: pool.fee,
          pool: pool.pool,
          sqrtPriceX96,
          liquidity: active as bigint,
          zeroForOne
        });
      } catch {
        failed.push({ ...pool, reason: "state_decode_failed" });
      }
    });
    return { available, failed };
  }

  private quoterCall(pool: ExitCheckPool, tokenIn: string, tokenOut: string, amountIn: bigint) {
    return {
      target: UNISWAP_QUOTER_V2 as `0x${string}`,
      allowFailure: true,
      callData: encodeFunctionData({
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn: tokenIn as `0x${string}`, tokenOut: tokenOut as `0x${string}`, amountIn, fee: pool.fee, sqrtPriceLimitX96: 0n }]
      })
    };
  }

  private aggregate3(calls: Array<{ target: `0x${string}`; allowFailure: boolean; callData: Hex }>): Hex {
    return encodeFunctionData({
      abi: multicall3Abi,
      functionName: "aggregate3",
      args: [calls]
    });
  }

  private decodeAggregate3(raw: unknown, expectedCount: number): Array<{ success: boolean; returnData: Hex }> {
    if (typeof raw !== "string" || !raw.startsWith("0x")) throw new AppError("EXIT_CHECK_MALFORMED_POOL", 503, "The pool read returned an unexpected response");
    let decoded: unknown;
    try {
      decoded = decodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", data: raw as Hex });
    } catch {
      throw new AppError("EXIT_CHECK_MALFORMED_POOL", 503, "The pool read could not be decoded");
    }
    if (!Array.isArray(decoded) || decoded.length !== expectedCount) {
      throw new AppError("EXIT_CHECK_MALFORMED_POOL", 503, "The pool read returned an unexpected number of results");
    }
    return decoded as Array<{ success: boolean; returnData: Hex }>;
  }

  private async rpcEthCall(data: Hex, blockHex: string, consume: (units: number) => Promise<void>): Promise<unknown> {
    await consume(1);
    return this.rpc("eth_call", [{ to: UNISWAP_MULTICALL3, data }, blockHex]);
  }

  private async latestBlock(consume: (units: number) => Promise<void>): Promise<ExitCheckAnchor> {
    await consume(1);
    const response = await this.rpc("eth_getBlockByNumber", ["latest", false]) as Record<string, unknown> | null;
    const block = response as Record<string, unknown> | null;
    const blockNumber = hexNumber(block?.number);
    const timestampSeconds = hexNumber(block?.timestamp);
    if (!block || blockNumber === undefined || timestampSeconds === undefined || typeof block.hash !== "string" || !HASH_PATTERN.test(block.hash)) {
      throw new AppError("EXIT_CHECK_ANCHOR_UNAVAILABLE", 503, "Robinhood Chain did not return a usable current block");
    }
    const capturedAt = this.dependencies.now();
    return {
      blockNumber,
      blockHash: block.hash.toLowerCase(),
      blockHex: `0x${blockNumber.toString(16)}`,
      timestamp: new Date(timestampSeconds * 1_000).toISOString(),
      fetchedAt: capturedAt.toISOString(),
      capturedAtMs: capturedAt.getTime()
    };
  }

  private async assertAnchorUnchanged(anchor: ExitCheckAnchor, consume: (units: number) => Promise<void>): Promise<void> {
    await consume(1);
    const response = await this.rpc("eth_getBlockByNumber", [anchor.blockHex, false]) as Record<string, unknown> | null;
    const hash = typeof response?.hash === "string" && HASH_PATTERN.test(response.hash) ? response.hash.toLowerCase() : undefined;
    if (!hash || hash !== anchor.blockHash) {
      throw new AppError("EXIT_CHECK_REORGED", 503, "The block changed while the estimate was being verified; run the check again");
    }
  }

  private async rpc(method: string, params: unknown[]): Promise<unknown> {
    try {
      const json = await this.dependencies.rpc.requestJson(this.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
      }) as { result?: unknown; error?: unknown };
      if (json.error) throw new ProviderRequestError("PROVIDER_RPC_ERROR", false);
      return json.result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof ProviderRequestError) {
        if (error.code === "PROVIDER_HTTP_429") throw new AppError("EXIT_CHECK_RATE_LIMITED", 503, "The Robinhood Chain RPC provider rate-limited this check; try again shortly");
        if (error.code === "PROVIDER_BUDGET_EXCEEDED" || error.code === "PROVIDER_CIRCUIT_OPEN") {
          throw new AppError("EXIT_CHECK_PROVIDER_UNAVAILABLE", 503, "The read-only chain provider is cooling down");
        }
      }
      throw new AppError("EXIT_CHECK_PROVIDER_UNAVAILABLE", 503, "The read-only chain provider is temporarily unavailable");
    }
  }

  private async rpcBatch(requests: RpcRequest[]): Promise<Map<string, RpcResponse>> {
    try {
      const body = await this.dependencies.rpc.requestJson(this.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requests)
      }) as RpcResponse[] | RpcResponse;
      const responses = Array.isArray(body) ? body : [body];
      return new Map(responses.flatMap((response) => typeof response.id === "string" ? [[response.id, response] as const] : []));
    } catch (error) {
      if (error instanceof ProviderRequestError && error.code === "PROVIDER_HTTP_429") {
        throw new AppError("EXIT_CHECK_RATE_LIMITED", 503, "The Robinhood Chain RPC provider rate-limited this check; try again shortly");
      }
      throw new AppError("EXIT_CHECK_PROVIDER_UNAVAILABLE", 503, "The read-only chain provider is temporarily unavailable");
    }
  }

  private get rpcUrl(): string {
    return this.rpcEndpoint.url;
  }
}

type ExitCheckAnchor = { blockNumber: number; blockHash: string; blockHex: string; timestamp: string; fetchedAt: string; capturedAtMs: number };

function responseAnchor(anchor: ExitCheckAnchor): ExitCheckResponse["anchor"] {
  return {
    tag: "latest",
    blockNumber: anchor.blockNumber,
    blockHash: anchor.blockHash,
    timestamp: anchor.timestamp,
    fetchedAt: anchor.fetchedAt
  };
}

function revertReason(returnData: Hex | undefined): string {
  if (typeof returnData === "string" && returnData.length >= 10) return `reverted:${returnData.slice(0, 10)}`;
  return "reverted";
}

function hexNumber(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) return undefined;
  const number = Number(BigInt(value));
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}

// The pool state helper needs to know token ordering; kept as a separate pure
// helper so it is unit testable without RPC.
export function zeroForOneFor(tokenIn: string, tokenOut: string): boolean {
  return BigInt(tokenIn.toLowerCase()) < BigInt(tokenOut.toLowerCase());
}

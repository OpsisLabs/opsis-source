import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "../config/env.js";
import { PublicSwapHistoryReader, type PublicSwapHistoryEvidence, type PublicSwapHistoryRead, type PublicSwapHistoryRequest } from "../history/public-swap-reader.js";

const ADDRESS = /^0x[0-9a-f]{40}$/;
const SOURCE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const MAX_BLOCK = 9_223_372_036_854_775_807n;

export type PublicSwapHistoryLookup = Pick<PublicSwapHistoryReader, "read">;

function parseBody(body: unknown): PublicSwapHistoryRequest | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) return;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).sort().join(",") !== "chainId,fromBlock,poolAddress,source,toBlock") return;
  if (input.chainId !== 4663 || typeof input.poolAddress !== "string" || !ADDRESS.test(input.poolAddress)
    || typeof input.source !== "string" || !SOURCE.test(input.source)
    || typeof input.fromBlock !== "string" || !DECIMAL.test(input.fromBlock)
    || typeof input.toBlock !== "string" || !DECIMAL.test(input.toBlock)) return;
  let fromBlock: bigint;
  let toBlock: bigint;
  try {
    fromBlock = BigInt(input.fromBlock);
    toBlock = BigInt(input.toBlock);
  } catch { return; }
  if (fromBlock > MAX_BLOCK || toBlock > MAX_BLOCK || toBlock < fromBlock || toBlock - fromBlock >= 100n) return;
  return { chainId: 4663, poolAddress: input.poolAddress, fromBlock, toBlock, source: input.source };
}

function publicResult(result: PublicSwapHistoryRead, request: PublicSwapHistoryRequest) {
  if (result.state === "complete") {
    const evidence = publicEvidence(result.evidence, request);
    const events = result.events.map((event) => publicEvent(event, request, evidence?.anchor.hash));
    if (!evidence || evidence.coverage.state !== "complete" || events.length < 1 || events.length > 100
      || events.some((event) => !event)) return { state: "gap" as const };
    return { state: "complete" as const, evidence, events: events as Record<string, unknown>[] };
  }
  if (result.state === "empty") {
    const evidence = publicEvidence(result.evidence, request);
    return evidence?.coverage.state === "empty" && result.events.length === 0
      ? { state: "empty" as const, evidence, events: [] as const } : { state: "gap" as const };
  }
  return { state: result.state };
}

function publicEvidence(value: PublicSwapHistoryEvidence, request: PublicSwapHistoryRequest) {
  if (!value || typeof value !== "object") return undefined;
  const e = value as Record<string, any>;
  if (e.kind !== "observed" || e.chain !== "eip155:4663"
    || typeof e.instrumentId !== "string" || !/^eip155:4663\/pool:0x[0-9a-f]{40}$/.test(e.instrumentId)
    || typeof e.observedAt !== "string" || !Number.isFinite(Date.parse(e.observedAt))
    || typeof e.sourceId !== "string" || !SOURCE.test(e.sourceId) || e.sourceVersion !== "unknown"
    || e.decoderVersion !== "uniswap-v3-swap-abi-v1"
    || !e.anchor || !DECIMAL.test(e.anchor.height) || typeof e.anchor.hash !== "string"
    || !/^0x[0-9a-f]{64}$/.test(e.anchor.hash) || e.anchor.semantics !== "current-not-final"
    || !e.coverage || !["complete", "empty"].includes(e.coverage.state)
    || !e.coverage.scope || !DECIMAL.test(e.coverage.scope.fromBlock) || !DECIMAL.test(e.coverage.scope.toBlock)
    || BigInt(e.coverage.scope.toBlock) < BigInt(e.coverage.scope.fromBlock)
    || e.instrumentId !== `eip155:4663/pool:${request.poolAddress.toLowerCase()}`
    || e.sourceId !== request.source || e.coverage.scope.fromBlock !== request.fromBlock.toString()
    || e.coverage.scope.toBlock !== request.toBlock.toString() || e.anchor.height !== request.toBlock.toString()
    || e.coverage.caps?.maxBlocks !== 100 || e.coverage.caps?.maxEvents !== 100
    || !Array.isArray(e.coverage.gaps) || e.coverage.gaps.length !== 0
    || e.freshness?.state !== "unknown" || typeof e.freshness.checkedAt !== "string"
    || !Number.isFinite(Date.parse(e.freshness.checkedAt))
    || e.units?.amount0 !== "raw-token-units" || e.units?.amount1 !== "raw-token-units"
    || e.units?.sqrtPriceX96 !== "Q64.96" || e.units?.liquidity !== "raw-pool-liquidity" || e.units?.tick !== "ticks"
    || !Array.isArray(e.limitations) || e.limitations.some((item: unknown) => typeof item !== "string")) return undefined;
  return {
    kind: e.kind,
    chain: e.chain,
    instrumentId: e.instrumentId,
    observedAt: e.observedAt,
    sourceId: e.sourceId,
    sourceVersion: e.sourceVersion,
    decoderVersion: e.decoderVersion,
    anchor: { height: e.anchor.height, hash: e.anchor.hash, semantics: e.anchor.semantics },
    coverage: { state: e.coverage.state,
      scope: { fromBlock: e.coverage.scope.fromBlock, toBlock: e.coverage.scope.toBlock },
      caps: { maxBlocks: e.coverage.caps.maxBlocks, maxEvents: e.coverage.caps.maxEvents }, gaps: [] },
    freshness: { state: e.freshness.state, checkedAt: e.freshness.checkedAt },
    units: { amount0: e.units.amount0, amount1: e.units.amount1, sqrtPriceX96: e.units.sqrtPriceX96,
      liquidity: e.units.liquidity, tick: e.units.tick },
    limitations: [...e.limitations],
  };
}

function publicEvent(value: Record<string, unknown>, request: PublicSwapHistoryRequest, anchorHash?: string) {
  const keys = ["chainId", "poolAddress", "blockNumber", "blockHash", "transactionHash", "logIndex", "blockTimestamp",
    "amount0", "amount1", "sqrtPriceX96", "liquidity", "tick"] as const;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const event = value as Record<string, unknown>;
  if (event.chainId !== 4663 || typeof event.poolAddress !== "string" || !ADDRESS.test(event.poolAddress)
    || typeof event.blockNumber !== "string" || !DECIMAL.test(event.blockNumber)
    || event.poolAddress !== request.poolAddress.toLowerCase()
    || BigInt(event.blockNumber) < request.fromBlock || BigInt(event.blockNumber) > request.toBlock
    || typeof event.blockHash !== "string" || !/^0x[0-9a-f]{64}$/.test(event.blockHash)
    || (event.blockNumber === request.toBlock.toString() && event.blockHash !== anchorHash)
    || typeof event.transactionHash !== "string" || !/^0x[0-9a-f]{64}$/.test(event.transactionHash)
    || !Number.isSafeInteger(event.logIndex) || (event.logIndex as number) < 0
    || typeof event.blockTimestamp !== "string" || !Number.isFinite(Date.parse(event.blockTimestamp))
    || typeof event.amount0 !== "string" || !/^-?(0|[1-9][0-9]*)$/.test(event.amount0)
    || typeof event.amount1 !== "string" || !/^-?(0|[1-9][0-9]*)$/.test(event.amount1)
    || typeof event.sqrtPriceX96 !== "string" || !DECIMAL.test(event.sqrtPriceX96)
    || typeof event.liquidity !== "string" || !DECIMAL.test(event.liquidity)
    || !Number.isInteger(event.tick)) return undefined;
  return Object.fromEntries(keys.map((key) => [key, event[key]]));
}

export async function publicSwapHistoryRoutes(
  app: FastifyInstance,
  env: Env,
  prisma?: PrismaClient,
  reader?: PublicSwapHistoryLookup,
): Promise<void> {
  const activeReader = reader ?? (prisma ? new PublicSwapHistoryReader(prisma, env.PUBLIC_SWAP_HISTORY_ENABLED) : undefined);
  app.post("/v1/public/swap-history", {
    config: { rateLimit: { max: env.RATE_LIMIT_PUBLIC_PER_HOUR, timeWindow: "1 hour" } },
  }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    if (!env.PUBLIC_SWAP_HISTORY_ENABLED || !prisma || !activeReader) return reply.code(404).send({ error: "not_found" });
    const parsed = parseBody(request.body);
    if (!parsed) return reply.code(400).send({ error: "invalid_request" });
    const result = await activeReader.read(parsed);
    return reply.send(publicResult(result, parsed));
  });
}

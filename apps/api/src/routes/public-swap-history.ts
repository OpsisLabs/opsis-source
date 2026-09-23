import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "../config/env.js";
import { PublicSwapHistoryReader, type PublicSwapHistoryRead, type PublicSwapHistoryRequest } from "../history/public-swap-reader.js";

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

function publicResult(result: PublicSwapHistoryRead) {
  if (result.state === "complete") {
    const events = result.events.map(publicEvent);
    if (events.some((event) => !event)) return { state: "gap" as const };
    return { state: "complete" as const, events: events as Record<string, unknown>[] };
  }
  if (result.state === "empty") return { state: "empty" as const, events: [] as const };
  return { state: result.state };
}

function publicEvent(value: Record<string, unknown>) {
  const keys = ["chainId", "poolAddress", "blockNumber", "blockHash", "transactionHash", "logIndex", "blockTimestamp",
    "amount0", "amount1", "sqrtPriceX96", "liquidity", "tick"] as const;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const event = value as Record<string, unknown>;
  if (event.chainId !== 4663 || typeof event.poolAddress !== "string" || !ADDRESS.test(event.poolAddress)
    || typeof event.blockNumber !== "string" || !DECIMAL.test(event.blockNumber)
    || typeof event.blockHash !== "string" || !/^0x[0-9a-f]{64}$/.test(event.blockHash)
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
    return reply.send(publicResult(result));
  });
}

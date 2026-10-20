import type { Env } from "../config/env.js";
import type { PortfolioBudget } from "../portfolio/budget.js";
import type { ProviderHttp } from "../chain/provider-http.js";
import {
  createRobinhoodRpcHttp,
  robinhoodRpcEndpoint,
  type RpcSpendBudget,
} from "../chain/robinhood-rpc.js";
import { BlockscoutProvider } from "../chain/blockscout.js";
import { decodeErc20Metadata } from "../chain/erc20-metadata.js";
import { normalizeEntity } from "../chain/normalize.js";
import type { ChainProvider } from "../chain/types.js";
import { AppError } from "../http/errors.js";
import type { Anchor, CardSources, Identity, MarketSample } from "./service.js";

/** Reuses the admitted RPC transport and explorer gate; reserves before reads. */
export class EngineCardSources implements CardSources {
  private readonly rpc: ProviderHttp;
  private readonly explorer: Pick<ChainProvider, "getToken">;
  constructor(
    private readonly env: Env,
    private readonly budget: PortfolioBudget,
    spend?: RpcSpendBudget,
    rpc?: ProviderHttp,
    explorer?: Pick<ChainProvider, "getToken">,
  ) {
    this.rpc =
      rpc ??
      createRobinhoodRpcHttp(env, {
        providerName: "card-metadata-rpc",
        spend,
        client: {
          maxRetries: 0,
          maxConcurrency: 1,
          maxResponseBytes: 10_000,
          rpcWorkload: "controls",
        },
      });
    this.explorer = explorer ?? new BlockscoutProvider(env);
  }
  async identity(address: string, anchor: Anchor): Promise<Identity> {
    await this.budget.consume(4);
    const endpoint = robinhoodRpcEndpoint(this.env);
    const block = `0x${anchor.blockNumber.toString(16)}`;
    let id = 0;
    const read = async (method: string, params: unknown[]) => {
      const callId = ++id;
      const raw = (await this.rpc.requestJson(endpoint.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: callId, method, params }),
      })) as { id?: unknown; result?: unknown; error?: unknown };
      if (!raw || raw.id !== callId || raw.error)
        throw new AppError(
          "METADATA_UNAVAILABLE",
          503,
          "Token metadata unavailable",
        );
      return raw.result;
    };
    const name = decodeErc20Metadata(
      "name",
      await read("eth_call", [{ to: address, data: "0x06fdde03" }, block]),
    );
    const symbol = decodeErc20Metadata(
      "symbol",
      await read("eth_call", [{ to: address, data: "0x95d89b41" }, block]),
    );
    const decimals = decodeErc20Metadata(
      "decimals",
      await read("eth_call", [{ to: address, data: "0x313ce567" }, block]),
    );
    const end = (await read("eth_getBlockByNumber", [block, false])) as {
      hash?: unknown;
    } | null;
    if (
      end?.hash !== anchor.blockHash ||
      typeof decimals !== "number" ||
      decimals > 36 ||
      (typeof name !== "string" && typeof symbol !== "string")
    )
      throw new AppError(
        "METADATA_UNAVAILABLE",
        503,
        "Token metadata unavailable",
      );
    return {
      name: typeof name === "string" ? name : null,
      symbol: typeof symbol === "string" ? symbol : null,
      decimals,
      basis: "self_reported_rpc",
      source: endpoint.id,
      observedAt: new Date().toISOString(),
      anchor,
    };
  }
  async market(address: string): Promise<MarketSample> {
    // The existing summary makes at most six document reads. Share the daily
    // portfolio ledger in addition to the explorer's rate/credit gate.
    await this.budget.consume(6);
    const docs = await this.explorer.getToken(address, {
      detail: "summary",
      limit: 10,
    });
    const facts = normalizeEntity(4663, "token", address, docs).facts;
    const profile = docs.find(
      (doc) =>
        doc.requestUrl && /\/tokens\/[^/?]+(?:\?|$)/.test(doc.requestUrl),
    );
    const holders = docs.find((doc) => doc.requestUrl?.endsWith("/holders"));
    const percentage = facts.top10WalletShare;
    const count = facts.holdersAnalyzed;
    // Invalid amounts must not be normalized into a zero share.
    const raw = holders?.responseJson as
      { items?: Array<{ value?: unknown }> } | undefined;
    const validSample =
      raw?.items?.length &&
      raw.items.every(
        (row) => typeof row.value === "string" && /^\d+$/.test(row.value),
      );
    const supply = facts.totalSupply;
    const valid =
      validSample &&
      typeof supply === "string" &&
      /^\d+$/.test(supply) &&
      BigInt(supply) > 0n &&
      raw!.items!.every((row) => BigInt(row.value as string) <= BigInt(supply));
    return {
      source: "blockscout",
      observedAt: profile?.fetchedAt ?? new Date().toISOString(),
      priceUsd:
        typeof facts.exchangeRate === "string" ? facts.exchangeRate : null,
      concentration:
        valid &&
        typeof percentage === "number" &&
        Number.isFinite(percentage) &&
        percentage >= 0 &&
        percentage <= 100 &&
        typeof count === "number" &&
        count > 0
          ? {
              state: "available",
              value: {
                top10Percent: percentage,
                holdersAnalyzed: count,
                source: "blockscout",
                observedAt: holders!.fetchedAt,
              },
            }
          : {
              state: "unknown",
              reason: "EXPLORER_HOLDER_SAMPLE_UNAVAILABLE_OR_INVALID",
            },
    };
  }
}

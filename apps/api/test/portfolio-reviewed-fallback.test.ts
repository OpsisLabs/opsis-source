import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../src/config/env.js";
import { ProviderRequestError, type ProviderHttp } from "../src/chain/provider-http.js";
import { REVIEWED_ROBINHOOD_ASSET_SAMPLE } from "../src/chain/reviewed-assets.js";
import type { PortfolioBudget } from "../src/portfolio/budget.js";
import { PortfolioService } from "../src/portfolio/service.js";

const OWNER = "0x1111111111111111111111111111111111111111";
const BLOCK_HASH = `0x${"f".repeat(64)}`;
const USDG = REVIEWED_ROBINHOOD_ASSET_SAMPLE[0].address.toLowerCase();
const AAPL = REVIEWED_ROBINHOOD_ASSET_SAMPLE[2].address.toLowerCase();

function env() {
  return loadEnv({ NODE_ENV: "test", PORTFOLIO_MODE_ENABLED: "true", SCOUT_WATCH_ENABLED: "true" });
}

/** Every reviewed token holds `balances[index]` (hex) with its reviewed decimals. */
function rpcFixture(balances: (index: number) => string): ProviderHttp {
  return {
    requestJson: vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { id?: string; method?: string } | Array<{ id: string; method: string }>;
      if (!Array.isArray(payload)) {
        return { jsonrpc: "2.0", id: payload.id, result: { number: "0x3e8", hash: BLOCK_HASH, timestamp: "0x6898a340" } };
      }
      return payload.map((request) => {
        if (request.id === "native") return { jsonrpc: "2.0", id: request.id, result: "0x0" };
        const balance = /^token:(\d+)$/.exec(request.id);
        if (balance) return { jsonrpc: "2.0", id: request.id, result: balances(Number(balance[1])) };
        const decimals = /^token-decimals:(\d+)$/.exec(request.id);
        if (decimals) {
          const asset = REVIEWED_ROBINHOOD_ASSET_SAMPLE[Number(decimals[1])];
          return { jsonrpc: "2.0", id: request.id, result: `0x${asset.decimals.toString(16)}` };
        }
        throw new Error(`unexpected RPC request ${request.id}`);
      });
    })
  };
}

function service(balances: (index: number) => string, blockscout?: ProviderHttp) {
  const rpc = rpcFixture(balances);
  const budget: PortfolioBudget = { consume: vi.fn().mockResolvedValue(undefined) };
  const refused: ProviderHttp = { requestJson: vi.fn(async () => { throw new ProviderRequestError("PROVIDER_HTTP_403", false); }) };
  return {
    rpc,
    budget,
    service: new PortfolioService(env(), { rpc, blockscout: blockscout ?? refused, budget, now: () => new Date("2026-09-26T12:00:00.000Z") })
  };
}

describe("reviewed-sample token fallback when indexer discovery fails", () => {
  it("checks the reviewed sample at the anchor and treats zero balances as confirmed, not gaps", async () => {
    const { service: portfolio, budget } = service((index) =>
      index === 0 ? "0x4c4b40" : index === 2 ? "0x1bc16d674ec80000" : "0x0");

    const snapshot = await portfolio.snapshot(OWNER);

    expect(snapshot.tokens.map((token) => [token.contract, token.symbol, token.quantity])).toEqual([
      [USDG, "USDG", "5"],
      [AAPL, "AAPL", "2"]
    ]);
    expect(snapshot.tokens.every((token) => token.sourceIds.includes("reviewed-asset-sample"))).toBe(true);
    expect(snapshot.citations.map((citation) => citation.id)).toContain("reviewed-asset-sample");
    expect(snapshot.reconciliation).toMatchObject({
      tokenCandidates: REVIEWED_ROBINHOOD_ASSET_SAMPLE.length,
      tokenConfirmed: 2,
      truncatedSections: []
    });
    expect(snapshot.reconciliation.degradedSources).toContain("blockscout:token-balances");
    const notice = snapshot.attention.find((item) => item.title === "Token list limited to a reviewed sample");
    expect(notice?.detail).toContain("Other tokens may be held and are not shown");
    expect(notice?.sourceIds).toEqual(["reviewed-asset-sample", expect.stringMatching(/-anchor$/)]);
    // One anchor read, one 25-member batch (native + 12 × balance/decimals), one recheck.
    expect(vi.mocked(budget.consume).mock.calls.map(([units]) => units)).toEqual([1, 25, 1]);
  });

  it("never returns more than the Vault's ten-token limit and says what was trimmed", async () => {
    const { service: portfolio } = service(() => "0xde0b6b3a7640000");

    const snapshot = await portfolio.snapshot(OWNER);

    expect(snapshot.tokens).toHaveLength(10);
    expect(snapshot.reconciliation.truncatedSections).toContain(
      `tokens: 10 of ${REVIEWED_ROBINHOOD_ASSET_SAMPLE.length} held tokens returned`
    );
  });

  it("does not use the reviewed sample when the indexer lists tokens", async () => {
    const blockscout: ProviderHttp = {
      requestJson: vi.fn(async (url: string) => (String(url).includes("/tokens?type=ERC-20") ? { items: [] } : { items: [] }))
    };
    const { service: portfolio } = service(() => "0xde0b6b3a7640000", blockscout);

    const snapshot = await portfolio.snapshot(OWNER);

    expect(snapshot.tokens).toEqual([]);
    expect(snapshot.citations.map((citation) => citation.id)).not.toContain("reviewed-asset-sample");
    expect(snapshot.attention.some((item) => item.title === "Token list limited to a reviewed sample")).toBe(false);
  });
});

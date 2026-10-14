import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../src/config/env.js";
import type { ProviderHttp } from "../src/chain/provider-http.js";
import { REVIEWED_ROBINHOOD_ASSET_SAMPLE } from "../src/chain/reviewed-assets.js";
import { installErrorHandler } from "../src/http/errors.js";
import { PortfolioService } from "../src/portfolio/service.js";
import { portfolioRoutes } from "../src/routes/portfolio.js";

const OWNER = `0x${"1".repeat(40)}`;
const BLOCK_HASH = `0x${"f".repeat(64)}`;
const KEY = "test-only-explorer-key";
const asset = REVIEWED_ROBINHOOD_ASSET_SAMPLE[0];

function fixture(rows: unknown[], options: { explorerFailure?: boolean; balanceFailure?: boolean } = {}) {
  const env = loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent", WATCH_ENABLED: "true", PORTFOLIO_MODE_ENABLED: "true", BLOCKSCOUT_PRO_API_KEY: KEY });
  const rpc: ProviderHttp = {
    requestJson: vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      if (!Array.isArray(payload)) return { id: payload.id, result: { number: "0x3e8", hash: BLOCK_HASH, timestamp: "0x6898a340" } };
      return payload.map((request: { id: string }) => ({
        id: request.id,
        result: request.id.startsWith("token-decimals:") ? "0x0" : options.balanceFailure && request.id === "native" ? null : "0x1"
      }));
    })
  };
  const blockscout: ProviderHttp = {
    requestJson: vi.fn(async (url: string) => {
      if (options.explorerFailure) throw new Error(`Upstream refused ${url}`);
      return { items: new URL(url).pathname.endsWith("/tokens") ? rows : [] };
    })
  };
  const service = new PortfolioService(env, { rpc, blockscout, budget: { consume: vi.fn().mockResolvedValue(undefined) } });
  return { env, service, rpc, blockscout };
}

const token = (contract: string, reputation?: unknown) => ({ token: { address_hash: contract, type: "ERC-20", name: "Sample token", symbol: "SAMPLE", reputation } });

describe("Watch explorer token discoveries", () => {
  it("checks a reviewed contract at position 15 before the ten-token bound, keeping other order and limits", async () => {
    const contracts = Array.from({ length: 16 }, (_, index) => `0x${(index + 100).toString(16).padStart(40, "0")}`);
    contracts[14] = `0x${asset.address.slice(2).toUpperCase()}`;
    const { service, rpc } = fixture(contracts.map((contract) => token(contract)));
    const snapshot = await service.snapshot(OWNER);
    expect(snapshot.tokens.map((holding) => holding.contract)).toEqual([asset.address.toLowerCase(), ...contracts.slice(0, 9)]);
    expect(snapshot.reconciliation.tokenCandidates).toBe(16);
    expect(snapshot.reconciliation.truncatedSections).toContain("tokens: 10 of 16 candidates evaluated");
    const batch = JSON.parse(String(vi.mocked(rpc.requestJson).mock.calls[1][1]?.body));
    expect(batch.filter((request: { id: string }) => request.id.startsWith("token:")).map((request: { params: [{ to: string }] }) => request.params[0].to)).toEqual(snapshot.tokens.map((holding) => holding.contract));
  });

  it("retains string reputation and omits absent or malformed values", async () => {
    const rows = ["scam", undefined, null, 7, ""].map((reputation, index) => token(`0x${(index + 100).toString(16).padStart(40, "0")}`, reputation));
    const snapshot = await fixture(rows).service.snapshot(OWNER);
    expect(snapshot.tokens[0].reputation).toBe("scam");
    expect(snapshot.tokens.slice(1).every((holding) => !("reputation" in holding))).toBe(true);
  });

  it.each([{}, { explorerFailure: true }, { explorerFailure: true, balanceFailure: true }])("keeps authenticated fetch URLs out of citations and responses, including failures: %j", async (options) => {
    const { env, service, blockscout } = fixture([token(asset.address)], options);
    const app = Fastify({ logger: false });
    installErrorHandler(app);
    await portfolioRoutes(app, env, service);
    try {
      const response = await app.inject({ method: "POST", url: "/v1/private/watch/snapshot", payload: { address: OWNER } });
      expect(response.statusCode).toBe(options.balanceFailure ? 503 : 200);
      expect(response.body).not.toContain(KEY);
      expect(response.body).not.toContain("api.blockscout.com");
      expect(vi.mocked(blockscout.requestJson).mock.calls).toHaveLength(5);
      for (const [url] of vi.mocked(blockscout.requestJson).mock.calls) {
        expect(new URL(url).searchParams.get("apikey")).toBe(KEY);
        expect(new URL(url).host).toBe("api.blockscout.com");
      }
      if (!options.explorerFailure) {
        const citations = response.json().citations.filter((citation: { provider: string }) => citation.provider === "blockscout");
        expect(citations.map((citation: { url: string }) => citation.url)).toEqual([
          `https://robinhoodchain.blockscout.com/address/${OWNER}`,
          `https://robinhoodchain.blockscout.com/address/${OWNER}?tab=tokens`,
          `https://robinhoodchain.blockscout.com/address/${OWNER}?tab=tokens`,
          `https://robinhoodchain.blockscout.com/address/${OWNER}?tab=txs`,
          `https://robinhoodchain.blockscout.com/address/${OWNER}?tab=txs`
        ]);
      }
    } finally { await app.close(); }
  });
});

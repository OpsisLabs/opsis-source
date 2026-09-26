import { afterEach, describe, expect, it, vi } from "vitest";
import type { PortfolioSnapshot } from "@rh-chain/shared";
import {
  PORTFOLIO_APPROVED_DESTINATIONS,
  isPortfolioProviderDestinations,
  requestPortfolioSnapshot
} from "./api";

const ADDRESS = "0x1111111111111111111111111111111111111111";

afterEach(() => vi.unstubAllGlobals());

function fixture(providerDestinations: unknown = ["drpc", "blockscout"]): PortfolioSnapshot {
  return {
    schemaVersion: 1,
    chain: { id: 4663, name: "Robinhood Chain", nativeSymbol: "ETH" },
    address: ADDRESS,
    anchor: { tag: "latest", blockNumber: 60_401_526, blockHash: `0x${"a".repeat(64)}`, timestamp: "2026-09-25T12:00:00.000Z", fetchedAt: "2026-09-25T12:00:01.000Z" },
    nativeBalanceEth: "0",
    tokens: [],
    nfts: [],
    transactions: [],
    movements: [],
    approvals: [],
    attention: [],
    reconciliation: { tokenCandidates: 0, tokenConfirmed: 0, nftCandidates: 0, nftConfirmed: 0, activityCandidates: 0, activityConfirmed: 0, approvalCandidates: 0, approvalConfirmed: 0, degradedSources: [], truncatedSections: [] },
    citations: [],
    privacy: {
      accountRequired: false,
      walletConnectionRequired: false,
      serverStorage: "none",
      browserStorage: "client_encrypted_vault",
      providerDestinations: providerDestinations as string[],
      disclosure: "fixture"
    }
  };
}

function mock(value: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Portfolio snapshot provider destinations", () => {
  it("accepts the production dRPC gateway and the development public RPC on every snapshot route", async () => {
    for (const destinations of [["drpc", "blockscout"], ["robinhood_public_rpc", "blockscout"]]) {
      for (const approvalsOnly of [false, true]) {
        const fetchMock = mock(fixture(destinations));
        await expect(requestPortfolioSnapshot(ADDRESS, undefined, approvalsOnly)).resolves.toMatchObject({
          privacy: { providerDestinations: destinations }
        });
        expect(fetchMock).toHaveBeenCalledWith(
          approvalsOnly ? "/v1/private/approvals/snapshot" : "/v1/private/portfolio/snapshot",
          expect.objectContaining({ credentials: "omit", body: JSON.stringify({ address: ADDRESS }) })
        );
      }
    }
  });

  it("fails closed when the server names any other or additional destination", async () => {
    for (const destinations of [
      ["alchemy", "blockscout"],
      ["robinhood-public-rpc", "blockscout"],
      ["dRPC Robinhood Chain gateway", "blockscout"],
      ["DRPC", "blockscout"],
      ["blockscout", "drpc"],
      ["drpc"],
      ["drpc", "blockscout", "openai"],
      [],
      "drpc,blockscout",
      null
    ]) {
      mock(fixture(destinations));
      await expect(requestPortfolioSnapshot(ADDRESS), JSON.stringify(destinations)).rejects.toThrow();
    }

    const missing = fixture();
    delete (missing.privacy as { providerDestinations?: unknown }).providerDestinations;
    mock(missing);
    await expect(requestPortfolioSnapshot(ADDRESS)).rejects.toThrow();
  });

  it("records the production dRPC gateway on the pre-request receipt", () => {
    expect(PORTFOLIO_APPROVED_DESTINATIONS).toEqual(["drpc", "blockscout"]);
    expect(isPortfolioProviderDestinations([...PORTFOLIO_APPROVED_DESTINATIONS])).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { CHAINSCOUT_REVIEWED_ASSETS } from "@rh-chain/shared";
import { fetchOpenDataRegistry, normalizeOpenDataAddress } from "./api";
import { SWAP_TOKENS } from "../swap/api";

const REVIEWED_AT = "2026-08-12T21:31:50.000Z";
const UNKNOWN = "0x1111111111111111111111111111111111111111";

afterEach(() => vi.unstubAllGlobals());

function asset(token: typeof CHAINSCOUT_REVIEWED_ASSETS.WETH | typeof CHAINSCOUT_REVIEWED_ASSETS.USDG) {
  return {
    schemaVersion: 1,
    canonicalId: `eip155:4663/erc20:${token.address}`,
    chain: { id: 4663, namespace: "eip155", name: "Robinhood Chain" },
    assetType: "erc20",
    address: token.address,
    name: token.name,
    symbol: token.symbol,
    decimals: token.decimals,
    registryStatus: "chainscout_supported",
    identityConfidence: "chainscout_reviewed_static_match",
    provenance: { derivation: "chainscout_static_review", upstreamPayloadIncluded: false, redistributionClass: "chainscout_reviewed_reference", reviewedAt: REVIEWED_AT },
    sources: [
      { id: "robinhood-chain-contracts", title: "Robinhood Chain contract reference", url: "https://docs.robinhood.com/chain/contracts/", kind: "primary_reference", purpose: "human_verification_link_only" },
      { id: `blockscout-token-${token.address.toLowerCase()}`, title: `${token.symbol} contract on the Robinhood Chain explorer`, url: `https://robinhoodchain.blockscout.com/token/${token.address}`, kind: "human_verification", purpose: "human_verification_link_only" },
    ],
    limitations: ["Reviewed support reference only.", "Not a safety or value claim."],
  };
}

function registry() {
  return {
    schemaVersion: 1,
    registryVersion: "2026-08-12.1",
    chainscoutSourceRevision: null,
    chain: { id: 4663, namespace: "eip155", name: "Robinhood Chain" },
    assets: [asset(CHAINSCOUT_REVIEWED_ASSETS.WETH), asset(CHAINSCOUT_REVIEWED_ASSETS.USDG)],
    assetsShown: 2,
    completeFor: "chainscout_reviewed_launch_registry",
    generatedAt: REVIEWED_AT,
    provenance: { upstreamPayloadIncluded: false, redistributionClass: "chainscout_reviewed_reference" },
    rights: { chainscoutAuthored: ["response schema"], excludedFromLicenseClaim: ["third-party marks"] },
    limitations: ["Complete only for the reviewed launch registry."],
    cap: { anonymousRequestsPerHour: 60, scope: "pseudonymous_network_client" },
  };
}

function identity(address = UNKNOWN, match: null | Record<string, unknown> = null) {
  return {
    schemaVersion: 1,
    chain: { id: 4663, namespace: "eip155", name: "Robinhood Chain" },
    kind: "address",
    normalizedValue: address,
    canonicalKey: `eip155:4663/address:${address}`,
    syntaxValid: true,
    existenceVerified: false,
    registryMatch: match,
    explorerUrl: `https://robinhoodchain.blockscout.com/address/${address}`,
    provenance: { derivation: "deterministic_syntax_normalization", upstreamPayloadIncluded: false, redistributionClass: "chainscout_derived_normalization", reviewedAt: REVIEWED_AT },
    limitations: ["Syntax only; existence is not verified.", "Explorer link is a handoff only.", "No type is inferred."],
  };
}

function stub(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Open Data browser client", () => {
  it("uses credentialless exact routes and validates the exact shared tuple", async () => {
    const fetchMock = stub(registry());
    await expect(fetchOpenDataRegistry()).resolves.toMatchObject({ assetsShown: 2 });
    expect(fetchMock).toHaveBeenCalledWith("/v1/public/open-data/v1/registry", expect.objectContaining({ method: "GET", credentials: "omit" }));
    expect(SWAP_TOKENS).toBe(CHAINSCOUT_REVIEWED_ASSETS);
    expect(SWAP_TOKENS.WETH.name).toBe("Wrapped Ether");
  });

  it("posts only the exact public address body and validates request-bound identity fields", async () => {
    const fetchMock = stub(identity());
    await normalizeOpenDataAddress(UNKNOWN);
    expect(fetchMock).toHaveBeenCalledWith("/v1/public/open-data/v1/normalize", expect.objectContaining({
      credentials: "omit",
      body: JSON.stringify({ chainId: 4663, kind: "evm_address", value: UNKNOWN }),
    }));
  });

  it("fails closed on replacement, duplicate, swapped, mismatched, malicious, and overlong registry truth", async () => {
    const mutations = [
      (value: ReturnType<typeof registry>) => {
        const entry = value.assets[0]! as Record<string, unknown>;
        entry.address = UNKNOWN;
        entry.canonicalId = `eip155:4663/erc20:${UNKNOWN}`;
      },
      (value: ReturnType<typeof registry>) => { value.assets[1] = structuredClone(value.assets[0]!); },
      (value: ReturnType<typeof registry>) => { value.assets.reverse(); },
      (value: ReturnType<typeof registry>) => { value.assets[0]!.decimals = 6; },
      (value: ReturnType<typeof registry>) => { value.assets[0]!.canonicalId = `eip155:4663/erc20:${UNKNOWN}`; },
      (value: ReturnType<typeof registry>) => { value.assets[0]!.sources[1]!.url = `https://robinhoodchain.blockscout.com/token/${UNKNOWN}`; },
      (value: ReturnType<typeof registry>) => { value.assets[0]!.sources[0]!.url = "https://evil.example"; },
      (value: ReturnType<typeof registry>) => { value.limitations = ["x".repeat(241)]; },
    ];
    for (const mutate of mutations) {
      const value = registry();
      mutate(value);
      stub(value);
      await expect(fetchOpenDataRegistry()).rejects.toThrow("invalid Open Data registry");
    }
  });

  it("fails closed on inconsistent normalized identity and false registry matches", async () => {
    const cases = [
      { ...identity(), canonicalKey: `eip155:4663/address:${CHAINSCOUT_REVIEWED_ASSETS.WETH.address}` },
      { ...identity(), explorerUrl: `https://robinhoodchain.blockscout.com/address/${CHAINSCOUT_REVIEWED_ASSETS.WETH.address}` },
      { ...identity(), registryMatch: { canonicalId: "eip155:4663/erc20:0x1111111111111111111111111111111111111111", symbol: "WETH", registryStatus: "chainscout_supported", identityConfidence: "chainscout_reviewed_static_match" } },
    ];
    for (const value of cases) {
      stub(value);
      await expect(normalizeOpenDataAddress(UNKNOWN)).rejects.toThrow("invalid normalized identity");
    }
    const weth = CHAINSCOUT_REVIEWED_ASSETS.WETH;
    stub(identity(weth.address, null));
    await expect(normalizeOpenDataAddress(weth.address)).rejects.toThrow("invalid normalized identity");
  });
});

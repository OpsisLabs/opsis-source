import type {
  OpenDataAsset,
  OpenDataAssetListResponse,
  OpenDataIdentityResponse,
  OpenDataManifestResponse,
  OpenDataNormalizeRequest,
} from "@rh-chain/shared";
import {
  CHAINSCOUT_REVIEWED_ASSETS,
  OPEN_DATA_REGISTRY_VERSION,
  OPEN_DATA_REVIEWED_AT,
  ROBINHOOD_CHAIN_4663,
} from "@rh-chain/shared";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

const CHAIN = ROBINHOOD_CHAIN_4663;
const CONTRACTS_SOURCE = {
  id: "robinhood-chain-contracts",
  title: "Robinhood Chain contract reference",
  url: "https://docs.robinhood.com/chain/contracts/",
  kind: "primary_reference" as const,
  purpose: "human_verification_link_only" as const,
};
const ASSET_LIMITATIONS = [
  "This is a reviewed ChainScout launch-registry fact, not a live balance, price, risk score, or complete token directory.",
  "Contract identity and ERC-20 metadata do not prove safety, value, liquidity, redemption rights, or issuer endorsement.",
];

function asset(input: Pick<OpenDataAsset, "address" | "name" | "symbol" | "decimals">): OpenDataAsset {
  const address = getAddress(input.address);
  return {
    schemaVersion: 1,
    canonicalId: `eip155:4663/erc20:${address}`,
    chain: CHAIN,
    assetType: "erc20",
    address,
    name: input.name,
    symbol: input.symbol,
    decimals: input.decimals,
    registryStatus: "chainscout_supported",
    identityConfidence: "chainscout_reviewed_static_match",
    provenance: {
      derivation: "chainscout_static_review",
      upstreamPayloadIncluded: false,
      redistributionClass: "chainscout_reviewed_reference",
      reviewedAt: OPEN_DATA_REVIEWED_AT,
    },
    sources: [
      CONTRACTS_SOURCE,
      {
        id: `blockscout-token-${address.toLowerCase()}`,
        title: `${input.symbol} contract on the Robinhood Chain explorer`,
        url: `https://robinhoodchain.blockscout.com/token/${address}`,
        kind: "human_verification",
        purpose: "human_verification_link_only",
      },
    ],
    limitations: ASSET_LIMITATIONS,
  };
}

export const OPEN_DATA_ASSETS: readonly OpenDataAsset[] = Object.freeze([
  asset(CHAINSCOUT_REVIEWED_ASSETS.WETH),
  asset(CHAINSCOUT_REVIEWED_ASSETS.USDG),
]);

export function openDataManifest(requestsPerHour: number): OpenDataManifestResponse {
  return {
    schemaVersion: 1,
    apiVersion: "v1",
    status: "available",
    chain: CHAIN,
    endpoints: [
      { method: "GET", path: "/v1/public/open-data/v1/registry", description: "Reviewed launch support registry" },
      { method: "POST", path: "/v1/public/open-data/v1/normalize", description: "Syntax-only EVM address normalization" },
    ],
    cap: { anonymousRequestsPerHour: requestsPerHour, scope: "pseudonymous_network_client" },
    privacy: {
      accountRequired: false,
      browserCredentialsUsed: false,
      vaultDataAccepted: false,
      providerCallsPerRequest: 0,
      rawUpstreamPayloadsReturned: false,
    },
    generatedAt: OPEN_DATA_REVIEWED_AT,
    limitations: [
      "The v1 surface is deliberately small and contains no live wallet, transaction, price, inventory, or portfolio endpoint.",
      "The anonymous cap can be reduced or the API disabled to protect service availability; no paid-overage provider path exists.",
    ],
  };
}

export function listOpenDataAssets(sourceRevision: string | null = null): OpenDataAssetListResponse {
  return {
    schemaVersion: 1,
    registryVersion: OPEN_DATA_REGISTRY_VERSION,
    chainscoutSourceRevision: sourceRevision,
    chain: CHAIN,
    assets: OPEN_DATA_ASSETS.map((entry) => structuredClone(entry)),
    assetsShown: OPEN_DATA_ASSETS.length,
    completeFor: "chainscout_reviewed_launch_registry",
    generatedAt: OPEN_DATA_REVIEWED_AT,
    provenance: { upstreamPayloadIncluded: false, redistributionClass: "chainscout_reviewed_reference" },
    rights: {
      chainscoutAuthored: ["response schema", "normalization", "limitations", "support-registry annotations"],
      excludedFromLicenseClaim: ["third-party names", "symbols", "contract addresses", "trademarks", "linked source materials"],
    },
    limitations: [
      "This list is complete only for ChainScout's reviewed launch registry, not for Robinhood Chain.",
      "No provider is contacted when this response is created.",
    ],
  };
}

export function findOpenDataAsset(address: string): OpenDataAsset | null {
  if (!isAddress(address, { strict: false })) return null;
  const normalized = getAddress(address);
  const found = OPEN_DATA_ASSETS.find((entry) => entry.address === normalized);
  return found ? structuredClone(found) : null;
}

export const normalizeBody = z.object({
  chainId: z.literal(4663),
  kind: z.literal("evm_address"),
  value: z.string().min(42).max(42),
}).strict();

export function normalizeOpenDataIdentity(input: OpenDataNormalizeRequest): OpenDataIdentityResponse | null {
  if (!isAddress(input.value, { strict: false })) return null;
  const normalizedValue = getAddress(input.value);
  const registryMatch = findOpenDataAsset(normalizedValue);

  return {
    schemaVersion: 1,
    chain: CHAIN,
    kind: "address",
    normalizedValue,
    canonicalKey: `eip155:4663/address:${normalizedValue}`,
    syntaxValid: true,
    existenceVerified: false,
    registryMatch: registryMatch ? {
      canonicalId: registryMatch.canonicalId,
      symbol: registryMatch.symbol,
      registryStatus: registryMatch.registryStatus,
      identityConfidence: registryMatch.identityConfidence,
    } : null,
    explorerUrl: `https://robinhoodchain.blockscout.com/address/${normalizedValue}`,
    provenance: {
      derivation: "deterministic_syntax_normalization",
      upstreamPayloadIncluded: false,
      redistributionClass: "chainscout_derived_normalization",
      reviewedAt: OPEN_DATA_REVIEWED_AT,
    },
    limitations: [
      "Syntax normalization does not query a provider and does not prove the address, transaction, or block exists.",
      "The explorer URL is a user-verification handoff, not a copied explorer response.",
      registryMatch
        ? `This address exactly matches ChainScout's reviewed ${registryMatch.symbol} launch-support entry.`
        : "This address is not in ChainScout's reviewed launch registry; no asset type or contract behavior is inferred.",
    ],
  };
}

import {
  CHAINSCOUT_REVIEWED_ASSETS,
  OPEN_DATA_REGISTRY_VERSION,
  OPEN_DATA_REVIEWED_AT,
  ROBINHOOD_CHAIN_4663,
  type OpenDataAsset,
  type OpenDataAssetListResponse,
  type OpenDataIdentityResponse,
} from "@rh-chain/shared";
import { getAddress, isAddress } from "viem";
import { translateCurrent } from "../i18n/translate";

export const OPEN_DATA_PATHS = {
  registry: "/v1/public/open-data/v1/registry",
  normalize: "/v1/public/open-data/v1/normalize",
} as const;

type RegistryResponse = OpenDataAssetListResponse & {
  cap: { anonymousRequestsPerHour: number; scope: "pseudonymous_network_client" };
};

const CHAIN = ROBINHOOD_CHAIN_4663;
const TOKENS = [CHAINSCOUT_REVIEWED_ASSETS.WETH, CHAINSCOUT_REVIEWED_ASSETS.USDG] as const;

export async function fetchOpenDataRegistry(signal?: AbortSignal): Promise<RegistryResponse> {
  const response = await fetch(OPEN_DATA_PATHS.registry, {
    method: "GET",
    credentials: "omit",
    headers: { accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error(await publicError(response));
  const value = await response.json() as unknown;
  assertRegistry(value);
  return value;
}

export async function normalizeOpenDataAddress(value: string, signal?: AbortSignal): Promise<OpenDataIdentityResponse> {
  const response = await fetch(OPEN_DATA_PATHS.normalize, {
    method: "POST",
    credentials: "omit",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chainId: 4663, kind: "evm_address", value }),
    signal,
  });
  if (!response.ok) throw new Error(await publicError(response));
  const result = await response.json() as unknown;
  assertIdentity(result, value);
  return result;
}

async function publicError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: { message?: unknown } };
    if (typeof body.error?.message === "string") return body.error.message;
  } catch {
    // Keep the public failure bounded when a proxy returns something else.
  }
  return response.status === 503
    ? translateCurrent("guide.openData.comingSoon")
    : translateCurrent("guide.openData.notAccepted");
}

function assertRegistry(value: unknown): asserts value is RegistryResponse {
  const candidate = record(value);
  if (!exactKeys(candidate, ["schemaVersion", "registryVersion", "chainscoutSourceRevision", "chain", "assets", "assetsShown", "completeFor", "generatedAt", "provenance", "rights", "limitations", "cap"])) invalidRegistry();
  if (
    candidate.schemaVersion !== 1 || candidate.registryVersion !== OPEN_DATA_REGISTRY_VERSION ||
    !(candidate.chainscoutSourceRevision === null || fullSha(candidate.chainscoutSourceRevision)) ||
    !exactChain(candidate.chain) || candidate.assetsShown !== 2 ||
    candidate.completeFor !== "chainscout_reviewed_launch_registry" || candidate.generatedAt !== OPEN_DATA_REVIEWED_AT ||
    !exactObject(candidate.provenance, { upstreamPayloadIncluded: false, redistributionClass: "chainscout_reviewed_reference" }) ||
    !stringList(candidate.limitations, 1, 4, 240)
  ) invalidRegistry();
  const rights = record(candidate.rights);
  if (!exactKeys(rights, ["chainscoutAuthored", "excludedFromLicenseClaim"])) invalidRegistry();
  if (!stringList(rights.chainscoutAuthored, 1, 8, 80) || !stringList(rights.excludedFromLicenseClaim, 1, 8, 80)) invalidRegistry();
  const cap = record(candidate.cap);
  if (!exactKeys(cap, ["anonymousRequestsPerHour", "scope"]) || cap.scope !== "pseudonymous_network_client" || !integerIn(cap.anonymousRequestsPerHour, 1, 1_000)) invalidRegistry();
  if (!Array.isArray(candidate.assets) || candidate.assets.length !== TOKENS.length) invalidRegistry();
  candidate.assets.forEach((asset, index) => assertAsset(asset, TOKENS[index]!));
}

function assertAsset(value: unknown, expected: typeof TOKENS[number]): asserts value is OpenDataAsset {
  const asset = record(value);
  if (!exactKeys(asset, ["schemaVersion", "canonicalId", "chain", "assetType", "address", "name", "symbol", "decimals", "registryStatus", "identityConfidence", "provenance", "sources", "limitations"])) invalidRegistry();
  const canonicalId = `eip155:4663/erc20:${expected.address}`;
  if (
    asset.schemaVersion !== 1 || asset.canonicalId !== canonicalId || !exactChain(asset.chain) ||
    asset.assetType !== "erc20" || asset.address !== expected.address || asset.name !== expected.name ||
    asset.symbol !== expected.symbol || asset.decimals !== expected.decimals ||
    asset.registryStatus !== "chainscout_supported" || asset.identityConfidence !== "chainscout_reviewed_static_match" ||
    !exactObject(asset.provenance, {
      derivation: "chainscout_static_review",
      upstreamPayloadIncluded: false,
      redistributionClass: "chainscout_reviewed_reference",
      reviewedAt: OPEN_DATA_REVIEWED_AT,
    }) || !stringList(asset.limitations, 1, 4, 240)
  ) invalidRegistry();
  if (!Array.isArray(asset.sources) || asset.sources.length !== 2) invalidRegistry();
  const [reference, explorer] = asset.sources.map(record);
  const expectedSources = [
    { id: "robinhood-chain-contracts", title: "Robinhood Chain contract reference", url: "https://docs.robinhood.com/chain/contracts/", kind: "primary_reference", purpose: "human_verification_link_only" },
    { id: `blockscout-token-${expected.address.toLowerCase()}`, title: `${expected.symbol} contract on the Robinhood Chain explorer`, url: `https://robinhoodchain.blockscout.com/token/${expected.address}`, kind: "human_verification", purpose: "human_verification_link_only" },
  ];
  if (!exactObject(reference, expectedSources[0]!) || !exactObject(explorer, expectedSources[1]!)) invalidRegistry();
}

function assertIdentity(value: unknown, requested: string): asserts value is OpenDataIdentityResponse {
  if (!isAddress(requested, { strict: false })) throw new Error(translateCurrent("guide.openData.invalidIdentity"));
  const normalized = getAddress(requested);
  const candidate = record(value);
  if (!exactKeys(candidate, ["schemaVersion", "chain", "kind", "normalizedValue", "canonicalKey", "syntaxValid", "existenceVerified", "registryMatch", "explorerUrl", "provenance", "limitations"])) invalidIdentity();
  if (
    candidate.schemaVersion !== 1 || !exactChain(candidate.chain) || candidate.kind !== "address" ||
    candidate.normalizedValue !== normalized || candidate.canonicalKey !== `eip155:4663/address:${normalized}` ||
    candidate.syntaxValid !== true || candidate.existenceVerified !== false ||
    candidate.explorerUrl !== `https://robinhoodchain.blockscout.com/address/${normalized}` ||
    !exactObject(candidate.provenance, {
      derivation: "deterministic_syntax_normalization",
      upstreamPayloadIncluded: false,
      redistributionClass: "chainscout_derived_normalization",
      reviewedAt: OPEN_DATA_REVIEWED_AT,
    }) || !stringList(candidate.limitations, 2, 4, 240)
  ) invalidIdentity();
  const expectedToken = TOKENS.find((token) => token.address === normalized);
  if (!expectedToken) {
    if (candidate.registryMatch !== null) invalidIdentity();
    return;
  }
  if (!exactObject(candidate.registryMatch, {
    canonicalId: `eip155:4663/erc20:${expectedToken.address}`,
    symbol: expectedToken.symbol,
    registryStatus: "chainscout_supported",
    identityConfidence: "chainscout_reviewed_static_match",
  })) invalidIdentity();
}

function exactChain(value: unknown): boolean {
  return exactObject(value, CHAIN);
}

function exactObject(value: unknown, expected: Record<string, unknown>): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(expected);
  return exactKeys(candidate, keys) && keys.every((key) => candidate[key] === expected[key]);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(translateCurrent("guide.openData.invalidResponse"));
  return value as Record<string, unknown>;
}

function stringList(value: unknown, min: number, max: number, maxLength: number): boolean {
  return Array.isArray(value) && value.length >= min && value.length <= max && value.every((item) => typeof item === "string" && item.length >= 1 && item.length <= maxLength);
}

function integerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function fullSha(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function invalidRegistry(): never {
  throw new Error(translateCurrent("guide.openData.invalidRegistry"));
}

function invalidIdentity(): never {
  throw new Error(translateCurrent("guide.openData.invalidIdentity"));
}

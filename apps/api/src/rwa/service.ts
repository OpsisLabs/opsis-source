import {
  decodeFunctionResult,
  encodeFunctionData,
  formatUnits,
  isAddress,
  type Abi,
  type Address,
  type Hex
} from "viem";
import type { Env } from "../config/env.js";
import { createProviderHttp, ProviderRequestError, type ProviderHttp } from "../chain/provider-http.js";
import {
  createRobinhoodRpcHttp,
  robinhoodRpcEndpoint,
  rpcRoutingDisclosure,
  type RobinhoodRpcEndpoint,
  type RpcSpendBudget
} from "../chain/robinhood-rpc.js";
import { AppError } from "../http/errors.js";
import { createRwaBudget, type RwaBudget } from "./budget.js";

const RHJ_API = "https://api.robinhood.com/rhj";
const CHAINLINK_RDD = "https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json";
const MORPHO_API = "https://api.morpho.org";
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

const stockAbi = [
  { type: "function", name: "uid", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "uiMultiplier", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "newUIMultiplier", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "effectiveAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "oraclePaused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "tokenPaused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "terms", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] }
] as const satisfies Abi;

const feedAbi = [
  { type: "function", name: "description", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "latestRoundData", stateMutability: "view", inputs: [], outputs: [
    { type: "uint80" }, { type: "int256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint80" }
  ] }
] as const satisfies Abi;

const vaultAbi = [
  { type: "function", name: "asset", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "totalAssets", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] }
] as const satisfies Abi;

const assetAbi = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }
] as const satisfies Abi;

type Dependencies = { http: ProviderHttp; rpc: ProviderHttp; budget: RwaBudget; now: () => Date };
type RpcCall = { id: string; to?: string; method?: string; data?: Hex; params?: unknown[] };
type RpcResult = { id?: string; result?: unknown; error?: unknown };
type OptionalDocument = { state: "available"; body: unknown } | { state: "unavailable"; code: string };
type ParseResult<T> = { state: "match"; value: T } | { state: "empty" } | { state: "malformed" };

export type RwaCitation = { id: string; provider: string; url: string; fetchedAt: string; description: string };
export type RwaCheck = {
  id: string;
  label: string;
  status: "confirmed" | "claim" | "warning" | "missing" | "conflict" | "unsupported";
  detail: string;
  sourceIds: string[];
};

export type RwaVerification = {
  kind: "stock_token" | "morpho_vault" | "unsupported_contract";
  address: string;
  headline: string;
  summary: string;
  anchor: { chainId: 4663; blockNumber: number; blockHash: string; capturedAt: string; finality: "current_non_final" };
  checks: RwaCheck[];
  stock?: {
    uid: string;
    symbol: string;
    name: string;
    decimals: number;
    registryStatus: string;
    currentMultiplier: string;
    pendingMultiplier: string | null;
    pendingEffectiveAt: string | null;
    oraclePaused: boolean;
    tokenPaused: boolean | null;
    termsUrl: string | null;
    underlyingQuote: null | { bid: string; ask: string; currency: string; generatedAt: string; tradingHalted: boolean; state: "current" | "stale"; ageSeconds: number };
    oracle: null | { feed: string; value: string | null; updatedAt: string | null; heartbeatSeconds: number; state: "current" | "paused" | "stale_or_market_closed" | "invalid" };
    corporateActions: Array<{ id: string; type: string; status: string; processDate: string | null; detail: string }>;
  };
  morpho?: {
    name: string;
    symbol: string;
    version: string;
    listed: boolean | null;
    asset: { address: string; symbol: string; decimals: number };
    owner: string;
    curator: string;
    timelockSeconds: number;
    managementFeeWad: string | null;
    performanceFeeWad: string | null;
    gates: { sendShares: string | null; receiveShares: string | null; sendAssets: string | null; receiveAssets: string | null };
    totalAssetsRaw: string;
    totalSupplyRaw: string;
    withdrawableAssetsRaw: string | null;
    allocatedAssetsRaw: string | null;
    idleAssetsRaw: string | null;
    indexedBlock: number | null;
    configIndexedBlock: number | null;
    apyIndexedBlock: number | null;
    indexLagBlocks: number | null;
    trailing24hApy: string | null;
  };
  limitations: string[];
  sources: RwaCitation[];
  privacy: {
    serverStorage: "none";
    modelProvider: "none";
    providerDestinations: string[];
    disclosure: string;
  };
};

export interface RwaVerificationSource { verify(address: string): Promise<RwaVerification> }

export class RwaService implements RwaVerificationSource {
  private readonly dependencies: Dependencies;
  private readonly rpcEndpoint: RobinhoodRpcEndpoint;

  constructor(private readonly env: Env, dependencies?: Partial<Dependencies> & { rpcSpend?: RpcSpendBudget }) {
    const oneAttemptEnv: Env = { ...env, PROVIDER_MAX_RETRIES: 0 };
    this.rpcEndpoint = robinhoodRpcEndpoint(env);
    this.dependencies = {
      http: dependencies?.http ?? createProviderHttp(oneAttemptEnv, "rwa-public-source"),
      rpc: dependencies?.rpc ?? createRobinhoodRpcHttp(env, {
        providerName: "rwa-rpc",
        spend: dependencies?.rpcSpend,
        client: { maxRetries: 0, rpcWorkload: "rwa" }
      }),
      budget: dependencies?.budget ?? createRwaBudget(env),
      now: dependencies?.now ?? (() => new Date())
    };
  }

  async verify(input: string): Promise<RwaVerification> {
    if (!isAddress(input, { strict: false })) throw new AppError("INVALID_RWA_CONTRACT", 400, "Provide one complete Robinhood Chain contract address");
    const address = input.toLowerCase();
    const run = { rpcUnits: 0 };
    const anchor = await this.captureAnchor(run);
    const code = await this.rpcSingle("eth_getCode", [address, anchor.blockHex], run);
    const assetsBody = await this.dependencies.http.requestJson(`${RHJ_API}/assets`, { redirect: "error" });
    if (!Array.isArray(asRecord(assetsBody).assets)) {
      throw new AppError("RWA_PROVIDER_SCHEMA_CHANGED", 503, "Robinhood returned an unrecognized asset registry");
    }
    const asset = findStockAsset(assetsBody, address);

    let result: RwaVerification;
    if (asset) result = await this.verifyStock(address, anchor, asset, run);
    else {
      const morphoConfig = await this.lookupJson(`${MORPHO_API}/v0/vaults-v2/4663:${address}`);
      result = morphoConfig ? await this.verifyMorpho(address, anchor, morphoConfig, run) : this.unsupported(address, anchor, code);
    }
    await this.recheckAnchor(anchor, run);
    return result;
  }

  private async verifyStock(address: string, anchor: CapturedAnchor, asset: StockAsset, run: VerificationRun): Promise<RwaVerification> {
    const fetchedAt = this.dependencies.now().toISOString();
    const [priceDocument, actionsDocument, rddDocument] = await Promise.all([
      this.optionalDocument(`${RHJ_API}/prices/${encodeURIComponent(asset.symbol)}`, { redirect: "error" }),
      this.optionalDocument(`${RHJ_API}/corporate-actions`, { redirect: "error" }),
      this.optionalDocument(CHAINLINK_RDD, { redirect: "error" })
    ]);
    const priceBody = documentBody(priceDocument);
    const actionsBody = documentBody(actionsDocument);
    const rddBody = documentBody(rddDocument);
    const actionsSchemaValid = actionsDocument.state === "available" && Array.isArray(asRecord(actionsBody).corpActions);
    const feedResult = rddDocument.state === "available" ? parseFeedDirectory(rddBody, asset.symbol) : { state: "empty" as const };
    const feed = feedResult.state === "match" ? feedResult.value : null;
    const calls: RpcCall[] = stockAbi.map((entry) => ({ id: `stock:${entry.name}`, to: address, data: encodeFunctionData({ abi: stockAbi, functionName: entry.name }) }));
    if (feed) feedAbi.forEach((entry) => calls.push({ id: `feed:${entry.name}`, to: feed.proxyAddress, data: encodeFunctionData({ abi: feedAbi, functionName: entry.name }) }));
    const direct = await this.rpcBatch(calls, anchor.blockHex, run);

    const uid = decoded<Hex>(stockAbi, "uid", direct.get("stock:uid"));
    const name = decoded<string>(stockAbi, "name", direct.get("stock:name"));
    const symbol = decoded<string>(stockAbi, "symbol", direct.get("stock:symbol"));
    const decimals = decoded<number>(stockAbi, "decimals", direct.get("stock:decimals"));
    const multiplier = decoded<bigint>(stockAbi, "uiMultiplier", direct.get("stock:uiMultiplier"));
    const pendingMultiplier = decoded<bigint>(stockAbi, "newUIMultiplier", direct.get("stock:newUIMultiplier"));
    const effectiveAt = decoded<bigint>(stockAbi, "effectiveAt", direct.get("stock:effectiveAt"));
    const oraclePaused = decoded<boolean>(stockAbi, "oraclePaused", direct.get("stock:oraclePaused"));
    const tokenPaused = decoded<boolean>(stockAbi, "tokenPaused", direct.get("stock:tokenPaused"));
    const terms = decoded<string>(stockAbi, "terms", direct.get("stock:terms"));
    if (uid === undefined || name === undefined || symbol === undefined || decimals === undefined || multiplier === undefined || oraclePaused === undefined) {
      throw new AppError("RWA_DIRECT_VERIFICATION_FAILED", 503, "The canonical token could not be verified at the captured block");
    }

    const identityMatches = uid.toLowerCase() === asset.id.toLowerCase()
      && symbol === asset.symbol
      && decimals === asset.decimals;
    const multiplierText = formatUnits(multiplier, 18);
    const registryMultiplierMatches = multiplierText === trimDecimal(asset.currentMultiplier);
    const pendingEffectiveAt = effectiveAt && effectiveAt > 0n ? unixIso(effectiveAt) : null;
    const sources: RwaCitation[] = [
      source("robinhood-registry", "Robinhood", `${RHJ_API}/assets`, fetchedAt, "Canonical Stock Token registry and deployment"),
      source("robinhood-rpc", this.rpcEndpoint.label, publicRpcCitationOrigin(this.rpcEndpoint.url), anchor.capturedAt, `Direct contract reads at block ${anchor.blockNumber}`),
      source("robinhood-terms", "Robinhood Jersey", "https://robinhood.com/rhj/stocktokens/", fetchedAt, "Issuer product, custody, and redemption statements")
    ];
    if (priceDocument.state === "available") sources.push(source("robinhood-price", "Robinhood", `${RHJ_API}/prices/${asset.symbol}`, fetchedAt, "Underlying-equity quote response; rejected if identity, currency, or timestamp validation fails"));
    if (actionsDocument.state === "available") sources.push(source("robinhood-actions", "Robinhood", `${RHJ_API}/corporate-actions`, fetchedAt, actionsSchemaValid ? "Issuer corporate-action schedule" : "Corporate-action response rejected as malformed"));
    if (rddDocument.state === "available") sources.push(source("chainlink-rdd", "Chainlink", CHAINLINK_RDD, fetchedAt, feedResult.state === "malformed" ? "Feed directory or matching entry rejected as malformed" : feed ? "Official Robinhood feed directory entry" : "Official Robinhood feed directory checked; no matching feed"));

    const quoteResult = priceDocument.state === "available" ? parseQuote(priceBody, asset.symbol, address, this.dependencies.now()) : { state: "empty" as const };
    const quote = quoteResult.state === "match" ? quoteResult.value : null;
    const allCorporateActions = actionsSchemaValid ? parseActions(actionsBody, asset, address) : [];
    const corporateActions = allCorporateActions.slice(0, 20);
    const oracle = feed ? parseOracle(feed, direct, oraclePaused, this.dependencies.now()) : null;
    const checks: RwaCheck[] = [
      check("canonical", "Canonical address", identityMatches ? "confirmed" : "conflict", identityMatches
        ? "Exact chain-4663 deployment, onchain UID, symbol, and decimals agree."
        : "The registry deployment and direct onchain identity do not fully agree.", ["robinhood-registry", "robinhood-rpc"]),
      check("multiplier", "UI multiplier", registryMultiplierMatches ? "confirmed" : "conflict", registryMultiplierMatches
        ? `Registry and onchain multiplier agree at ${multiplierText}. Raw balances do not rebase.`
        : `Registry reports ${trimDecimal(asset.currentMultiplier)} while the contract reports ${multiplierText}.`, ["robinhood-registry", "robinhood-rpc"]),
      check("rights", "What the token represents", "claim", "Robinhood describes this as a tokenized debt security providing economic exposure—not ownership or shareholder rights in the underlying stock.", ["robinhood-terms"]),
      check("custody", "Backing and custody", "claim", "The issuer states that underlying assets are held 1:1 with a licensed custodian. Opsis has not independently audited that custody.", ["robinhood-terms"]),
      check("redemption", "Minting and redemption", "warning", "Direct mint/burn is for authorized participants. Any issuer redemption path can be jurisdiction-limited and require KYC/AML; Opsis does not determine eligibility or execute it.", ["robinhood-terms"]),
      check("jurisdiction", "Geographic eligibility", "warning", "Robinhood's published Stock Token materials describe geographic restrictions including U.S. persons, Canada, the United Kingdom, and Switzerland. Rules can change; check the current issuer terms for your situation.", ["robinhood-terms"]),
      check("quote", "Underlying quote coverage", priceDocument.state === "unavailable" || quoteResult.state === "empty" ? "missing" : quoteResult.state === "malformed" ? "conflict" : quote?.tradingHalted || quote?.state === "stale" ? "warning" : "confirmed", priceDocument.state === "unavailable"
        ? `Robinhood's quote endpoint was unavailable (${priceDocument.code}); no bid or ask was shown.`
        : quoteResult.state === "empty"
          ? "Robinhood returned a valid quote collection with no matching exact-deployment quote; no bid or ask was shown."
        : quoteResult.state === "malformed" || !quote
          ? "The quote response failed contract deployment, USD currency, numeric, or timestamp validation; no bid or ask was shown."
          : `${quote.bid} / ${quote.ask} ${quote.currency} raw underlying bid/ask, generated ${quote.generatedAt}; ${quote.tradingHalted ? "trading halt reported" : quote.state === "stale" ? "older than Opsis's five-minute display threshold" : "within Opsis's five-minute display threshold"}.`, priceDocument.state === "available" ? ["robinhood-price"] : []),
      check("actions", "Corporate-action coverage", actionsDocument.state === "unavailable" ? "missing" : !actionsSchemaValid ? "conflict" : allCorporateActions.length > 20 ? "warning" : "confirmed", actionsDocument.state === "unavailable"
        ? `Robinhood's corporate-action endpoint was unavailable (${actionsDocument.code}); zero actions was not assumed.`
        : !actionsSchemaValid
          ? "Robinhood's corporate-action response was malformed; zero actions was not assumed."
          : allCorporateActions.length > 20
            ? `${corporateActions.length} of ${allCorporateActions.length} exact-deployment matches are shown; coverage is truncated.`
            : `${corporateActions.length} exact-deployment corporate action${corporateActions.length === 1 ? "" : "s"} matched the current response. Process dates are not necessarily payment dates.`, actionsDocument.state === "available" ? ["robinhood-actions"] : []),
      check("oracle", "Per-token oracle", oracle ? oracleStatus(oracle.state) : feedResult.state === "malformed" ? "conflict" : "missing", oracle
        ? oracleDetail(oracle)
        : rddDocument.state === "unavailable"
          ? `Chainlink's official feed directory was unavailable (${rddDocument.code}). No oracle coverage or price was assumed.`
          : feedResult.state === "empty"
          ? "No matching feed was found in Chainlink's official Robinhood directory. No price was invented."
          : "Chainlink's official feed directory or matching feed entry was malformed. No oracle coverage or price was assumed.", feed ? ["chainlink-rdd", "robinhood-rpc"] : rddDocument.state === "available" ? ["chainlink-rdd"] : []),
    ];
    if (oraclePaused) checks.push(check("oracle-paused", "Issuer oracle pause", "warning", "The Stock Token contract reports oraclePaused=true. A retained numeric answer must not be treated as current.", ["robinhood-rpc"]));
    const registryPending = asset.pendingMultiplier ? trimDecimal(asset.pendingMultiplier) : null;
    const pendingEvidenceComplete = pendingMultiplier !== undefined && effectiveAt !== undefined;
    const onchainPending = pendingEvidenceComplete && effectiveAt > 0n ? formatUnits(pendingMultiplier, 18) : null;
    checks.push(check("scheduled-multiplier", "Scheduled UI multiplier", !pendingEvidenceComplete ? "missing" : registryPending === onchainPending ? "confirmed" : "conflict", !pendingEvidenceComplete
      ? "The contract's scheduled multiplier evidence could not be decoded; Opsis did not assume there was no pending change."
      : registryPending === onchainPending
        ? onchainPending ? `Registry and contract pending multiplier agree at ${onchainPending}; the contract reports the effective time.` : "Registry and contract both report no scheduled UI multiplier change."
        : `Registry reports ${registryPending ?? "no pending multiplier"}, while the contract reports ${onchainPending ?? "no active pending multiplier"}.`, ["robinhood-registry", "robinhood-rpc"]));
    checks.push(check("token-pause", "Token pause evidence", tokenPaused === undefined ? "missing" : tokenPaused ? "warning" : "confirmed", tokenPaused === undefined
      ? "tokenPaused() could not be decoded; Opsis did not assume transfers were unpaused."
      : tokenPaused
        ? "The Stock Token contract reports tokenPaused=true. Transfer availability may be restricted even if other evidence is current."
        : "The Stock Token contract reports tokenPaused=false at the captured block.", ["robinhood-rpc"]));

    return {
      kind: "stock_token",
      address,
      headline: identityMatches ? `${asset.symbol} is a canonical Robinhood Stock Token` : `${asset.symbol} needs identity review`,
      summary: identityMatches
        ? "The contract address and UID match Robinhood's chain-4663 registry. Claims about backing, custody, and redemption remain issuer statements."
        : "The pasted contract appears in the registry, but direct identity evidence conflicts. Do not rely on the ticker or name.",
      anchor: publicAnchor(anchor),
      checks,
      stock: {
        uid,
        symbol,
        name,
        decimals,
        registryStatus: asset.status,
        currentMultiplier: multiplierText,
        pendingMultiplier: onchainPending,
        pendingEffectiveAt,
        oraclePaused,
        tokenPaused: tokenPaused ?? null,
        termsUrl: safeTerms(terms),
        underlyingQuote: quote,
        oracle,
        corporateActions
      },
      limitations: [
        "The Robinhood quote is raw underlying-equity data; the Chainlink feed is per-token and already includes the multiplier.",
        "No official Robinhood sequencer-uptime feed was found, so oracle health is incomplete even when the heartbeat is current.",
        "Process dates describe Robinhood's corporate-action schedule and are not necessarily payment dates.",
        "Availability and eligibility vary by jurisdiction; this is evidence, not an offer or recommendation."
      ],
      sources,
      privacy: privacy(["Robinhood Stock Token API", this.rpcEndpoint.label, "Chainlink feed directory"], `The pasted contract and derived public feed identifier were sent only to the listed sources. Nothing was saved by Opsis or sent to an AI model.${rpcRoutingDisclosure(this.rpcEndpoint)}`)
    };
  }

  private async verifyMorpho(address: string, anchor: CapturedAnchor, configBody: unknown, run: VerificationRun): Promise<RwaVerification> {
    const fetchedAt = this.dependencies.now().toISOString();
    const config = parseMorphoConfig(configBody, address);
    if (!config) throw new AppError("RWA_PROVIDER_SCHEMA_CHANGED", 503, "Morpho returned an unrecognized vault record");
    const query = `query($address: String!){vaultV2s(first:1,where:{chainId_in:[4663],address_in:[$address]}){items{address listed name symbol}}}`;
    const [stateDocument, apyDocument, listingDocument] = await Promise.all([
      this.optionalDocument(`${MORPHO_API}/v1/vaults-v2/4663:${address}/state`, { redirect: "error" }),
      this.optionalDocument(`${MORPHO_API}/v1/vaults-v2/4663:${address}/apy-averages?lookback=one_day`, { redirect: "error" }),
      this.optionalDocument(`${MORPHO_API}/graphql`, { method: "POST", redirect: "error", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables: { address } }) })
    ]);
    const calls = vaultAbi.map((entry) => ({ id: `vault:${entry.name}`, to: address, data: encodeFunctionData({ abi: vaultAbi, functionName: entry.name }) }));
    const direct = await this.rpcBatch(calls, anchor.blockHex, run);
    const directAsset = decoded<Address>(vaultAbi, "asset", direct.get("vault:asset"))?.toLowerCase();
    const totalAssets = decoded<bigint>(vaultAbi, "totalAssets", direct.get("vault:totalAssets"));
    const totalSupply = decoded<bigint>(vaultAbi, "totalSupply", direct.get("vault:totalSupply"));
    const directName = decoded<string>(vaultAbi, "name", direct.get("vault:name"));
    const directSymbol = decoded<string>(vaultAbi, "symbol", direct.get("vault:symbol"));
    if (!directAsset || totalAssets === undefined || totalSupply === undefined || directName === undefined || directSymbol === undefined) {
      throw new AppError("RWA_DIRECT_VERIFICATION_FAILED", 503, "The vault could not be verified at the captured block");
    }
    const directAssetResult = await this.rpcBatch([{ id: "asset:decimals", to: directAsset, data: encodeFunctionData({ abi: assetAbi, functionName: "decimals" }) }], anchor.blockHex, run);
    const directAssetDecimals = decoded<number>(assetAbi, "decimals", directAssetResult.get("asset:decimals"));
    if (directAssetDecimals === undefined || !Number.isInteger(directAssetDecimals) || directAssetDecimals < 0 || directAssetDecimals > 255) {
      throw new AppError("RWA_DIRECT_VERIFICATION_FAILED", 503, "The vault's underlying asset decimals could not be verified at the captured block");
    }
    const identityMatches = directAsset === config.asset.address && directAssetDecimals === config.asset.decimals && directName === config.name && directSymbol === config.symbol;
    const state = stateDocument.state === "available" ? parseMorphoState(stateDocument.body) : null;
    const apy = apyDocument.state === "available" ? parseMorphoApy(apyDocument.body) : null;
    const listingResult = listingDocument.state === "available" ? parseMorphoListing(listingDocument.body, address) : { state: "empty" as const };
    const listing = listingResult.state === "match" ? listingResult.value : null;
    const stateMalformed = stateDocument.state === "available" && state === null;
    const apyMalformed = apyDocument.state === "available" && apy === null;
    const listingMalformed = listingDocument.state === "available" && listingResult.state === "malformed";
    const indexedBlock = state?.indexedBlock ?? null;
    const lag = indexedBlock === null ? null : anchor.blockNumber - indexedBlock;
    const indexedTotalsMatch = !state || (state.totalAssetsRaw === totalAssets.toString() && state.totalSupplyRaw === totalSupply.toString());
    const indexedTotalsStatus: RwaCheck["status"] = stateMalformed
      ? "conflict"
      : !state || indexedBlock === null
        ? "missing"
      : indexedBlock !== anchor.blockNumber
        ? "warning"
        : indexedTotalsMatch ? "confirmed" : "conflict";
    const sources = [
      source("morpho-config", "Morpho", `${MORPHO_API}/v0/vaults-v2/4663:${address}`, fetchedAt, "Vault identity and configuration indexed by Morpho"),
      source("robinhood-rpc", this.rpcEndpoint.label, publicRpcCitationOrigin(this.rpcEndpoint.url), anchor.capturedAt, `Direct vault reads at block ${anchor.blockNumber}`)
    ];
    if (stateDocument.state === "available") sources.push(source("morpho-state", "Morpho", `${MORPHO_API}/v1/vaults-v2/4663:${address}/state`, fetchedAt, stateMalformed ? "State response rejected as malformed" : "Indexed vault liquidity and allocation state"));
    if (apyDocument.state === "available") sources.push(source("morpho-apy", "Morpho", `${MORPHO_API}/v1/vaults-v2/4663:${address}/apy-averages?lookback=one_day`, fetchedAt, apyMalformed ? "APY response rejected as malformed" : "Provider-reported trailing one-day APY average"));
    if (listingDocument.state === "available") sources.push(source("morpho-listing", "Morpho", `${MORPHO_API}/graphql`, fetchedAt, listingMalformed ? "Listing response rejected as malformed" : listingResult.state === "empty" ? "Morpho returned no matching listing record" : "Morpho listed/unlisted classification"));

    return {
      kind: "morpho_vault",
      address,
      headline: `${config.name || directName} is a Morpho V2 vault`,
      summary: `${identityMatches ? "Direct contract identity and underlying decimals agree with Morpho's index." : "Direct identity or underlying decimals conflict with Morpho's index."} ${listing === true ? "Morpho marks it listed." : listing === false ? "Morpho marks it unlisted; that is not proof of fraud, and listing is not an endorsement." : listingDocument.state === "unavailable" ? "Morpho listing status was unavailable." : listingResult.state === "empty" ? "Morpho returned no matching listing record." : "Morpho listing status was unavailable."}`,
      anchor: publicAnchor(anchor),
      checks: [
        check("vault-identity", "Vault identity", identityMatches ? "confirmed" : "conflict", identityMatches
          ? "Contract name, symbol, underlying asset, and underlying decimals agree with Morpho's record."
          : "Direct contract identity or underlying decimals and Morpho's indexed record do not fully agree.", ["morpho-config", "robinhood-rpc"]),
        check("listing", "Morpho listing", listing === true ? "confirmed" : listing === false ? "warning" : listingMalformed ? "conflict" : "missing", listing === true
          ? "Morpho currently marks this vault listed. Listing is a provider classification, not an Opsis endorsement."
          : listing === false
            ? "Morpho currently marks this vault unlisted. Review the owner, curator, gates, and source contract carefully."
            : listingMalformed
              ? "Morpho's listing response was malformed; Opsis did not assume listed or unlisted."
              : listingDocument.state === "unavailable"
                ? `Morpho listing status was unavailable (${listingDocument.code}); Opsis did not assume listed or unlisted.`
                : listingResult.state === "empty"
                  ? "Morpho returned a valid listing collection with no matching vault record; Opsis did not assume listed or unlisted."
                  : "Morpho listing status was unavailable; Opsis did not assume listed or unlisted.", listingDocument.state === "available" ? ["morpho-listing"] : ["morpho-config"]),
        check("vault-totals", "Direct vs indexed totals", indexedTotalsStatus, !state || indexedBlock === null
          ? stateMalformed ? "Morpho's indexed state response was malformed; direct totals are still shown." : `Morpho's indexed state was unavailable${stateDocument.state === "unavailable" ? ` (${stateDocument.code})` : ""}; direct totals are still shown.`
          : indexedBlock !== anchor.blockNumber
            ? `Direct totals use captured block ${anchor.blockNumber}; Morpho's state uses block ${indexedBlock}. Differences are shown as an index-timing limit, not a contract conflict.`
          : indexedTotalsMatch
            ? "Direct total assets and shares agree with Morpho's indexed response at its recorded block."
            : "Direct current totals and Morpho's indexed totals differ. This can reflect index lag, but the difference is not hidden.", state ? ["morpho-state", "robinhood-rpc"] : ["robinhood-rpc"]),
        check("liquidity", "Indexed withdrawals", state ? "warning" : stateMalformed ? "conflict" : "missing", state
          ? `${state.withdrawableAssetsRaw} raw underlying units were indexed as withdrawable. Eligibility and executable output remain unknown until an official transaction requotes.`
          : stateMalformed ? "Morpho's indexed liquidity response was malformed. Opsis did not infer withdrawability from ERC-4626 max methods." : `Morpho's indexed liquidity state was unavailable${stateDocument.state === "unavailable" ? ` (${stateDocument.code})` : ""}. Opsis did not infer withdrawability from ERC-4626 max methods.`, stateDocument.state === "available" ? ["morpho-state"] : ["morpho-config"]),
        check("yield", "Trailing yield", apy ? "warning" : apyMalformed ? "conflict" : "missing", apy
          ? `${formatPercent(apy.apy)} trailing one-day APY reported by Morpho${apy.indexedBlock === null ? "" : ` at indexed block ${apy.indexedBlock}`}. It is variable historical data—not a forecast or guarantee.`
          : apyMalformed ? "Morpho's APY response was malformed; no yield was invented." : `No supported APY response was available${apyDocument.state === "unavailable" ? ` (${apyDocument.code})` : ""}; no yield was invented.`, apyDocument.state === "available" ? ["morpho-apy"] : ["morpho-config"]),
        check("controls", "Vault controls", "warning", `${config.timelockSeconds} second timelock · owner ${config.owner} · curator ${config.curator} · ${Object.values(config.gates).filter(Boolean).length} configured gates · ${[config.managementFeeWad, config.performanceFeeWad].filter(Boolean).length} configured fee fields. Review these public controls; Opsis does not rate their safety.`, ["morpho-config"])
      ],
      morpho: {
        name: config.name,
        symbol: config.symbol,
        version: config.version,
        listed: listing,
        asset: { ...config.asset, decimals: directAssetDecimals },
        owner: config.owner,
        curator: config.curator,
        timelockSeconds: config.timelockSeconds,
        managementFeeWad: config.managementFeeWad,
        performanceFeeWad: config.performanceFeeWad,
        gates: config.gates,
        totalAssetsRaw: totalAssets.toString(),
        totalSupplyRaw: totalSupply.toString(),
        withdrawableAssetsRaw: state?.withdrawableAssetsRaw ?? null,
        allocatedAssetsRaw: state?.allocatedAssetsRaw ?? null,
        idleAssetsRaw: state?.idleAssetsRaw ?? null,
        indexedBlock,
        configIndexedBlock: config.indexedBlock,
        apyIndexedBlock: apy?.indexedBlock ?? null,
        indexLagBlocks: lag,
        trailing24hApy: apy ? String(apy.apy) : null
      },
      limitations: [
        "Morpho listing is a provider classification, not an endorsement, audit, or guarantee.",
        "APY is trailing indexed data and can change or become negative; it is not promised yield.",
        "ERC-4626 maxDeposit/maxWithdraw values are not used as general liquidity because Morpho V2 may return zero by design.",
        "No deposit, withdrawal, eligibility, or redemption transaction is prepared or executed here."
      ],
      sources,
      privacy: privacy([this.rpcEndpoint.label, "Morpho public API"], `The pasted contract was sent to Morpho and the ${this.rpcEndpoint.label} for read-only verification. Nothing was saved by Opsis or sent to an AI model.${rpcRoutingDisclosure(this.rpcEndpoint)}`)
    };
  }

  private unsupported(address: string, anchor: CapturedAnchor, code: unknown): RwaVerification {
    const isContract = typeof code === "string" && code !== "0x" && code !== "0x0";
    return {
      kind: "unsupported_contract",
      address,
      headline: isContract ? "No supported RWA registry match" : "This address is not a contract at the captured block",
      summary: isContract
        ? "The contract is not an exact chain-4663 deployment in Robinhood's Stock Token registry and was not recognized by Morpho's Vault V2 API. A ticker, image, NFT, certificate, or issuer statement alone cannot prove backing or physical authenticity."
        : "No bytecode was present at the captured block. Opsis cannot verify it as a tokenized asset or vault.",
      anchor: publicAnchor(anchor),
      checks: [
        check("stock-registry", "Robinhood Stock Token registry", "unsupported", "No exact deployment match was found. Name or ticker similarity is deliberately ignored.", ["robinhood-registry"]),
        check("morpho-registry", "Morpho Vault V2", "unsupported", "Morpho's exact-address endpoint did not recognize this contract as a V2 vault.", ["morpho-lookup"]),
        check("physical", "Physical authenticity", "unsupported", "Onchain ownership does not prove a physical object exists, is authentic, insured, held by a custodian, or redeemable.", [])
      ],
      limitations: ["Unsupported means Opsis lacks a supported primary-source registry match; it is not an accusation of fraud."],
      sources: [
        source("robinhood-registry", "Robinhood", `${RHJ_API}/assets`, this.dependencies.now().toISOString(), "Canonical Stock Token registry lookup"),
        source("morpho-lookup", "Morpho", `${MORPHO_API}/v0/vaults-v2/4663:${address}`, this.dependencies.now().toISOString(), "Exact-address Vault V2 lookup"),
        source("robinhood-rpc", this.rpcEndpoint.label, publicRpcCitationOrigin(this.rpcEndpoint.url), anchor.capturedAt, `Contract bytecode read at block ${anchor.blockNumber}`)
      ],
      privacy: privacy(["Robinhood Stock Token API", "Morpho public API", this.rpcEndpoint.label], `The pasted public contract was sent to the listed sources only. Nothing was saved by Opsis or sent to an AI model.${rpcRoutingDisclosure(this.rpcEndpoint)}`)
    };
  }

  private async captureAnchor(run: VerificationRun): Promise<CapturedAnchor> {
    const result = asRecord(await this.rpcSingle("eth_getBlockByNumber", ["latest", false], run));
    const blockNumber = parseHexNumber(result.number);
    const blockHash = typeof result.hash === "string" && HASH_PATTERN.test(result.hash) ? result.hash.toLowerCase() : null;
    if (blockNumber === null || !blockHash) throw new AppError("RWA_PROVIDER_UNAVAILABLE", 503, "A current Robinhood Chain anchor could not be captured");
    return { blockNumber, blockHex: `0x${blockNumber.toString(16)}`, blockHash, capturedAt: this.dependencies.now().toISOString() };
  }

  private async recheckAnchor(anchor: CapturedAnchor, run: VerificationRun): Promise<void> {
    const result = asRecord(await this.rpcSingle("eth_getBlockByNumber", [anchor.blockHex, false], run));
    if (typeof result.hash !== "string" || result.hash.toLowerCase() !== anchor.blockHash) {
      throw new AppError("RWA_ANCHOR_CHANGED", 503, "The captured block changed during verification");
    }
  }

  private async rpcSingle(method: string, params: unknown[], run: VerificationRun): Promise<unknown> {
    await this.consumeRpc(1, run);
    const response = asRecord(await this.dependencies.rpc.requestJson(this.rpcEndpoint.url, {
      method: "POST", redirect: "error", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "rwa", method, params })
    }));
    if (response.error !== undefined || response.result === undefined) throw new AppError("RWA_PROVIDER_UNAVAILABLE", 503, "A direct Robinhood Chain read failed");
    return response.result;
  }

  private async rpcBatch(calls: RpcCall[], blockHex: string, run: VerificationRun): Promise<Map<string, RpcResult>> {
    await this.consumeRpc(calls.length, run);
    const body = calls.map((call) => call.method
      ? { jsonrpc: "2.0", id: call.id, method: call.method, params: call.params ?? [] }
      : { jsonrpc: "2.0", id: call.id, method: "eth_call", params: [{ to: call.to, data: call.data }, blockHex] });
    const response = await this.dependencies.rpc.requestJson(this.rpcEndpoint.url, {
      method: "POST", redirect: "error", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
    });
    if (!Array.isArray(response)) throw new AppError("RWA_PROVIDER_UNAVAILABLE", 503, "The direct verification response was malformed");
    return new Map(response.map((value) => asRecord(value)).filter((value) => typeof value.id === "string").map((value) => [String(value.id), value]));
  }

  private async consumeRpc(units: number, run: VerificationRun): Promise<void> {
    if (run.rpcUnits + units > this.env.RWA_MAX_RPC_SUBCALLS) throw new AppError("RWA_RPC_LIMIT_EXCEEDED", 503, "The verification exceeded its RPC safety limit");
    run.rpcUnits += units;
    await this.dependencies.budget.consume(units);
  }

  private async optionalDocument(url: string, init?: RequestInit): Promise<OptionalDocument> {
    try { return { state: "available", body: await this.dependencies.http.requestJson(url, init) }; }
    catch (error) {
      return { state: "unavailable", code: error instanceof ProviderRequestError ? error.code : "PROVIDER_REQUEST_FAILED" };
    }
  }

  private async lookupJson(url: string): Promise<unknown | null> {
    try { return await this.dependencies.http.requestJson(url, { redirect: "error" }); }
    catch (error) {
      if (error instanceof ProviderRequestError && error.code === "PROVIDER_HTTP_404") return null;
      throw new AppError("RWA_PROVIDER_UNAVAILABLE", 503, "A required RWA identity source is unavailable");
    }
  }
}

type CapturedAnchor = { blockNumber: number; blockHex: string; blockHash: string; capturedAt: string };
type VerificationRun = { rpcUnits: number };
type StockAsset = { id: string; symbol: string; name: string; decimals: number; currentMultiplier: string; pendingMultiplier: string | null; status: string };
type Feed = { proxyAddress: string; name: string; heartbeat: number; decimals: number };

function findStockAsset(body: unknown, address: string): StockAsset | null {
  const assets = asArray(asRecord(body).assets);
  for (const raw of assets) {
    const item = asRecord(raw);
    const deployment = asArray(item.deployments).map(asRecord).find((value) => value.chainId === 4663 && lowerAddress(value.contractAddress) === address);
    if (!deployment) continue;
    if (typeof item.id !== "string" || !HASH_PATTERN.test(item.id) || typeof item.tokenSymbol !== "string" || typeof item.tokenName !== "string") {
      throw new AppError("RWA_PROVIDER_SCHEMA_CHANGED", 503, "Robinhood's matching asset record was malformed");
    }
    const decimals = typeof item.tokenDecimals === "number" ? item.tokenDecimals : Number.NaN;
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255 || typeof item.currentMultiplier !== "string" || !/^\d+(?:\.\d+)?$/.test(item.currentMultiplier)) {
      throw new AppError("RWA_PROVIDER_SCHEMA_CHANGED", 503, "Robinhood's matching asset multiplier or decimals were malformed");
    }
    if (typeof item.pendingMultiplier === "string" && item.pendingMultiplier !== "" && !/^\d+(?:\.\d+)?$/.test(item.pendingMultiplier)) {
      throw new AppError("RWA_PROVIDER_SCHEMA_CHANGED", 503, "Robinhood's pending multiplier was malformed");
    }
    return { id: item.id, symbol: item.tokenSymbol, name: item.tokenName, decimals, currentMultiplier: item.currentMultiplier, pendingMultiplier: typeof item.pendingMultiplier === "string" && item.pendingMultiplier ? item.pendingMultiplier : null, status: typeof item.status === "string" ? item.status : "UNKNOWN" };
  }
  return null;
}

function parseFeedDirectory(body: unknown, symbol: string): ParseResult<Feed> {
  if (!Array.isArray(body)) return { state: "malformed" };
  const raw = body.map(asRecord).find((item) => {
    const docs = asRecord(item.docs);
    return (docs.baseAsset === symbol && docs.quoteAsset === "USD" && docs.blockchainName === "Robinhood")
      || item.name === `Robinhood ${symbol} / USD`
      || item.name === `Robinhood ${symbol}-USD`;
  });
  if (!raw) return { state: "empty" };
  if (typeof raw.name !== "string" || !lowerAddress(raw.proxyAddress) || typeof raw.heartbeat !== "number" || !Number.isInteger(raw.heartbeat) || raw.heartbeat <= 0 || typeof raw.decimals !== "number" || !Number.isInteger(raw.decimals) || raw.decimals < 0 || raw.decimals > 255) return { state: "malformed" };
  return { state: "match", value: { proxyAddress: String(raw.proxyAddress).toLowerCase(), name: raw.name, heartbeat: raw.heartbeat, decimals: raw.decimals } };
}

type UnderlyingQuote = NonNullable<NonNullable<RwaVerification["stock"]>["underlyingQuote"]>;
function parseQuote(body: unknown, symbol: string, address: string, now: Date): ParseResult<UnderlyingQuote> {
  const quotes = asRecord(body).quotes;
  if (!Array.isArray(quotes)) return { state: "malformed" };
  const quote = quotes.map(asRecord).find((item) => item.tokenSymbol === symbol);
  if (!quote) return { state: "empty" };
  if (!stringFields(quote, ["bid", "ask", "currency", "generatedAt"]) || typeof quote.isTradingHalt !== "boolean") return { state: "malformed" };
  if (quote.currency !== "USD" || !asArray(quote.deployments).map(asRecord).some((deployment) => deployment.chainId === 4663 && lowerAddress(deployment.contractAddress) === address)) return { state: "malformed" };
  if (![quote.bid, quote.ask].every((value) => typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value))) return { state: "malformed" };
  const generatedMs = Date.parse(String(quote.generatedAt));
  if (Number.isNaN(generatedMs) || generatedMs > now.getTime() + 60_000) return { state: "malformed" };
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - generatedMs) / 1_000));
  return { state: "match", value: { bid: String(quote.bid), ask: String(quote.ask), currency: String(quote.currency), generatedAt: String(quote.generatedAt), tradingHalted: quote.isTradingHalt === true, state: ageSeconds > 300 ? "stale" : "current", ageSeconds } };
}

function parseActions(body: unknown, asset: StockAsset, address: string): NonNullable<RwaVerification["stock"]>["corporateActions"] {
  return asArray(asRecord(body).corpActions).map(asRecord).filter((item) => {
    if (item.tokenSymbol !== asset.symbol || typeof item.id !== "string") return false;
    return asArray(item.deployments).map(asRecord).some((deployment) => deployment.chainId === 4663 && lowerAddress(deployment.contractAddress) === address);
  }).map((item) => ({
    id: String(item.id),
    type: typeof item.type === "string" ? item.type.replace("CORPORATE_ACTION_TYPE_", "") : "UNKNOWN",
    status: typeof item.status === "string" ? item.status.replace("CORPORATE_ACTION_STATUS_", "") : "UNKNOWN",
    processDate: parseProcessDate(item.processDate),
    detail: actionDetail(item.details)
  }));
}

function parseOracle(feed: Feed, results: Map<string, RpcResult>, paused: boolean, now: Date): NonNullable<NonNullable<RwaVerification["stock"]>["oracle"]> {
  const description = decoded<string>(feedAbi, "description", results.get("feed:description"));
  const decimals = decoded<number>(feedAbi, "decimals", results.get("feed:decimals"));
  const round = decoded<readonly [bigint, bigint, bigint, bigint, bigint]>(feedAbi, "latestRoundData", results.get("feed:latestRoundData"));
  if (description !== feed.name || decimals !== feed.decimals || !round || round[1] <= 0n || round[3] <= 0n || round[4] < round[0] || Number(round[3]) * 1_000 > now.getTime() + 60_000) {
    return { feed: feed.proxyAddress, value: null, updatedAt: null, heartbeatSeconds: feed.heartbeat, state: "invalid" };
  }
  const updatedAt = new Date(Number(round[3]) * 1_000);
  const stale = now.getTime() - updatedAt.getTime() > feed.heartbeat * 1_000;
  return { feed: feed.proxyAddress, value: formatUnits(round[1], decimals), updatedAt: updatedAt.toISOString(), heartbeatSeconds: feed.heartbeat, state: paused ? "paused" : stale ? "stale_or_market_closed" : "current" };
}

type MorphoConfig = {
  name: string; symbol: string; version: string;
  asset: { address: string; symbol: string; decimals: number };
  owner: string; curator: string; timelockSeconds: number; indexedBlock: number | null;
  managementFeeWad: string | null; performanceFeeWad: string | null;
  gates: { sendShares: string | null; receiveShares: string | null; sendAssets: string | null; receiveAssets: string | null };
};
function parseMorphoConfig(body: unknown, address: string): MorphoConfig | null {
  const data = asRecord(asRecord(body).data);
  const asset = asRecord(data.asset);
  if (lowerAddress(data.address) !== address || data.chain_id !== 4663 || data.version !== "2.0" || !stringFields(data, ["name", "symbol", "version", "owner", "curator"]) || !stringFields(asset, ["address", "symbol"])) return null;
  const assetAddress = lowerAddress(asset.address);
  const owner = lowerAddress(data.owner);
  const curator = lowerAddress(data.curator);
  if (!assetAddress || !owner || !curator || typeof asset.decimals !== "number" || !Number.isInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 255 || typeof data.timelock_seconds !== "number" || !Number.isSafeInteger(data.timelock_seconds) || data.timelock_seconds < 0) return null;
  const gates = asRecord(data.gates);
  const managementFeeWad = decimalStringOrNull(data.management_fee_wad);
  const performanceFeeWad = decimalStringOrNull(data.performance_fee_wad);
  if ((data.management_fee_wad !== null && data.management_fee_wad !== undefined && managementFeeWad === null)
    || (data.performance_fee_wad !== null && data.performance_fee_wad !== undefined && performanceFeeWad === null)) return null;
  if ([gates.send_shares, gates.receive_shares, gates.send_assets, gates.receive_assets].some((value) => value !== null && value !== undefined && lowerAddress(value) === null)) return null;
  return {
    name: String(data.name), symbol: String(data.symbol), version: String(data.version),
    asset: { address: assetAddress, symbol: String(asset.symbol), decimals: asset.decimals },
    owner, curator,
    timelockSeconds: data.timelock_seconds, indexedBlock: decimalNumber(data.last_indexed_block),
    managementFeeWad,
    performanceFeeWad,
    gates: {
      sendShares: lowerAddress(gates.send_shares), receiveShares: lowerAddress(gates.receive_shares),
      sendAssets: lowerAddress(gates.send_assets), receiveAssets: lowerAddress(gates.receive_assets)
    }
  };
}

function parseMorphoState(body: unknown): null | { totalAssetsRaw: string; totalSupplyRaw: string; withdrawableAssetsRaw: string; allocatedAssetsRaw: string; idleAssetsRaw: string; indexedBlock: number | null } {
  const data = asRecord(asRecord(body).data);
  if (!stringFields(data, ["total_assets", "total_supply", "withdrawable_assets", "allocated_assets", "idle_assets"])) return null;
  if (![data.total_assets, data.total_supply, data.withdrawable_assets, data.allocated_assets, data.idle_assets].every((value) => typeof value === "string" && /^\d{1,100}$/.test(value))) return null;
  return { totalAssetsRaw: String(data.total_assets), totalSupplyRaw: String(data.total_supply), withdrawableAssetsRaw: String(data.withdrawable_assets), allocatedAssetsRaw: String(data.allocated_assets), idleAssetsRaw: String(data.idle_assets), indexedBlock: decimalNumber(data.last_indexed_block) };
}

function parseMorphoApy(body: unknown): null | { apy: number; indexedBlock: number | null } {
  const data = asRecord(asRecord(body).data);
  return typeof data.apy === "number" && Number.isFinite(data.apy) ? { apy: data.apy, indexedBlock: decimalNumber(data.last_indexed_block) } : null;
}

function parseMorphoListing(body: unknown, address: string): ParseResult<boolean> {
  const itemsValue = asRecord(asRecord(asRecord(body).data).vaultV2s).items;
  if (!Array.isArray(itemsValue)) return { state: "malformed" };
  const items = itemsValue;
  const match = items.map(asRecord).find((item) => lowerAddress(item.address) === address);
  if (!match) return { state: "empty" };
  return typeof match.listed === "boolean" ? { state: "match", value: match.listed } : { state: "malformed" };
}

function decoded<T>(abi: Abi, functionName: string, result?: RpcResult): T | undefined {
  if (!result || result.error !== undefined || typeof result.result !== "string") return undefined;
  try { return decodeFunctionResult({ abi, functionName, data: result.result as Hex }) as T; }
  catch { return undefined; }
}

function source(id: string, provider: string, url: string, fetchedAt: string, description: string): RwaCitation { return { id, provider, url, fetchedAt, description }; }

function publicRpcCitationOrigin(configuredUrl: string): string {
  return new URL(configuredUrl).origin;
}
function check(id: string, label: string, status: RwaCheck["status"], detail: string, sourceIds: string[]): RwaCheck { return { id, label, status, detail, sourceIds }; }
function privacy(providerDestinations: string[], disclosure: string): RwaVerification["privacy"] { return { serverStorage: "none", modelProvider: "none", providerDestinations, disclosure }; }
function publicAnchor(anchor: CapturedAnchor): RwaVerification["anchor"] { return { chainId: 4663, blockNumber: anchor.blockNumber, blockHash: anchor.blockHash, capturedAt: anchor.capturedAt, finality: "current_non_final" }; }
function asRecord(value: unknown): Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function documentBody(document: OptionalDocument): unknown | null { return document.state === "available" ? document.body : null; }
function lowerAddress(value: unknown): string | null { return typeof value === "string" && isAddress(value, { strict: false }) ? value.toLowerCase() : null; }
function stringFields(value: Record<string, unknown>, keys: string[]): boolean { return keys.every((key) => typeof value[key] === "string"); }
function parseHexNumber(value: unknown): number | null { if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return null; const number = Number(BigInt(value)); return Number.isSafeInteger(number) ? number : null; }
function decimalNumber(value: unknown): number | null { if (typeof value !== "string" || !/^\d+$/.test(value)) return null; const number = Number(value); return Number.isSafeInteger(number) ? number : null; }
function decimalStringOrNull(value: unknown): string | null { return typeof value === "string" && /^\d{1,100}$/.test(value) ? value : null; }
function trimDecimal(value: string): string { return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value; }
function safeTerms(value: string | undefined): string | null { if (!value) return null; try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "robinhood.com" ? url.toString() : null; } catch { return null; } }
function unixIso(value: bigint): string | null { const seconds = Number(value); if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 8_640_000_000_000) return null; try { return new Date(seconds * 1_000).toISOString(); } catch { return null; } }
function parseProcessDate(value: unknown): string | null { const date = asRecord(value); if (![date.year, date.month, date.day].every((part) => Number.isInteger(part))) return null; const text = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`; return Number.isNaN(Date.parse(`${text}T00:00:00Z`)) ? null : text; }
function actionDetail(value: unknown): string { const details = asRecord(value); const entry = Object.values(details).map(asRecord).find((item) => Object.keys(item).length > 0); if (!entry) return "Robinhood did not supply structured details."; return Object.entries(entry).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v)).slice(0, 4).map(([k, v]) => `${k}: ${String(v)}`).join(" · ") || "Robinhood supplied an unrecognized action detail."; }
function oracleStatus(state: NonNullable<NonNullable<RwaVerification["stock"]>["oracle"]>["state"]): RwaCheck["status"] { return state === "current" ? "confirmed" : state === "invalid" ? "conflict" : "warning"; }
function oracleDetail(oracle: NonNullable<NonNullable<RwaVerification["stock"]>["oracle"]>): string { if (oracle.state === "invalid") return "The feed response failed description, decimals, timestamp, or positive-value validation."; if (oracle.state === "paused") return "The issuer reports the oracle paused. The numeric value is not treated as current."; return `${oracle.value} USD per token, updated ${oracle.updatedAt}; state: ${oracle.state.replaceAll("_", " ")}. The multiplier is already included.`; }
function formatPercent(value: number): string { return `${(value * 100).toFixed(2)}%`; }

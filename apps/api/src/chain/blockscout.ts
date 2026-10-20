import { explorerUnavailableReason, type ExplorerUnavailableReason } from "./explorer-gate.js";
import { randomUUID } from "node:crypto";
import type { Env } from "../config/env.js";
import type { ChainProvider, ProviderQueryOptions, SourceDocumentInput } from "./types.js";
import { createProviderHttp, ProviderRequestError, type ProviderHttp } from "./provider-http.js";

export type ExplorerDocuments = SourceDocumentInput[] & { explorerUnavailableReason?: ExplorerUnavailableReason };

export class BlockscoutProvider implements ChainProvider {
  readonly name = "blockscout";

  constructor(private readonly env: Env, private readonly http: ProviderHttp = createProviderHttp(env, "blockscout")) {}

  async getTransaction(hash: string, options: ProviderQueryOptions = {}): Promise<SourceDocumentInput[]> {
    const transaction = await this.fetchDoc("transaction", hash, `/transactions/${hash}`);
    // The private first answer must fit inside one provider timeout. Core
    // transaction data already includes decoded input when available; the RPC
    // provider independently supplies its receipt. Do not queue paginated
    // traces, state changes or ABI enrichment behind that useful evidence.
    if (options.detail === "summary") return [transaction];
    const transactionJson = transaction.responseJson as Record<string, unknown>;
    const to = addressValue(transactionJson.to);
    const needsAbi = !transactionJson.decoded_input && typeof (transactionJson.raw_input ?? transactionJson.input) === "string";
    const [tokenTransfers, internalTransactions, logs, rawTrace, stateChanges, contract] = await Promise.all([
      this.fetchPaginated("transaction", hash, `/transactions/${hash}/token-transfers`, true),
      this.fetchPaginated("transaction", hash, `/transactions/${hash}/internal-transactions`, true),
      this.fetchPaginated("transaction", hash, `/transactions/${hash}/logs`, true),
      this.fetchOptionalDoc("transaction", hash, `/transactions/${hash}/raw-trace`),
      this.fetchPaginated("transaction", hash, `/transactions/${hash}/state-changes`, true),
      needsAbi && to ? this.fetchOptionalDoc("transaction", hash, `/smart-contracts/${to}`) : undefined
    ]);
    return [
      transaction,
      ...tokenTransfers,
      ...internalTransactions,
      ...logs,
      ...(rawTrace ? [rawTrace] : []),
      ...stateChanges,
      ...(contract ? [contract] : [])
    ];
  }

  async getAddressSummary(address: string, options: ProviderQueryOptions = {}): Promise<SourceDocumentInput[]> {
    const maxPages = this.maxPagesFor(options);
    let reason: ExplorerUnavailableReason | undefined;
    const onError = (error: unknown) => { reason = mergeReason(reason, explorerUnavailableReason(error)); };
    // Private Mode's first answer needs identity, recent activity and balances,
    // not every transfer/trace collection. Fetch the three useful sources in
    // parallel so one broken optional endpoint cannot hold the whole card for
    // multiple provider retry windows.
    if (options.detail === "summary") {
      const [wallet, transactions, tokenBalances] = await Promise.all([
        this.fetchDoc("wallet", address, `/addresses/${address}`),
        this.fetchPaginated("wallet", address, `/addresses/${address}/transactions`, true, maxPages, onError),
        this.fetchOptionalDoc("wallet", address, `/addresses/${address}/token-balances`, onError)
      ]);
      return Object.assign([wallet, ...transactions, ...(tokenBalances ? [tokenBalances] : [])], { explorerUnavailableReason: reason });
    }
    const wallet = await this.fetchDoc("wallet", address, `/addresses/${address}`);
    const [transactions, tokenTransfers, internalTransactions, tokenBalances] = await Promise.all([
      this.fetchPaginated("wallet", address, `/addresses/${address}/transactions`, true, maxPages, onError),
      this.fetchPaginated("wallet", address, `/addresses/${address}/token-transfers`, true, maxPages, onError),
      this.fetchPaginated("wallet", address, `/addresses/${address}/internal-transactions`, true, maxPages, onError),
      this.fetchOptionalDoc("wallet", address, `/addresses/${address}/token-balances`, onError)
    ]);
    return Object.assign([wallet, ...transactions, ...tokenTransfers, ...internalTransactions, ...(tokenBalances ? [tokenBalances] : [])], { explorerUnavailableReason: reason });
  }

  async getToken(address: string, options: ProviderQueryOptions = {}): Promise<SourceDocumentInput[]> {
    const summary = options.detail === "summary";
    const maxPages = summary ? 1 : this.maxPagesFor(options);
    let reason: ExplorerUnavailableReason | undefined;
    const onError = (error: unknown) => { reason = mergeReason(reason, explorerUnavailableReason(error)); };
    // Private Mode asks for every document at once instead of reading the
    // profile first: the explorer takes up to several seconds per call, so the
    // old order made every uncached lookup wait for two round trips. Under the
    // per-second limit the four slowest documents start first and the two fast
    // ones (profile and counts) take the second slot. `BLOCKSCOUT_OPTIONAL_WAIT_MS`
    // is only a backstop for a document that hangs. Callers have already
    // established that the address is a token, so no call is spent on a
    // non-token. Elsewhere the profile is still read first.
    const bounded = <T>(read: Promise<T>, late: T): Promise<T> => summary
      ? withDeadline(read, this.env.BLOCKSCOUT_OPTIONAL_WAIT_MS, late, () => onError(new ProviderRequestError("PROVIDER_TIMEOUT", true)))
      : read;
    const token = summary ? undefined : await this.fetchDoc("token", address, `/tokens/${address}`);
    // Holders, lifetime counters and the deploying address are what make
    // distribution analysis possible; the transfer window alone cannot show
    // who actually controls the supply.
    const transfersRead = bounded(this.fetchPaginated("token", address, `/tokens/${address}/transfers`, true, maxPages, onError), []);
    const contractRead = bounded(this.fetchOptionalDoc("token", address, `/smart-contracts/${address}`, onError), undefined);
    const addressRead = bounded(this.fetchOptionalDoc("token", address, `/addresses/${address}`, onError), undefined);
    const holdersRead = bounded(this.fetchOptionalDoc("token", address, `/tokens/${address}/holders`, onError), undefined);
    const tokenRead = token ? Promise.resolve(token) : this.fetchDoc("token", address, `/tokens/${address}`);
    const countersRead = bounded(this.fetchOptionalDoc("token", address, `/tokens/${address}/counters`, onError), undefined);
    const profile = await tokenRead;
    const [transfers, contract, holders, counters, addressInfo] = await Promise.all([transfersRead, contractRead, holdersRead, countersRead, addressRead]);
    // A token amount in the millions means nothing on its own. The transfer
    // rows carry no price, but the transaction that produced each one carries
    // the native coin it moved — fetch that for the largest few only, so the
    // headline transfers can be shown in ETH instead of raw token units.
    const valueDocs = summary ? [] : await this.fetchTopTransferTransactions(address, transfers);

    return Object.assign([
      profile,
      ...transfers,
      ...(contract ? [contract] : []),
      ...(holders ? [holders] : []),
      ...(counters ? [counters] : []),
      ...(addressInfo ? [addressInfo] : []),
      ...valueDocs
    ], { explorerUnavailableReason: reason });
  }

  /** Transactions behind the five largest transfers, for native-coin pricing. */
  private async fetchTopTransferTransactions(
    address: string,
    transferDocs: SourceDocumentInput[]
  ): Promise<SourceDocumentInput[]> {
    const items = transferDocs.flatMap((doc) => {
      const body = doc.responseJson as { items?: unknown[] } | undefined;
      return Array.isArray(body?.items) ? body.items : [];
    });

    const ranked = items
      .map((item) => {
        const row = item as Record<string, unknown>;
        const total = (row.total ?? {}) as Record<string, unknown>;
        return { hash: row.transaction_hash, amount: Number(total.value ?? row.value ?? 0) };
      })
      .filter((entry): entry is { hash: string; amount: number } => typeof entry.hash === "string" && Number.isFinite(entry.amount))
      .sort((a, b) => b.amount - a.amount);

    const unique: string[] = [];
    for (const { hash } of ranked) {
      if (!unique.includes(hash)) unique.push(hash);
      if (unique.length === 5) break;
    }

    const docs = await Promise.all(
      unique.map((hash) => this.fetchOptionalDoc("token", address, `/transactions/${hash}`))
    );
    return docs.filter((doc): doc is SourceDocumentInput => doc !== undefined);
  }

  async sourceVerification(address: string): Promise<"verified" | "unverified" | "unknown"> {
    try {
      const doc = await this.fetchDoc("contract", address, `/smart-contracts/${address}`);
      const body = doc.responseJson as Record<string, unknown>;
      if (body.is_verified === true || body.is_verified_via_eth_bytecode_db === true) return "verified";
      if (body.is_verified === false && (body.is_verified_via_eth_bytecode_db === false || body.is_verified_via_eth_bytecode_db === undefined)) return "unverified";
      return "unknown";
    } catch { return "unknown"; }
  }

  async getContract(address: string, options: ProviderQueryOptions = {}): Promise<SourceDocumentInput[]> {
    const contract = await this.fetchDoc("contract", address, `/smart-contracts/${address}`);
    const [addressDoc, transactions] = await Promise.all([
      this.fetchOptionalDoc("contract", address, `/addresses/${address}`),
      this.fetchPaginated("contract", address, `/addresses/${address}/transactions`, true, this.maxPagesFor(options))
    ]);
    return [contract, ...(addressDoc ? [addressDoc] : []), ...transactions];
  }

  private async fetchDoc(entityType: SourceDocumentInput["entityType"], entityValue: string, path: string): Promise<SourceDocumentInput> {
    const configuredBase = this.env.BLOCKSCOUT_PRO_API_KEY
      ? `${this.env.BLOCKSCOUT_PRO_API_BASE_URL.replace(/\/$/, "")}/${this.env.BLOCKSCOUT_CHAIN_ID}/api/v2`
      : this.env.BLOCKSCOUT_API_BASE_URL;
    const baseUrl = configuredBase.endsWith("/") ? configuredBase : `${configuredBase}/`;
    const publicUrl = new URL(path.replace(/^\//, ""), baseUrl);
    publicUrl.searchParams.delete("apikey");
    const requestUrl = publicUrl.toString();
    const authenticatedUrl = new URL(requestUrl);
    const apiKey = this.env.BLOCKSCOUT_PRO_API_KEY ?? this.env.BLOCKSCOUT_API_KEY;
    if (apiKey) authenticatedUrl.searchParams.set("apikey", apiKey);
    return {
      id: randomUUID(),
      provider: this.name,
      chainId: this.env.ROBINHOOD_CHAIN_ID,
      entityType,
      entityValue,
      requestUrl,
      responseJson: await this.http.requestJson(authenticatedUrl.toString(), { headers: { accept: "application/json" } }),
      fetchedAt: new Date().toISOString()
    };
  }

  private async fetchPaginated(
    entityType: SourceDocumentInput["entityType"],
    entityValue: string,
    path: string,
    optional = false,
    maxPages = this.env.BLOCKSCOUT_MAX_PAGES,
    onError?: (error: unknown) => void
  ): Promise<SourceDocumentInput[]> {
    const docs: SourceDocumentInput[] = [];
    let nextPath: string | undefined = path;
    const visited = new Set<string>();
    while (nextPath && docs.length < maxPages && !visited.has(nextPath)) {
      visited.add(nextPath);
      let doc: SourceDocumentInput;
      try {
        doc = await this.fetchDoc(entityType, entityValue, nextPath);
      } catch (error) {
        if (optional) { onError?.(error); break; }
        throw error;
      }
      docs.push(doc);
      nextPath = nextPageUrl(doc);
    }
    return docs;
  }

  /** Blockscout pages contain up to 50 rows; do not fetch unused pages for a smaller UI window. */
  private maxPagesFor(options: ProviderQueryOptions): number {
    if (options.limit === undefined) return this.env.BLOCKSCOUT_MAX_PAGES;
    return Math.min(this.env.BLOCKSCOUT_MAX_PAGES, Math.max(1, Math.ceil(options.limit / 50)));
  }

  private async fetchOptionalDoc(
    entityType: SourceDocumentInput["entityType"],
    entityValue: string,
    path: string,
    onError?: (error: unknown) => void
  ): Promise<SourceDocumentInput | undefined> {
    try {
      return await this.fetchDoc(entityType, entityValue, path);
    } catch (error) {
      onError?.(error);
      return undefined;
    }
  }
}

function addressValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "hash" in value && typeof (value as { hash: unknown }).hash === "string") {
    return (value as { hash: string }).hash;
  }
  return undefined;
}

function nextPageUrl(doc: SourceDocumentInput): string | undefined {
  const response = doc.responseJson as { next_page_params?: Record<string, unknown> | null };
  const cursor = response?.next_page_params;
  if (!cursor || !doc.requestUrl) return undefined;
  const url = new URL(doc.requestUrl);
  for (const [key, value] of Object.entries(cursor)) {
    if (["string", "number", "boolean"].includes(typeof value)) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function mergeReason(current: ExplorerUnavailableReason | undefined, next: ExplorerUnavailableReason): ExplorerUnavailableReason {
  if (current === "daily_limit" || next === "daily_limit") return "daily_limit";
  if (current === "rate_limited" || next === "rate_limited") return "rate_limited";
  return "unavailable";
}

/** Resolves with `late` (and calls `onLate`) if `read` has not settled within `ms`. */
function withDeadline<T>(read: Promise<T>, ms: number, late: T, onLate: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((resolve) => {
    timer = setTimeout(() => { onLate(); resolve(late); }, ms);
  });
  return Promise.race([read, deadline]).finally(() => clearTimeout(timer));
}

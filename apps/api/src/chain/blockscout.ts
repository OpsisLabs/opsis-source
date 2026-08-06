import { randomUUID } from "node:crypto";
import type { Env } from "../config/env.js";
import type { ChainProvider, ProviderQueryOptions, SourceDocumentInput } from "./types.js";
import { createProviderHttp, type ProviderHttp } from "./provider-http.js";

export class BlockscoutProvider implements ChainProvider {
  readonly name = "blockscout";

  constructor(private readonly env: Env, private readonly http: ProviderHttp = createProviderHttp(env, "blockscout")) {}

  async getTransaction(hash: string): Promise<SourceDocumentInput[]> {
    const transaction = await this.fetchDoc("transaction", hash, `/transactions/${hash}`);
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
    const wallet = await this.fetchDoc("wallet", address, `/addresses/${address}`);
    const maxPages = this.maxPagesFor(options);
    const [transactions, tokenTransfers, internalTransactions, tokenBalances] = await Promise.all([
      this.fetchPaginated("wallet", address, `/addresses/${address}/transactions?filter=to%20%7C%20from`, true, maxPages),
      this.fetchPaginated("wallet", address, `/addresses/${address}/token-transfers`, true, maxPages),
      this.fetchPaginated("wallet", address, `/addresses/${address}/internal-transactions`, true, maxPages),
      this.fetchOptionalDoc("wallet", address, `/addresses/${address}/token-balances`)
    ]);
    return [wallet, ...transactions, ...tokenTransfers, ...internalTransactions, ...(tokenBalances ? [tokenBalances] : [])];
  }

  async getToken(address: string, options: ProviderQueryOptions = {}): Promise<SourceDocumentInput[]> {
    const token = await this.fetchDoc("token", address, `/tokens/${address}`);
    const maxPages = this.maxPagesFor(options);
    // Holders, lifetime counters and the deploying address are what make
    // distribution analysis possible; the transfer window alone cannot show
    // who actually controls the supply.
    const [transfers, contract, holders, counters, addressInfo] = await Promise.all([
      this.fetchPaginated("token", address, `/tokens/${address}/transfers`, true, maxPages),
      this.fetchOptionalDoc("token", address, `/smart-contracts/${address}`),
      this.fetchOptionalDoc("token", address, `/tokens/${address}/holders`),
      this.fetchOptionalDoc("token", address, `/tokens/${address}/counters`),
      this.fetchOptionalDoc("token", address, `/addresses/${address}`)
    ]);
    // A token amount in the millions means nothing on its own. The transfer
    // rows carry no price, but the transaction that produced each one carries
    // the native coin it moved — fetch that for the largest few only, so the
    // headline transfers can be shown in ETH instead of raw token units.
    const valueDocs = await this.fetchTopTransferTransactions(address, transfers);

    return [
      token,
      ...transfers,
      ...(contract ? [contract] : []),
      ...(holders ? [holders] : []),
      ...(counters ? [counters] : []),
      ...(addressInfo ? [addressInfo] : []),
      ...valueDocs
    ];
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
    const requestUrl = new URL(path.replace(/^\//, ""), baseUrl).toString();
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
    maxPages = this.env.BLOCKSCOUT_MAX_PAGES
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
        if (optional) break;
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
    path: string
  ): Promise<SourceDocumentInput | undefined> {
    try {
      return await this.fetchDoc(entityType, entityValue, path);
    } catch {
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

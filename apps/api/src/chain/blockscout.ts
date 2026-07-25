import { randomUUID } from "node:crypto";
import type { Env } from "../config/env.js";
import type { ChainProvider, SourceDocumentInput } from "./types.js";
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

  async getAddressSummary(address: string): Promise<SourceDocumentInput[]> {
    const wallet = await this.fetchDoc("wallet", address, `/addresses/${address}`);
    const [transactions, tokenTransfers, internalTransactions, tokenBalances] = await Promise.all([
      this.fetchPaginated("wallet", address, `/addresses/${address}/transactions?filter=to%20%7C%20from`, true),
      this.fetchPaginated("wallet", address, `/addresses/${address}/token-transfers`, true),
      this.fetchPaginated("wallet", address, `/addresses/${address}/internal-transactions`, true),
      this.fetchOptionalDoc("wallet", address, `/addresses/${address}/token-balances`)
    ]);
    return [wallet, ...transactions, ...tokenTransfers, ...internalTransactions, ...(tokenBalances ? [tokenBalances] : [])];
  }

  async getToken(address: string): Promise<SourceDocumentInput[]> {
    const token = await this.fetchDoc("token", address, `/tokens/${address}`);
    const [transfers, contract] = await Promise.all([
      this.fetchPaginated("token", address, `/tokens/${address}/transfers`, true),
      this.fetchOptionalDoc("token", address, `/smart-contracts/${address}`)
    ]);
    return [token, ...transfers, ...(contract ? [contract] : [])];
  }

  async getContract(address: string): Promise<SourceDocumentInput[]> {
    const contract = await this.fetchDoc("contract", address, `/smart-contracts/${address}`);
    const [addressDoc, transactions] = await Promise.all([
      this.fetchOptionalDoc("contract", address, `/addresses/${address}`),
      this.fetchPaginated("contract", address, `/addresses/${address}/transactions`, true)
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
    optional = false
  ): Promise<SourceDocumentInput[]> {
    const docs: SourceDocumentInput[] = [];
    let nextPath: string | undefined = path;
    const visited = new Set<string>();
    while (nextPath && docs.length < this.env.BLOCKSCOUT_MAX_PAGES && !visited.has(nextPath)) {
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

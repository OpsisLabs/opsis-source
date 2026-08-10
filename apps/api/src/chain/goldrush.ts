import { randomUUID } from "node:crypto";
import type { Env } from "../config/env.js";
import { createProviderHttp, type ProviderHttp } from "./provider-http.js";
import type { SourceDocumentInput } from "./types.js";

export class GoldRushProvider {
  readonly name = "goldrush";

  constructor(private readonly env: Env, private readonly http: ProviderHttp = createProviderHttp(env, "goldrush")) {}

  isConfigured(): boolean {
    return this.env.GOLDRUSH_ENABLED && Boolean(this.env.GOLDRUSH_API_KEY);
  }

  async getAddressSummary(address: string): Promise<SourceDocumentInput[]> {
    if (!this.env.GOLDRUSH_ENABLED || !this.env.GOLDRUSH_API_KEY) return [];
    const paths = [
      `address/${address}/balances_v2/`,
      `address/${address}/transactions_v3/?tier=small`,
      `approvals/${address}/`
    ];
    const results = await Promise.allSettled(paths.map((path) => this.fetchDoc(address, path)));
    return results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  }

  private async fetchDoc(address: string, path: string): Promise<SourceDocumentInput> {
    const base = `${this.env.GOLDRUSH_API_BASE_URL.replace(/\/$/, "")}/${this.env.GOLDRUSH_CHAIN_NAME}/`;
    const publicUrl = new URL(path, base);
    const authenticatedUrl = new URL(publicUrl);
    authenticatedUrl.searchParams.set("key", this.env.GOLDRUSH_API_KEY!);
    return {
      id: randomUUID(),
      provider: this.name,
      chainId: this.env.ROBINHOOD_CHAIN_ID,
      entityType: "wallet",
      entityValue: address,
      requestUrl: publicUrl.toString(),
      responseJson: await this.http.requestJson(authenticatedUrl.toString(), { headers: { accept: "application/json" } }),
      fetchedAt: new Date().toISOString()
    };
  }
}

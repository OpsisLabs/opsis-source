import { randomUUID } from "node:crypto";
import type { Env } from "../config/env.js";
import type { ChainProvider, SourceDocumentInput } from "./types.js";
import { createProviderHttp, type ProviderHttp } from "./provider-http.js";

const FORBIDDEN_METHODS = new Set(["eth_sendRawTransaction", "eth_sendTransaction", "personal_sign", "eth_sign", "eth_signTypedData"]);
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export type AllowanceTarget = {
  token: string;
  spender: string;
  method?: unknown;
};

export class AlchemyProvider implements Pick<ChainProvider, "name" | "getTransaction" | "getAddressSummary"> {
  readonly name = "alchemy";
  private readonly rpcUrl?: string;

  constructor(private readonly env: Env, private readonly http: ProviderHttp = createProviderHttp(env, "alchemy")) {
    this.rpcUrl =
      env.ALCHEMY_ROBINHOOD_RPC_URL ||
      (env.ALCHEMY_API_KEY ? `https://robinhood-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}` : undefined) ||
      (env.ENABLE_PUBLIC_RPC_FALLBACK ? env.ROBINHOOD_PUBLIC_RPC_URL : undefined);
  }

  async getTransaction(hash: string): Promise<SourceDocumentInput[]> {
    if (!this.rpcUrl) return [];
    const [tx, receipt] = await Promise.all([
      this.rpc("eth_getTransactionByHash", [hash]),
      this.rpc("eth_getTransactionReceipt", [hash])
    ]);
    if (tx === null && receipt === null) return [];
    return [
      this.doc("transaction", hash, "eth_getTransactionByHash", tx),
      this.doc("transaction", hash, "eth_getTransactionReceipt", receipt)
    ];
  }

  async getAddressSummary(address: string): Promise<SourceDocumentInput[]> {
    if (!this.rpcUrl || !ADDRESS_PATTERN.test(address)) return [];
    const [code, balance] = await Promise.all([
      this.rpc("eth_getCode", [address, "latest"]),
      this.rpc("eth_getBalance", [address, "latest"])
    ]);
    return [
      this.doc("wallet", address, "eth_getCode", code),
      this.doc("wallet", address, "eth_getBalance", balance)
    ];
  }

  async getAllowances(owner: string, targets: AllowanceTarget[]): Promise<SourceDocumentInput[]> {
    if (!this.rpcUrl || !ADDRESS_PATTERN.test(owner)) return [];
    const unique = new Map(
      targets
        .filter((target) => ADDRESS_PATTERN.test(target.token) && ADDRESS_PATTERN.test(target.spender))
        .map((target) => [
          `${target.token.toLowerCase()}:${target.spender.toLowerCase()}:${String(target.method).toLowerCase() === "setapprovalforall" ? "operator" : "allowance"}`,
          target
        ] as const)
    );
    const results = await Promise.allSettled(
      [...unique.values()].map(async ({ token, spender, method }) => {
        const isOperatorApproval = String(method).toLowerCase() === "setapprovalforall";
        const selector = isOperatorApproval ? "0xe985e9c5" : "0xdd62ed3e";
        const data = `${selector}${owner.slice(2).padStart(64, "0")}${spender.slice(2).padStart(64, "0")}`;
        const result = await this.rpc("eth_call", [{ to: token, data }, "latest"]);
        return this.doc("wallet", owner, "eth_call", result, {
          owner,
          token,
          spender,
          query: isOperatorApproval ? "isApprovedForAll" : "allowance"
        });
      })
    );
    return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  }

  private async rpc(method: string, params: unknown[]): Promise<unknown> {
    if (FORBIDDEN_METHODS.has(method)) throw new Error("WRITE_RPC_METHOD_DISABLED");
    const json = (await this.http.requestJson(this.rpcUrl!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
    })) as { result?: unknown; error?: unknown };
    if (json.error) throw new Error("ALCHEMY_RPC_ERROR");
    return json.result;
  }

  private doc(
    entityType: SourceDocumentInput["entityType"],
    entityValue: string,
    method: string,
    responseJson: unknown,
    context?: Record<string, unknown>
  ): SourceDocumentInput {
    return {
      id: randomUUID(),
      provider: this.name,
      chainId: this.env.ROBINHOOD_CHAIN_ID,
      entityType,
      entityValue,
      requestUrl: redactRpcUrl(this.rpcUrl),
      responseJson: { method, ...context, result: responseJson },
      fetchedAt: new Date().toISOString()
    };
  }
}

function redactRpcUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return new URL(value).origin;
}

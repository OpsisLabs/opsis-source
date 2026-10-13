import { decodeReceiptActions, RESEARCH_MAX_RPC_SUBCALLS } from "./transaction-actions.js";
import { randomUUID } from "node:crypto";
import { decodeFunctionResult, encodeFunctionData, type Abi, type Hex } from "viem";
import type { Env } from "../config/env.js";
import type { ChainProvider, SourceDocumentInput } from "./types.js";
import { createProviderHttp, type ProviderHttp } from "./provider-http.js";
import { delegationTarget } from "./delegation.js";
import { REVIEWED_ROBINHOOD_ASSET_SAMPLE } from "./reviewed-assets.js";
import {
  createRobinhoodRpcHttp,
  robinhoodRpcEndpoint,
  type RobinhoodRpcProviderId,
  type RpcSpendBudget
} from "./robinhood-rpc.js";

const FORBIDDEN_METHODS = new Set(["eth_sendRawTransaction", "eth_sendTransaction", "personal_sign", "eth_sign", "eth_signTypedData"]);
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

const REVIEWED_WALLET_BALANCE_SAMPLE = REVIEWED_ROBINHOOD_ASSET_SAMPLE;

const balanceOfAbi = [{
  type: "function",
  name: "balanceOf",
  stateMutability: "view",
  inputs: [{ name: "account", type: "address" }],
  outputs: [{ name: "", type: "uint256" }]
}] as const satisfies Abi;

const multicall3Abi = [{
  type: "function",
  name: "aggregate3",
  stateMutability: "payable",
  inputs: [{
    name: "calls",
    type: "tuple[]",
    components: [
      { name: "target", type: "address" },
      { name: "allowFailure", type: "bool" },
      { name: "callData", type: "bytes" }
    ]
  }],
  outputs: [{
    name: "returnData",
    type: "tuple[]",
    components: [
      { name: "success", type: "bool" },
      { name: "returnData", type: "bytes" }
    ]
  }]
}] as const satisfies Abi;

export type AllowanceTarget = {
  token: string;
  spender: string;
  method?: unknown;
};

export class AlchemyProvider implements Pick<ChainProvider, "name" | "getTransaction" | "getAddressSummary"> {
  readonly name: "alchemy" | RobinhoodRpcProviderId;
  private readonly rpcUrl?: string;
  private readonly http: ProviderHttp;
  private readonly inFlightTransactions = new Map<string, Promise<SourceDocumentInput[]>>();
  private static readonly MAX_IN_FLIGHT_TRANSACTIONS = 64;

  constructor(private readonly env: Env, http?: ProviderHttp, options: { rpcSpend?: RpcSpendBudget } = {}) {
    const alchemyUrl = env.ALCHEMY_ROBINHOOD_RPC_URL
      || (env.ALCHEMY_API_KEY ? `https://robinhood-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}` : undefined);
    if (alchemyUrl) {
      this.rpcUrl = alchemyUrl;
      this.name = "alchemy";
      this.http = http ?? createProviderHttp(env, this.name, undefined, "research");
      return;
    }
    // Without Alchemy, the bounded fallback uses the configured Robinhood Chain
    // transport: the public RPC in development, dRPC in production (D20).
    const endpoint = robinhoodRpcEndpoint(env);
    this.name = endpoint.id;
    this.rpcUrl = env.ENABLE_PUBLIC_RPC_FALLBACK ? endpoint.url : undefined;
    this.http = http ?? createRobinhoodRpcHttp(env, {
      providerName: "research-rpc",
      spend: options.rpcSpend,
      client: { rpcWorkload: "research" }
    });
  }

  isConfigured(): boolean {
    return Boolean(this.rpcUrl);
  }

  async getTransaction(hash: string): Promise<SourceDocumentInput[]> {
    if (!this.rpcUrl) return [];
    const key = /^0x[0-9a-f]{64}$/i.test(hash) ? hash.toLowerCase() : undefined;
    if (key) {
      const pending = this.inFlightTransactions.get(key);
      if (pending) return pending;
      if (this.inFlightTransactions.size < AlchemyProvider.MAX_IN_FLIGHT_TRANSACTIONS) {
        const request = this.fetchTransaction(hash);
        let tracked: Promise<SourceDocumentInput[]>;
        tracked = request.finally(() => {
          if (this.inFlightTransactions.get(key) === tracked) this.inFlightTransactions.delete(key);
        });
        this.inFlightTransactions.set(key, tracked);
        return tracked;
      }
    }
    return this.fetchTransaction(hash);
  }

  private async fetchTransaction(hash: string): Promise<SourceDocumentInput[]> {
    const [tx, receipt] = await Promise.all([
      this.rpc("eth_getTransactionByHash", [hash]),
      this.rpc("eth_getTransactionReceipt", [hash])
    ]);
    validateTransactionEvidence(hash, tx, receipt);
    if (tx === null && receipt === null) return [];
    let subcalls = 2;
    const decodeReads: Array<{ to: string; data: string; block: string; result: unknown }> = [];
    const decoded = await decodeReceiptActions(receipt, async (to, data, block) => {
      if (subcalls >= RESEARCH_MAX_RPC_SUBCALLS) throw new Error("RESEARCH_RPC_LIMIT_EXCEEDED");
      subcalls++;
      const result = await this.rpc("eth_call", [{ to, data }, block]);
      decodeReads.push({ to, data, block, result });
      return result;
    });
    return [
      this.doc("transaction", hash, "eth_getTransactionByHash", tx),
      this.doc("transaction", hash, "eth_getTransactionReceipt", receipt, { ...decoded, decodeReads })
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

  /** One explicit-token sample: code plus four standard ERC-20 getters at latest. */
  async getTokenMetadataSample(address: string, knownCode?: string): Promise<SourceDocumentInput[]> {
    if (!this.rpcUrl || !ADDRESS_PATTERN.test(address)) return [];
    const code = knownCode ?? await this.rpc("eth_getCode", [address, "latest"]);
    const validCode = typeof code === "string" && /^0x(?:[0-9a-f]{2})+$/i.test(code) && !/^0x0*$/i.test(code);
    if (!validCode || delegationTarget(code)) return [];
    const fields = [
      ["name", "0x06fdde03"], ["symbol", "0x95d89b41"], ["decimals", "0x313ce567"], ["totalSupply", "0x18160ddd"]
    ] as const;
    const responses = await Promise.all(fields.map(async ([field, data]) => {
      try {
        const result = await this.rpc("eth_call", [{ to: address, data }, "latest"]);
        return this.doc("token", address, "eth_call", result, { query: "erc20MetadataSample", field });
      } catch {
        return this.doc("token", address, "eth_call", null, { query: "erc20MetadataSample", field, readError: true });
      }
    }));
    return [this.doc("token", address, "eth_getCode", code, { query: "erc20MetadataSample" }), ...responses];
  }

  async getReviewedAssetBalances(address: string): Promise<SourceDocumentInput[]> {
    if (!this.rpcUrl || !ADDRESS_PATTERN.test(address)) return [];
    const data = encodeFunctionData({
      abi: multicall3Abi,
      functionName: "aggregate3",
      args: [REVIEWED_WALLET_BALANCE_SAMPLE.map((asset) => ({
        target: asset.address as `0x${string}`,
        allowFailure: true,
        callData: encodeFunctionData({ abi: balanceOfAbi, functionName: "balanceOf", args: [address as `0x${string}`] })
      }))]
    });
    const raw = await this.rpc("eth_call", [{ to: MULTICALL3, data }, "latest"]);
    if (typeof raw !== "string" || !raw.startsWith("0x")) return [];

    let results: readonly { success: boolean; returnData: Hex }[];
    try {
      results = decodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", data: raw as Hex });
    } catch {
      return [];
    }

    const items = REVIEWED_WALLET_BALANCE_SAMPLE.flatMap((asset, index) => {
      const result = results[index];
      if (!result?.success) return [];
      try {
        const balance = decodeFunctionResult({ abi: balanceOfAbi, functionName: "balanceOf", data: result.returnData });
        if (balance === 0n) return [];
        return [{
          token: {
            address_hash: asset.address,
            name: asset.name,
            symbol: asset.symbol,
            type: "ERC-20",
            decimals: asset.decimals
          },
          value: balance.toString()
        }];
      } catch {
        return [];
      }
    });

    return [{
      id: randomUUID(),
      provider: this.name,
      chainId: this.env.ROBINHOOD_CHAIN_ID,
      entityType: "wallet",
      entityValue: address,
      requestUrl: redactRpcUrl(this.rpcUrl),
      responseJson: {
        method: "eth_call",
        query: "reviewedTokenBalanceSample",
        contractsChecked: REVIEWED_WALLET_BALANCE_SAMPLE.length,
        registryReviewedAt: "2026-09-02",
        registrySource: "https://api.robinhood.com/rhj/assets",
        items
      },
      fetchedAt: new Date().toISOString()
    }];
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

function validateTransactionEvidence(requestedHash: string, transaction: unknown, receipt: unknown): void {
  const requested = requestedHash.toLowerCase();
  if (!/^0x[0-9a-f]{64}$/i.test(requestedHash)) throw new Error("RPC_TRANSACTION_RESPONSE_MISMATCH");
  const tx = transaction === null ? undefined : asRpcObject(transaction);
  const receiptValue = receipt === null ? undefined : asRpcObject(receipt);
  if (tx && (typeof tx.hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(tx.hash) || tx.hash.toLowerCase() !== requested)) {
    throw new Error("RPC_TRANSACTION_RESPONSE_MISMATCH");
  }
  if (receiptValue && (typeof receiptValue.transactionHash !== "string"
    || !/^0x[0-9a-f]{64}$/i.test(receiptValue.transactionHash)
    || receiptValue.transactionHash.toLowerCase() !== requested)) {
    throw new Error("RPC_TRANSACTION_RESPONSE_MISMATCH");
  }
  if (tx && receiptValue) {
    for (const field of ["blockHash", "blockNumber"] as const) {
      const txValue = tx[field];
      const receiptFieldValue = receiptValue[field];
      if ((txValue === null) !== (receiptFieldValue === null)) {
        throw new Error("RPC_TRANSACTION_RESPONSE_MISMATCH");
      }
      if (txValue === null || receiptFieldValue === null || txValue === undefined || receiptFieldValue === undefined) continue;
      if (field === "blockHash") {
        if (typeof txValue !== "string" || typeof receiptFieldValue !== "string"
          || !/^0x[0-9a-f]{64}$/i.test(txValue) || !/^0x[0-9a-f]{64}$/i.test(receiptFieldValue)
          || txValue.toLowerCase() !== receiptFieldValue.toLowerCase()) {
          throw new Error("RPC_TRANSACTION_RESPONSE_MISMATCH");
        }
      } else if (canonicalRpcQuantity(txValue) === undefined || canonicalRpcQuantity(receiptFieldValue) === undefined
        || canonicalRpcQuantity(txValue) !== canonicalRpcQuantity(receiptFieldValue)) {
        throw new Error("RPC_TRANSACTION_RESPONSE_MISMATCH");
      }
    }
  }
}

function asRpcObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("RPC_TRANSACTION_RESPONSE_MISMATCH");
  }
  return value as Record<string, unknown>;
}

function canonicalRpcQuantity(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return undefined;
  try {
    return BigInt(value).toString(16);
  } catch {
    return undefined;
  }
}

function redactRpcUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return new URL(value).origin;
}

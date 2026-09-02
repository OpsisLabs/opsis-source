import { randomUUID } from "node:crypto";
import { decodeFunctionResult, encodeFunctionData, type Abi, type Hex } from "viem";
import type { Env } from "../config/env.js";
import type { ChainProvider, SourceDocumentInput } from "./types.js";
import { createProviderHttp, type ProviderHttp } from "./provider-http.js";

const FORBIDDEN_METHODS = new Set(["eth_sendRawTransaction", "eth_sendTransaction", "personal_sign", "eth_sign", "eth_signTypedData"]);
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

/**
 * A deliberately small, reviewed set of high-recognition Robinhood asset
 * contracts. Private Mode uses one read-only Multicall when the public
 * indexer cannot return token balances. This is a sample, never a complete
 * portfolio claim. Addresses were reviewed against Robinhood's public asset
 * registry on 2026-09-02.
 */
const REVIEWED_WALLET_BALANCE_SAMPLE = [
  { symbol: "USDG", name: "Global Dollar", address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", decimals: 6 },
  { symbol: "WETH", name: "Wrapped Ether", address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", decimals: 18 },
  { symbol: "AAPL", name: "Apple", address: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", decimals: 18 },
  { symbol: "NVDA", name: "NVIDIA", address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", decimals: 18 },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", address: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", decimals: 18 },
  { symbol: "TSLA", name: "Tesla", address: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d", decimals: 18 },
  { symbol: "GLD", name: "SPDR Gold Trust", address: "0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e", decimals: 18 },
  { symbol: "GME", name: "GameStop", address: "0x1b0E319c6A659F002271B69dB8A7df2F911c153E", decimals: 18 },
  { symbol: "AMZN", name: "Amazon", address: "0x12f190a9F9d7D37a250758b26824B97CE941bF54", decimals: 18 },
  { symbol: "GOOGL", name: "Alphabet Class A", address: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3", decimals: 18 },
  { symbol: "COIN", name: "Coinbase", address: "0x6330D8C3178a418788dF01a47479c0ce7CCF450b", decimals: 18 },
  { symbol: "QQQ", name: "Invesco QQQ", address: "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68", decimals: 18 }
] as const;

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
  readonly name: "alchemy" | "robinhood-public-rpc";
  private readonly rpcUrl?: string;
  private readonly http: ProviderHttp;

  constructor(private readonly env: Env, http?: ProviderHttp) {
    const alchemyUrl = env.ALCHEMY_ROBINHOOD_RPC_URL
      || (env.ALCHEMY_API_KEY ? `https://robinhood-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}` : undefined);
    this.rpcUrl = alchemyUrl || (env.ENABLE_PUBLIC_RPC_FALLBACK ? env.ROBINHOOD_PUBLIC_RPC_URL : undefined);
    this.name = alchemyUrl ? "alchemy" : "robinhood-public-rpc";
    this.http = http ?? createProviderHttp(env, this.name);
  }

  isConfigured(): boolean {
    return Boolean(this.rpcUrl);
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

function redactRpcUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return new URL(value).origin;
}

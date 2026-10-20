import { adaptAnswer, type BackendAnswer, type BackendEntity } from "../dashboard/adapters";
import { privateApi } from "../dashboard/http";
import type { AiExplorerAnswer, ChainEntityType, ExplorerAnswerTask } from "../dashboard/types";
import { readLocaleCookie } from "../i18n/locale";
import type { ContractFacts } from "@rh-chain/shared";

export type PrivatePrivacyReceipt = {
  accountRequired: false;
  walletConnectionRequired: false;
  serverStorage: "none";
  browserStorage: "memory_only";
  clearsOnReload: true;
  modelProvider: "none";
  providerDestinations: string[];
  disclosure: string;
};

export type TokenRef = { address: string; symbol: string | null; decimals: number | null };
export type Leg = { token: TokenRef; rawAmount: string; amount: string | null };
export type DecodedAction =
  | { kind: "erc20_transfer"; logIndex: number; token: TokenRef; from: string; to: string; rawAmount: string; amount: string | null }
  | { kind: "erc20_approval"; logIndex: number; token: TokenRef; owner: string; spender: string; rawAmount: string; amount: string | null; unlimited: boolean }
  | { kind: "uniswap_v3_swap"; logIndex: number; pool: string; feeBps: number | null; sold: Leg; bought: Leg; sender: string; recipient: string };
export type ResearchFacts = Record<string, unknown> & {
  decimals?: number | string | null;
  totalSupply?: string | null;
  holders?: number | string | null;
  lifetimeTransfers?: number | string | null;
  verified?: boolean | null;
  proxy?: boolean | null;
  proxyType?: string;
  implementations?: { address: string; name?: string }[];
  holderCoverage?: "top_holders" | "unavailable";
  activityCoverage?: "indexed_window" | "unavailable";
  tokenBalanceCoverage?: "indexed_window" | "reviewed_asset_sample" | "unavailable";
  sourceCoverage?: "explorer_metadata" | "rpc_sample_only" | "unavailable";
  explorerObservedAt?: string;
  explorerCached?: boolean;
  explorerReputation?: string;
  explorerUnavailableReason?: "daily_limit" | "rate_limited" | "unavailable";
  topHolders?: { address: string; label?: string; isPool?: boolean; isContract?: boolean; isBurn?: boolean; flaggedScam?: boolean; share?: number | string | null }[];
  top1WalletShare?: number | string | null;
  top5WalletShare?: number | string | null;
  top10WalletShare?: number | string | null;
  burnedShare?: number | string | null;
  liquidityPoolShare?: number | string | null;
  liquidityPools?: { address: string; label?: string; share?: number | string | null }[];
  holdersAnalyzed?: number | string | null;
  deployer?: string;
  deployerStillHolds?: number | string | null;
  scamFlaggedHolders?: number;
  recentTransfers?: { from: string; to: string; timestamp?: string; transactionHash?: string; tokenSymbol?: string; rawValue?: string; formattedValue?: string | null; method?: string | null }[];
  recentTransactions?: { hash: string; timestamp?: string; status?: string; from: string; to?: string | null; value?: string; method?: string | null; decodedInput?: unknown; failureDetail?: unknown }[];
  tokenBalances?: { tokenAddress?: string; tokenName?: string; tokenSymbol?: string; tokenType?: string; rawValue?: string; formattedValue?: string | null; reputation?: string; decimals?: number | null }[];
  decodedActions?: DecodedAction[];
  decodeCoverage?: "decoded" | "partial" | "none";
};

export type PrivateAnalysis = {
  contractFacts?: ContractFacts;
  entity: BackendEntity & { facts: ResearchFacts };
  answer: AiExplorerAnswer;
  privacy: PrivatePrivacyReceipt;
};

export async function analyzePrivate(input: {
  entity: string;
  entityType?: ChainEntityType;
  question?: string;
  task?: ExplorerAnswerTask;
}, signal?: AbortSignal): Promise<PrivateAnalysis> {
  const response = await privateApi<{
    mode: "private";
    contractFacts?: ContractFacts;
    entity: BackendEntity;
    answer: BackendAnswer;
    privacy: PrivatePrivacyReceipt;
  }>("/v1/private/analyze", {
    entity: input.entity,
    entityType: input.entityType ?? "unknown",
    locale: readLocaleCookie(),
    ...(input.question ? { question: input.question } : {}),
    ...(input.task ? { task: input.task } : {})
  }, signal);
  return {
    entity: response.entity,
    ...(response.contractFacts ? { contractFacts: response.contractFacts } : {}),
    answer: adaptAnswer(response.answer, { type: response.entity.type, id: response.entity.value }),
    privacy: response.privacy
  };
}

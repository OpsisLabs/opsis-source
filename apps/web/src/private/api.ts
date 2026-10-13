import { adaptAnswer, type BackendAnswer, type BackendEntity } from "../dashboard/adapters";
import { privateApi } from "../dashboard/http";
import type { AiExplorerAnswer, ChainEntityType, ExplorerAnswerTask } from "../dashboard/types";
import { readLocaleCookie } from "../i18n/locale";

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
  decodedActions?: DecodedAction[];
  decodeCoverage?: "decoded" | "partial" | "none";
};

export type PrivateAnalysis = {
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
    answer: adaptAnswer(response.answer, { type: response.entity.type, id: response.entity.value }),
    privacy: response.privacy
  };
}

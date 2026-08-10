import { adaptAnswer, type BackendAnswer, type BackendEntity } from "../dashboard/adapters";
import { privateApi } from "../dashboard/http";
import type { AiExplorerAnswer, ChainEntityType } from "../dashboard/types";

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

export type PrivateAnalysis = {
  entity: BackendEntity;
  answer: AiExplorerAnswer;
  privacy: PrivatePrivacyReceipt;
};

export async function analyzePrivate(input: {
  entity: string;
  entityType?: ChainEntityType;
  question?: string;
}): Promise<PrivateAnalysis> {
  const response = await privateApi<{
    mode: "private";
    entity: BackendEntity;
    answer: BackendAnswer;
    privacy: PrivatePrivacyReceipt;
  }>("/v1/private/analyze", {
    entity: input.entity,
    entityType: input.entityType ?? "unknown",
    ...(input.question ? { question: input.question } : {})
  });
  return {
    entity: response.entity,
    answer: adaptAnswer(response.answer, { type: response.entity.type, id: response.entity.value }),
    privacy: response.privacy
  };
}

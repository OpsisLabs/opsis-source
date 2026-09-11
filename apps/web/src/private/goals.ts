import type { TranslationKey } from "../i18n/translate";
import type { ChainEntityType, ExplorerAnswerTask } from "../dashboard/types";

export type ExplorerGoal = {
  task: ExplorerAnswerTask;
  labelKey: TranslationKey;
};

/**
 * Identifier-appropriate goal chips. A 40-character address is only known to be
 * a wallet/contract until the content resolver runs, so the API is still called
 * with an unknown type and the token goals appear after resolution.
 */
const WALLET_GOALS: ExplorerGoal[] = [
  { task: "holdings", labelKey: "explorer.goal.holdings" },
  { task: "activity", labelKey: "explorer.goal.activity" },
  { task: "explain", labelKey: "explorer.goal.explain" },
  { task: "risk", labelKey: "explorer.goal.risk" },
  { task: "evidence", labelKey: "explorer.goal.evidence" },
];

const TRANSACTION_GOALS: ExplorerGoal[] = [
  { task: "moved", labelKey: "explorer.goal.moved" },
  { task: "success", labelKey: "explorer.goal.success" },
  { task: "fees", labelKey: "explorer.goal.fees" },
  { task: "evidence", labelKey: "explorer.goal.evidence" },
];

const TOKEN_GOALS: ExplorerGoal[] = [
  { task: "token", labelKey: "explorer.goal.token" },
  { task: "verify", labelKey: "explorer.goal.verify" },
  { task: "risk", labelKey: "explorer.goal.risk" },
  { task: "evidence", labelKey: "explorer.goal.evidence" },
];

const CONTRACT_GOALS: ExplorerGoal[] = [
  { task: "explain", labelKey: "explorer.goal.explain" },
  { task: "risk", labelKey: "explorer.goal.risk" },
  { task: "evidence", labelKey: "explorer.goal.evidence" },
];

export function goalsForEntity(type: ChainEntityType): ExplorerGoal[] {
  if (type === "transaction") return TRANSACTION_GOALS;
  if (type === "token") return TOKEN_GOALS;
  if (type === "contract") return CONTRACT_GOALS;
  return WALLET_GOALS;
}

import type { PrivateAnalysis } from "../private/api";
import type { ExplorerAnswerTask } from "../dashboard/types";
import type { ExitCheckQuote, ExitCheckOutputSymbol } from "../exit-check/api";

// Tab memory only. These forms and API responses contain public lookup context;
// Saved records, Vault inputs, labels, notes and report drafts never enter here.
export const publicSession: {
  research: { entity: string; task: ExplorerAnswerTask; entityType: "unknown" | "token"; result: PrivateAnalysis | null };
  check: { token: string; amount: string; output: ExitCheckOutputSymbol; curveEnabled: boolean; result: ExitCheckQuote | null };
} = {
  research: { entity: "", task: "overview", entityType: "unknown", result: null },
  check: { token: "", amount: "", output: "WETH", curveEnabled: false, result: null },
};
export function clearPublicSession() {
  publicSession.research = { entity: "", task: "overview", entityType: "unknown", result: null };
  publicSession.check = { token: "", amount: "", output: "WETH", curveEnabled: false, result: null };
}

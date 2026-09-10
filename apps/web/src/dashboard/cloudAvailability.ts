// Cloud research is deferred. Only an explicitly configured future/cloud build
// exposes it; encrypted local history is independent of this flag.
import { translateCurrent } from "../i18n/translate";

export const cloudWorkspaceEnabled = import.meta.env.VITE_CLOUD_WORKSPACE_ENABLED === "true";
export function cloudUnavailableMessage(): string {
  return translateCurrent("cloud.availability.message");
}

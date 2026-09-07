// Cloud research is deferred. Only an explicitly configured future/cloud build
// exposes it; encrypted local history is independent of this flag.
export const cloudWorkspaceEnabled = import.meta.env.VITE_CLOUD_WORKSPACE_ENABLED === "true";
export const cloudUnavailableMessage = "Cloud research is coming in a future update. Use encrypted local chat history and the local Vault without an account or wallet connection.";

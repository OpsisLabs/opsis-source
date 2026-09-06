// Public preview deployments without durable account storage set this false.
// The API independently rejects cloud writes when no database is connected.
export const cloudWorkspaceEnabled = import.meta.env.VITE_CLOUD_WORKSPACE_ENABLED !== "false";
export const cloudUnavailableMessage = "Saved cloud research is temporarily unavailable. Private Explorer and your encrypted local Vault are ready to use without signing in.";

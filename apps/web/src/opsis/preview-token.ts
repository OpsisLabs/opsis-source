// Never persisted. Restricted to same API paths as the server preview guard.
let credential = "";
let expiresAt = 0;
export function setOpsisPreviewToken(value: string, expiry = 0) {
  credential = value;
  expiresAt = expiry;
}
export function opsisPreviewAuthorization(path: string): string | null {
  return import.meta.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
    path.startsWith("/v1/private/") &&
    credential &&
    Date.now() < expiresAt
    ? `Preview ${credential}`
    : null;
}

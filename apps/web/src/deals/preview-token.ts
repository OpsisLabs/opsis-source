// Operator test credential: memory only; never an account or Vault token.
let previewToken = "";
export function setDealPreviewToken(value: string) { previewToken = value; }
export function dealPreviewAuthorization(path: string): string | undefined {
  return path.startsWith("/v1/private/deals/") && previewToken ? `Preview ${previewToken}` : undefined;
}

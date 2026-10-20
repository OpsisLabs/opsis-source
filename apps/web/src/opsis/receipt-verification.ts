import { verifyReceipt, validateKeys, type ReceiptChecks } from "@rh-chain/shared";
import { keccak256, recoverAddress } from "viem";
import { opsisPreviewAuthorization } from "./preview-token";
const path = "/v1/private/opsis/receipts/keys";
/** Receipt text is used only by the local verifier. The only request fetches public keys. */
export async function verifyBrowserReceipt(text: string, enabled: boolean, signal?: AbortSignal): Promise<ReceiptChecks> {
  if (!enabled) throw new Error("Receipt verification unavailable");
  if (new TextEncoder().encode(text).length > 2_000_000) throw new Error("Receipt file too large");
  const authorization = opsisPreviewAuthorization(path);
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ""}${path}`, {
    method: "GET", credentials: "omit", cache: "no-store", redirect: "error", signal,
    headers: authorization ? { authorization } : {},
  });
  if (!response.ok) throw new Error("Receipt keys unavailable");
  const keys = validateKeys(await response.json());
  return verifyReceipt(text, keys, { keccak256, recoverAddress });
}

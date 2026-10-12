import type { PortfolioSnapshot } from "@rh-chain/shared";
import { isAddress } from "viem";
import { privateApi } from "../dashboard/http";
import { translateCurrent as t } from "../i18n/translate";
import { assertWatchSnapshot } from "./model";

// A public check has no storage dependency. Saving is a separate explicit action.
export async function checkPublicWallet(address: string, signal?: AbortSignal) {
  const normalized = address.trim();
  if (!isAddress(normalized, { strict: true }))
    throw new Error(t("watch.error.address"));
  const snapshot = await privateApi<PortfolioSnapshot>(
    "/v1/private/watch/snapshot",
    { address: normalized.toLowerCase() },
    signal,
  );
  assertWatchSnapshot(snapshot, normalized.toLowerCase());
  return snapshot;
}

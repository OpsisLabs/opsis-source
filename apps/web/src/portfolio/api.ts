import type { PortfolioSnapshot } from "@rh-chain/shared";
import { privateApi } from "../dashboard/http";
import { translateCurrent } from "../i18n/translate";

export async function requestPortfolioSnapshot(address: string, signal?: AbortSignal, approvalsOnly = false): Promise<PortfolioSnapshot> {
  const response = approvalsOnly
    ? await privateApi<PortfolioSnapshot>("/v1/private/approvals/snapshot", { address }, signal)
    : await privateApi<PortfolioSnapshot>("/v1/private/portfolio/snapshot", { address }, signal);
  assertPortfolioSnapshot(response, address);
  return response;
}

function assertPortfolioSnapshot(value: PortfolioSnapshot, requestedAddress: string): void {
  const address = requestedAddress.toLowerCase();
  if (!value
    || value.schemaVersion !== 1
    || value.chain?.id !== 4663
    || value.address !== address
    || value.anchor?.tag !== "latest"
    || !Number.isSafeInteger(value.anchor.blockNumber)
    || !/^0x[0-9a-f]{64}$/.test(value.anchor.blockHash)
    || !Array.isArray(value.tokens)
    || !Array.isArray(value.nfts)
    || !Array.isArray(value.transactions)
    || !Array.isArray(value.movements)
    || !Array.isArray(value.approvals)
    || value.privacy?.serverStorage !== "none") {
    throw new Error(translateCurrent("portfolio.error.invalidSnapshot"));
  }
}

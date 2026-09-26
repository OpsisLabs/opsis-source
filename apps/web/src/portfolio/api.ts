import type { PortfolioSnapshot } from "@rh-chain/shared";
import { privateApi } from "../dashboard/http";
import { translateCurrent } from "../i18n/translate";

// Server-side Robinhood Chain RPC destinations a Portfolio snapshot may name:
// the admitted dRPC gateway in production, the public RPC only in development.
export const PORTFOLIO_RPC_DESTINATIONS: readonly string[] = ["drpc", "robinhood_public_rpc"];

// What an approved refresh discloses before the request starts. The on-screen
// permission names the production dRPC gateway, so the pre-request receipt
// records it; a completed receipt is replaced with the server's own list.
export const PORTFOLIO_APPROVED_DESTINATIONS: readonly string[] = ["drpc", "blockscout"];

export function isPortfolioProviderDestinations(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === "string"
    && PORTFOLIO_RPC_DESTINATIONS.includes(value[0])
    && value[1] === "blockscout";
}

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
    || value.privacy?.serverStorage !== "none"
    || !isPortfolioProviderDestinations(value.privacy?.providerDestinations)) {
    throw new Error(translateCurrent("portfolio.error.invalidSnapshot"));
  }
}

import type { PortfolioSnapshot } from "@rh-chain/shared";
import { privateApi } from "../dashboard/http";

export async function requestPortfolioSnapshot(address: string, signal?: AbortSignal): Promise<PortfolioSnapshot> {
  const response = await privateApi<PortfolioSnapshot>("/v1/private/portfolio/snapshot", { address }, signal);
  assertPortfolioSnapshot(response, address);
  return response;
}

function assertPortfolioSnapshot(value: PortfolioSnapshot, requestedAddress: string): void {
  const address = requestedAddress.toLowerCase();
  if (!value
    || value.schemaVersion !== 1
    || value.chain?.id !== 4663
    || value.address !== address
    || value.finality?.tag !== "finalized"
    || !Number.isSafeInteger(value.finality.blockNumber)
    || !/^0x[0-9a-f]{64}$/.test(value.finality.blockHash)
    || !Array.isArray(value.tokens)
    || !Array.isArray(value.nfts)
    || !Array.isArray(value.transactions)
    || !Array.isArray(value.movements)
    || !Array.isArray(value.approvals)
    || value.privacy?.serverStorage !== "none") {
    throw new Error("ChainScout returned an invalid portfolio snapshot");
  }
}

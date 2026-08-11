import type {
  ApprovedMerchantDirectoryResponse,
  CryptoMarketResponse,
  MerchantInventoryResponse,
} from "@rh-chain/shared";
import { privateApi } from "../dashboard/http";

export function fetchCryptoMarket(
  contract: string,
  signal?: AbortSignal,
): Promise<CryptoMarketResponse> {
  return privateApi<CryptoMarketResponse>(
    "/v1/private/market/crypto",
    { chainId: 4663, contract },
    signal,
  );
}

export function fetchMerchantInventory(
  merchantId: string,
  canonicalAssetId: string,
  expected: { sku: string; productId: string; reviewedAt: string },
  signal?: AbortSignal,
): Promise<MerchantInventoryResponse> {
  return privateApi<MerchantInventoryResponse>(
    "/v1/private/market/merchant",
    {
      merchantId,
      canonicalAssetId,
      expectedSku: expected.sku,
      expectedProductId: expected.productId,
      expectedMappingReviewedAt: expected.reviewedAt,
    },
    signal,
  );
}

export function fetchApprovedMerchants(
  signal?: AbortSignal,
): Promise<ApprovedMerchantDirectoryResponse> {
  return privateApi<ApprovedMerchantDirectoryResponse>(
    "/v1/private/market/merchants",
    {},
    signal,
  );
}

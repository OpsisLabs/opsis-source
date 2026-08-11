export type WooCommerceMerchant = {
  id: string;
  name: string;
  provider: "woocommerce";
  baseUrl: string;
  permissionRecordId: string;
  permissionReviewedAt: string;
  permissionEvidenceUrl: string;
  products: Array<{
    canonicalAssetId: string;
    sku: string;
    expectedProductId: string;
    variantLabel: string;
    condition: string;
    reviewedAt: string;
    evidenceUrl: string;
  }>;
};

export type ApprovedMerchant = WooCommerceMerchant;

// Deliberately code-reviewed rather than browser- or environment-supplied. An
// entry is added only after the merchant opts in and its origin, identifiers,
// public terms, and fallback link have been reviewed. This keeps the adapter from
// becoming an SSRF-capable general web proxy.
export const APPROVED_MARKET_MERCHANTS: readonly ApprovedMerchant[] = [];

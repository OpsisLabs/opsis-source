import type { RwaVerification } from "./api";

// Synthetic values, using the existing RWA API fixture shape. Never loaded by the product.
export const RWA_TEST_CONTRACT = `0x${"11".repeat(20)}`;
export const RWA_TEST_TIME = "2026-08-15T12:00:00.000Z";

export function rwaWorkspaceFixture(): RwaVerification {
  return {
    kind: "stock_token",
    address: RWA_TEST_CONTRACT,
    headline: "SAMPLE-STOCK synthetic identity response",
    summary: "Synthetic fixture. Custody and redemption remain issuer claims.",
    anchor: {
      chainId: 4663,
      blockNumber: 33440000,
      blockHash: `0x${"ab".repeat(32)}`,
      capturedAt: RWA_TEST_TIME,
      finality: "current_non_final",
    },
    stock: {
      uid: `0x${"12".repeat(32)}`,
      symbol: "SAMPLE-STOCK",
      name: "Synthetic stock-token example",
      decimals: 18,
      registryStatus: "ACTIVE",
      currentMultiplier: "1",
      pendingMultiplier: "2",
      pendingEffectiveAt: "2026-08-20T12:00:00Z",
      oraclePaused: false,
      tokenPaused: null,
      termsUrl: "https://robinhood.com/rhj/stocktokens/",
      underlyingQuote: {
        bid: "100.01",
        ask: "100.05",
        currency: "USD",
        generatedAt: RWA_TEST_TIME,
        tradingHalted: false,
        state: "current",
        ageSeconds: 0,
      },
      oracle: {
        feed: `0x${"22".repeat(20)}`,
        value: "100.03",
        updatedAt: RWA_TEST_TIME,
        heartbeatSeconds: 86400,
        state: "current",
      },
      corporateActions: [
        {
          id: "fixture-action",
          type: "SPLIT",
          status: "ANNOUNCED",
          processDate: "2026-08-20",
          detail: "Synthetic schedule; process date is not a payment date.",
        },
      ],
    },
    checks: [
      {
        id: "canonical",
        label: "Canonical address",
        status: "confirmed",
        detail: "Synthetic exact-deployment match.",
        sourceIds: ["registry"],
      },
      {
        id: "custody",
        label: "Backing and custody",
        status: "claim",
        detail: "Issuer custody statement; not independently audited.",
        sourceIds: ["terms"],
      },
      {
        id: "redemption",
        label: "Minting and redemption",
        status: "warning",
        detail:
          "Issuer redemption may require eligibility and KYC/AML. Opsis does not execute it.",
        sourceIds: ["terms"],
      },
      {
        id: "actions",
        label: "Corporate-action coverage",
        status: "missing",
        detail:
          "Synthetic partial corporate-action coverage; not a complete schedule.",
        sourceIds: [],
      },
    ],
    sources: [
      {
        id: "registry",
        provider: "Robinhood",
        url: "https://api.robinhood.com/rhj/assets",
        description: "Synthetic registry response",
        fetchedAt: RWA_TEST_TIME,
      },
      {
        id: "terms",
        provider: "Robinhood Jersey",
        url: "https://robinhood.com/rhj/stocktokens/",
        description: "Issuer terms fixture",
        fetchedAt: RWA_TEST_TIME,
      },
    ],
    limitations: [
      "No official sequencer-uptime feed; oracle health remains incomplete.",
    ],
    privacy: {
      serverStorage: "none",
      modelProvider: "none",
      providerDestinations: ["Robinhood Stock Token API"],
      disclosure:
        "The public contract was sent only to the listed sources. Nothing was saved.",
    },
  };
}

export function rwaHistoryFixture() {
  return {
    schemaVersion: 1,
    instrument: {
      chainId: 4663,
      address: RWA_TEST_CONTRACT,
      symbol: "SAMPLE-STOCK",
    },
    quoteCurrency: "USD",
    referenceQuoteCurrency: "USD",
    referenceType: "oracle",
    sourceName: "Synthetic test fixture — not market data",
    observedAt: RWA_TEST_TIME,
    observations: [
      {
        timestamp: "2026-08-11T12:00:00Z",
        dexPrice: "101.123456",
        referencePrice: "100",
        oracleObservedAt: "2026-08-11T11:00:00Z",
        session: "open",
        corporateAction: { state: "none_reported" },
      },
      {
        timestamp: "2026-08-11T13:00:00Z",
        dexPrice: "102",
        referencePrice: "100",
        oracleObservedAt: "2026-08-11T11:30:00Z",
        session: "closed",
        corporateAction: { state: "unknown" },
      },
      {
        timestamp: "2026-08-14T12:00:00Z",
        dexPrice: "104",
        referencePrice: "100",
        oracleObservedAt: "2026-08-14T10:00:00Z",
        session: "unknown",
        corporateAction: {
          state: "effective",
          description: "Synthetic split example",
        },
      },
    ],
  };
}

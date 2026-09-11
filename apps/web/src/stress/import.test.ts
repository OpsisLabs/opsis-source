import { describe, expect, it } from "vitest";
import type { PortfolioSnapshot } from "@rh-chain/shared";
import type {
  VaultAsset,
  VaultCollectibleReference,
  VaultLot,
  VaultPortfolioContext,
} from "../vault/types";
import {
  candidateValue,
  extractImportCandidates,
  isStaleDate,
  normalizeReferenceDate,
  referenceCents,
  resolveCandidate,
} from "./import";

const NOW = new Date("2026-09-11T00:00:00Z");

function lot(quantity: string, unitPrice = "1", currency = "USD"): VaultLot {
  return {
    id: `lot-${quantity}`,
    quantity,
    unitPrice,
    currency,
    acquiredAt: "2026-01-01",
  };
}

function reference(
  value: string,
  currency = "USD",
  observedAt = "2026-05-01",
): VaultCollectibleReference {
  return {
    id: `ref-${value}-${currency}-${observedAt}`,
    value,
    currency,
    observedAt,
    sourceUrl: "https://example.com/ref",
    label: "Saved reference",
  };
}

function asset(overrides: Partial<VaultAsset> = {}): VaultAsset {
  return {
    id: "asset-1",
    name: "Saved Card",
    assetType: "collectible",
    identifier: "tcgdex:en:base1-4",
    lots: [lot("1")],
    notes: "",
    collectible: {
      catalog: null,
      ownerPrinting: "",
      condition: "unknown",
      grader: "ungraded",
      grade: "",
      certificate: "",
      photoSource: null,
      photoAddedAt: null,
      references: [reference("500.00")],
    },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function portfolio(
  overrides: Partial<VaultPortfolioContext> = {},
): VaultPortfolioContext {
  return {
    id: "portfolio-1",
    kind: "portfolio-context",
    address: "0xabc",
    label: "Wallet",
    valuations: [],
    latestSnapshot: null,
    receipts: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function snapshot(tokens: Array<{ contract: string; quantity: string }>) {
  return {
    nativeBalanceEth: "0",
    tokens: tokens.map((token) => ({
      contract: token.contract,
      quantity: token.quantity,
    })),
    nfts: [],
  } as unknown as PortfolioSnapshot;
}

describe("Vault import extraction", () => {
  it("imports a saved USD reference as a total only when there is exactly one unit", () => {
    const candidates = extractImportCandidates([asset()], [], NOW);
    expect(candidates[0].status).toBe("available");
    expect(candidates[0].cents).toBe(50_000n);
    expect(candidates[0].sourceKind).toBe("reference");
    expect(candidates[0].observedAt).toBe("2026-05-01");
  });

  it("never treats a per-unit reference as a position total", () => {
    const candidates = extractImportCandidates(
      [asset({ lots: [lot("10")] })],
      [],
      NOW,
    );
    expect(candidates[0].status).toBe("needs-value");
    expect(candidates[0].reason).toBe("unitValue");
    expect(candidates[0].cents).toBeNull();
    expect(candidates[0].cents).not.toBe(2_500n);
    expect(candidates[0].cents).not.toBe(25_000n);
  });

  it("does not treat acquisition cost as current value", () => {
    const candidates = extractImportCandidates(
      [
        asset({
          collectible: {
            ...asset().collectible!,
            references: [],
          },
          lots: [lot("2", "1234.56")],
        }),
      ],
      [],
      NOW,
    );
    expect(candidates[0].status).toBe("needs-value");
    expect(candidates[0].reason).toBe("purchaseCostOnly");
    expect(candidates[0].cents).toBeNull();
  });

  it("keeps foreign currency and missing references out of USD", () => {
    const foreign = extractImportCandidates(
      [
        asset({
          collectible: {
            ...asset().collectible!,
            references: [reference("900.00", "EUR")],
          },
        }),
      ],
      [],
      NOW,
    );
    expect(foreign[0].status).toBe("needs-value");
    expect(foreign[0].reason).toBe("foreignCurrency");
    expect(foreign[0].cents).toBeNull();
    expect(foreign[0].currency).toBeNull();

    const missing = extractImportCandidates(
      [
        asset({
          lots: [],
          collectible: { ...asset().collectible!, references: [] },
        }),
      ],
      [],
      NOW,
    );
    expect(missing[0].reason).toBe("missingReference");
    expect(missing[0].cents).toBeNull();
  });

  it("treats ISO timestamps as dates and rejects future observations", () => {
    expect(normalizeReferenceDate("2026-05-01T12:34:56.000Z", NOW)).toEqual({
      date: "2026-05-01",
      reason: null,
    });
    expect(normalizeReferenceDate("2026-10-01", NOW)).toEqual({
      date: null,
      reason: "futureDate",
    });
    expect(normalizeReferenceDate("", NOW)).toEqual({
      date: null,
      reason: "missingDate",
    });
    const future = extractImportCandidates(
      [
        asset({
          collectible: {
            ...asset().collectible!,
            references: [reference("500.00", "USD", "2026-10-01")],
          },
        }),
      ],
      [],
      NOW,
    );
    expect(future[0].reason).toBe("futureDate");
    expect(future[0].cents).toBeNull();
  });

  it("flags stale dates and parses exact reference cents", () => {
    expect(isStaleDate("2024-01-01", NOW)).toBe(true);
    expect(isStaleDate("2026-08-01", NOW)).toBe(false);
    expect(referenceCents("1234.560000000000000001")).toBe(123_456n);
    expect(referenceCents("0.005")).toBe(1n);
    expect(referenceCents("1,000")).toBeNull();
    const stale = extractImportCandidates(
      [
        asset({
          collectible: {
            ...asset().collectible!,
            references: [reference("500.00", "USD", "2024-01-01")],
          },
        }),
      ],
      [],
      NOW,
    );
    expect(stale[0].status).toBe("available");
    expect(stale[0].stale).toBe(true);
  });

  it("imports a unit valuation only after matching quantity exactly", () => {
    const matched = extractImportCandidates(
      [
        asset({
          id: "asset-1",
          identifier: "0xabc",
          lots: [lot("10")],
          collectible: { ...asset().collectible!, references: [] },
        }),
      ],
      [
        portfolio({
          valuations: [
            {
              id: "val-1",
              assetKey: "token:0xabc",
              unitPrice: "25",
              currency: "USD",
              updatedAt: "2026-05-01T00:00:00Z",
            },
          ],
          latestSnapshot: snapshot([{ contract: "0xabc", quantity: "10" }]),
        }),
      ],
      NOW,
    );
    expect(matched[0].status).toBe("available");
    expect(matched[0].cents).toBe(25_000n);

    const mismatch = extractImportCandidates(
      [
        asset({
          id: "asset-1",
          identifier: "0xabc",
          lots: [lot("10")],
          collectible: { ...asset().collectible!, references: [] },
        }),
      ],
      [
        portfolio({
          valuations: [
            {
              id: "val-1",
              assetKey: "token:0xabc",
              unitPrice: "25",
              currency: "USD",
              updatedAt: "2026-05-01T00:00:00Z",
            },
          ],
          latestSnapshot: snapshot([{ contract: "0xabc", quantity: "9" }]),
        }),
      ],
      NOW,
    );
    expect(mismatch[0].status).toBe("needs-value");
    expect(mismatch[0].reason).toBe("quantityMismatch");
    expect(mismatch[0].cents).toBeNull();
  });

  it("requires a confirmed total and date for manual candidates", () => {
    const candidate = extractImportCandidates(
      [asset({ lots: [lot("10")] })],
      [],
      NOW,
    )[0];
    expect(resolveCandidate(candidate, { value: "", date: "" }, NOW).status).toBe(
      "needs-value",
    );
    expect(
      resolveCandidate(candidate, { value: "250", date: "" }, NOW).reason,
    ).toBe("missingDate");
    expect(
      resolveCandidate(candidate, { value: "250", date: "2026-10-01" }, NOW)
        .reason,
    ).toBe("futureDate");
    const resolved = resolveCandidate(
      candidate,
      { value: "250.00", date: "2026-06-01" },
      NOW,
    );
    expect(resolved.status).toBe("available");
    expect(resolved.cents).toBe(25_000n);
    expect(resolved.sourceKind).toBe("manual");
    expect(resolved.observedAt).toBe("2026-06-01");
  });

  it("flags saved totals above the per-position limit locally", () => {
    const huge = extractImportCandidates(
      [
        asset({
          collectible: {
            ...asset().collectible!,
            references: [reference("1000000001.00")],
          },
        }),
      ],
      [],
      NOW,
    );
    expect(huge[0].status).toBe("needs-value");
    expect(huge[0].reason).toBe("overLimit");
    expect(huge[0].cents).toBeNull();

    const candidate = extractImportCandidates(
      [asset({ lots: [lot("10")] })],
      [],
      NOW,
    )[0];
    const manual = resolveCandidate(
      candidate,
      { value: "1000000001", date: "2026-06-01" },
      NOW,
    );
    expect(manual.status).toBe("needs-value");
    expect(manual.reason).toBe("overLimit");
    expect(manual.cents).toBeNull();

    const atMax = extractImportCandidates(
      [
        asset({
          collectible: {
            ...asset().collectible!,
            references: [reference("1000000000.00")],
          },
        }),
      ],
      [],
      NOW,
    );
    expect(atMax[0].status).toBe("available");
    expect(atMax[0].cents).toBe(100_000_000_000n);
    expect(() => candidateValue(atMax[0])).not.toThrow();
    expect(() =>
      candidateValue({ ...atMax[0], cents: 100_000_000_001n }),
    ).toThrow("value");
  });

  it("never reports a missing value as zero", () => {
    const candidates = extractImportCandidates(
      [
        asset({ collectible: { ...asset().collectible!, references: [] }, lots: [] }),
        asset({
          id: "asset-2",
          lots: [lot("10")],
        }),
        asset({
          id: "asset-3",
          collectible: {
            ...asset().collectible!,
            references: [reference("900.00", "EUR")],
          },
        }),
      ],
      [],
      NOW,
    );
    for (const candidate of candidates) {
      expect(candidate.status).toBe("needs-value");
      expect(candidate.cents).toBeNull();
    }
  });
});

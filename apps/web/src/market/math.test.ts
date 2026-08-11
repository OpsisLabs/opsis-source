import { describe, expect, it } from "vitest";
import type { VaultMarketComparison } from "../vault/types";
import { buildMarketHandoffs, calculateLandedCosts } from "./math";

describe("landed-cost comparison", () => {
  it("uses exact decimal math and ranks only complete comparable rows", () => {
    const first = comparison("00000000-0000-4000-8000-000000000001", {
      itemUnitPrice: "100.123456789123456789",
      quantity: "2",
      shipping: "4",
      tax: "1.25",
      duty: "0",
      fees: "0.5",
      discount: "1",
    });
    const second = comparison("00000000-0000-4000-8000-000000000002", {
      itemUnitPrice: "105",
      quantity: "2",
      shipping: "0",
      tax: "0",
      duty: "0",
      fees: "0",
      discount: "0",
    });
    const rows = calculateLandedCosts(
      [second, first],
      new Set([first.id, second.id]),
    );
    expect(
      rows.map((row) => [row.comparison.id, row.landedTotal, row.rank]),
    ).toEqual([
      [first.id, "204.996913578246913578", 1],
      [second.id, "210", 2],
    ]);
  });

  it("treats blanks as unknown, explicit zero as known, and rejects negative totals", () => {
    const missing = comparison("00000000-0000-4000-8000-000000000001", {
      shipping: "",
    });
    const discounted = comparison("00000000-0000-4000-8000-000000000002", {
      itemUnitPrice: "1",
      discount: "2",
    });
    const rows = calculateLandedCosts(
      [missing, discounted],
      new Set([missing.id, discounted.id]),
    );
    expect(rows[0]?.unavailableReason).toMatch(/explicit zero/i);
    expect(rows[1]?.unavailableReason).toMatch(/Discount exceeds/i);
  });

  it("refuses candidates, stale rows, unavailable stock, and different condition/currency groups", () => {
    const candidate = comparison("00000000-0000-4000-8000-000000000001", {
      identityConfidence: "candidate",
    });
    const stale = comparison("00000000-0000-4000-8000-000000000002");
    const unavailable = comparison("00000000-0000-4000-8000-000000000003", {
      inventoryState: "provider_unavailable",
    });
    const eur = comparison("00000000-0000-4000-8000-000000000004", {
      currency: "EUR",
    });
    const used = comparison("00000000-0000-4000-8000-000000000005", {
      condition: "Played",
    });
    const rows = calculateLandedCosts(
      [candidate, stale, unavailable, eur, used],
      new Set([candidate.id, unavailable.id, eur.id, used.id]),
    );
    expect(rows.filter((row) => row.rankable).map((row) => row.rank)).toEqual([
      1, 1,
    ]);
    expect(
      rows.find((row) => row.comparison.id === candidate.id)?.unavailableReason,
    ).toMatch(/candidate/i);
    expect(
      rows.find((row) => row.comparison.id === stale.id)?.unavailableReason,
    ).toMatch(/stale/i);
    expect(
      rows.find((row) => row.comparison.id === unavailable.id)
        ?.unavailableReason,
    ).toMatch(/Availability/i);
  });

  it("assigns tied totals the same rank deterministically", () => {
    const first = comparison("00000000-0000-4000-8000-000000000002");
    const second = comparison("00000000-0000-4000-8000-000000000001");
    const rows = calculateLandedCosts(
      [first, second],
      new Set([first.id, second.id]),
    );
    expect(rows.map((row) => [row.comparison.id, row.rank])).toEqual([
      [second.id, 1],
      [first.id, 1],
    ]);
  });

  it("never ranks different quantities or destination regions against each other", () => {
    const oneCanada = comparison("00000000-0000-4000-8000-000000000001");
    const tenCanada = comparison("00000000-0000-4000-8000-000000000002", {
      quantity: "10",
    });
    const oneUs = comparison("00000000-0000-4000-8000-000000000003", {
      region: "United States",
    });
    const rows = calculateLandedCosts(
      [oneCanada, tenCanada, oneUs],
      new Set([oneCanada.id, tenCanada.id, oneUs.id]),
    );
    expect(new Set(rows.map((row) => row.comparisonGroup)).size).toBe(3);
    expect(rows.map((row) => row.rank)).toEqual([1, 1, 1]);
  });

  it("keeps delimiter-bearing identity and condition tuples in separate groups", () => {
    const identityDelimiter = comparison(
      "00000000-0000-4000-8000-000000000001",
      {
        canonicalAssetId: "a|b",
        condition: "c",
        itemUnitPrice: "100",
      },
    );
    const conditionDelimiter = comparison(
      "00000000-0000-4000-8000-000000000002",
      {
        canonicalAssetId: "a",
        condition: "b|c",
        itemUnitPrice: "50",
      },
    );
    const rows = calculateLandedCosts(
      [identityDelimiter, conditionDelimiter],
      new Set([identityDelimiter.id, conditionDelimiter.id]),
    );
    expect(new Set(rows.map((row) => row.comparisonGroup)).size).toBe(2);
    expect(rows.map((row) => row.rank)).toEqual([1, 1]);
  });

  it("preserves a 78-integer plus 78-fraction per-unit value without floating-point loss", () => {
    const exact = `${"9".repeat(78)}.${"8".repeat(78)}`;
    const row = calculateLandedCosts(
      [
        comparison("00000000-0000-4000-8000-000000000001", {
          itemUnitPrice: exact,
        }),
      ],
      new Set(["00000000-0000-4000-8000-000000000001"]),
    )[0];
    expect(row?.landedTotal).toBe(exact);
    expect(row?.rank).toBe(1);
  });

  it("builds click-only encoded handoffs without private fields or affiliate tags", () => {
    const links = buildMarketHandoffs("Charizard", "Base Set", "4");
    expect(links).toHaveLength(3);
    expect(
      links.every(
        (link) => link.liveData === false && link.url.startsWith("https://"),
      ),
    ).toBe(true);
    expect(links.map((link) => link.query)).toEqual(
      Array(3).fill("Charizard Base Set #4"),
    );
    expect(JSON.stringify(links)).not.toMatch(/cert|notes|affiliate|utm_/i);
  });
});

function comparison(
  id: string,
  overrides: Partial<VaultMarketComparison> = {},
): VaultMarketComparison {
  return {
    id,
    canonicalAssetId: "tcgdex:en:base1-4",
    label: "Offer",
    sourceKind: "owner_entered",
    identityConfidence: "owner_linked",
    merchantMapping: null,
    providerName: "Owner-entered source",
    sourceUrl: "https://example.com/offer",
    observedAt: "2026-08-11T12:00:00.000Z",
    freshForMs: 86_400_000,
    currency: "USD",
    itemUnitPrice: "100",
    quantity: "1",
    shipping: "0",
    tax: "0",
    duty: "0",
    fees: "0",
    discount: "0",
    inventoryState: "owner_available",
    condition: "Near mint",
    region: "Canada",
    returnNotes: "Owner-entered",
    createdAt: "2026-08-11T12:00:00.000Z",
    updatedAt: "2026-08-11T12:00:00.000Z",
    ...overrides,
  };
}

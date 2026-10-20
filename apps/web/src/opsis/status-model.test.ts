import { describe, expect, it } from "vitest";
import type { Capabilities } from "./model";
import {
  capabilityAvailability,
  capabilityCheckedAt,
  capabilityRows,
} from "./status-model";
import { DIRECTORY_CHECKED_AT, REVIEW_AFTER_DAYS } from "./perp-venues";

const capabilities: Capabilities = {
  expiresAt: "2026-10-19T12:00:00Z",
  chainId: 4663,
  research: true,
  tokenControls: false,
  exitCheck: true,
  watch: true,
  rwa: false,
  observedTrades: true,
  perpExecution: false,
};

describe("capability registry evidence", () => {
  it("never treats configured remote reads or local records as observed provider health", () => {
    const rows = capabilityRows(capabilities);
    expect(rows[0].id).toBe("research");
    expect(rows).toHaveLength(14);
    expect(rows.find(row => row.id === "claimCheck")?.enabled).toBe(false);
    expect(rows.find(row => row.id === "openDataSql")?.enabled).toBe(false);
    expect(rows.find((row) => row.id === "launchCards")?.enabled).toBe(false);
    expect(rows.find(row => row.id === "linkedWallets")?.enabled).toBe(false);
    for (const row of rows)
      expect(capabilityAvailability(row)).toBe(
        row.enabled ? "unknown" : "not-enabled",
      );
    expect(
      capabilityAvailability({ id: "savedCheckComparisons", enabled: true }),
    ).toBe("unknown");
    expect(
      rows.find((row) => row.id === "savedCheckComparisons")?.enabled,
    ).toBe(false);
    expect(rows.some((row) => String(row.id) === "perpExecution")).toBe(false);
  });

  it("preserves exact manifest scope, timestamps, limits, coverage and flags", () => {
    const rows = capabilityRows(capabilities).map((row) => ({
      ...row,
      scope: "Exact server scope",
      origin: "captured 2026-10-10",
      coverage: "partial",
      limits: "Bounded source evidence",
    }));
    const result = capabilityRows({
      ...capabilities,
      manifest: {
        version: 1,
        chain: { id: 4663, name: "Robinhood Chain" },
        build: null,
        capabilities: rows,
      },
    });
    expect(result).toBe(rows);
    expect(result[0]).toMatchObject({
      scope: "Exact server scope",
      origin: "captured 2026-10-10",
      coverage: "partial",
    });
    expect(capabilityCheckedAt("research")).toBeNull();
  });

  it("dates only the documented static directory and marks its review stale without inferring trading access", () => {
    const reviewed = Date.parse(`${DIRECTORY_CHECKED_AT}T00:00:00Z`);
    const row = { id: "perpHandoff", enabled: true } as const;
    expect(capabilityCheckedAt(row.id)).toBe(DIRECTORY_CHECKED_AT);
    expect(
      capabilityAvailability(
        row,
        new Date(reviewed + REVIEW_AFTER_DAYS * 86400000),
      ),
    ).toBe("available");
    expect(
      capabilityAvailability(
        row,
        new Date(reviewed + REVIEW_AFTER_DAYS * 86400000 + 1),
      ),
    ).toBe("stale");
    expect(
      capabilityAvailability({ ...row, enabled: false }, new Date("invalid")),
    ).toBe("not-enabled");
    expect(capabilityAvailability(row, new Date("invalid"))).toBe("stale");
  });
});

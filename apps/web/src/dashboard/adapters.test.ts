import { describe, expect, it } from "vitest";
import { deriveCard } from "./adapters";

describe("answer-card coverage", () => {
  it("labels reviewed-contract results as a limited sample, not total holdings", () => {
    const card = deriveCard({ tokenBalanceCoverage: "reviewed_asset_sample", tokenBalanceContractsChecked: 12, tokenBalances: [] }, "wallet", "0x42");
    expect(card.stats).toContainEqual({ label: "Sample matches", value: "0", tone: "warn" });
    expect(card.stats.some((stat) => stat.label === "Token balances")).toBe(false);
    expect(card.badges).toContainEqual({ label: "LIMITED SAMPLE · 12 CONTRACTS CHECKED", tone: "warn" });
  });
  it("renders unavailable provider sections instead of invented zero counts", () => {
    const card = deriveCard({
      address: "0x0000000000000000000000000000000000000042",
      nativeBalanceEth: "0.25",
      activityCoverage: "unavailable",
      tokenBalanceCoverage: "unavailable"
    }, "wallet", "0x0000000000000000000000000000000000000042");

    expect(card.stats).toEqual([
      { label: "Balance", value: "0.25 ETH", tone: undefined },
      { label: "Token balances", value: "Unavailable", tone: "warn" },
      { label: "Activity", value: "Unavailable", tone: "warn" }
    ]);
  });
});

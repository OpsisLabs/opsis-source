import { describe, expect, it } from "vitest";
import { deriveCard } from "./adapters";

describe("answer-card coverage", () => {
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

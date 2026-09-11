import { describe, expect, it } from "vitest";
import { adaptAnswer, deriveCard, safeHttpUrl } from "./adapters";

const address = "0x0000000000000000000000000000000000000042";

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

describe("provider URL safety", () => {
  it("renders only http(s) links and never an executable scheme", () => {
    expect(safeHttpUrl("https://example.test/a")).toBe("https://example.test/a");
    expect(safeHttpUrl("http://example.test/a")).toBe("http://example.test/a");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });

  it("drops unsafe citation URLs instead of placing them in an href", () => {
    const answer = adaptAnswer({
      answer: "A deterministic answer.",
      facts: { address },
      citations: [{
        id: "source-1",
        provider: "blockscout",
        url: "javascript:alert(1)",
        fetchedAt: "2026-08-10T00:00:00.000Z",
        fieldsUsed: ["nativeBalanceEth"]
      }]
    }, { type: "wallet", id: address });

    expect(answer.citations[0]?.url).toBeNull();
  });

  it("falls back to a safe citation URL when the explorer URL is unsafe", () => {
    const answer = adaptAnswer({
      answer: "A deterministic answer.",
      facts: { address, explorerUrl: "javascript:alert(1)" },
      citations: [{
        id: "source-1",
        provider: "blockscout",
        url: "https://robinhoodchain.blockscout.com/address/0x42",
        fetchedAt: "2026-08-10T00:00:00.000Z",
        fieldsUsed: ["nativeBalanceEth"]
      }]
    }, { type: "wallet", id: address });

    expect(answer.citations[0]?.url).toBe("https://robinhoodchain.blockscout.com/address/0x42");
  });
});

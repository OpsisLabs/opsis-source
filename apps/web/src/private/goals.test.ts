import { describe, expect, it } from "vitest";
import { goalsForEntity } from "./goals";

describe("explorer goal chips", () => {
  it("offers holdings, activity and a plain explanation for wallets", () => {
    for (const type of ["wallet", "unknown", "block"] as const) {
      expect(goalsForEntity(type).map((goal) => goal.task)).toEqual([
        "holdings",
        "activity",
        "explain",
        "risk",
        "evidence",
      ]);
    }
  });

  it("offers movement, success and fee goals for transactions", () => {
    expect(goalsForEntity("transaction").map((goal) => goal.task)).toEqual([
      "moved",
      "success",
      "fees",
      "evidence",
    ]);
  });

  it("offers identity and verification goals for a resolved token", () => {
    expect(goalsForEntity("token").map((goal) => goal.task)).toEqual([
      "token",
      "verify",
      "risk",
      "evidence",
    ]);
  });

  it("offers generic, non-ownership goals for a resolved contract", () => {
    expect(goalsForEntity("contract").map((goal) => goal.task)).toEqual([
      "explain",
      "risk",
      "evidence",
    ]);
    expect(goalsForEntity("contract").map((goal) => goal.task)).not.toContain("holdings");
  });

  it("never offers a transaction-only goal to an address or token", () => {
    expect(goalsForEntity("wallet").map((goal) => goal.task)).not.toContain("fees");
    expect(goalsForEntity("contract").map((goal) => goal.task)).not.toContain("moved");
    expect(goalsForEntity("token").map((goal) => goal.task)).not.toContain("holdings");
  });
});

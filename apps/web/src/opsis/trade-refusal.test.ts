import { describe, expect, it } from "vitest";
import { tradeRefusal, tradeRefusalCopy } from "./trade-refusal";

describe("trade refusal copy", () => {
  it("maps the named refusal codes in both languages", () => {
    for (const code of ["EXIT_CHECK_INVALID_TOKEN", "EXIT_CHECK_DAILY_BUDGET_EXCEEDED", "EXIT_CHECK_BUDGET_UNAVAILABLE", "EXIT_CHECK_PROVIDER_UNAVAILABLE", "EXIT_CHECK_RATE_LIMITED"]) {
      const copy = tradeRefusalCopy({ code, status: 503 });
      expect(copy[0]).not.toContain("The request failed");
      expect(copy[1]).not.toContain("请求失败");
    }
  });
  it("explains the hourly limit and gives the wait only when the server stated one", () => {
    expect(tradeRefusalCopy({ code: "RATE_LIMITED", status: 429, retryAfter: 60 })[0]).toContain("about 60 seconds");
    expect(tradeRefusalCopy({ code: "", status: 429, retryAfter: 3257 })[0]).toContain("about 55 minutes");
    expect(tradeRefusalCopy({ code: "", status: 429, retryAfter: 3257 })[1]).toContain("约 55 分钟");
    expect(tradeRefusalCopy({ code: "", status: 429 })[0]).toContain("Wait a little");
    expect(tradeRefusal({ code: "X", status: 429, retryAfter: "60" })).toEqual({ code: "X", status: 429 });
    expect(tradeRefusal({ code: "X", status: 429, retryAfter: Number.NaN })).toEqual({ code: "X", status: 429 });
  });
  it("keeps unexpected errors generic", () => {
    expect(tradeRefusal(null)).toEqual({ code: "", status: 0 });
    expect(tradeRefusalCopy(tradeRefusal(new Error("untrusted provider text")))[0]).toContain("The request failed");
  });
});

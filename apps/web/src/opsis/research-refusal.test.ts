import { describe, expect, it } from "vitest";
import { ApiError } from "../dashboard/http";
import { researchRefusal, researchRefusalCopy } from "./research-refusal";

describe("Research refusal copy", () => {
  it("keeps only the code, status and a valid server wait", () => {
    expect(researchRefusal(new ApiError("RATE_LIMITED", "server detail", 429, 60))).toEqual({ code: "RATE_LIMITED", status: 429, retryAfter: 60 });
    for (const retryAfter of [undefined, "60", NaN, Infinity, -1, 0]) {
      expect(researchRefusal({ code: "RATE_LIMITED", status: 429, retryAfter, message: "server detail" })).toEqual({ code: "RATE_LIMITED", status: 429 });
    }
    expect(researchRefusal(null)).toEqual({ code: "", status: 0 });
  });
  it.each([
    [undefined, "This connection has reached its hourly limit for lookups.", "此连接已达到每小时查询次数上限。"],
    [60, "Try again in about 60 seconds.", "请在约 60 秒后重试。"],
    [89.5, "Try again in about 90 seconds.", "请在约 90 秒后重试。"],
    [90, "Try again in about 2 minutes.", "请在约 2 分钟后重试。"],
    [3257, "Try again in about 55 minutes.", "请在约 55 分钟后重试。"],
  ])("explains the hourly limit and server wait (%s)", (retryAfter, en, zh) => {
    const copy = researchRefusalCopy({ code: "RATE_LIMITED", status: 429, retryAfter });
    expect(copy[0]).toContain(en);
    expect(copy[1]).toContain(zh);
    if (retryAfter === undefined) {
      expect(copy[0]).not.toMatch(/seconds|minutes/);
      expect(copy[1]).not.toMatch(/秒|分钟/);
    }
  });
  it.each(["PROVIDER_UNAVAILABLE", "PROVIDER_BUDGET_EXCEEDED", "PROVIDER_MONTHLY_BUDGET_EXCEEDED", "PROVIDER_GLOBAL_BUDGET_EXCEEDED", "PROVIDER_GLOBAL_BUDGET_UNAVAILABLE", "PROVIDER_GLOBAL_BUDGET_UNMETERED", "PROVIDER_SPEND_GUARD_UNAVAILABLE", "PROVIDER_HTTP_429", "PROVIDER_HTTP_503", "PROVIDER_CIRCUIT_OPEN", "PROVIDER_TIMEOUT", "PROVIDER_NETWORK_ERROR", "PROVIDER_MALFORMED_RESPONSE"])("explains the chain-data refusal %s in both languages", (code) => {
    expect(researchRefusalCopy({ code, status: 503 })).toEqual([
      "Opsis has reached its chain-data rate for the moment. Nothing is wrong with the identifier. Try again in a minute.",
      "Opsis 暂时达到链上数据速率上限。标识符没有问题。请在一分钟后重试。",
    ]);
  });
  it.each([{ code: "", status: 400 }, { code: "VALIDATION_ERROR", status: 422 }, { code: "INVALID_ENTITY", status: 422 }])("explains an invalid identifier (%s)", (error) => {
    expect(researchRefusalCopy(error)).toEqual([
      "The identifier was not accepted. Check that it is a full 0x address or transaction hash.",
      "标识符未被接受。请检查它是否为完整的 0x 地址或交易哈希。",
    ]);
  });
  it.each([{ code: "UNEXPECTED", status: 503 }, { code: "PROVIDER_UNAVAILABLE", status: 500 }, researchRefusal(new Error("private server text"))])("keeps other failures generic without server text (%s)", (error) => {
    expect(researchRefusalCopy(error)).toEqual([
      "The lookup failed or reached a provider limit. Check the identifier and retry.",
      "查询失败或达到提供商限制。请检查标识符后重试。",
    ]);
  });
});

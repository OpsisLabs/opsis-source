import { afterEach, describe, expect, it, vi } from "vitest";
import { humanize, privateApi } from "./http";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("portfolio API errors", () => {
  it("describes an in-flight current-anchor reorg without claiming finality", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: "SNAPSHOT_REORGED", message: "snapshot changed" }
    }), {
      status: 409,
      headers: { "content-type": "application/json" }
    })));

    await expect(privateApi("/v1/private/portfolio/snapshot", { address: "0x0" })).rejects.toMatchObject({
      code: "SNAPSHOT_REORGED",
      message: "The current block anchor changed during verification. Nothing was saved; refresh again."
    });
  });
});

describe("catalog failure copy", () => {
  it.each([
    ["COLLECTIBLE_CATALOG_DISABLED", "paused"],
    ["COLLECTIBLE_DAILY_BUDGET_EXCEEDED", "budget"],
    ["COLLECTIBLE_BUDGET_UNAVAILABLE", "safety guard"],
    ["COLLECTIBLE_REQUEST_LIMIT_EXCEEDED", "request limit"],
    ["COLLECTIBLE_PROVIDER_RATE_LIMITED", "rate-limited"],
    ["COLLECTIBLE_PROVIDER_UNAVAILABLE", "temporarily unavailable"],
    ["COLLECTIBLE_PROVIDER_MALFORMED", "could not verify safely"],
    ["COLLECTIBLE_NOT_FOUND", "not found"]
  ])("keeps %s explicit", (code, expected) => {
    expect(humanize(code, "provider detail", 503).toLowerCase()).toContain(expected);
  });
});

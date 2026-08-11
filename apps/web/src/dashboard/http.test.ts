import { afterEach, describe, expect, it, vi } from "vitest";
import { privateApi } from "./http";

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

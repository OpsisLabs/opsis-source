import { describe, expect, it, vi } from "vitest";
import { GoldRushProvider } from "../src/chain/goldrush.js";
import { loadEnv } from "../src/config/env.js";
import type { ProviderHttp } from "../src/chain/provider-http.js";

describe("GoldRush feature flag", () => {
  it("does not call GoldRush while disabled", async () => {
    const http: ProviderHttp = { requestJson: vi.fn() };
    const provider = new GoldRushProvider(loadEnv({ NODE_ENV: "test" }), http);

    await expect(provider.getAddressSummary("0x0000000000000000000000000000000000000001")).resolves.toEqual([]);
    expect(http.requestJson).not.toHaveBeenCalled();
  });

  it("fetches enriched wallet sources without persisting the API key", async () => {
    const requestJson = vi.fn(async () => ({ data: { items: [] } }));
    const provider = new GoldRushProvider(loadEnv({
      NODE_ENV: "test",
      GOLDRUSH_ENABLED: "true",
      GOLDRUSH_API_KEY: "secret-key"
    }), { requestJson });

    const sources = await provider.getAddressSummary("0x0000000000000000000000000000000000000001");

    expect(sources).toHaveLength(3);
    expect(requestJson).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(sources)).not.toContain("secret-key");
    expect(requestJson.mock.calls.every(([url]) => url.includes("key=secret-key"))).toBe(true);
  });
});

import { afterEach, expect, it } from "vitest";
import { dealPreviewAuthorization, setDealPreviewToken } from "./preview-token";
afterEach(() => setDealPreviewToken(""));
it("attaches the test credential only to exact Deal Finder API paths", () => {
  setDealPreviewToken("test");
  expect(dealPreviewAuthorization("/v1/private/deals/benchmark")).toBe("Preview test");
  for (const path of ["/v1/private/analyze", "https://evil.test/v1/private/deals/", "/v1/private/deals-evil/", "/v1/auth/login"]) expect(dealPreviewAuthorization(path)).toBeUndefined();
  setDealPreviewToken(""); expect(dealPreviewAuthorization("/v1/private/deals/access")).toBeUndefined();
});

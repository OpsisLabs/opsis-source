import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { canonicalize } from "@rh-chain/shared";
import I18nProvider from "../i18n/I18nProvider";
import ReceiptVerify from "./ReceiptVerify";
import { ReceiptDownload } from "./ReceiptDownload";
import { verifyBrowserReceipt } from "./receipt-verification";
import { receiptFixture } from "./receipt-test-fixtures";

afterEach(() => vi.unstubAllGlobals());
describe("browser-local receipt verification", () => {
  it("off or missing capability renders nothing and sends no request", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const capabilities of [{ receipts: false }, {}]) {
      const html = renderToStaticMarkup(<I18nProvider><ReceiptVerify capabilities={capabilities} /></I18nProvider>);
      expect(html).toBe(""); expect(html).not.toContain("textarea"); expect(html).not.toContain("Verify a receipt");
    }
    await expect(verifyBrowserReceipt("private fixture content", false)).rejects.toThrow("unavailable"); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["tokenControls", "stock-desk", "claimCheck"])("verifies %s with all shared checks and only a GET for published keys", async (tool) => {
    const { text, keys } = await receiptFixture(tool);
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(keys))); vi.stubGlobal("fetch", fetcher);
    const result = await verifyBrowserReceipt(text, true);
    expect(result).toMatchObject({ valid: true, schema: true, canonical: true, signature: true, keyValidity: true, merkle: true, timestamp: "pending" });
    expect(result.receipt?.tool).toBe(tool);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!; expect(url).toBe("/v1/private/opsis/receipts/keys"); expect(init).toMatchObject({ method: "GET", credentials: "omit", cache: "no-store" });
    expect(init.body).toBeUndefined(); expect(JSON.stringify(fetcher.mock.calls)).not.toContain("12345678901234567890");
  });
  it("fails tampering locally and makes no provider or timestamp request", async () => {
    const { receipt, keys } = await receiptFixture(); receipt.outputs = { state: "observed" };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(keys))); vi.stubGlobal("fetch", fetcher);
    expect((await verifyBrowserReceipt(canonicalize(receipt), true)).valid).toBe(false); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("refuses unavailable or malformed key lists, oversized files", async () => {
    const { text } = await receiptFixture(); const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 404 })); vi.stubGlobal("fetch", fetcher);
    await expect(verifyBrowserReceipt(text, true)).rejects.toThrow("keys unavailable");
    fetcher.mockResolvedValue(new Response("{}")); await expect(verifyBrowserReceipt(text, true)).rejects.toThrow();
    fetcher.mockClear(); await expect(verifyBrowserReceipt("x".repeat(2_000_001), true)).rejects.toThrow("too large"); expect(fetcher).not.toHaveBeenCalled();
  });
  it("renders enabled input and reusable download control", async () => {
    const { receipt } = await receiptFixture();
    const html = renderToStaticMarkup(<I18nProvider><ReceiptVerify capabilities={{ receipts: true }} /><ReceiptDownload receipt={receipt} /></I18nProvider>);
    expect(html).toContain("textarea"); expect(html).toContain('type="file"'); expect(html).toContain("not that a conclusion is right"); expect(html).toContain("Download receipt");
  });
});

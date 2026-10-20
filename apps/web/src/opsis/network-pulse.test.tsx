import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import I18nProvider from "../i18n/I18nProvider";
import * as localeCookie from "../i18n/locale";
import NetworkPulsePanel from "./NetworkPulsePanel";
import type { Capabilities } from "./model";
import { fetchNetworkPulse, networkPulseEnabled, NetworkPulseError, parseNetworkPulse, pulseReasons, shouldRefreshPulse } from "./network-pulse";

const known = <T,>(value: T) => ({ value, reason: null });
const unknown = { value: null, reason: "unavailable" };
const fixture = () => ({
  chainId: 4663, observedAt: "2026-10-20T12:00:00.000Z",
  source: { rpc: "drpc", feed: `0x${"ab".repeat(20)}` },
  latestBlock: known({ number: "9007199254740993", hash: `0x${"ab".repeat(32)}`, timestamp: "2026-10-20T11:59:58.000Z" }),
  latestAgeSeconds: known(2), safeBlock: unknown, safeLagBlocks: unknown, safeLagSeconds: unknown,
  gasPriceGwei: known("1.000000001"), ethUsd: known("2000.12345678"),
  ethUsdUpdatedAt: known("2026-10-20T11:59:55.000Z"), rpcLatencyMs: known(250),
});
const capabilities: Capabilities = {
  chainId: 4663, expiresAt: "2026-10-20T13:00:00.000Z", research: true,
  exitCheck: false, watch: false, rwa: false, observedTrades: false, perpExecution: false,
};
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("network pulse model", () => {
  it("retains exact integers, decimal units and explicit unknown reasons", () => {
    const pulse = parseNetworkPulse(fixture());
    expect(pulse.latestBlock.value?.number).toBe("9007199254740993");
    expect(pulse.gasPriceGwei.value).toBe("1.000000001");
    expect(pulse.safeBlock).toEqual(unknown);
    expect(pulse.safeLagBlocks.value).toBeNull();
    for (const copy of Object.values(pulseReasons)) expect(copy.every(text => text.length > 0)).toBe(true);
  });

  it("rejects malformed, cross-chain and unreasoned data instead of coercing it", () => {
    for (const change of [
      { chainId: 1 }, { observedAt: "invalid" }, { rpcLatencyMs: known(-1) },
      { safeLagBlocks: known(4) }, { ethUsd: known("0") }, { gasPriceGwei: known("1e9") },
      { safeBlock: { value: null, reason: null } }, { safeBlock: { value: null, reason: "private upstream detail" } },
      { source: { rpc: "another-provider", feed: "0x1234" } },
    ]) expect(() => parseNetworkPulse({ ...fixture(), ...change })).toThrow("Invalid pulse");
    expect(() => parseNetworkPulse(null)).toThrow();
  });

  it("fails closed for missing flags, missing manifest rows and mismatched rows", () => {
    expect(networkPulseEnabled(capabilities)).toBe(false);
    expect(networkPulseEnabled({ ...capabilities, networkPulse: true })).toBe(true);
    const manifest = { version: 1 as const, chain: { id: 4663 as const, name: "Robinhood Chain" }, build: null, capabilities: [] };
    expect(networkPulseEnabled({ ...capabilities, networkPulse: true, manifest })).toBe(false);
  });

  it("polls only when enabled, visible, idle and the 30-second or Retry-After window has passed", () => {
    expect(shouldRefreshPulse(true, true, false, 30_000, 30_000)).toBe(true);
    expect(shouldRefreshPulse(false, true, false, 0, 30_000)).toBe(false);
    expect(shouldRefreshPulse(true, false, false, 0, 30_000)).toBe(false);
    expect(shouldRefreshPulse(true, true, true, 0, 30_000)).toBe(false);
    expect(shouldRefreshPulse(true, true, false, 30_000, 29_999)).toBe(false);
    expect(shouldRefreshPulse(true, true, false, 90_000, 30_000)).toBe(false);
  });

  it("fetches only the network route without credentials, query data or storage", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture())));
    vi.stubGlobal("fetch", fetcher);
    const signal = new AbortController().signal;
    expect((await fetchNetworkPulse("", signal)).chainId).toBe(4663);
    expect(fetcher).toHaveBeenCalledWith(expect.stringMatching(/\/v1\/private\/opsis\/network-pulse$/), { credentials: "omit", cache: "no-store", signal, headers: {} });
    fetcher.mockResolvedValue(new Response(JSON.stringify(fixture())));
    await fetchNetworkPulse("a".repeat(64), signal);
    expect(fetcher.mock.calls[1][1].headers.authorization).toBe(`Preview ${"a".repeat(64)}`);
    fetcher.mockResolvedValue(new Response("", { status: 429, headers: { "retry-after": "90" } }));
    await expect(fetchNetworkPulse("", signal)).rejects.toMatchObject({ status: 429, retryAfter: 90 });
    expect(new NetworkPulseError(404, 30).message).not.toContain("private");
  });

  it.each(["en", "zh-CN"] as const)("renders bilingual enabled and disabled states (%s)", locale => {
    vi.spyOn(localeCookie, "readLocaleCookie").mockReturnValue(locale);
    const render = (enabled: boolean) => renderToStaticMarkup(<I18nProvider><NetworkPulsePanel capabilities={{ ...capabilities, networkPulse: enabled }} previewKey="" /></I18nProvider>);
    expect(render(false)).toContain(locale === "en" ? "Not enabled · server flag off" : "未启用 · 服务器标志已关闭");
    const html = render(true);
    expect(html).toContain(locale === "en" ? "Network now" : "网络现况");
    expect(html).toContain(locale === "en" ? "Unknown · not read yet" : "未知 · 尚未读取");
    expect(html).toContain(locale === "en" ? "30 seconds" : "30 秒");
    expect(html).not.toContain("localStorage");
  });
});

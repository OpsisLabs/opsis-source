import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import {
  extractClaims,
  stripPostIdentifiers,
  type Claim,
  type ClaimResponse,
  type Receipt,
} from "@rh-chain/shared";
import I18nProvider from "../i18n/I18nProvider";
import ClaimCheck, { ClaimResults } from "./ClaimCheck";
import { receiptFixture } from "./receipt-test-fixtures";
import * as localeCookie from "../i18n/locale";
import { addressConfirmed, claimInput, requestClaims } from "./claims-model";
import { unlockPreview } from "./model";
import { routeTitle, toolGroups } from "./shell-model";
import { chunks } from "./route-chunks";
import { statusDetails } from "./status-copy";
import { en } from "../i18n/dictionaries/en";
import { zhCN } from "../i18n/dictionaries/zh-CN";
const address = `0x${"1".repeat(40)}`;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("claim result receipts", () => {
  const result: ClaimResponse = {
    chainId: 4663,
    address,
    current: { block: null, results: [{ claim: { type: "ownership", expected: true }, definition: "ownership-v1", status: "can't check", wording: "Fixture observation unavailable", evidence: {}, reason: "FIXTURE_UNAVAILABLE" }] },
  };
  const render = (receipt: Receipt | undefined, receipts?: boolean) => renderToStaticMarkup(
    <I18nProvider><MemoryRouter><ClaimResults result={{ ...result, receipt }} receipts={receipts} /></MemoryRouter></I18nProvider>,
  );
  it.each(["en", "zh-CN"] as const)("offers a validated claim receipt and verifier link in %s", async (locale) => {
    vi.spyOn(localeCookie, "readLocaleCookie").mockReturnValue(locale);
    const { receipt } = await receiptFixture("claimCheck");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const html = render(receipt, true);
    expect(html).toContain(locale === "en" ? "Download receipt" : "下载凭据");
    expect(html).toContain('href="/verify"');
    expect(html).toContain(locale === "en" ? "Verify a receipt →" : "验证收据 →");
    expect(html).toContain(locale === "en" ? "It proves the computation, not that a conclusion is right." : "它证明计算过程，而不证明结论正确。");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("hides absent or malformed receipts and disabled capability without losing claim results", async () => {
    const { receipt } = await receiptFixture("claimCheck");
    const invalid = { ...receipt, signature: { ...receipt.signature, value: "0x1234" } } as Receipt;
    for (const [value, receipts] of [[undefined, true], [invalid, true], [receipt, false], [receipt, undefined]] as const) {
      const html = render(value, receipts);
      expect(html).toContain("Fixture observation unavailable");
      expect(html).toContain("FIXTURE_UNAVAILABLE");
      expect(html).not.toContain("Download receipt");
      expect(html).not.toContain('href="/verify"');
      expect(html).not.toContain("Signed receipt:");
      expect(html).not.toContain('role="alert"');
    }
  });
});
describe("deterministic browser extraction", () => {
  it.each([
    ["LP burned", { type: "lpBurned", expected: true }],
    ["liquidity burnt", { type: "lpBurned", expected: true }],
    ["renounced", { type: "ownership", expected: true }],
    ["not renounced", { type: "ownership", expected: false }],
    ["contract not paused", { type: "paused", expected: false }],
    ["contract paused", { type: "paused", expected: true }],
    ["LP not burned", { type: "lpBurned", expected: false }],
    ["0/0 tax", { type: "tax", buy: "0", sell: "0" }],
    ["buy tax 2%", { type: "tax", buy: "2", sell: null }],
    ["sell tax 3%", { type: "tax", buy: null, sell: "3" }],
    ["no tax", { type: "tax", buy: "0", sell: "0" }],
    ["buy/sell tax 2.5%", { type: "tax", buy: "2.5", sell: "2.5" }],
    ["top 10 hold 12%", { type: "top10", comparison: "equal", percent: "12" }],
    [
      "top10 holders hold under 12.25%",
      { type: "top10", comparison: "under", percent: "12.25" },
    ],
    ["dev holds 3%", { type: "deployer", comparison: "equal", percent: "3" }],
    [
      "deployer holds over 0.125%",
      { type: "deployer", comparison: "over", percent: "0.125" },
    ],
    ["contract source verified", { type: "verified", expected: true }],
    ["source not verified", { type: "verified", expected: false }],
    ["launched on pools.trade", { type: "launchpad", launchpad: "launcher" }],
  ])("extracts %s with matched text and pattern provenance", (text, claim) => {
    expect(extractClaims(text as string)).toEqual([
      { claim, matchedText: text, foundBy: "pattern" },
    ]);
  });
  it.each([
    "not LP burned",
    "never launched on pons",
    "dev does not hold 3%",
    "contract isn't paused",
    "not no tax",
    "if LP burned",
    "maybe renounced",
    "top 10 hold 101%",
    "buy tax 101%",
    "unrenounced",
    "liquidity not yet burnt",
  ])("avoids unsupported or ambiguous context: %s", (text) =>
    expect(extractClaims(text)).toEqual([]),
  );
  it("strips URLs and identifiers before matching and caps work", () => {
    const syntheticMention =
      String.fromCharCode(64) + ["sample", "account"].join("_");
    const text = `${syntheticMention} LP burned https://example.test/renounced www.example.test/paused`;
    expect(stripPostIdentifiers(text)).not.toContain(syntheticMention);
    expect(stripPostIdentifiers(text)).not.toContain("example.test");
    expect(extractClaims(text)).toEqual([
      {
        claim: { type: "lpBurned", expected: true },
        matchedText: "LP burned",
        foundBy: "pattern",
      },
    ]);
    expect(extractClaims("renounced; ".repeat(100))).toHaveLength(32);
    expect(extractClaims(" ".repeat(20000) + "renounced")).toEqual([]);
  });
});
describe("client confirmation and privacy boundary", () => {
  it("refuses unchecked or changed addresses and disabled capability before fetch", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(addressConfirmed(address, "")).toBe(false);
    expect(addressConfirmed(address, address)).toBe(true);
    expect(addressConfirmed(`0x${"2".repeat(40)}`, address)).toBe(false);
    for (const [confirmedAddress, enabled] of [
      ["", true],
      [address, false],
    ] as const)
      await expect(
        requestClaims(
          {
            address,
            confirmedAddress,
            claims: [{ type: "ownership", expected: true }],
          },
          enabled,
          "",
        ),
      ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("projects only address, confirmed types, parameters and post time into the request body", async () => {
    const fetcher = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    const claim = {
      type: "top10",
      comparison: "under",
      percent: "12.5",
      matchedText: "private sample post",
      foundBy: "pattern",
      rawText: "local-only sample",
    } as Claim;
    const postTime = "2026-10-19T00:00:00.000Z";
    await requestClaims(
      { address, confirmedAddress: address, claims: [claim], postTime },
      true,
      "sample-preview",
    );
    const [url, init] = fetcher.mock.calls[0]! as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/v1/private/opsis/claims");
    expect(init).toMatchObject({
      credentials: "omit",
      cache: "no-store",
      method: "POST",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      address,
      confirmed: true,
      claims: [{ type: "top10", comparison: "under", percent: "12.5" }],
      postTime,
    });
    for (const word of [
      "private sample post",
      "local-only sample",
      "matchedText",
      "foundBy",
      "sample-preview",
    ])
      expect(init.body).not.toContain(word);
    expect(claimInput({ type: "unsupported" })).toEqual({
      type: "unsupported",
    });
  });
  it("handles API refusal and keeps disabled direct renders inert", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      requestClaims(
        {
          address,
          confirmedAddress: address,
          claims: [{ type: "unsupported" }],
        },
        true,
        "",
      ),
    ).rejects.toThrow("unavailable");
    fetcher.mockClear();
    for (const capabilities of [{ claimCheck: false }, {}])
      expect(
        renderToStaticMarkup(
          <I18nProvider>
            <ClaimCheck capabilities={capabilities} />
          </I18nProvider>,
        ),
      ).toBe("");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("renders confirmation, definitions and a disabled run control without a request", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const html = renderToStaticMarkup(
      <I18nProvider>
        <ClaimCheck capabilities={{ claimCheck: true }} />
      </I18nProvider>,
    );
    expect(html).toContain("Confirm this contract address");
    expect(html).toContain("Lookalike tickers");
    expect(html).toMatch(/disabled="">Run claim check/);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
describe("capability, navigation and bilingual parity", () => {
  const base = () => ({
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    chainId: 4663,
    research: true,
    tokenControls: true,
    exitCheck: false,
    watch: false,
    rwa: false,
    observedTrades: false,
    perpExecution: false,
  });
  const row = (id: string, enabled: boolean) => ({
    id,
    enabled,
    scope: "fixture",
    origin: "fixture",
    freshness: "fixture",
    coverage: "fixture",
    limits: "fixture",
  });
  const body = () => ({
    ...base(),
    manifest: {
      version: 1,
      chain: { id: 4663, name: "Robinhood Chain" },
      build: null,
      capabilities: [
        row("research", true),
        row("tokenControls", true),
        ...["exitCheck", "watch", "rwa", "observedTrades"].map((id) =>
          row(id, false),
        ),
      ],
    },
  });
  const parse = async (value: unknown) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(value))),
    );
    return unlockPreview("", new AbortController().signal);
  };
  it("accepts old manifests, enforces new row parity and rejects malformed flags", async () => {
    expect((await parse(body())).claimCheck).toBeUndefined();
    for (const flag of [false, true])
      expect(
        (
          await parse({
            ...body(),
            claimCheck: flag,
            manifest: {
              ...body().manifest,
              capabilities: [
                ...body().manifest.capabilities,
                row("claimCheck", flag),
              ],
            },
          })
        ).claimCheck,
      ).toBe(flag);
    for (const value of [
      { ...body(), claimCheck: true },
      {
        ...body(),
        claimCheck: false,
        manifest: {
          ...body().manifest,
          capabilities: [
            ...body().manifest.capabilities,
            row("claimCheck", true),
          ],
        },
      },
      { ...body(), claimCheck: "true" },
    ])
      await expect(parse(value)).rejects.toThrow("Invalid preview response");
  });
  it("registers the guarded route chunk, page title, Look up entry and status metadata", async () => {
    const capabilities = await parse({ ...base(), claimCheck: true });
    expect(chunks.ClaimCheck.path).toBe("/research/claims");
    expect(routeTitle("/research/claims", "en")).toContain("Claim Check");
    expect(toolGroups(capabilities)[0]?.tools.map((r) => r.path)).toContain(
      "/research/claims",
    );
    expect(
      toolGroups({ ...capabilities, claimCheck: false })[0]?.tools.map(
        (r) => r.path,
      ),
    ).not.toContain("/research/claims");
    expect(statusDetails.claimCheck.label).toEqual(["Claim Check", "声明核查"]);
  });
  it("provides both dictionaries for every claim string", () => {
    const keys = Object.keys(en).filter((k) => k.startsWith("claims."));
    expect(keys.length).toBeGreaterThan(40);
    for (const key of keys) expect(zhCN).toHaveProperty(key);
  });
});

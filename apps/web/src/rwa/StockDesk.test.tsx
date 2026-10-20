import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { REVIEWED_ROBINHOOD_ASSET_SAMPLE, type Receipt, type StockDeskResult } from "@rh-chain/shared";
import I18nProvider from "../i18n/I18nProvider";
import * as localeCookie from "../i18n/locale";
import StockDesk, { DeskFacts } from "./StockDesk";
import { stockCardPath } from "./stock-card";
import RwaWorkspace from "./RwaWorkspace";
import { createRef } from "react";
import { rwaWorkspaceFixture } from "./test-fixtures";
import { receiptFixture } from "../opsis/receipt-test-fixtures";
const unknown = { state: "unknown" as const, reason: "FIXTURE_UNAVAILABLE" };
const desk: StockDeskResult = {
  schemaVersion: 1,
  address: `0x${"1".repeat(40)}`,
  symbol: "SAMPLE",
  observedAt: "2026-10-19T15:00:00.000Z",
  canonical: "not_on_official_list",
  reference: unknown,
  pool: unknown,
  gapBps: unknown,
  multiplier: unknown,
  corporateActions: unknown,
  feed: unknown,
  concentration: unknown,
  depth: ["1000", "10000", "100000"].map((notionalUsd) => ({
    notionalUsd,
    quote: unknown,
  })),
  history: {
    state: "unavailable",
    reason: "history unavailable in this release",
  },
  limitations: [],
  disclaimer:
    "A Stock Token tracks a stock; it is not a share. The issuer sets who can hold it; Opsis does not check eligibility. Not investment advice.",
};
function render(node: React.ReactNode, locale: "en" | "zh-CN" = "en") {
  vi.spyOn(localeCookie, "readLocaleCookie").mockReturnValue(locale);
  return renderToStaticMarkup(
    <I18nProvider>
      <MemoryRouter>{node}</MemoryRouter>
    </I18nProvider>,
  );
}
afterEach(() => vi.restoreAllMocks());
it.each(["en", "zh-CN"] as const)("offers a validated desk receipt and verifier link in %s", async (locale) => {
  const { receipt } = await receiptFixture("stock-desk");
  const fetcher = vi.spyOn(globalThis, "fetch");
  const html = render(<DeskFacts desk={{ ...desk, receipt }} receipts />, locale);
  expect(html).toContain(locale === "en" ? "Download receipt" : "下载凭据");
  expect(html).toContain('href="/verify"');
  expect(html).toContain(locale === "en" ? "Verify a receipt →" : "验证收据 →");
  expect(html).toContain(locale === "en" ? "It proves the computation, not that a conclusion is right." : "它证明计算过程，而不证明结论正确。");
  expect(fetcher).not.toHaveBeenCalled();
});
it("hides absent or malformed receipts and disabled capability without losing desk facts", async () => {
  const { receipt } = await receiptFixture("stock-desk");
  const invalid = { ...receipt, signature: { ...receipt.signature, value: "0x1234" } } as Receipt;
  for (const [value, receipts] of [[undefined, true], [invalid, true], [receipt, false], [receipt, undefined]] as const) {
    const html = render(<DeskFacts desk={{ ...desk, receipt: value }} receipts={receipts} />);
    expect(html).toContain("FIXTURE_UNAVAILABLE");
    expect(html).not.toContain("Download receipt");
    expect(html).not.toContain('href="/verify"');
    expect(html).not.toContain("Signed receipt:");
    expect(html).not.toContain('role="alert"');
  }
});
it("offers explicit desk/index requests and the mandatory line without fetching during render", () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const html = render(<StockDesk address={desk.address} onSelect={() => {}} />);
  expect(html).toContain("Load desk facts");
  expect(html).toContain("Reviewed-sample index");
  expect(html).toContain("it is not a share");
  expect(html).toContain("Opsis does not check eligibility");
  expect(fetch).not.toHaveBeenCalled();
});
it("renders a table equivalent, unknowns, source boundaries and Chinese labels", () => {
  const en = render(<DeskFacts desk={desk} />);
  expect(en).toContain("<table");
  expect(en).toContain("Not on the official list");
  expect(en).toContain("FIXTURE_UNAVAILABLE");
  expect(en).toContain("100000 USD");
  expect(en).toContain("History unavailable in this release");
  expect(en).toContain("USDG units are not dollars");
  const zh = render(
    <>
      <StockDesk address={desk.address} onSelect={() => {}} />
      <DeskFacts desk={desk} />
    </>,
    "zh-CN",
  );
  expect(zh).toContain("股票代币数据台");
  expect(zh).toContain("非投资建议");
  expect(zh).toContain("未知");
  expect(zh).not.toContain("desk.");
});
it("keeps the redesigned workspace unchanged without a desk slot", () => {
  const props = {
    address: desk.address,
    loading: false,
    error: "",
    result: rwaWorkspaceFixture(),
    setAddress: () => {},
    prepare: () => {},
    verifyButton: createRef<HTMLButtonElement>(),
    morphoDetails: null,
    consent: null,
  };
  expect(render(<RwaWorkspace {...props} />)).not.toContain("Stock Token Desk");
  expect(
    render(
      <RwaWorkspace
        {...props}
        desk={<StockDesk address={desk.address} onSelect={() => {}} />}
      />,
    ),
  ).toContain("Stock Token Desk");
});

it("rounds the small-size pool price for display and keeps the exact value in the title", () => {
  const exact = "217.210022382317694690382834140505";
  const withPool = {
    ...desk,
    pool: {
      state: "available",
      value: { notionalUsd: "100", inputAmount: "0.460400000000000000", outputAmount: "100.003", outputUnit: "USDG", priceUsdG: exact, impactBps: "5", expiresAt: "2026-10-20T04:06:31.079Z" },
      evidence: [],
    },
  } as unknown as StockDeskResult;
  const html = render(<DeskFacts desk={withPool} />);
  expect(html).toContain("217.2100 USDG");
  expect(html).toContain(`title="${exact} USDG"`);
});

it("offers sharing only for reviewed stocks and the public-cards capability, without fetching a preview on render", () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const address = REVIEWED_ROBINHOOD_ASSET_SAMPLE.find((asset) => asset.symbol === "AAPL")!.address;
  expect(render(<StockDesk address={address} onSelect={() => {}} />)).not.toContain("Share card");
  const html = render(<StockDesk address={address} onSelect={() => {}} publicCards />);
  expect(html).toContain("Share card");
  expect(html).not.toContain("<img");
  expect(fetch).not.toHaveBeenCalled();
  expect(render(<StockDesk address={address} onSelect={() => {}} publicCards />, "zh-CN")).toContain("分享卡片");
  expect(render(<StockDesk address={desk.address} onSelect={() => {}} publicCards />)).not.toContain("Share card");
  expect(stockCardPath(address.toLowerCase(), "en")).toBe("/v1/public/open-data/v1/cards/stock/AAPL.svg");
  expect(stockCardPath(address, "zh-CN")).toBe("/v1/public/open-data/v1/cards/stock/AAPL.svg?lang=zh-CN");
  for (const asset of REVIEWED_ROBINHOOD_ASSET_SAMPLE.filter((entry) => entry.symbol === "USDG" || entry.symbol === "WETH"))
    expect(stockCardPath(asset.address, "en")).toBeNull();
});

it("links the exact token and feed contracts without linking a block hash", () => {
  const feed = `0x${"2".repeat(40)}`;
  const blockHash = `0x${"a".repeat(64)}`;
  const withFeed: StockDeskResult = { ...desk, feed: {
    state: "available",
    value: { updatedAt: desk.observedAt, ageSeconds: 10, heartbeatSeconds: 3600, stale: false, paused: false, expectedOffHours: false, offHoursBasis: "fixture" },
    evidence: [{ source: `chainlink:${feed}`, block: 100, blockHash, time: desk.observedAt }],
  } };
  const html = render(<DeskFacts desk={withFeed} />);
  expect(html).toContain(`href="https://robinhoodchain.blockscout.com/token/${desk.address}"`);
  expect(html).toContain(`href="https://robinhoodchain.blockscout.com/address/${feed}"`);
  expect(html).not.toContain(`/tx/${blockHash}`);
  expect(render(<DeskFacts desk={withFeed} />, "zh-CN")).toContain("在 Blockscout 查看 ↗");
});

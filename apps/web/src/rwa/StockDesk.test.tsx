import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import type { StockDeskResult } from "@rh-chain/shared";
import I18nProvider from "../i18n/I18nProvider";
import * as localeCookie from "../i18n/locale";
import StockDesk, { DeskFacts } from "./StockDesk";
import RwaWorkspace from "./RwaWorkspace";
import { createRef } from "react";
import { rwaWorkspaceFixture } from "./test-fixtures";
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

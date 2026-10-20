import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import I18nProvider from "../i18n/I18nProvider";
import * as localeCookie from "../i18n/locale";
import ToolWorkspace from "../opsis/ToolWorkspace";
import type { StockGapSeries } from "../opsis/stock-gap-series";
import { parseStockGapSeries } from "../opsis/stock-gap-series";
import {
  RWA_TEST_CONTRACT,
  RWA_TEST_TIME,
  rwaHistoryFixture,
  rwaWorkspaceFixture,
} from "./test-fixtures";
import type { RwaVerification } from "./api";
import RwaWorkspace from "./RwaWorkspace";

const imported = vi.hoisted(() => ({ series: null as StockGapSeries | null }));
vi.mock("../opsis/useStockGapImport", () => ({
  useStockGapImport: () => ({
    series: imported.series,
    busy: false,
    error: "",
    load: vi.fn(),
    cancel: vi.fn(),
  }),
}));

function render(
  result: RwaVerification | null = null,
  locale: "en" | "zh-CN" = "en",
) {
  vi.spyOn(localeCookie, "readLocaleCookie").mockReturnValue(locale);
  return renderToStaticMarkup(
    <I18nProvider>
      <MemoryRouter initialEntries={["/rwa"]}>
        <ToolWorkspace>
          <RwaWorkspace
            address={result?.address ?? ""}
            loading={false}
            error=""
            result={result}
            setAddress={() => {}}
            prepare={() => {}}
            verifyButton={createRef()}
            morphoDetails={null}
            consent={null}
          />
        </ToolWorkspace>
      </MemoryRouter>
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  imported.series = null;
});

describe("Opsis Stock-token workspace", () => {
  it.each(["en", "zh-CN"] as const)(
    "renders the input, honest history state and four evidence sections in %s",
    (locale) => {
      const html = render(null, locale);
      expect(html.match(/<h1>/g)).toHaveLength(1);
      for (const label of locale === "en"
        ? [
            "Stock-token check",
            "Token or vault contract",
            "Run check",
            "History unavailable",
            "Token identity",
            "Reference source",
            "Redemption unverified",
            "Backing documents",
          ]
        : [
            "股票代币核查",
            "代币或金库合约",
            "运行核查",
            "历史不可用",
            "代币身份",
            "参考来源",
            "赎回未经验证",
            "支持资产文件",
          ])
        expect(html).toContain(label);
      expect(html).not.toContain("SAMPLE-STOCK");
      expect(html.match(/role="img"/g)).toHaveLength(2);
      expect(html).not.toContain('class="rwa-chart-line"');
      expect(html).toContain("disabled");
    },
  );
  it("keeps all evidence, exact identities and read times without a backing-verification badge", () => {
    const result = rwaWorkspaceFixture();
    const html = render(result);
    expect(html).toContain(RWA_TEST_CONTRACT);
    expect(html).toContain(result.anchor.blockHash);
    expect(html).toContain(RWA_TEST_TIME);
    expect(html).toContain("100.01 / 100.05 USD");
    expect(html).toContain("100.03 USD");
    for (const check of result.checks) expect(html).toContain(check.detail);
    for (const limit of result.limitations) expect(html).toContain(limit);
    expect(html).toContain(result.privacy.disclosure);
    expect(html).toContain("Document retrieval unavailable");
    expect(html).not.toContain("Verified backing");
  });
  it("labels a retained paused oracle value as not current", () => {
    const result = rwaWorkspaceFixture();
    result.stock!.oracle!.state = "paused";
    const html = render(result);
    expect(html).toContain("Paused");
    expect(html).toContain("Last returned; not current");
    expect(html).not.toContain(
      "Current at lookup</dd></div><div><dt>Oracle updated",
    );
  });
  it("renders actual imported points, exact values, markers and count without filling missing intervals", () => {
    imported.series = parseStockGapSeries(rwaHistoryFixture());
    const html = render(rwaWorkspaceFixture());
    expect(html.match(/role="img"/g)).toHaveLength(2);
    expect(html.match(/class="rwa-chart-point rwa-session-/g)).toHaveLength(3);
    expect(html.match(/class="rwa-chart-action"/g)).toHaveLength(1);
    expect(html).toContain('data-testid="rwa-gap-latest">4.0000%');
    expect(html).toContain("101.123456");
    expect(html).toContain("1.1234");
    expect(html).toContain("Expected count unknown");
    expect(html).toContain("120 minutes");
    expect(html).not.toContain("2026-08-12");
  });
  it("refuses to show another contract's history next to lookup evidence", () => {
    imported.series = parseStockGapSeries(rwaHistoryFixture());
    const result = rwaWorkspaceFixture();
    result.address = `0x${"33".repeat(20)}`;
    const html = render(result);
    expect(html).toContain("History hidden");
    expect(html.match(/role="img"/g)).toHaveLength(2);
    expect(html).not.toContain('class="rwa-chart-line"');
    expect(html).not.toContain("4.0000%");
  });
  it("keeps unsupported contracts explicit instead of deriving a stock-token match", () => {
    const result = rwaWorkspaceFixture();
    result.kind = "unsupported_contract";
    result.stock = undefined;
    result.headline = "Unsupported fixture";
    const html = render(result);
    expect(html).toContain("Unsupported contract");
    expect(html).toContain("No reference price or source frequency is assumed");
    expect(html).not.toContain("100.03 USD");
  });
});

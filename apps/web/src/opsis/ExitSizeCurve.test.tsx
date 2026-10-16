import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExitCheckQuote } from "../exit-check/api";
import ExitSizeCurve from "./ExitSizeCurve";
import { fixture } from "./test-fixtures";

const language = vi.hoisted(() => ({ locale: "en" }));
vi.mock("../i18n", () => ({ useI18n: () => ({ locale: language.locale }) }));
function quote(): ExitCheckQuote {
  const base = fixture() as ExitCheckQuote;
  return {
    ...base,
    curve: {
      requestedAmount: base.input.amount,
      scope: { strategy: "selected_pool", pool: base.quote!.pool },
      points: [
        { ...base.quote!, amount: "1.5", rawAmount: "1500000", status: "ok" },
        {
          ...base.quote!,
          amount: "3",
          rawAmount: "3000000",
          status: "unavailable",
          amountOutDisplay: null,
        },
      ],
    },
  };
}
afterEach(() => {
  language.locale = "en";
});
describe("Exit size curve presentation", () => {
  it("renders nothing without a requested curve", () => {
    expect(
      renderToStaticMarkup(
        <ExitSizeCurve
          result={fixture() as ExitCheckQuote}
          outputSymbol="WETH"
        />,
      ),
    ).toBe("");
  });
  it.each(["en", "zh-CN"])(
    "keeps only observed points and mirrors missing coverage in its table in %s",
    (locale) => {
      language.locale = locale;
      const html = renderToStaticMarkup(
        <ExitSizeCurve result={quote()} outputSymbol="WETH" />,
      );
      expect(html.match(/<circle\b/g)).toHaveLength(1);
      expect(html).toContain(
        locale === "en" ? "Observed points only." : "仅显示观察点。",
      );
      expect(html).toContain(locale === "en" ? "Unavailable" : "不可用");
      expect(html).toContain("0.0000005 WETH");
      expect(html).toContain("<table>");
      expect(html).toContain('aria-pressed="true"');
      if (locale === "zh-CN") expect(html).not.toContain("fee pool");
    },
  );
});

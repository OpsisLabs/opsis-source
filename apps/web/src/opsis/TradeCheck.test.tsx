import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import I18nProvider from "../i18n/I18nProvider";
import { EXIT_CHECK_TOKENS, type ExitCheckQuote } from "../exit-check/api";
import TradeCheck from "./TradeCheck";
import type { Capabilities } from "./model";
import { clearPublicSession, publicSession } from "./public-session";
import { fixture } from "./test-fixtures";

const language = vi.hoisted(() => ({ chinese: false }));
vi.mock("./copy", () => ({
  useCopy: () => (en: string, zh: string) => (language.chinese ? zh : en),
}));
const capabilities: Capabilities = {
  expiresAt: "2026-10-16T12:00:00Z",
  chainId: 4663,
  research: true,
  exitCheck: true,
  watch: false,
  rwa: false,
  observedTrades: false,
  perpExecution: false,
};
function markup(
  result: ExitCheckQuote | null = null,
  token = result?.input.contract ?? "",
) {
  publicSession.check = {
    token,
    amount: result?.input.amount ?? "",
    output: "WETH",
    curveEnabled: !!result?.curve,
    result,
  };
  return renderToStaticMarkup(
    <I18nProvider>
      <MemoryRouter initialEntries={["/check"]}>
        <TradeCheck capabilities={capabilities} />
      </MemoryRouter>
    </I18nProvider>,
  );
}
afterEach(() => {
  clearPublicSession();
  language.chinese = false;
});

describe("Trade Check receipt", () => {
  it("keeps a reviewed contract and its amount unit visible for address input", () => {
    const html = markup(null, EXIT_CHECK_TOKENS.WETH.address);
    expect(html).toContain(EXIT_CHECK_TOKENS.WETH.address);
    expect(html).toContain("<span>WETH</span>");
    expect(html).toContain("Resolved");
  });
  it.each([false, true])(
    "explains the empty receipt in Chinese=%s without a hand-off",
    (chinese) => {
      language.chinese = chinese;
      const html = markup();
      expect(html.match(/<h1\b/g)).toHaveLength(1);
      expect(html).toContain(
        chinese
          ? "运行核查，查看输入数量的估算输出"
          : "Run a check to see estimated output",
      );
      expect(html).toContain(chinese ? "您的核查" : "YOUR CHECK");
      expect(html).not.toContain('href="https://app.uniswap.org');
      expect(html).not.toContain("opsis-check-with-curve");
    },
  );
  it.each([false, true])(
    "prints the observed amounts and excluded gas in Chinese=%s",
    (chinese) => {
      language.chinese = chinese;
      const result = fixture() as ExitCheckQuote;
      const html = markup(result);
      expect(html).toContain(chinese ? "您送出" : "You send");
      expect(html).toContain(chinese ? "您大约收到" : "You’d receive about");
      expect(html).toContain(result.quote!.amountOutDisplay);
      expect(html).toContain(result.quote!.feeAmountDisplay);
      expect(html).toContain(chinese ? "不含 Gas" : "Gas not included");
      expect(html).toContain(
        chinese
          ? "估算，并非可执行报价。"
          : "Estimate, not an executable quote.",
      );
      expect(html).toContain(result.input.contract);
      expect(html).toContain(String(result.anchor.blockNumber));
      expect(html.indexOf("opsis-check-handoff")).toBeGreaterThan(
        html.indexOf('data-testid="opsis-quote"'),
      );
      expect(html).toContain('rel="noopener noreferrer"');
    },
  );
  it.each([false, true])(
    "keeps unavailable coverage in the receipt in Chinese=%s",
    (chinese) => {
      language.chinese = chinese;
      const html = markup({
        ...fixture(),
        supported: false,
        reason: "unknown_decimals",
        quote: null,
        output: null,
      } as ExitCheckQuote);
      expect(html).toContain(
        chinese ? "代币精度未知。" : "Token precision is unknown.",
      );
      expect(html).not.toContain("opsis-check-output");
      expect(html).not.toContain("opsis-check-handoff");
      expect(html).toContain(chinese ? "核查时间" : "Checked at");
    },
  );
});

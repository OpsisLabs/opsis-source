import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import I18nProvider from "../i18n/I18nProvider";
import { EXIT_CHECK_TOKENS, type ExitCheckQuote } from "../exit-check/api";
import TradeCheck from "./TradeCheck";
import { KNOWN_ASSETS } from "./known-assets";
import type { Capabilities } from "./model";
import { clearPublicSession, publicSession } from "./public-session";
import { fixture } from "./test-fixtures";

const language = vi.hoisted(() => ({ chinese: false }));
const state = vi.hoisted(() => ({
  index: 0,
  error: null as { status: number; code: string; message: string } | null,
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = state.index++;
      return actual.useState(
        index === 7 && state.error ? state.error : initial,
      );
    },
  };
});
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
  state.index = 0;
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
  state.error = null;
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

it.each([false, true])(
  "uses the reviewed AAPL identity when the API symbol is absent, Chinese=%s",
  (chinese) => {
    language.chinese = chinese;
    const result = fixture() as ExitCheckQuote;
    result.input.contract = KNOWN_ASSETS.find(
      (asset) => asset.symbol === "AAPL",
    )!.address;
    const html = markup(result);
    expect(html).toContain("1.5 AAPL");
    expect(html).toContain("0.0045 AAPL");
    expect(html).not.toContain(chinese ? "输入代币" : "input token");
  },
);

it("translates detailed quote limitations while preserving unknown source text", () => {
  language.chinese = true;
  const result = fixture() as ExitCheckQuote;
  result.limitations.push(
    "It is not a guaranteed fill, a maximum slippage, or proof that the token can be transferred or sold. Token transfer restrictions, paused contracts, allowlists, taxes, and hooks are not checked.",
    "The fee amount shown is a floor estimate of the input-side pool fee and can differ from the exact charge because V3 rounding and the actual tick path are not reproduced.",
    "Only a QuoterV2 result that did not end at a price-boundary is shown. A boundary result can indicate a partial fill, so full execution is never proven.",
    "Pleiades and other non-admitted venues are excluded from this estimate.",
    "Unknown future explanation",
  );
  const html = markup(result);
  expect(html).toContain("未检查代币转账限制");
  expect(html).toContain("向下取整估算");
  expect(html).toContain("部分成交");
  expect(html).toContain("未获准接入的场所");
  expect(html).toContain("Unknown future explanation");
  for (const limit of result.limitations.slice(0, -1))
    expect(html).not.toContain(limit);
});

it.each([false, true])(
  "shows the API precision refusal beside its amount, Chinese=%s",
  (chinese) => {
    language.chinese = chinese;
    state.error = {
      status: 400,
      code: "EXIT_CHECK_INVALID_AMOUNT",
      message: "Enter a positive amount with no more than 18 decimal places",
    };
    const html = markup();
    expect(html).toContain(
      'id="check-amount" aria-invalid="true" aria-describedby="check-amount-error"',
    );
    expect(html).toContain("EXIT_CHECK_INVALID_AMOUNT:");
    expect(html).toContain(
      chinese ? "请输入正数数量，小数最多 18 位" : state.error.message,
    );
    expect(html).not.toContain(
      chinese ? "请求失败、受限" : "The request failed, was limited",
    );
  },
);

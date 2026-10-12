import { renderToStaticMarkup } from "react-dom/server";
import { opsisOverrides } from "../i18n/dictionaries/opsis-overrides";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as localeCookie from "../i18n/locale";
import I18nProvider from "../i18n/I18nProvider";
import { en } from "../i18n/dictionaries/en";
import { zhCN } from "../i18n/dictionaries/zh-CN";
import Guide from "./Guide";
import ToolOrientation from "./ToolOrientation";
import { toolGuides } from "./tool-guide";
import type { Capabilities } from "./model";

const capabilities: Capabilities = {
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  chainId: 4663,
  research: true,
  exitCheck: true,
  watch: true,
  rwa: true,
  observedTrades: true,
  swapPreview: false,
  perpExecution: false,
};
const names = [
  ["/research", "Research", "研究"],
  ["/research/details", "Detailed research", "详细研究"],
  ["/check", "Trade Check", "交易核查"],
  ["/watch", "Watch", "观察"],
  ["/swap", "Swap preview", "兑换预览"],
  ["/simulate", "Trade scenarios", "交易情景"],
  ["/check/perp-scenario", "Perp cost scenario", "永续成本情景"],
  ["/stress-test", "Portfolio shocks", "投资组合冲击"],
  ["/rwa", "Stock-token check", "股票代币核查"],
  ["/biggest-trades", "Big trades", "大额交易"],
  ["/research/events", "World & markets", "世界与市场"],
  ["/saved", "Saved", "已保存"],
  ["/lab", "Quant Lab", "量化实验室"],
];
describe("canonical UI copy", () => {
  it.each(names)(
    "names %s consistently in both languages",
    (path, english, chinese) => {
      expect(toolGuides.find((tool) => tool.path === path)?.name).toEqual([
        english,
        chinese,
      ]);
    },
  );
  it("contains no retired product names in nonlegal dictionary copy", () => {
    // Legal sentences are deliberately frozen pending founder review. Block explorer
    // and observed swaps describe evidence, not an Opsis destination.
    const retired =
      /\b(?:Private Explorer|Wallet Explorer|Detailed Explorer|Entity research|Scout Watch|Wallet watch|Scout Swap|Swap Lab|Exit check|Exit quotes|Trade Simulator|Stress Test|RWA Verify|Asset Proof|Situation Room|World Map|Holdings & Vault)\b|私密链上查询|退出核查|RWA 验证|态势室|世界地图|兑换实验室/iu;
    // The Opsis build reads shared dictionaries through the Opsis overrides.
    for (const dictionary of [
      { ...en, ...opsisOverrides.en },
      { ...zhCN, ...opsisOverrides["zh-CN"] },
    ]) {
      for (const [key, value] of Object.entries(dictionary)) {
        if (key.startsWith("legal.")) continue;
        expect(value, key).not.toMatch(retired);
        if (
          /\.(?:label|shortLabel)$/.test(key) ||
          /^(?:cloud\.rail|landing\.nav)\./.test(key)
        ) {
          expect(value, key).not.toMatch(
            /^(?:Vault|Portfolio|Explorer|保险库|投资组合)$/i,
          );
        }
      }
    }
  });
});

describe("task guidance", () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(["en", "zh-CN"] as const)(
    "renders one pressed task and no task arrow in %s",
    (locale) => {
      vi.spyOn(localeCookie, "readLocaleCookie").mockReturnValue(locale);
      const html = renderToStaticMarkup(
        <I18nProvider>
          <MemoryRouter>
            <Guide capabilities={capabilities} />
          </MemoryRouter>
        </I18nProvider>,
      );
      const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
      expect(buttons).toHaveLength(8);
      expect(
        buttons.filter((button) => button.includes('aria-pressed="true"')),
      ).toHaveLength(1);
      expect(buttons.join("")).not.toContain("↗");
      expect(html).not.toContain('href="/swap"');
      expect(html).not.toContain('href="/simulate"');
    },
  );
  it("keeps audience, input and output inside a closed disclosure", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <MemoryRouter initialEntries={["/research"]}>
          <ToolOrientation capabilities={capabilities} />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(html).toContain("<details>");
    expect(html).not.toContain("<details open");
    expect(html).toContain("Paste a public token");
  });
  it("does not offer orientation for a disabled tool", () => {
    vi.stubEnv("VITE_EXIT_CHECK_ENABLED", "false");
    const html = renderToStaticMarkup(
      <I18nProvider>
        <MemoryRouter initialEntries={["/check"]}>
          <ToolOrientation capabilities={capabilities} />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(html).toBe("");
    vi.unstubAllEnvs();
  });
});

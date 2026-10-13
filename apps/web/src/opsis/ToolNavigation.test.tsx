import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import I18nProvider from "../i18n/I18nProvider";
import * as localeCookie from "../i18n/locale";
import type { Capabilities } from "./model";
import ToolNavigation from "./ToolNavigation";

const capabilities: Capabilities = {
  expiresAt: "2026-10-13T12:00:00Z",
  chainId: 4663,
  research: true,
  exitCheck: true,
  watch: true,
  rwa: true,
  observedTrades: true,
  swapPreview: false,
  perpExecution: false,
};
afterEach(() => vi.restoreAllMocks());
function navigation(
  path: string,
  locale: "en" | "zh-CN",
  access = capabilities,
) {
  vi.spyOn(localeCookie, "readLocaleCookie").mockReturnValue(locale);
  return renderToStaticMarkup(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <ToolNavigation capabilities={access} />
      </MemoryRouter>
    </I18nProvider>,
  );
}
it.each([
  ["/watch", "Compare saved wallet checks", "比较已保存的钱包核查"],
  ["/lab", "Explore data and scenarios", "探索数据与情景"],
  ["/guide", "Find a tool for your task", "按任务选择工具"],
  ["/saved", "Encrypted observations on this device", "此设备上的加密观察"],
  ["/missing", "Tools and their data limits", "工具及其数据限制"],
])(
  "fills the sub-navigation band on %s in both languages",
  (path, english, chinese) => {
    for (const [locale, copy] of [
      ["en", english],
      ["zh-CN", chinese],
    ] as const) {
      const html = navigation(path, locale);
      expect(html).toContain(`<p>${copy}</p>`);
      expect(html).not.toContain("aria-hidden");
      expect(html).not.toContain("<nav");
    }
  },
);
it("keeps unavailable trade tools out of navigation", () => {
  const html = navigation("/check", "en", {
    ...capabilities,
    swapPreview: undefined,
  });
  expect(html).toContain('href="/check"');
  expect(html).toContain('href="/check/perp-scenario"');
  expect(html).not.toContain('href="/swap"');
  expect(html).not.toContain('href="/simulate"');
});
it("keeps detailed research in its workspace and marks the research link current", () => {
  const html = navigation("/research/details", "zh-CN");
  expect(html).toContain('aria-label="工作区工具"');
  expect(html).toContain('class="active" href="/research"');
  expect(html).toContain("研究");
  expect(html).not.toContain('href="/check"');
});
it("keeps the research link when enrichment capabilities are unavailable", () => {
  const html = navigation("/research", "en", {
    ...capabilities,
    rwa: false,
    observedTrades: false,
  });
  expect(html).toContain('href="/research"');
  expect(html).not.toContain('href="/rwa"');
  expect(html).not.toContain('href="/biggest-trades"');
});

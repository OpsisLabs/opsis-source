import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import I18nProvider from "../i18n/I18nProvider";
import * as localeCookie from "../i18n/locale";
import { PrivacyPage, TermsPage } from "../pages/Legal";
import Community from "./Community";
import Status from "./Status";
import ToolNavigation from "./ToolNavigation";
import ToolWorkspace from "./ToolWorkspace";
import type { Capabilities } from "./model";

vi.mock("./presentation", () => ({ OPSIS_PRESENTATION: true }));
const capabilities: Capabilities = {
  expiresAt: "2026-10-19T12:00:00Z",
  chainId: 4663,
  research: true,
  tokenControls: false,
  exitCheck: true,
  watch: true,
  rwa: false,
  observedTrades: false,
  perpExecution: false,
};

describe.each(["en", "zh-CN"] as const)(
  "utility workspace composition (%s)",
  (locale) => {
    beforeEach(() =>
      vi.spyOn(localeCookie, "readLocaleCookie").mockReturnValue(locale),
    );
    afterEach(() => vi.restoreAllMocks());
    it.each([
      [
        "/status",
        "Data status",
        "数据状态",
        <Status capabilities={capabilities} />,
      ],
      ["/community", "Community", "社区", <Community />],
      ["/privacy", "Privacy", "隐私", <PrivacyPage />],
      ["/terms", "Terms", "条款", <TermsPage />],
    ] as const)("uses one plain heading for %s", (path, en, zh, content) => {
      const html = renderToStaticMarkup(
        <I18nProvider>
          <MemoryRouter initialEntries={[path]}>
            <ToolWorkspace>{content}</ToolWorkspace>
          </MemoryRouter>
        </I18nProvider>,
      );
      expect(html.match(/<h1>/g)).toHaveLength(1);
      expect(html).toContain(`<h1>${locale === "en" ? en : zh}</h1>`);
      // Mockup stamps never reach the product pages.
      expect(html).not.toContain(
        locale === "en"
          ? "Design preview · illustrative values"
          : "设计预览 · 示例数值",
      );
    });
    it("keeps four primary groups and one Saved utility link with Find your tool", () => {
      const html = renderToStaticMarkup(
        <I18nProvider>
          <MemoryRouter initialEntries={["/community"]}>
            <ToolNavigation capabilities={capabilities} />
          </MemoryRouter>
        </I18nProvider>,
      );
      expect(html.match(/<h2 id="rail-/g)).toHaveLength(4);
      expect(html.match(/href="\/saved"/g)).toHaveLength(1);
      expect(html).toMatch(/<a(?=[^>]*href="\/saved")(?=[^>]*class="opsis-rail-overview")[^>]*>/);
      expect(html).toContain(locale === "en" ? "Find your tool" : "选择工具");
      expect(html).toMatch(/<a(?=[^>]*href="\/community")(?=[^>]*aria-current="page")[^>]*>/);
    });
  },
);

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import I18nProvider from "../i18n/I18nProvider";
import * as localeCookie from "../i18n/locale";
import type { Capabilities } from "./model";
import ToolNavigation from "./ToolNavigation";
const capabilities: Capabilities = {
  expiresAt: "2026-10-16T12:00:00Z",
  chainId: 4663,
  research: true,
  exitCheck: true,
  watch: true,
  rwa: true,
  observedTrades: true,
  perpExecution: false,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
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
it.each(["en", "zh-CN"] as const)(
  "renders four groups, tool purposes and an overview in %s",
  (locale) => {
    const html = navigation("/research", locale);
    expect(html.match(/<section/g)).toHaveLength(4);
    expect(html).toContain('href="/guide"');
    expect(html).toContain(
      locale === "en" ? "Check the backing" : "核查支持资产",
    );
    expect(html).toContain('aria-current="page"');
  },
);
it("omits disabled tools rather than leaving disabled links", () => {
  const html = navigation("/check", "en", {
    ...capabilities,
    research: false,
    exitCheck: false,
    watch: false,
    rwa: false,
    observedTrades: false,
  });
  for (const path of [
    "/research",
    "/rwa",
    "/watch",
    "/check",
    "/biggest-trades",
    "/swap",
    "/simulate",
  ])
    expect(html).not.toContain(`href="${path}"`);
  expect(html).toContain('href="/check/perp-scenario"');
});
it("marks detailed research as Research and the perp tool independently", () => {
  expect(navigation("/research/details", "zh-CN")).toMatch(
    /aria-current="page"[^>]*href="\/research"/,
  );
  expect(navigation("/check/perp-scenario", "en")).toMatch(
    /aria-current="page"[^>]*href="\/check\/perp-scenario"/,
  );
});

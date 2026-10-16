import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import I18nProvider from "../i18n/I18nProvider";
import * as localeCookie from "../i18n/locale";
import Guide from "./Guide";
import type { Capabilities } from "./model";
import { searchIdentity } from "./shell/search-model";
import { resolveKnownAsset } from "./known-assets";
const access: Capabilities = {
  expiresAt: "2026-10-16T12:00:00Z",
  chainId: 4663,
  research: true,
  exitCheck: true,
  watch: true,
  rwa: true,
  observedTrades: true,
  perpExecution: false,
};
afterEach(() => vi.restoreAllMocks());
it.each(["en", "zh-CN"] as const)(
  "shows four illustrated groups, reviewed examples, one heading and a collapsed chooser in %s",
  (locale) => {
    vi.spyOn(localeCookie, "readLocaleCookie").mockReturnValue(locale);
    const html = renderToStaticMarkup(
      <I18nProvider>
        <MemoryRouter>
          <Guide capabilities={access} />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html.match(/class="opsis-overview-group"/g)).toHaveLength(4);
    expect(html.match(/class="opsis-group-picture"/g)).toHaveLength(4);
    expect(html).toContain('<details class="opsis-task-chooser">');
    expect(html).toContain('id="guide-entity"');
    for (const symbol of ["WETH", "USDG", "AAPL", "NVDA"])
      expect(html).toContain(`entity=${resolveKnownAsset(symbol)!.address}`);
    expect(html).not.toContain("584,725");
    expect(html).not.toContain('href="/swap"');
  },
);
it("accepts reviewed symbols and public identities, rejecting private or malformed input", () => {
  expect(searchIdentity(" WETH ")).toBe(resolveKnownAsset("WETH")!.address);
  expect(searchIdentity(`0x${"a".repeat(64)}`)).toBe(`0x${"a".repeat(64)}`);
  for (const input of ["unknown", "private notes", "0x123", "WETH?amount=1"])
    expect(searchIdentity(input)).toBe("");
});

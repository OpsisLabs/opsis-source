import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import I18nProvider from "../i18n/I18nProvider";
import * as localeCookie from "../i18n/locale";
import { LoadBoundary, LoadRecovery } from "./LoadRecovery";

afterEach(() => vi.restoreAllMocks());

describe("page load recovery", () => {
  it.each(["en", "zh-CN"] as const)("renders one announcement and one heading in %s inside and outside the shell", (locale) => {
    vi.spyOn(localeCookie, "readLocaleCookie").mockReturnValue(locale);
    for (const shell of [false, true]) {
      const html = renderToStaticMarkup(<I18nProvider><LoadRecovery shell={shell} /></I18nProvider>);
      expect(html.match(/<h1>/g)).toHaveLength(1);
      expect(html.match(/role="alert"/g)).toHaveLength(1);
      expect(html).not.toContain("aria-live");
      expect(html).toContain(locale === "en" ? "This page did not finish loading" : "此页面未能完成加载");
      expect(html).toContain(locale === "en" ? "Nothing saved on this device was changed." : "此设备上已保存的内容未被更改。");
      expect(html).toContain(locale === "en" ? "Reload page" : "重新加载页面");
    }
  });
  it("rethrows real application bugs unchanged", () => {
    const bug = new Error("render bug");
    expect(() => LoadBoundary.getDerivedStateFromError(bug)).toThrow(bug);
    expect(LoadBoundary.getDerivedStateFromError(new TypeError("Importing a module script failed."))).toEqual({ failed: true });
  });
});

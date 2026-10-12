import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as localeCookie from "../i18n/locale";
import I18nProvider from "../i18n/I18nProvider";
import { PrivacyPage, TermsPage } from "./Legal";

describe.each(["en", "zh-CN"] as const)(
  "legal content in the shared shell (%s)",
  (locale) => {
    afterEach(() => vi.restoreAllMocks());
    it.each([PrivacyPage, TermsPage])(
      "renders content without duplicate chrome",
      (Page) => {
        vi.spyOn(localeCookie, "readLocaleCookie").mockReturnValue(locale);
        const html = renderToStaticMarkup(
          <I18nProvider>
            <Page />
          </I18nProvider>,
        );
        expect(html).toContain("<article");
        expect(html).not.toMatch(/<(?:header|main|nav|img)\b/);
        expect(html).not.toContain('role="group"');
        expect(html).not.toContain("CHAIN");
        expect(html).not.toContain("chainscout-source");
        expect(html).not.toContain("security/advisories");
      },
    );
    it("publishes a neutral pending contact statement", () => {
      vi.spyOn(localeCookie, "readLocaleCookie").mockReturnValue(locale);
      const html = renderToStaticMarkup(
        <I18nProvider>
          <PrivacyPage />
        </I18nProvider>,
      );
      expect(html).toContain(
        locale === "en"
          ? "A support and security contact is to be published on this page."
          : "支持与安全联系方式待公布于本页面。",
      );
      expect(html).toContain(
        locale === "en"
          ? "Do not post a Vault passphrase"
          : "请勿发布保险库口令",
      );
    });
  },
);

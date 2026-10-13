import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as localeCookie from "../i18n/locale";
import I18nProvider from "../i18n/I18nProvider";
import { PrivacyPage, TermsPage } from "./Legal";

// These tests cover the Opsis build; the legacy build keeps its own chrome.
vi.mock("../opsis/presentation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../opsis/presentation")>()),
  OPSIS_PRESENTATION: true,
}));

describe.each(["en", "zh-CN"] as const)(
  "legal content in the shared shell (%s)",
  (locale) => {
    beforeEach(() => {
      vi.stubEnv("VITE_SUPPORT_EMAIL", undefined);
      vi.stubEnv("VITE_SECURITY_EMAIL", undefined);
      vi.spyOn(localeCookie, "readLocaleCookie").mockReturnValue(locale);
    });
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    });
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
        expect(html).not.toContain("github.com");
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
    it.each([undefined, "", "SUPPORT@OPSIS.EXAMPLE"])(
      "renders a shared support and security address once (%s)",
      (security) => {
        vi.stubEnv("VITE_SUPPORT_EMAIL", "SUPPORT@OPSIS.EXAMPLE");
        vi.stubEnv("VITE_SECURITY_EMAIL", security);
        const html = renderToStaticMarkup(<I18nProvider><PrivacyPage /></I18nProvider>);
        expect(html.match(/href="mailto:[^"]+"/g)).toEqual(['href="mailto:support@opsis.example"']);
        expect(html).toContain('>support@opsis.example</a>');
        expect(html).toContain(locale === "en"
          ? "Report security issues privately before any public post."
          : "安全问题请先私下报告，再公开发布。");
        expect(html).not.toContain(locale === "en"
          ? "A support and security contact is to be published on this page."
          : "支持与安全联系方式待公布于本页面。");
      },
    );
    it("renders distinct support and private security links in the selected language", () => {
      vi.stubEnv("VITE_SUPPORT_EMAIL", "support@opsis.example");
      vi.stubEnv("VITE_SECURITY_EMAIL", "security@opsis.example");
      const html = renderToStaticMarkup(<I18nProvider><PrivacyPage /></I18nProvider>);
      expect(html.match(/href="mailto:[^"]+"/g)).toEqual([
        'href="mailto:support@opsis.example"', 'href="mailto:security@opsis.example"',
      ]);
      expect(html).toContain('>support@opsis.example</a>');
      expect(html).toContain('>security@opsis.example</a>');
      const text = html.replace(/<[^>]+>/g, "");
      expect(text).toContain(locale === "en"
        ? "For support questions, contact support@opsis.example. Report security issues privately to security@opsis.example before any public post."
        : "支持问题请联系 support@opsis.example。安全问题请先私下报告至 security@opsis.example，再公开发布。");
    });
    it.each([
      ["", undefined], ["   ", ""], [undefined, "security@opsis.example"],
      ["<support@opsis.example>", undefined], ['"support"@opsis.example', undefined],
      ["support @opsis.example", undefined], ["support@opsis.example\n", undefined],
      ["a@b.example, c@d.example", undefined], ["support@opsis.example", "not-an-email"],
    ])("keeps absent or malformed settings unpublished (%s, %s)", (support, security) => {
      vi.stubEnv("VITE_SUPPORT_EMAIL", support);
      vi.stubEnv("VITE_SECURITY_EMAIL", security);
      const html = renderToStaticMarkup(<I18nProvider><PrivacyPage /></I18nProvider>);
      expect(html).not.toContain("mailto:");
      expect(html).toContain(locale === "en"
        ? "A support and security contact is to be published on this page."
        : "支持与安全联系方式待公布于本页面。");
    });
  },
);

import { describe, expect, it } from "vitest";
import { en } from "./dictionaries/en";
import { zhCN } from "./dictionaries/zh-CN";
import { opsisOverrides } from "./dictionaries/opsis-overrides";

const destinations = [
  ["private-explorer", "Research", "研究"],
  ["exit-check", "Trade Check", "交易核查"],
  ["swap-preview", "Swap preview", "兑换预览"],
  ["trade-simulator", "Trade scenarios", "交易情景"],
  ["portfolio-stress-test", "Portfolio shocks", "投资组合冲击"],
  ["rwa-verify", "Stock-token check", "股票代币核查"],
  ["biggest-trades", "Big trades", "大额交易"],
  ["situation-room", "World & markets", "世界与市场"],
  ["watch", "Watch", "观察"],
  ["portfolio-intelligence", "Saved", "已保存"],
] as const;

describe("Opsis identity in the base dictionaries", () => {
  it.each(destinations)("names %s without a presentation override", (id, english, chinese) => {
    const key = `product.feature.${id}.label` as keyof typeof en;
    expect(en[key]).toBe(english);
    expect(zhCN[key]).toBe(chinese);
  });
  it("names the product and pending operator contact in both languages", () => {
    expect(en["common.brand.name"]).toBe("Opsis");
    expect(zhCN["common.brand.name"]).toBe("Opsis");
    expect(en["legal.privacy.s08.prefix"]).toBe("Opsis is currently operated as an independent source-available beta.");
    expect(zhCN["legal.privacy.s08.prefix"]).toBe("Opsis 目前作为独立的源码可用测试版运营。");
    expect(en["legal.privacy.s08.contact"]).toBe("A support and security contact is to be published on this page.");
    expect(zhCN["legal.privacy.s08.contact"]).toBe("支持与安全联系方式待公布于本页面。");
  });
  it("keeps configured contact instructions bilingual and addresses outside the dictionaries", () => {
    const keys = ["supportPrefix", "supportSuffix", "securityPrefix", "securitySuffix", "sharedPrefix", "sharedSuffix"] as const;
    for (const suffix of keys) {
      const key = `legal.privacy.s08.${suffix}` as keyof typeof en;
      for (const dictionary of [en, zhCN]) {
        expect(dictionary[key]).toBeTruthy();
        expect(dictionary[key]).not.toContain("@");
        expect(dictionary[key]).not.toMatch(/\b(safe|unsafe|guaranteed|will|best|recommended|free)\b/i);
      }
    }
    expect(en["legal.privacy.s08.securitySuffix"]).toBe(" before any public post.");
    expect(zhCN["legal.privacy.s08.securitySuffix"]).toBe("，再公开发布。");
  });
  it("omits product-token copy from both locales and presentation overrides", () => {
    const removedPrefixes = ["docs.token.", "docs.nav.token", "guide.faq.groups.token.", "guide.faq.tokenReminder.", "landing.official."];
    for (const dictionary of [en, zhCN, opsisOverrides.en, opsisOverrides["zh-CN"]]) {
      expect(Object.keys(dictionary).filter((key) => removedPrefixes.some((prefix) => key.startsWith(prefix)))).toEqual([]);
    }
  });
  it("keeps only overrides that differ from base copy", () => {
    for (const [locale, base] of [["en", en], ["zh-CN", zhCN]] as const) {
      for (const [key, value] of Object.entries(opsisOverrides[locale])) {
        expect(value, `${locale}:${key}`).not.toBe(base[key as keyof typeof en]);
      }
    }
  });
});

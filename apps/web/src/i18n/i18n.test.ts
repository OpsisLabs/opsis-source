import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "./dictionaries/en";
import { zhCN } from "./dictionaries/zh-CN";
import { PRODUCT_FEATURES } from "../product/features";
import { interpolate, lookup, translate, translateCurrent } from "./translate";
import {
  DEFAULT_LOCALE,
  LOCALES,
  isLocale,
  readLocaleCookie,
  writeLocaleCookie,
} from "./locale";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dictionary parity", () => {
  const enKeys = Object.keys(en).sort();
  const zhKeys = Object.keys(zhCN).sort();

  it("defines the same keys in English and Simplified Chinese", () => {
    expect(zhKeys).toEqual(enKeys);
  });

  it("never ships an empty translation", () => {
    for (const key of enKeys) {
      expect(en[key as keyof typeof en], `en:${key}`).not.toHaveLength(0);
      expect(zhCN[key], `zh-CN:${key}`).not.toHaveLength(0);
    }
  });

  it("only exposes supported locales", () => {
    expect([...LOCALES]).toEqual(["en", "zh-CN"]);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("zh-CN")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("preserves every named interpolation parameter", () => {
    const parameters = (value: string) => [...new Set(value.match(/\{\w+\}/g) ?? [])].sort();
    for (const key of enKeys) expect(parameters(zhCN[key]), key).toEqual(parameters(en[key as keyof typeof en]));
  });

  it("covers every dynamically generated feature label and step", () => {
    for (const feature of PRODUCT_FEATURES) {
      const fields = ["label", "shortLabel", "helpLabel", "eyebrow", "navHint", "summary", "bestFor", "privacy", "boundary", ...feature.steps.map((_, index) => `step.${index + 1}`)];
      for (const field of fields) {
        const key = `product.feature.${feature.id}.${field}`;
        expect(lookup("en", key), key).toBeTruthy();
        expect(lookup("zh-CN", key), key).toBeTruthy();
      }
    }
  });
});

describe("translation primitives", () => {
  it("interpolates named parameters", () => {
    expect(interpolate("Switch to {language}", { language: "简体中文" })).toBe(
      "Switch to 简体中文",
    );
    expect(interpolate("No params")).toBe("No params");
    expect(interpolate("{missing} stays", { other: 1 })).toBe("{missing} stays");
  });

  it("falls back to English when a locale value is missing", () => {
    expect(lookup("zh-CN", "common.brand.name")).toBe(
      en["common.brand.name"],
    );
    expect(translate("en", "metadata.home.title")).toBe(
      en["metadata.home.title"],
    );
    expect(translate("en", "does.not.exist")).toBe("does.not.exist");
    expect(lookup("en", "constructor")).toBeUndefined();
    expect(lookup("zh-CN", "toString")).toBeUndefined();
  });
});

describe("non-React module localization", () => {
  it("localizes server-independent copy and validation through the cookie", () => {
    const store = { cookie: "chainscout_locale_v1=zh-CN" };
    vi.stubGlobal("document", store);
    expect(translateCurrent("common.state.unknown")).toBe("未知");
    expect(translateCurrent("trade.error.insufficientBalance")).toBe(
      zhCN["trade.error.insufficientBalance"],
    );
    expect(translateCurrent("vault.create.mismatch")).toBe(
      zhCN["vault.create.mismatch"],
    );
  });
});

describe("locale persistence", () => {
  it("ignores malformed unrelated cookies and falls back for malformed or unsupported preferences", () => {
    vi.stubGlobal("document", { cookie: "unrelated=%ZZ; chainscout_locale_v1=zh-CN" });
    expect(readLocaleCookie()).toBe("zh-CN");
    for (const value of ["%ZZ", "zh-TW", "en-US", "", "__proto__"]) {
      vi.stubGlobal("document", { cookie: `chainscout_locale_v1=${value}` });
      expect(readLocaleCookie()).toBe("en");
    }
  });

  it("survives blocked preference storage", () => {
    vi.stubGlobal("document", { get cookie() { throw new Error("blocked"); }, set cookie(_value: string) { throw new Error("blocked"); } });
    expect(readLocaleCookie()).toBe("en");
    expect(() => writeLocaleCookie("zh-CN")).not.toThrow();
  });

  it("uses a Secure cookie on HTTPS", () => {
    const store = { cookie: "" };
    vi.stubGlobal("document", store);
    vi.stubGlobal("window", { location: { protocol: "https:" } });
    writeLocaleCookie("zh-CN");
    expect(store.cookie).toContain("; Secure");
  });
  it("defaults to English without a cookie", () => {
    vi.stubGlobal("document", { cookie: "" });
    expect(readLocaleCookie()).toBe(DEFAULT_LOCALE);
  });

  it("persists and reads back the chosen locale from a cookie", () => {
    const store = { cookie: "" } as { cookie: string };
    vi.stubGlobal("document", store);
    writeLocaleCookie("zh-CN");
    expect(store.cookie).toContain("chainscout_locale_v1=zh-CN");
    expect(store.cookie).toContain("Max-Age=31536000");
    expect(store.cookie).toContain("Path=/");
    expect(store.cookie).toContain("SameSite=Strict");
    expect(readLocaleCookie()).toBe("zh-CN");
  });
});

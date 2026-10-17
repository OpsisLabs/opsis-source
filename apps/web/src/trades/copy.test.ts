import { describe, expect, it } from "vitest";
import { translate, type TranslateParams, type TranslationKey } from "../i18n";
import { tradeText } from "./copy";

const t =
  (locale: "en" | "zh-CN") => (key: TranslationKey, params?: TranslateParams) =>
    translate(locale, key, params);

describe("Big trades result explanations", () => {
  it("translates every limitation and the narrowed-window note, preserving English", () => {
    for (const key of [1, 2, 3, 4, 5, 6]
      .map((n) => `trades.limitations.${n}`)
      .concat("trades.result.narrowedNote")) {
      const english = translate("en", key);
      expect(tradeText(english, t("en"))).toBe(english);
      expect(tradeText(english, t("zh-CN"))).toBe(translate("zh-CN", key));
      expect(tradeText(english, t("zh-CN"))).toMatch(/[\u3400-\u9fff]/);
    }
  });
  it("translates the full receipt and routing disclosure without losing the destination", () => {
    for (const destination of [
      "Robinhood Public RPC",
      "dRPC Robinhood Chain gateway",
    ]) {
      const routing = destination.startsWith("dRPC")
        ? translate("en", "trades.privacy.routing")
        : "";
      const english =
        translate("en", "trades.privacy.disclosure", { destination }) + routing;
      expect(tradeText(english, t("en"))).toBe(english);
      const chinese = tradeText(english, t("zh-CN"));
      expect(chinese).toContain(destination);
      expect(chinese).toContain("未发送私人钱包");
      expect(chinese).toContain("不保留未使用的交易数据");
      expect(chinese.includes("独立节点运营方")).toBe(Boolean(routing));
    }
  });
  it("keeps unknown or changed server evidence intact", () => {
    for (const text of [
      "A future limitation",
      "A future privacy receipt",
      "toString",
      "",
    ]) {
      expect(tradeText(text, t("zh-CN"))).toBe(text);
    }
    const receipt = translate("en", "trades.privacy.disclosure", {
      destination: "demo-provider",
    });
    expect(tradeText(receipt + " New qualification.", t("zh-CN"))).toBe(
      receipt + " New qualification.",
    );
  });
});

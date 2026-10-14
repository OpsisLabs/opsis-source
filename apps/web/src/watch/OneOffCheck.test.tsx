import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KNOWN_ASSETS } from "../opsis/known-assets";
import { TokenTable } from "./OneOffCheck";
import { watchFixture } from "./fixture";

const language = vi.hoisted(() => ({ chinese: false }));
vi.mock("../opsis/copy", () => ({ useCopy: () => (en: string, zh: string) => language.chinese ? zh : en }));
const base = watchFixture().tokens[0];
for (const chinese of [false, true]) {
  describe(chinese ? "Chinese Watch token table" : "English Watch token table", () => {
    it("shows reviewed assets first and the same identity flags as Research", () => {
      language.chinese = chinese;
      const html = renderToStaticMarkup(<TokenTable tokens={[
        { ...base, name: "Ordinary token", symbol: "OTHER" },
        { ...base, contract: `0x${"4".repeat(40)}`, name: "United Stable Dollar Coin", symbol: "USDC" },
        { ...base, contract: `0x${"5".repeat(40)}`, name: "Reported\u202ename", symbol: "N\u200bVDA", reputation: "scam" },
        { ...base, contract: KNOWN_ASSETS[0].address, name: "Reviewed token", symbol: KNOWN_ASSETS[0].symbol },
      ]} />);
      const text = html.replace(/<[^>]*>/g, "");
      expect(text.indexOf("Reviewed token")).toBeLessThan(text.indexOf("United Stable Dollar Coin"));
      expect(text.indexOf("Reported[U+202E]name")).toBeLessThan(text.indexOf("Ordinary token"));
      expect(text).toContain("N[U+200B]VDA");
      expect(text).toContain(chinese ? "已审核资产" : "Reviewed asset");
      expect(text).toContain(chinese ? "使用符号 NVDA，但这不是已审核的 NVDA 合约。" : "Uses the symbol NVDA, but this is not the reviewed NVDA contract.");
      expect(text).toContain(chinese ? "使用符号 USDC；此合约不在 Opsis 的已审核资产列表中。" : "Uses the symbol USDC; this contract is not on the Opsis reviewed asset list.");
      expect(text).toContain(chinese ? "名称或符号含有隐藏字符，已在上方用方括号显示。" : "The name or symbol contains hidden characters, shown in brackets above.");
      expect(text).toContain(chinese ? "Blockscout 将此代币标记为骗局。" : "Blockscout marks this token as a scam.");
      expect(text).toContain(chinese ? "名称和符号由各合约自行报告。" : "Names and symbols are what each contract reports about itself.");
      expect(html).toContain("overflow-x-auto");
      expect(html).toContain("table-fixed");
      expect(html).not.toContain("\u200b");
      expect(html).not.toContain("\u202e");
    });

    it("keeps an empty result and old holdings without reputation renderable", () => {
      language.chinese = chinese;
      expect(renderToStaticMarkup(<TokenTable tokens={[]} />)).toContain("<tbody></tbody>");
      const html = renderToStaticMarkup(<TokenTable tokens={[base]} />);
      expect(html).toContain("Test token · TEST");
      expect(html).not.toContain(chinese ? "标记为骗局" : "marks this token as a scam");
    });
  });
}

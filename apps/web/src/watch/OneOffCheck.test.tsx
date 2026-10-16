import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KNOWN_ASSETS } from "../opsis/known-assets";
import { TokenTable, WalletSnapshot, WatchTimeline } from "./OneOffCheck";
import { watchFixture } from "./fixture";

const language = vi.hoisted(() => ({ chinese: false }));
vi.mock("../opsis/copy", () => ({ useCopy: () => (en: string, zh: string) => language.chinese ? zh : en }));
vi.mock("../i18n", () => ({ useI18n: () => ({ locale: language.chinese ? "zh-CN" : "en", t: (key: string) => key }) }));
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
      expect(html).toContain('class="watch-warning-row"');
      expect(html).toContain('colSpan="3"');
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

for (const chinese of [false, true]) {
  describe(chinese ? "Chinese Watch result" : "English Watch result", () => {
    it("shows exact native and token quantities, fact tiles and local save without logos", () => {
      language.chinese = chinese;
      const snapshot = watchFixture();
      const html = renderToStaticMarkup(<WalletSnapshot snapshot={snapshot} onSave={() => {}} />);
      expect(html).toContain("1.000000000000000001 ETH");
      expect(html).toContain(chinese ? "1 个中的 1 个" : "1 of 1");
      expect(html).toContain(chinese ? "保存到加密观察列表" : "Save to encrypted watchlist");
      expect(html).toContain(chinese ? "在此设备上加密" : "Encrypted on this device");
      expect(html).toContain(chinese ? "复制地址" : "Copy address");
      expect(html).toContain(chinese ? "原生资产" : "Native");
      expect(html).not.toContain("<img");
      expect(html).not.toContain("<h1");
    });

    it("renders newest transfers first, failed calls without movement claims and an explicit empty state", () => {
      language.chinese = chinese;
      const snapshot = watchFixture(101);
      const hash = `0x${"d".repeat(64)}`;
      snapshot.transactions.push({ ...snapshot.transactions[0], hash, blockNumber: 102, status: "failed" });
      snapshot.movements.push({ ...snapshot.movements[0], transactionHash: hash, quantity: "987654" });
      const html = renderToStaticMarkup(<WatchTimeline snapshot={snapshot} />);
      expect(html.indexOf(chinese ? "交易失败" : "Failed transaction")).toBeLessThan(html.indexOf(chinese ? "已发送 0.1 ETH" : "Sent 0.1 ETH"));
      expect(html).not.toContain("987654");
      expect(html).toContain(chinese ? "来源与读取时间" : "Sources &amp; read times");
      expect(html).toContain(chinese ? "查看交易证据" : "Open transaction evidence");
      const empty = watchFixture();
      empty.transactions = [];
      expect(renderToStaticMarkup(<WatchTimeline snapshot={empty} />)).toContain(chinese ? "覆盖缺失不代表历史为空" : "Missing coverage is not an empty history");
    });

    it("keeps undated approval evidence explicit and token text visible", () => {
      language.chinese = chinese;
      const snapshot = watchFixture();
      snapshot.transactions = [];
      snapshot.approvals = [{ transactionHash: `0x${"e".repeat(64)}`, contract: base.contract, spender: snapshot.address, kind: "erc20", symbol: "N\u200bVDA", active: true, unlimited: true, currentAmount: "1", sourceIds: ["rpc"] }];
      const html = renderToStaticMarkup(<WatchTimeline snapshot={snapshot} />);
      expect(html).toContain(chinese ? "授权活动" : "Approval activity");
      expect(html).toContain(chinese ? "交易时间未知" : "Transaction time unknown");
      expect(html).toContain(chinese ? "无限额" : "Unlimited");
      expect(html).toContain("N[U+200B]VDA");
      expect(html).not.toContain("\u200b");
    });

    it("does not present unavailable activity as zero", () => {
      language.chinese = chinese;
      const snapshot = watchFixture();
      snapshot.transactions = [];
      snapshot.reconciliation.degradedSources = ["blockscout:transactions"];
      const html = renderToStaticMarkup(<WalletSnapshot snapshot={snapshot} onSave={() => {}} />);
      expect(html).toContain(chinese ? "未知" : "Unknown");
    });
  });
}

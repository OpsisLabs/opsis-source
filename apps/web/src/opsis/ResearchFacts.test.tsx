import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { DecodedAction } from "../private/api";
import { DecodedActions, TokenFacts, WalletBalances } from "./ResearchFacts";
import { orderActions } from "./transactionTimeline";

const language = vi.hoisted(() => ({ chinese: false }));
vi.mock("./copy", () => ({ useCopy: () => (en: string, zh: string) => language.chinese ? zh : en }));
const address = `0x${"1".repeat(40)}`;
const token = { address, symbol: "FIX", decimals: 6 };
const text = (html: string) => html.replace(/<[^>]*>/g, "");

for (const chinese of [false, true]) {
  describe(chinese ? "Chinese result copy" : "English result copy", () => {
    it("formats transfers, permissions and swaps with exact raw values available", () => {
      language.chinese = chinese;
      const actions: DecodedAction[] = [
        { kind: "erc20_transfer", logIndex: 0, token, from: address, to: address, rawAmount: "1234567890", amount: "1234.56789" },
        { kind: "erc20_approval", logIndex: 1, token, owner: address, spender: address, rawAmount: "1000000", amount: "1", unlimited: false },
        { kind: "uniswap_v3_swap", logIndex: 2, pool: address, feeBps: 30, sender: address, recipient: address,
          sold: { token, rawAmount: "1000000", amount: "1" }, bought: { token, rawAmount: "2500000", amount: "2.5" } },
      ];
      const html = renderToStaticMarkup(<DecodedActions actions={actions} coverage="partial" />);
      expect(text(html)).toContain(chinese ? "发生了什么" : "What happened");
      expect(text(html)).toContain("1,234.56789 FIX");
      expect(text(html)).toContain(chinese ? "设置支出权限" : "set spending permission");
      expect(text(html)).toContain(chinese ? "兑换了 1 FIX 换得 2.5 FIX" : "Swapped 1 FIX for 2.5 FIX");
      expect(text(html)).toContain("0.3%");
      expect(text(html)).toContain("1234567890");
      expect(text(html)).toContain(chinese ? "部分收据日志未能解码" : "Some receipt logs were not decoded");
      expect(html).toContain(`title="${address}"`);
      expect(html).not.toContain("<details open");
    });

    it("leaves absent precision, balances and supply unknown", () => {
      language.chinese = chinese;
      const action: DecodedAction = { kind: "erc20_transfer", logIndex: 0, token: { ...token, decimals: null, symbol: null }, from: address, to: address, rawAmount: "1000000", amount: null };
      const html = renderToStaticMarkup(<DecodedActions actions={[action]} coverage="decoded" />);
      expect(text(html)).toContain(chinese ? "数量未知" : "Amount unknown");
      const supply = renderToStaticMarkup(<TokenFacts facts={{ totalSupply: "1000000", decimals: null }} />);
      expect(text(supply)).toContain(chinese ? "总供应量未知" : "Total supplyUnknown");
      const balances = renderToStaticMarkup(<WalletBalances facts={{ tokenBalances: [{ tokenSymbol: "FIX", formattedValue: null }], nativeBalanceEth: null, tokenBalanceCoverage: "reviewed_asset_sample" }} />);
      expect(text(balances)).toContain(chinese ? "数量未知" : "Amount unknown");
      expect(text(balances)).toContain(chinese ? "还可能持有其他代币" : "other tokens may be held");
    });
  });
}

describe("first-visit result details", () => {
  const zero = `0x${"0".repeat(40)}`;
  const transfer = (logIndex: number, from = address, to = address): DecodedAction =>
    ({ kind: "erc20_transfer", logIndex, token, from, to, rawAmount: "1000000", amount: "1" });
  const swap = (logIndex: number): DecodedAction => ({ kind: "uniswap_v3_swap", logIndex, pool: address, feeBps: 1, sender: address, recipient: address,
    sold: { token, rawAmount: "1000000", amount: "1" }, bought: { token, rawAmount: "2000000", amount: "2" } });

  it("lists swaps first and keeps the rest in receipt order", () => {
    expect(orderActions([transfer(33), transfer(34), swap(35), transfer(36)]).map((action) => action.logIndex)).toEqual([35, 33, 34, 36]);
    expect(orderActions([transfer(2), transfer(1)]).map((action) => action.logIndex)).toEqual([1, 2]);
  });

  it("explains the zero address instead of showing it as a counterparty", () => {
    language.chinese = false;
    const burned = text(renderToStaticMarkup(<DecodedActions actions={[transfer(0, address, zero)]} coverage="decoded" />));
    expect(burned).toContain("to the zero address (tokens removed from supply)");
    const issued = text(renderToStaticMarkup(<DecodedActions actions={[transfer(0, zero, address)]} coverage="decoded" />));
    expect(issued).toContain("from the zero address (newly issued tokens)");
  });

  it("says a token name is self-reported unless the contract is on the reviewed list", () => {
    language.chinese = false;
    const unknown = text(renderToStaticMarkup(<TokenFacts facts={{ address, name: "WETH", symbol: "WETH", decimals: 18, totalSupply: "1" }} />));
    expect(unknown).toContain("Name and symbol are what this contract reports about itself.");
    const reviewed = text(renderToStaticMarkup(<TokenFacts facts={{ address: "0x0bd7d308f8e1639fab988df18a8011f41eacad73", name: "WETH", symbol: "WETH", decimals: 18, totalSupply: "1" }} />));
    expect(reviewed).toContain("This contract is on the Opsis reviewed asset list.");
    expect(reviewed).not.toContain("reports about itself");
  });
});

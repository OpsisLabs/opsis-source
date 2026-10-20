import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { DecodedAction, ResearchFacts } from "../private/api";
import { DecodedActions, ResearchEvidence, ResearchIdentity, ResearchTiles, TokenFacts, WalletBalances, WalletTransactions } from "./ResearchFacts";
import weth from "./fixtures/research-weth-token.json";
import pons from "./fixtures/research-pons-token.json";
import wallet from "./fixtures/research-wallet.json";
import { KNOWN_ASSETS } from "./known-assets";
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


for (const chinese of [false, true]) {
  describe(chinese ? "Chinese explorer facts" : "English explorer facts", () => {
    const renderToken = (facts: ResearchFacts) => {
      language.chinese = chinese;
      return renderToStaticMarkup(<TokenFacts facts={facts} />);
    };

    it("shows four token and wallet tiles with explicit missing values", () => {
      language.chinese = chinese;
      for (const type of ["token", "wallet"] as const) {
        const facts = type === "token" ? weth.entity.facts : wallet.entity.facts;
        const html = renderToStaticMarkup(<ResearchTiles facts={facts} type={type} />);
        expect((html.match(/data-testid="research-fact-tile"/g) ?? []).length).toBe(4);
        expect(text(html)).toContain(type === "token" ? "584,668" : chinese ? "ETH 余额" : "ETH balance");
        const missing = renderToStaticMarkup(<ResearchTiles facts={{}} type={type} />);
        expect(text(missing)).toContain(chinese ? "未知" : "Unknown");
        expect(missing).not.toContain("<dd>0</dd>");
      }
      const unavailable = renderToStaticMarkup(<ResearchTiles facts={{ ...weth.entity.facts, holderCoverage: "unavailable", activityCoverage: "unavailable" }} type="token" />);
      expect(text(unavailable)).toContain("584,668");
      const statusUnknown = renderToStaticMarkup(<ResearchTiles facts={{ recentTransactions: [{ hash: "sample", from: address }] }} type="wallet" />);
      expect(text(statusUnknown)).toContain(chinese ? "失败未知" : "FailedUnknown");
    });

    it("uses the explorer read time and localized identity with exact identifier access", () => {
      language.chinese = chinese;
      const html = renderToStaticMarkup(<ResearchIdentity entity={{ chainId: weth.entity.chainId, value: weth.entity.value, citations: [], riskNotes: [], type: "token", facts: { ...weth.entity.facts, name: "Wrapped Ether", explorerObservedAt: "2026-10-14T15:00:00Z" } }} checkedAt="2026-10-15T15:00:00Z" />);
      expect(html).toContain("<h2>WETH</h2>");
      expect(text(html)).toContain("Wrapped Ether");
      expect(text(html)).toContain(chinese ? "链 4663" : "Chain 4663");
      expect(html).toContain(weth.entity.value);
      expect(html).toContain('dateTime="2026-10-14T15:00:00.000Z"');
      expect(html).not.toContain('dateTime="2026-10-15T15:00:00.000Z"');
      expect(text(html)).toContain(chinese ? "已审核资产列表" : "reviewed asset list");
    });

    it("groups evidence by label without dropping read times and rejects non-HTTP links", () => {
      language.chinese = chinese;
      const base = { id: "one", label: "Identity", provider: "Blockscout", entityType: "token" as const, entityId: address, fieldsUsed: ["name"], fetchedAt: "2026-10-14T15:00:00Z", url: "https://example.com/token" };
      const html = renderToStaticMarkup(<ResearchEvidence sources={[base, { ...base, id: "two", fetchedAt: "2026-10-14T15:01:00Z", url: "javascript:alert(1)" }, { ...base, id: "three", label: "Holders" }]} />);
      expect((html.match(/<h4>Identity<\/h4>/g) ?? []).length).toBe(1);
      expect(text(html)).toContain(chinese ? "来源与读取时间" : "Sources &amp; read times");
      expect(text(html)).toContain(chinese ? "3 条观察记录" : "3 observations");
      expect(html).toContain('dateTime="2026-10-14T15:01:00.000Z"');
      expect(html).toContain('href="https://example.com/token"');
      expect(html).not.toContain("javascript:");
      expect(html).not.toContain('open=""');
    });

    it("prints ranks, shares and tags next to each holder bar", () => {
      const html = renderToken(weth.entity.facts);
      expect((html.match(/data-testid="holder-bar"/g) ?? []).length).toBe(10);
      expect(html).toContain('class="research-bar-track" aria-hidden="true"');
      for (const holder of weth.entity.facts.topHolders.slice(0, 10)) {
        expect(html).toContain(holder.address);
        expect(text(html)).toContain(Number(holder.share).toFixed(1) + "%");
      }
      const unknown = renderToken({ holderCoverage: "top_holders", topHolders: [{ address, share: null }] });
      expect(unknown).toContain('width:0%');
      expect(text(unknown)).toContain(chinese ? "未知" : "Unknown");
    });

    it("renders the older WETH fixture and the new verification and proxy contract", () => {
      const legacy = renderToken(weth.entity.facts);
      expect(text(legacy)).toContain(chinese ? "小数位18" : "Decimals18");
      expect(text(legacy)).toContain("39,756.656303302136451718");
      expect(text(legacy)).toContain("584,668");
      expect(text(legacy)).toContain("486,615,089");
      expect(text(legacy)).toContain(chinese ? "交易池" : "Trading pool");
      expect(text(legacy)).toContain(chinese ? "已验证" : "Verified");
      expect(text(legacy)).toContain(chinese ? "近期转移" : "Recent transfers");
      const current = renderToken({ ...weth.entity.facts, decimals: 18, holders: 584668, lifetimeTransfers: 486615089,
        holderCoverage: "top_holders", activityCoverage: "indexed_window", sourceCoverage: "explorer_metadata",
        proxyType: "eip1967", implementations: [{ address, name: "TokenImplementation" }],
        explorerObservedAt: "2026-10-14T15:00:00Z", explorerCached: true });
      expect(current).toContain(`title="${address}"`);
      expect(current).toContain("eip1967");
      expect(current).toContain('dateTime="2026-10-14T15:00:00.000Z"');
      expect(text(current)).toContain(chinese ? "复用了该次读取的数据" : "Reused from that read");
      expect((current.match(/data-testid="holder-bar"/g) ?? []).length).toBe(10);
      expect((current.match(/<tbody>/g) ?? []).length).toBe(1);
      expect((current.match(/<tr>/g) ?? []).length).toBe(6);
    });

    it("renders PONS burns separately for both shapes", () => {
      for (const facts of [pons.entity.facts, { ...pons.entity.facts, decimals: 18, holderCoverage: "top_holders" as const,
        burnedShare: 32.5, top1WalletShare: 5.4, top10WalletShare: 21.2,
        topHolders: pons.entity.facts.topHolders.map((holder, index) => ({ ...holder, isBurn: index === 0 })) }]) {
        const html = renderToken(facts);
        expect(text(html)).toContain(chinese ? "销毁地址" : "Burn address");
        expect(text(html)).toContain(chinese ? "销毁地址占比32.5%" : "Burned share32.5%");
        expect(text(html)).toContain(chinese ? "最大持有人，不含交易池和销毁地址5.4%" : "Largest holder, excluding trading pools and burn addresses5.4%");
      }
    });

    it("keeps verification and proxy unknown and reports the explorer flag", () => {
      const html = renderToken({ holders: "5", verified: null, proxy: null, explorerReputation: "scam" });
      expect(text(html)).toContain(chinese ? "源代码 · Blockscout未知" : "Source code · BlockscoutUnknown");
      expect(text(html)).toContain(chinese ? "合约未知" : "ContractUnknown");
      expect(text(html)).toContain(chinese ? "Blockscout 将此代币标记为骗局" : "Blockscout marks this token as a scam");
      const no = text(renderToken({ holders: 0, verified: false, proxy: false }));
      expect(no).toContain(chinese ? "未验证" : "Not verified");
      expect(no).toContain(chinese ? "合约非代理合约" : "ContractNot a proxy");
    });

    it("groups the older wallet fixture, flags lookalikes and counts failures across the window", () => {
      language.chinese = chinese;
      const balances = renderToStaticMarkup(<WalletBalances facts={wallet.entity.facts} />);
      expect(text(balances)).toContain(chinese ? "使用符号 USDC；此合约不在 Opsis 的已审核资产列表中" : "Uses the symbol USDC; this contract is not on the Opsis reviewed asset list");
      expect(text(balances)).toContain(chinese ? "使用符号 NVDA，但这不是已审核的 NVDA 合约" : "Uses the symbol NVDA, but this is not the reviewed NVDA contract");
      // The two USDG lookalikes sit beyond the first ten balances in the explorer's order.
      expect(text(balances)).toContain(chinese ? "使用符号 USDG，但这不是已审核的 USDG 合约" : "Uses the symbol USDG, but this is not the reviewed USDG contract");
      expect(text(balances)).not.toContain("CA5HCAT");
      expect(balances).not.toContain('data-testid="reviewed-balances"');
      expect(text(balances)).toContain(chinese ? "显示所有其他代币" : "Show all other tokens");
      const transactions = renderToStaticMarkup(<WalletTransactions facts={wallet.entity.facts} address={wallet.entity.value} />);
      expect(text(transactions)).toContain(chinese ? "1 笔交易在此窗口中失败" : "1 failed transaction in this window");
      expect((transactions.match(/<tr>/g) ?? []).length).toBe(11);
      expect(text(transactions)).toContain(chinese ? "发送" : "Sent");
      expect(transactions).not.toContain("failureDetail");
    });

    it("shows hidden characters and explorer flags without rendering invisible controls", () => {
      language.chinese = chinese;
      const usdc = KNOWN_ASSETS.find((asset) => asset.symbol === "USDG")!;
      const html = renderToStaticMarkup(<WalletBalances facts={{ tokenBalances: [
        { tokenAddress: address, tokenName: "PO\u200bNS", tokenSymbol: "US\u202eDC", formattedValue: "10", reputation: "scam", decimals: 18 },
        { tokenAddress: usdc.address, tokenName: "Global Dollar", tokenSymbol: "USDG", formattedValue: "20" },
      ] }} />);
      expect(text(html)).toContain("PO[U+200B]NS");
      expect(text(html)).toContain("US[U+202E]DC");
      expect(text(html)).toContain(chinese ? "含有隐藏字符" : "contains hidden characters");
      expect(text(html)).toContain(chinese ? "Blockscout 将此代币标记为骗局" : "Blockscout marks this token as a scam");
      expect(html).not.toContain("\u200b");
      expect(html.indexOf("Global Dollar")).toBeLessThan(html.indexOf("PO[U+200B]NS"));
    });

    it("renders sent, received and self transactions, methods and exact positive ETH", () => {
      language.chinese = chinese;
      const transactions = [
        { hash: "one", from: address, to: `0x${"2".repeat(40)}`, status: "ok", value: "1000000000000000001", decodedInput: { method_call: "approve(address spender)" } },
        { hash: "two", from: `0x${"2".repeat(40)}`, to: address, status: "ok", value: "0", method: null },
        { hash: "three", from: address, to: address, status: "error", value: "0", method: "0xb2460c48", failureDetail: "server-only detail" },
      ];
      const html = renderToStaticMarkup(<WalletTransactions facts={{ activityCoverage: "indexed_window", recentTransactions: transactions }} address={address} />);
      for (const sentence of chinese ? ["发送", "接收", "自身", "转账", "合约调用", "失败"] : ["Sent", "Received", "Self", "Transfer", "Contract call", "Failed"]) expect(text(html)).toContain(sentence);
      expect(text(html)).toContain("1.000000000000000001 ETH");
      expect(text(html)).toContain("approve");
      expect(html).not.toContain("server-only detail");
      expect(text(html)).not.toContain("0 ETH");
    });

    it("keeps partial coverage and unavailable rows distinct", () => {
      const html = renderToken({ ...weth.entity.facts, holderCoverage: "top_holders", activityCoverage: "unavailable", explorerUnavailableReason: "rate_limited",
        topHolders: [{ address, label: "ExamplePool", isPool: true, isContract: true, flaggedScam: true, share: 3.7 }] });
      expect(text(html)).toContain(chinese ? "被区块浏览器标记" : "Flagged by the explorer");
      expect(text(html)).toContain("ExamplePool");
      expect(html).not.toContain('data-testid="token-transfers"><h3>' + (chinese ? "近期转移" : "Recent transfers") + '</h3><p class="opsis-small">12');
      expect(text(html)).not.toContain("0.041933053287515482");
      const balances = renderToStaticMarkup(<WalletBalances facts={{ ...wallet.entity.facts, tokenBalanceCoverage: "unavailable" }} />);
      expect(balances).not.toContain("<li>");
      const transactions = renderToStaticMarkup(<WalletTransactions facts={{ ...wallet.entity.facts, activityCoverage: "unavailable" }} address={wallet.entity.value} />);
      expect(transactions).not.toContain("<li>");
    });

    it("counts failed transactions beyond the ten displayed rows", () => {
      language.chinese = chinese;
      const rows = Array.from({ length: 11 }, (_, index) => ({ hash: String(index), from: address, to: address, status: index === 10 ? "error" : "ok" }));
      const html = renderToStaticMarkup(<WalletTransactions facts={{ recentTransactions: rows }} address={address} />);
      expect(text(html)).toContain(chinese ? "1 笔交易在此窗口中失败" : "1 failed transaction in this window");
      expect((html.match(/<tr>/g) ?? []).length).toBe(11);
    });

    it("does not attach a reason to holder and transfer data that was read", () => {
      language.chinese = chinese;
      for (const reason of ["daily_limit", "rate_limited", "unavailable"] as const) {
        const html = text(renderToken({ holderCoverage: "top_holders", activityCoverage: "indexed_window", sourceCoverage: "explorer_metadata",
          holders: 10, topHolders: [], recentTransfers: [], explorerUnavailableReason: reason }));
        expect(html).not.toContain("00:00 UTC");
        expect(html).not.toContain(chinese ? "请在一分钟后重试" : "try again in a minute");
        expect(html).not.toContain(chinese ? "无法从 Blockscout 读取" : "could not be read");
      }
    });

    for (const reason of [undefined, "daily_limit", "rate_limited", "unavailable"] as const) {
      it(`reports missing coverage with ${reason ?? "no reason"}`, () => {
        const facts: ResearchFacts = { holderCoverage: "unavailable", activityCoverage: "unavailable", tokenBalanceCoverage: "unavailable", explorerUnavailableReason: reason };
        const html = renderToken(facts);
        expect(text(html)).toContain(chinese ? "无法从 Blockscout 读取持有人数据" : "Holder data could not be read from Blockscout");
        expect(text(html)).toContain(chinese ? "无法从 Blockscout 读取近期转移" : "Recent transfers could not be read from Blockscout");
        const transactions = renderToStaticMarkup(<WalletTransactions facts={facts} address={address} />);
        expect(text(transactions)).toContain(chinese ? "无法从 Blockscout 读取近期交易" : "Recent transactions could not be read from Blockscout");
        const balances = renderToStaticMarkup(<WalletBalances facts={facts} />);
        expect(text(balances)).toContain(chinese ? "无法从 Blockscout 读取代币余额" : "Token balances could not be read from Blockscout");
        const rpc = renderToken({ ...facts, sourceCoverage: "rpc_sample_only", metadataCoverage: "rpc_partial" });
        expect(rpc).toContain('data-testid="research-token-rpc-coverage"');
        const sentence = reason === "daily_limit" ? "00:00 UTC" : reason === "rate_limited" ? (chinese ? "请在一分钟后重试" : "try again in a minute") : null;
        if (sentence) for (const markup of [html, transactions, balances, rpc]) expect(text(markup)).toContain(sentence);
        for (const markup of [html, transactions, balances]) {
          expect(markup).not.toContain("<li>");
          expect(text(markup)).not.toContain("0 holders");
          expect(text(markup)).not.toContain("0 transactions");
        }
      });
    }
  });
}

it("links Research identity, decoded parties, token contracts and holders", () => {
  language.chinese = false;
  const hash = `0x${"a".repeat(64)}`;
  const identity = (type: "token" | "wallet" | "contract" | "transaction", value: string) => renderToStaticMarkup(<ResearchIdentity entity={{ type, value, chainId: 4663, facts: {}, citations: [], riskNotes: [] }} />);
  for (const type of ["token", "wallet", "contract", "transaction"] as const) {
    const value = type === "transaction" ? hash : address;
    const kind = type === "transaction" ? "tx" : type === "token" ? "token" : "address";
    expect(identity(type, value)).toContain(`href="https://robinhoodchain.blockscout.com/${kind}/${value}"`);
  }
  const actions = renderToStaticMarkup(<DecodedActions coverage="decoded" actions={[{ kind: "erc20_transfer", logIndex: 1, token, from: address, to: address, rawAmount: "1000000", amount: "1" }]} />);
  expect(actions).toContain(`href="https://robinhoodchain.blockscout.com/address/${address}"`);
  expect(actions).toContain(`href="https://robinhoodchain.blockscout.com/token/${address}"`);
  const holders = renderToStaticMarkup(<TokenFacts facts={{ topHolders: [{ address, share: 1 }] }} />);
  expect(holders).toContain(`href="https://robinhoodchain.blockscout.com/address/${address}"`);
});

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContractFact, ContractFacts as Facts } from "@rh-chain/shared";
import I18nProvider from "../i18n/I18nProvider";
import type { PrivateAnalysis } from "../private/api";
import ContractFacts from "./ContractFacts";
import Research from "./Research";
import type { Capabilities } from "./model";
import { clearPublicSession, publicSession } from "./public-session";
import { research } from "./test-fixtures";

const language = vi.hoisted(() => ({ chinese: false }));
vi.mock("./copy", () => ({ useCopy: () => (en: string, zh: string) => language.chinese ? zh : en }));
const address = `0x${"1".repeat(40)}`;
const implementation = `0x${"2".repeat(40)}`;
const fetchedAt = "2026-10-20T12:00:00.000Z";
const source = { provider: "blockscout" as const, url: `https://robinhoodchain.blockscout.com/api/v2/smart-contracts/${address}`, fetchedAt, fieldsUsed: ["is_verified"] };
const fact = <T,>(value: T): ContractFact<T> => ({ value, reason: null, source });
const facts: Facts = { sourceVerified: fact(true), name: fact("SampleToken"), compilerVersion: fact("v0.8.30"),
  optimizationEnabled: fact(true), proxy: fact(true), implementations: fact([implementation]), verifiedAt: fact("2026-07-13T23:55:17.954502Z") };
const plain = (html: string) => html.replace(/<[^>]*>/g, "").replaceAll("&#x27;", "'");
afterEach(() => { clearPublicSession(); language.chinese = false; });

for (const chinese of [false, true]) {
  describe(chinese ? "Chinese contract facts" : "English contract facts", () => {
    it("renders verified metadata, proxy addresses and each original source time", () => {
      language.chinese = chinese;
      const html = renderToStaticMarkup(<ContractFacts facts={facts} address={address} />);
      const text = plain(html);
      expect(text).toContain(chinese ? "合约事实" : "Contract facts");
      expect(text).toContain(chinese ? "源代码已在 Blockscout 验证" : "Source verified on Blockscout");
      expect(text).toContain(chinese ? "源代码已验证不代表合约安全。" : "Verified source does not mean the contract is safe.");
      for (const value of ["SampleToken", "v0.8.30", implementation, facts.verifiedAt.value!]) expect(text).toContain(value);
      expect(text).toContain(chinese ? "开启" : "On");
      expect(html.match(/<time /g)).toHaveLength(7);
      expect(html.match(/Blockscout ↗<\/a>/g)).toHaveLength(chinese ? 7 : 8);
      expect(html).toContain(`href="https://robinhoodchain.blockscout.com/address/${address}?tab=contract" target="_blank" rel="noopener noreferrer"`);
      expect(text).toContain(chinese ? "在 Blockscout 查看源代码 ↗" : "View source on Blockscout ↗");
    });

    it("renders explicit unverified and off without inventing a verified name", () => {
      language.chinese = chinese;
      const missing: ContractFact<string> = { value: null, reason: "not_reported", source };
      const text = plain(renderToStaticMarkup(<ContractFacts address={address} facts={{ ...facts, sourceVerified: fact(false), name: missing,
        optimizationEnabled: fact(false), proxy: fact(false), implementations: fact([]), verifiedAt: missing }} />));
      expect(text).toContain(chinese ? "源代码未在 Blockscout 验证" : "Source not verified on Blockscout");
      expect(text).toContain(chinese ? "关闭" : "Off");
      expect(text).toContain(chinese ? "否" : "No");
      expect(text).toContain(chinese ? "未报告实现地址" : "None reported");
      expect(text).toContain(chinese ? "无法核查（Blockscout 未报告）" : "Can't check (not reported by Blockscout)");
      expect(text).not.toContain("SampleToken");
    });

    it.each(["explorer_unavailable", "malformed"] as const)("renders %s as can't check, never unverified", (reason) => {
      language.chinese = chinese;
      const missing = { value: null, reason, source: reason === "malformed" ? source : null };
      const unavailable: Facts = { sourceVerified: missing, name: missing, compilerVersion: missing, optimizationEnabled: missing,
        proxy: missing, implementations: missing, verifiedAt: missing };
      const text = plain(renderToStaticMarkup(<ContractFacts facts={unavailable} address={address} />));
      expect(text).toContain(reason === "malformed" ? chinese ? "无法核查（区块浏览器数据格式错误）" : "Can't check (malformed explorer data)"
        : chinese ? "无法核查（区块浏览器不可用）" : "Can't check (explorer unavailable)");
      expect(text).not.toContain(chinese ? "源代码未在 Blockscout 验证" : "Source not verified on Blockscout");
    });
  });
}

it("Research shows the block only for an explicitly enabled token/contract result, near identity", () => {
  const capabilities: Capabilities = { expiresAt: new Date(Date.now() + 60000).toISOString(), chainId: 4663, research: true,
    exitCheck: false, watch: false, rwa: false, observedTrades: false, perpExecution: false };
  const result = { ...research(), contractFacts: facts } as unknown as PrivateAnalysis;
  const render = (enabled?: boolean) => {
    publicSession.research = { entity: address, task: "overview", entityType: "unknown", result };
    return renderToStaticMarkup(<I18nProvider><MemoryRouter initialEntries={[`/research?entity=${address}`]}><Research capabilities={{ ...capabilities, contractFacts: enabled }} /></MemoryRouter></I18nProvider>);
  };
  for (const type of ["token", "contract"] as const) {
    result.entity.type = type;
    const html = render(true);
    expect(html).toContain('data-testid="contract-facts"');
    expect(html.indexOf('data-testid="research-identity"')).toBeLessThan(html.indexOf('data-testid="contract-facts"'));
  }
  for (const enabled of [false, undefined]) expect(render(enabled)).not.toContain('data-testid="contract-facts"');
  result.entity.type = "wallet";
  expect(render(true)).not.toContain('data-testid="contract-facts"');
  result.entity.type = "token";
  delete result.contractFacts;
  expect(render(true)).not.toContain('data-testid="contract-facts"');
});

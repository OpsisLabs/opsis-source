import { describe, expect, it } from "vitest";
import { researchFactCopy, researchNoteCopy, researchPrivacyCopy, researchSeverityCopy } from "./research-copy";
import weth from "./fixtures/research-weth-token.json";
import pons from "./fixtures/research-pons-token.json";
import wallet from "./fixtures/research-wallet.json";

describe("Research generated interface copy", () => {
  it("translates finding labels in each recorded response and preserves the English original", () => {
    for (const response of [weth, pons, wallet]) {
      for (const { fact } of response.answer.confirmedFacts) {
        const [en, zh] = researchFactCopy(fact);
        expect(en).toBe(fact);
        expect(zh).not.toBe(en);
      }
    }
  });
  it("leaves provider values alone, including names that resemble interface values", () => {
    for (const fact of ["Name: unknown", "Symbol: yes", "Type: ERC-20", "Proxy type: eip1967"]) {
      expect(researchFactCopy(fact)[1].split("：")[1]).toBe(fact.split(": ")[1]);
    }
    expect(researchFactCopy("Verified: yes")[1]).toBe("已验证：是");
    expect(researchFactCopy("Implementations: 1 item returned")[1]).toBe("实现合约：返回 1 项");
    expect(researchFactCopy("Holder coverage: top_holders")[1]).toBe("持有人覆盖：主要持有人");
    expect(researchFactCopy("Deployer: 0x1234")[1]).toBe("部署者：0x1234");
    expect(researchFactCopy("Top1 holder is contract: no")[1]).toBe("最大持有人是否为合约：否");
    expect(researchFactCopy("New provider wording")).toEqual(["New provider wording", "New provider wording"]);
  });
  it("translates the proxy explanation and severity without weakening its limit", () => {
    const note = weth.answer.riskNotes[0];
    const copy = researchNoteCopy(`${note.title}. ${note.detail}`);
    expect(copy[1]).toContain("当前的实现合约");
    expect(researchSeverityCopy("info")).toEqual(["info", "信息"]);
  });
  it("translates recorded concentration notes while retaining their numbers", () => {
    for (const note of pons.answer.riskNotes) {
      const original = `${note.title}. ${note.detail}`;
      const [en, zh] = researchNoteCopy(original);
      expect(en).toBe(original);
      expect(zh).not.toBe(original);
      for (const number of original.match(/\d+(?:\.\d+)?/g) ?? []) expect(zh).toContain(number);
    }
    const contract = "One contract holds a large share. The largest holder is a contract (Sample Market) holding 18% of supply. A contract can hold tokens for many users, such as a lending market, or for one party, such as a team multisig; the explorer data does not say which.";
    expect(researchNoteCopy(contract)[1]).toContain("Sample Market");
    expect(researchNoteCopy(contract)[1]).toContain("18%");
    expect(researchNoteCopy("Provider original text")).toEqual(["Provider original text", "Provider original text"]);
  });
  it("keeps the destination, paid routing and optional reuse duration in the privacy receipt", () => {
    const disclosure = weth.privacy.disclosure;
    expect(researchPrivacyCopy(disclosure)[0]).toBe(disclosure);
    const zh = researchPrivacyCopy(disclosure)[1];
    expect(zh).toContain("dRPC Robinhood Chain gateway");
    expect(zh).toContain("付费网关");
    expect(zh).toContain("12 个已审核合约");
    const cached = `${disclosure} Public token data read from Blockscout may be reused for up to 5 minutes and is kept without any visitor identifier.`;
    expect(researchPrivacyCopy(cached)[1]).toContain("5 分钟");
    expect(researchPrivacyCopy(cached)[1]).toContain("不附带任何访客标识符");
    const direct = disclosure.replace("dRPC Robinhood Chain gateway", "Robinhood Public RPC").replace(" dRPC is a paid gateway that may route each read to an independent node operator in its network.", "");
    expect(researchPrivacyCopy(direct)[1]).toContain("Robinhood Public RPC");
    expect(researchPrivacyCopy(direct)[1]).not.toContain("付费网关");
    expect(researchPrivacyCopy("Future receipt")).toEqual(["Future receipt", "Future receipt"]);
  });
});

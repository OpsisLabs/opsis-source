import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { expect, it } from "vitest";
import I18nProvider from "../i18n/I18nProvider";
import { adaptAnswer } from "../dashboard/adapters";
import type { PrivateAnalysis } from "./api";
import { DetailedResearchWorkspace } from "./DetailedResearchWorkspace";

it("keeps holder pivots and copy controls beside validated explorer links", () => {
  const token = `0x${"1".repeat(40)}`;
  const holder = `0x${"2".repeat(40)}`;
  const entity: PrivateAnalysis["entity"] = {
    chainId: 4663, type: "token", value: token,
    facts: { symbol: "SAMPLE", holderCoverage: "top_holders", topHolders: [{ address: holder, share: 2 }, { address: "0x1234", share: 1 }], explorerUrl: "https://example.test/untrusted" },
    citations: [], riskNotes: [],
  };
  const result: PrivateAnalysis = {
    entity, answer: adaptAnswer({ answer: "Public observations.", facts: entity.facts }, { type: entity.type, id: entity.value }),
    privacy: { accountRequired: false, walletConnectionRequired: false, serverStorage: "none", browserStorage: "memory_only", clearsOnReload: true, modelProvider: "none", providerDestinations: [], disclosure: "Public identifier only." },
  };
  const html = renderToStaticMarkup(<I18nProvider><MemoryRouter><DetailedResearchWorkspace
    result={result} loading={false} error={false} history={null} saved={null} follow={null} nextQuestions={null} privacyReceipt={null} onPivot={() => {}}
  /></MemoryRouter></I18nProvider>);
  expect(html).toContain(`href="https://robinhoodchain.blockscout.com/address/${holder}"`);
  expect(html).toContain(`aria-label="Copy address ${holder}"`);
  expect(html).toContain('aria-label="View 0x2222…2222 on Blockscout"');
  expect(html).not.toContain('href="https://robinhoodchain.blockscout.com/address/0x1234"');
  expect(html).not.toContain('href="https://example.test/untrusted"');
});

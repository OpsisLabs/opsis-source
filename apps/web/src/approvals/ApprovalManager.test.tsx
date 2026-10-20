import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PortfolioApproval, PortfolioSnapshot } from "@rh-chain/shared";
import I18nProvider from "../i18n/I18nProvider";
import { translate } from "../i18n/translate";
import { ApprovalManager } from "./ApprovalManager";

const hash = `0x${"a".repeat(64)}`;
const approval: PortfolioApproval = {
  contract: "0x3333333333333333333333333333333333333333", spender: "0x5555555555555555555555555555555555555555",
  transactionHash: hash, kind: "erc20", symbol: "USDG", active: true, unlimited: true,
  currentAmount: (2n ** 256n - 1001n).toString(), sourceIds: ["rpc-anchor", "approval-source"]
};
const snapshot: PortfolioSnapshot = {
  schemaVersion: 1, chain: { id: 4663, name: "Robinhood Chain", nativeSymbol: "ETH" },
  address: "0x1111111111111111111111111111111111111111",
  anchor: { tag: "latest", blockNumber: 1000, blockHash: hash, timestamp: "2026-10-20T12:00:00Z", fetchedAt: "2026-10-20T12:01:00Z" },
  nativeBalanceEth: "0", tokens: [], nfts: [], transactions: [], movements: [], approvals: [approval], attention: [],
  reconciliation: { tokenCandidates: 0, tokenConfirmed: 0, nftCandidates: 0, nftConfirmed: 0, activityCandidates: 2, activityConfirmed: 2,
    approvalCandidates: 1, approvalConfirmed: 1, degradedSources: [], truncatedSections: ["approvals: 1 calls skipped as unclassified"] },
  citations: [], privacy: { accountRequired: false, walletConnectionRequired: false, serverStorage: "none", browserStorage: "client_encrypted_vault", providerDestinations: [], disclosure: "Bounded snapshot" }
};
function render(value: PortfolioSnapshot) {
  return renderToStaticMarkup(<I18nProvider><ApprovalManager snapshot={value} /></I18nProvider>);
}
describe("approval manager evidence", () => {
  it("renders an unheld token with unknown balance, chain symbol, limits and transaction link", () => {
    const html = render(snapshot);
    expect(html).toContain("USDG");
    expect(html).toContain("Unknown (not returned in bounded holdings)");
    expect(html).toContain("approvals: 1 calls skipped as unclassified");
    expect(html).toContain(`href="https://robinhoodchain.blockscout.com/tx/${hash}"`);
    expect(html).toContain("2^255 raw base units");
    expect(html).toContain(`href="https://robinhoodchain.blockscout.com/token/${approval.contract}"`);
    expect(html).toContain(`href="https://robinhoodchain.blockscout.com/address/${approval.spender}"`);
    expect(html).toContain(`href="https://robinhoodchain.blockscout.com/address/${snapshot.address}"`);
  });
  it("uses the exact contract balance when holdings contain it", () => {
    const html = render({ ...snapshot, tokens: [{ kind: "erc20", contract: approval.contract, symbol: "USDG", name: "Example token", decimals: 18, quantity: "1.5", rawBalance: "1500000000000000000", sourceIds: [] }] });
    expect(html).toContain("Token balance at snapshot: 1.5");
  });
  it("keeps a collapsed permission and its transaction link visible", () => {
    const html = render({ ...snapshot, approvals: [approval, { ...approval, sourceIds: ["second-source"] }] });
    expect(html.match(/<article/g)).toHaveLength(1);
    expect(html).toContain("second-source");
    expect(html).toContain(`/tx/${hash}`);
  });
  it("explains the unlimited threshold in both languages", () => {
    for (const locale of ["en", "zh-CN"] as const) expect(translate(locale, "actions.approvals.meaningUnlimited")).toContain("2^255");
  });
  it("never presents a failed history read as a clean result", () => {
    const html = render({ ...snapshot, approvals: [], reconciliation: { ...snapshot.reconciliation, approvalCandidates: 0, approvalConfirmed: 0, degradedSources: ["blockscout:transactions"] } });
    expect(html).toContain("could not be fully checked");
    expect(html).toContain("this is not a clean result");
    expect(html).not.toContain("No confirmed permissions match this view");
    expect(html).not.toContain("0 active");
    for (const locale of ["en", "zh-CN"] as const) expect(translate(locale, "actions.approvals.discoveryUnavailable").length).toBeGreaterThan(10);
  });
});

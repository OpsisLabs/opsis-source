import { describe, expect, it } from "vitest";
import type { PortfolioApproval } from "@rh-chain/shared";
import { uniqueApprovals, permissionMeaning } from "./model";
const row: PortfolioApproval = { contract: "0xabc", spender: "0xdef", transactionHash: "0x123", kind: "erc20", symbol: "TST", active: true, unlimited: true, currentAmount: "100", sourceIds: ["a"] };
describe("approval review", () => {
  it("deduplicates permission state and keeps evidence", () => expect(uniqueApprovals([row, { ...row, sourceIds: ["b"] }])[0].sourceIds).toEqual(["a", "b"]));
  it("does not conflate different NFT token IDs", () => expect(uniqueApprovals([{ ...row, kind: "erc721-token", tokenId: "1" }, { ...row, kind: "erc721-token", tokenId: "2" }])).toHaveLength(2));
  it("fails closed on conflicting states", () => expect(() => uniqueApprovals([row, { ...row, active: false }])).toThrow("Conflicting"));
  it("labels limited allowance as raw units", () => expect(permissionMeaning({ ...row, unlimited: false })).toContain("raw base units"));
  it("does not describe inactive as safe", () => expect(permissionMeaning({ ...row, active: false })).toContain("not a wallet safety verdict"));
});

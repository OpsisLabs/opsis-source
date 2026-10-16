import { describe, expect, it } from "vitest";
import { KNOWN_ASSETS } from "../opsis/known-assets";
import { watchFixture } from "./fixture";
import { orderTokens, tokenFlags, tokenLabel, watchTimeline } from "./holdings";

const base = watchFixture().tokens[0];
const c = (en: string) => en;
describe("Watch token identity", () => {
  it("orders reviewed, flagged and ordinary tokens stably without mutating the snapshot", () => {
    const ordinary = { ...base, symbol: "OTHER" };
    const scam = { ...base, reputation: "scam" };
    const lookalike = { ...base, symbol: "NVDA" };
    const hidden = { ...base, name: "Sample\u200btoken" };
    const wellKnown = { ...base, symbol: "USDC" };
    const reviewed = { ...base, contract: KNOWN_ASSETS[0].address.toUpperCase() };
    const ordinary2 = { ...base, symbol: "OTHER2" };
    const tokens = [ordinary, scam, reviewed, lookalike, hidden, wellKnown, ordinary2];
    expect(orderTokens(tokens)).toEqual([reviewed, scam, lookalike, hidden, wellKnown, ordinary, ordinary2]);
    expect(tokens[0]).toBe(ordinary);
    expect(orderTokens([])).toEqual([]);
  });

  it("flags source identity, hidden names and symbols and only Blockscout's scam reputation", () => {
    expect(tokenFlags({ ...base, symbol: "N\u200bVDA" })).toMatchObject({ hidden: true, lookalike: { symbol: "NVDA" }, scam: false });
    expect(tokenFlags({ ...base, symbol: "USDC" }).wellKnown).toBe("USDC");
    expect(tokenFlags({ ...base, name: "Name\u202e" }).hidden).toBe(true);
    expect(tokenFlags({ ...base, reputation: "scam" }).scam).toBe(true);
    expect(tokenFlags({ ...base, reputation: "unknown" }).scam).toBe(false);
    expect(tokenFlags(base)).toMatchObject({ reviewed: undefined, lookalike: undefined, wellKnown: undefined, hidden: false, scam: false });
    const reviewed = { ...base, contract: KNOWN_ASSETS.find((asset) => asset.symbol === "NVDA")!.address, symbol: "NVDA" };
    expect(tokenFlags(reviewed).lookalike).toBeUndefined();
    expect(tokenLabel(reviewed, c)).not.toContain("Lookalike");
  });

  it("makes names and symbols visible in saved lists and labels with localized lookalike tags", () => {
    const token = { ...base, name: "Reported\u202ename", symbol: "N\u200bVDA" };
    expect(tokenLabel(token, c)).toBe("Reported[U+202E]name · N[U+200B]VDA · Lookalike");
    expect(tokenLabel(token, (_en, zh) => zh)).toContain("同符号不同合约");
    expect(tokenLabel(base, c)).toBe("Test token · TEST");
  });
});

describe("Watch timeline ordering", () => {
  it("groups movements and approvals by transaction and sorts by block without mutating the snapshot", () => {
    const snapshot = watchFixture(101);
    const approval = { transactionHash: snapshot.transactions[1].hash.toUpperCase(), contract: base.contract, spender: snapshot.address, kind: "erc20" as const, symbol: "TEST", active: true, unlimited: false, currentAmount: "1", sourceIds: ["rpc"] };
    snapshot.approvals.push(approval);
    snapshot.transactions[1].timestamp = null;
    const entries = watchTimeline(snapshot);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ blockNumber: 101, timestamp: null, movements: [snapshot.movements[0]], approvals: [approval] });
    expect(snapshot.transactions[0].blockNumber).toBe(99);
  });

  it("retains movement-only and undated approval evidence, with unknown chronology last", () => {
    const snapshot = watchFixture(101);
    snapshot.transactions = [];
    snapshot.approvals = [{ transactionHash: `0x${"e".repeat(64)}`, contract: base.contract, spender: snapshot.address, kind: "erc20", symbol: "TEST", active: false, unlimited: false, currentAmount: "0", sourceIds: ["rpc"] }];
    const entries = watchTimeline(snapshot);
    expect(entries.map((entry) => entry.blockNumber)).toEqual([101, null]);
    expect(entries[1].timestamp).toBeNull();
    expect(entries[1].transaction).toBeUndefined();
    expect(watchTimeline({ ...snapshot, movements: [], approvals: [] })).toEqual([]);
  });

  it("orders same-block timestamps and undated ties deterministically", () => {
    const snapshot = watchFixture(101);
    snapshot.transactions = [
      { ...snapshot.transactions[0], timestamp: null, blockNumber: 101 },
      { ...snapshot.transactions[1], timestamp: "2026-10-16T12:00:00Z" },
      { ...snapshot.transactions[1], hash: `0x${"d".repeat(64)}`, timestamp: "2026-10-16T12:01:00Z" },
    ];
    expect(watchTimeline(snapshot).map((entry) => entry.hash)).toEqual([snapshot.transactions[2].hash, snapshot.transactions[1].hash, snapshot.transactions[0].hash]);
  });
});

import { describe, expect, it } from "vitest";
import { captureWatch } from "./model";
import { watchFixture, WATCH_TEST_TOKEN } from "./fixture";
import { walletOverlap } from "./overlap";

function wallet(address: string, block = 100) {
  const snapshot = watchFixture(block);
  snapshot.address = address;
  return captureWatch(snapshot, "Private label");
}
const a = "0x1111111111111111111111111111111111111111",
  b = "0x2222222222222222222222222222222222222222";
describe("exact private wallet overlap", () => {
  it("groups only selected distinct wallets and exact contracts, never identical symbols", () => {
    const first = wallet(a),
      second = wallet(b);
    const ids = [first.id, second.id];
    expect(walletOverlap([first, second], ids).rows[0].holders).toHaveLength(2);
    expect(walletOverlap([first, second], [first.id]).rows).toEqual([]);
    expect(walletOverlap([first, first], ids).wallets).toHaveLength(1);
    second.snapshots[0].tokens[0].contract = b;
    expect(walletOverlap([first, second], ids).rows).toEqual([]);
  });
  it("excludes explicit zero balances and native ETH", () => {
    const first = wallet(a),
      second = wallet(b);
    second.snapshots[0].tokens[0].rawBalance = "0";
    second.snapshots[0].tokens[0].quantity = "0";
    expect(walletOverlap([first, second], [first.id, second.id]).rows).toEqual(
      [],
    );
  });
  it("keeps tiny positive balances and exact previous-check differences", () => {
    const first = wallet(a),
      second = wallet(b);
    const before = first.snapshots[0];
    before.tokens[0].rawBalance = "1";
    before.tokens[0].quantity = "0.000000000000000001";
    const after = watchFixture(101);
    after.tokens[0].rawBalance = "2";
    after.tokens[0].quantity = "0.000000000000000002";
    const changed = captureWatch(after, first.label, first);
    const h = walletOverlap([changed, second], [changed.id, second.id]).rows[0]
      .holders[0];
    expect(h.delta).toBe("+0.000000000000000001");
    expect(h.change).toBe("changed");
  });
  it("keeps unavailable previous holdings unknown and current missing out of counts", () => {
    const first = wallet(a),
      second = wallet(b);
    first.snapshots[0].tokens = [];
    const changed = captureWatch(watchFixture(101), first.label, first);
    let result = walletOverlap([changed, second], [changed.id, second.id]);
    expect(result.rows[0].holders[0]).toMatchObject({
      delta: null,
      change: "missing",
    });
    second.snapshots[0].tokens = [];
    second.snapshots[0].reconciliation.degradedSources = ["Tokens unavailable"];
    result = walletOverlap([changed, second], [changed.id, second.id]);
    expect(result.rows).toEqual([]);
    expect(result.partial).toBe(true);
  });
  it("preserves unequal capture times and marks incompatible decimal metadata", () => {
    const first = wallet(a),
      second = wallet(b, 101);
    const token = second.snapshots[0].tokens[0];
    token.decimals = 0;
    token.rawBalance = "5";
    const result = walletOverlap([first, second], [first.id, second.id]);
    expect(result.rows[0].incompatible).toBe(true);
    expect(result.rows[0].holders.map((h) => h.captured.blockNumber)).toEqual([
      100, 101,
    ]);
    expect(result.rows[0].contract).toBe(WATCH_TEST_TOKEN);
  });
  it("does not compare changed decimals across a wallet's checks", () => {
    const first = wallet(a),
      second = wallet(b);
    const after = watchFixture(101);
    after.tokens[0].decimals = 0;
    after.tokens[0].rawBalance = "5";
    const changed = captureWatch(after, first.label, first);
    expect(
      walletOverlap([changed, second], [changed.id, second.id]).rows[0]
        .holders[0],
    ).toMatchObject({ delta: null, change: "metadata" });
  });
  it("flags same-height block hash disagreements and does not mutate snapshots", () => {
    const first = wallet(a),
      second = wallet(b);
    second.snapshots[0].anchor.blockHash = `0x${"f".repeat(64)}`;
    const original = JSON.stringify([first, second]);
    expect(
      walletOverlap([first, second], [first.id, second.id]).rows[0]
        .incompatible,
    ).toBe(true);
    expect(JSON.stringify([first, second])).toBe(original);
  });
  it("fails closed on wrong-chain data and handles empty selections", () => {
    expect(walletOverlap([], []).rows).toEqual([]);
    const first = wallet(a);
    first.snapshots[0].chain.id = 1 as 4663;
    expect(() => walletOverlap([first], [first.id])).toThrow();
  });
});

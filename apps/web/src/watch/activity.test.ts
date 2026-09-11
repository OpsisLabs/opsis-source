import { describe, expect, it } from "vitest";
import { captureWatch } from "./model";
import { watchFixture } from "./fixture";
import { filterActivity, savedActivity } from "./activity";

const second = "0x2222222222222222222222222222222222222222";
function wallet(address = second) {
  const a = watchFixture(100),
    b = watchFixture(101);
  a.address = address;
  b.address = address;
  return captureWatch(b, "Private label", captureWatch(a, "Private label"));
}
describe("saved multi-wallet activity", () => {
  it("deduplicates retained hashes and multiple perspectives without summing movements", () => {
    const first = wallet(),
      next = wallet("0x1111111111111111111111111111111111111111");
    const untouched = JSON.stringify([first, next]);
    const events = savedActivity([first, next]);
    expect(events).toHaveLength(2);
    expect(events[0].block).toBe(101);
    expect(events[0].observations).toHaveLength(2);
    expect(events[0].observations[0].movements[0].quantity).toBe("0.1");
    expect(events[0].observations[0].discovery).toBe("later");
    expect(events[1].observations[0].discovery).toBe("baseline");
    expect(JSON.stringify([first, next])).toBe(untouched);
    expect(savedActivity([first, first])[0].observations).toHaveLength(1);
  });
  it("retains older discoveries and earlier activity missing from a subsequent sample", () => {
    const w = wallet();
    const newer = w.snapshots[1];
    newer.transactions[1].blockNumber = 98;
    newer.movements[0].blockNumber = 98;
    newer.transactions = newer.transactions.slice(1);
    expect(savedActivity([w]).map((e) => e.observations[0].discovery)).toEqual([
      "baseline",
      "older",
    ]);
  });
  it("filters by wallet and actual decoded kind, without treating failed value as a transfer", () => {
    const w = wallet();
    expect(filterActivity(savedActivity([w]), w.id, "native", "")).toHaveLength(
      1,
    );
    expect(filterActivity(savedActivity([w]), "other", "all", "")).toEqual([]);
    expect(filterActivity(savedActivity([w]), "", "tokens", "")).toEqual([]);
    expect(
      filterActivity(savedActivity([w]), "", "all", "0XCCCC"),
    ).toHaveLength(1);
    w.snapshots[1].transactions[1].status = "failed";
    w.snapshots[1].movements = [];
    w.snapshots[1].transactions[1].movementCount = 0;
    expect(filterActivity(savedActivity([w]), "", "native", "")).toEqual([]);
  });
  it("marks coverage gaps and conflicting observations instead of asserting one truth", () => {
    const a = wallet(),
      b = wallet("0x1111111111111111111111111111111111111111");
    b.snapshots[1].anchor.blockHash = `0x${"f".repeat(64)}`;
    a.snapshots[1].reconciliation.degradedSources = ["provider unavailable"];
    const event = savedActivity([a, b])[0];
    expect(event.conflict).toBe(true);
    expect(event.observations[0].partial).toBe(true);
  });
  it("supports NFT filtering and full contract searches", () => {
    const w = wallet();
    const m = w.snapshots[1].movements[0];
    m.kind = "erc1155";
    m.contract = second;
    m.tokenId = "7";
    m.quantity = "1";
    expect(filterActivity(savedActivity([w]), "", "nfts", second)).toHaveLength(
      1,
    );
    expect(
      filterActivity(savedActivity([w]), "", "tokens", second),
    ).toHaveLength(0);
    expect(savedActivity([])).toEqual([]);
  });
  it("fails closed on invalid saved snapshots", () => {
    const w = wallet();
    w.snapshots[0].address = "invalid";
    expect(() => savedActivity([w])).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import {
  assertWatchSnapshot,
  captureWatch,
  compareSnapshots,
  difference,
} from "./model";
import { watchFixture, WATCH_TEST_ADDRESS, WATCH_TEST_TOKEN } from "./fixture";

describe("Scout Watch exact and bounded comparisons", () => {
  it("retains wei and large integer precision, signs, and decimal scale", () => {
    expect(
      difference(
        "9007199254740993.000000000000000002",
        "9007199254740993.000000000000000001",
      ),
    ).toBe("+0.000000000000000001");
    expect(difference("0.900000000000000001", "1.000000000000000001")).toBe(
      "-0.1",
    );
    expect(difference("100", "0")).toBe("+100");
    expect(difference("1.00", "1")).toBe("0");
    expect(() => difference("NaN", "1")).toThrow();
  });
  it("compares matching contracts, never symbols, and preserves missing as unknown", () => {
    const before = watchFixture(),
      after = watchFixture(101);
    expect(
      compareSnapshots(before, after).rows.map((row) => row.delta),
    ).toEqual(["-0.1", "+3"]);
    after.tokens = [{ ...after.tokens[0], contract: `0x${"4".repeat(40)}` }];
    const result = compareSnapshots(before, after);
    expect(result.rows[1]).toMatchObject({
      contract: WATCH_TEST_TOKEN,
      after: null,
      delta: null,
      status: "unavailable",
    });
    expect(result.rows[2]).toMatchObject({
      before: null,
      delta: null,
      status: "newly-observed",
    });
    expect(result.unknown).toBe(2);
    after.tokens = [];
    after.reconciliation.degradedSources = ["token discovery unavailable"];
    expect(compareSnapshots(before, after).gaps).toContain(
      "token discovery unavailable",
    );
  });
  it("counts only newly observed transaction hashes and marks older discoveries", () => {
    const before = watchFixture(),
      after = watchFixture(101);
    after.transactions.push({
      ...after.transactions[0],
      hash: `0x${"d".repeat(64)}`,
      status: "failed",
      blockNumber: 98,
    });
    const result = compareSnapshots(before, after);
    expect(result.observed).toHaveLength(2);
    expect(result.observed.map((tx) => tx.afterBaseline)).toEqual([
      true,
      false,
    ]);
    expect(result.observed[1].status).toBe("failed");
  });
  it("compares NFT quantities only for the exact contract, kind and token ID", () => {
    const before = watchFixture(),
      after = watchFixture(101);
    before.nfts = [
      {
        kind: "erc1155",
        contract: WATCH_TEST_TOKEN,
        tokenId: "7",
        quantity: "3",
        name: "Edition",
        symbol: "NFT",
        sourceIds: ["rpc"],
      },
    ];
    after.nfts = [{ ...before.nfts[0], quantity: "2" }];
    expect(compareSnapshots(before, after).rows.at(-1)?.delta).toBe("-1");
    after.nfts[0].tokenId = "8";
    expect(
      compareSnapshots(before, after)
        .rows.slice(-2)
        .every((row) => row.delta === null),
    ).toBe(true);
  });
  it("does not compare changed decimals and rejects inconsistent raw quantities", () => {
    const before = watchFixture(),
      after = watchFixture(101);
    after.tokens[0] = {
      ...after.tokens[0],
      decimals: 0,
      quantity: "5",
      rawBalance: "5",
    };
    expect(compareSnapshots(before, after).rows[1].status).toBe(
      "metadata-changed",
    );
    after.tokens[0].rawBalance = "6";
    expect(() => compareSnapshots(before, after)).toThrow();
  });
  it("retains only three checks, never mutates the old record, and rejects same/older/reorganized blocks", () => {
    const now = Date.now();
    const baseline = captureWatch(
      watchFixture(100, now),
      " Private whale ",
      undefined,
      now,
    );
    let current = baseline;
    for (const block of [101, 102, 103])
      current = captureWatch(
        watchFixture(block, now),
        baseline.label,
        current,
        now,
      );
    expect(current.snapshots.map((s) => s.anchor.blockNumber)).toEqual([
      101, 102, 103,
    ]);
    expect(baseline.snapshots).toHaveLength(1);
    expect(current.label).toBe("Private whale");
    expect(() =>
      captureWatch(watchFixture(103, now), current.label, current, now),
    ).toThrow(/same block/i);
    expect(() =>
      captureWatch(watchFixture(102, now), current.label, current, now),
    ).toThrow(/older/i);
    const reorg = watchFixture(103, now);
    reorg.anchor.blockHash = `0x${"f".repeat(64)}`;
    expect(() => captureWatch(reorg, current.label, current, now)).toThrow(
      /reorganization/i,
    );
  });
  it("rejects stale/future snapshots, incorrect addresses, duplicate tokens and out-of-anchor activity", () => {
    const now = Date.now();
    expect(() =>
      captureWatch(watchFixture(100, now - 601_000), "test", undefined, now),
    ).toThrow(/old or future/i);
    expect(() =>
      captureWatch(watchFixture(100, now + 121_000), "test", undefined, now),
    ).toThrow();
    expect(() =>
      assertWatchSnapshot(watchFixture(), `0x${"2".repeat(40)}`),
    ).toThrow();
    const bad = watchFixture();
    bad.tokens.push(bad.tokens[0]);
    expect(() => assertWatchSnapshot(bad, WATCH_TEST_ADDRESS)).toThrow();
    const futureTx = watchFixture();
    futureTx.transactions[0].blockNumber = 999;
    expect(() => assertWatchSnapshot(futureTx, WATCH_TEST_ADDRESS)).toThrow();
    expect(() =>
      compareSnapshots(watchFixture(101), watchFixture(100)),
    ).toThrow();
  });
});

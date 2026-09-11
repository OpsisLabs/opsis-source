import { describe, expect, it } from "vitest";
import { buildBriefing, selectComparablePair } from "./briefing";
import { captureWatch } from "./model";
import { watchFixture, WATCH_TEST_ADDRESS, WATCH_TEST_TOKEN } from "./fixture";
import type { PortfolioSnapshot } from "@rh-chain/shared";
import type { VaultWatch } from "../vault/types";

const SECOND = `0x${"2".repeat(40)}`;
const FOURTH = `0x${"4".repeat(40)}`;
const FIFTH = `0x${"5".repeat(40)}`;
const TX_C = `0x${"c".repeat(64)}`;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function walletWith(
  address: string,
  blocks: number[],
  label = "Private label",
): VaultWatch {
  let current: VaultWatch | undefined;
  for (const block of blocks) {
    const snapshot = watchFixture(block);
    snapshot.address = address;
    current = captureWatch(snapshot, label, current);
  }
  return current!;
}

function makeWatch(
  address: string,
  snapshots: PortfolioSnapshot[],
  label = "Private label",
): VaultWatch {
  const now = new Date().toISOString();
  return {
    kind: "watch",
    id: crypto.randomUUID(),
    address,
    label,
    snapshots,
    createdAt: now,
    updatedAt: now,
  };
}

describe("private watch briefing chronology", () => {
  it("rejects raw reverse retained order instead of sorting it into progress", () => {
    const result = selectComparablePair(
      [watchFixture(101), watchFixture(100)],
      WATCH_TEST_ADDRESS,
    );
    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") expect(result.reason).toBe("order");
  });

  it("distinguishes a repeated check from a same-block hash conflict", () => {
    const first = watchFixture(100);
    const same = clone(first);
    expect(
      selectComparablePair([first, same], WATCH_TEST_ADDRESS).status,
    ).toBe("unsupported");
    const repeated = selectComparablePair([first, same], WATCH_TEST_ADDRESS);
    if (repeated.status === "unsupported")
      expect(repeated.reason).toBe("same-check");

    const conflict = clone(first);
    conflict.anchor.blockHash = `0x${"f".repeat(64)}`;
    const result = selectComparablePair([first, conflict], WATCH_TEST_ADDRESS);
    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported")
      expect(result.reason).toBe("conflict");
  });

  it("treats empty and non-monotonic evidence defensively without throwing", () => {
    expect(selectComparablePair([], WATCH_TEST_ADDRESS).status).toBe(
      "unsupported",
    );
    const wallet = makeWatch(WATCH_TEST_ADDRESS, []);
    const brief = buildBriefing([wallet]);
    expect(brief.phase).toBe("unsupported");
    expect(brief.unsupported).toBe(1);
    expect(() =>
      buildBriefing([makeWatch("not-an-address", [watchFixture(100)])]),
    ).not.toThrow();
  });

  it("preserves baseline coverage gaps as a partial limitation", () => {
    const snapshot = watchFixture(100);
    snapshot.reconciliation.degradedSources = ["Token discovery unavailable"];
    const brief = buildBriefing([
      makeWatch(WATCH_TEST_ADDRESS, [snapshot]),
    ]);
    expect(brief.phase).toBe("baseline");
    expect(brief.wallets[0]?.gaps).toContain("Token discovery unavailable");
    expect(brief.partial).toBe(true);
    expect(brief.gaps).toContain("Token discovery unavailable");
  });
});

describe("private watch briefing balances", () => {
  it("builds exact per-asset findings from the latest comparable pair and dedupes addresses", () => {
    const wallet = walletWith(WATCH_TEST_ADDRESS, [100, 101]);
    const brief = buildBriefing([wallet, { ...wallet, id: crypto.randomUUID() }]);
    expect(brief.phase).toBe("ready");
    expect(brief.walletCount).toBe(1);
    const balances = brief.findings.filter((row) => row.asset !== "transaction");
    expect(balances.map((row) => [row.asset, row.label, row.delta])).toEqual([
      ["native", "ETH", "-0.1"],
      ["erc20", "TEST", "+3"],
    ]);
    expect(balances[0].beforeBlock).toBe(100);
    expect(balances[0].afterBlock).toBe(101);
    expect(balances[0].beforeAt).toBeTruthy();
    expect(balances[0].sources.length).toBeGreaterThan(0);
  });

  it("keeps huge integer precision without routing quantities through Number", () => {
    const first = watchFixture(100);
    first.address = WATCH_TEST_ADDRESS;
    first.nativeBalanceEth = "9007199254740993.000000000000000001";
    const baseline = captureWatch(first, "Private label");
    const next = watchFixture(101);
    next.address = WATCH_TEST_ADDRESS;
    next.nativeBalanceEth = "9007199254740993.000000000000000002";
    const wallet = captureWatch(next, "Private label", baseline);
    const native = buildBriefing([wallet]).findings.find(
      (row) => row.asset === "native",
    );
    expect(native?.delta).toBe("+0.000000000000000001");
  });

  it("surfaces newly observed, missing and changed-decimal rows as unknowns", () => {
    const first = clone(watchFixture(100));
    first.address = WATCH_TEST_ADDRESS;
    first.tokens = [
      { ...first.tokens[0]! },
      {
        ...first.tokens[0]!,
        contract: FOURTH,
        name: "Second",
        symbol: "SEC",
      },
    ];
    const baseline = captureWatch(first, "Private label");
    const next = clone(watchFixture(101));
    next.address = WATCH_TEST_ADDRESS;
    next.tokens = [
      {
        ...next.tokens[0]!,
        decimals: 6,
        quantity: "5",
        rawBalance: "5000000",
      },
      {
        ...next.tokens[0]!,
        contract: FIFTH,
        name: "Third",
        symbol: "THR",
      },
    ];
    const wallet = captureWatch(next, "Private label", baseline);
    const brief = buildBriefing([wallet]);
    const statuses = brief.unknowns.map((row) => row.status).sort();
    expect(statuses).toEqual([
      "metadata-changed",
      "newly-observed",
      "unavailable",
    ]);
    expect(brief.partial).toBe(true);
    expect(
      brief.findings.some((row) => row.contract === WATCH_TEST_TOKEN),
    ).toBe(false);
  });

  it("keeps two missing NFT ids from one contract as distinct unknowns", () => {
    const first = clone(watchFixture(100));
    first.address = WATCH_TEST_ADDRESS;
    first.nfts = [
      {
        kind: "erc1155",
        contract: WATCH_TEST_TOKEN,
        tokenId: "7",
        quantity: "1",
        name: "Edition",
        symbol: "NFT",
        sourceIds: ["rpc"],
      },
      {
        kind: "erc1155",
        contract: WATCH_TEST_TOKEN,
        tokenId: "8",
        quantity: "1",
        name: "Edition",
        symbol: "NFT",
        sourceIds: ["rpc"],
      },
    ];
    const baseline = captureWatch(first, "Private label");
    const next = clone(watchFixture(101));
    next.address = WATCH_TEST_ADDRESS;
    next.nfts = [];
    const wallet = captureWatch(next, "Private label", baseline);
    const nfts = buildBriefing([wallet]).unknowns.filter(
      (row) => row.tokenId !== null,
    );
    expect(nfts).toHaveLength(2);
    expect(new Set(nfts.map((row) => row.key)).size).toBe(2);
    expect(nfts.map((row) => row.tokenId).sort()).toEqual(["7", "8"]);
    expect(nfts.every((row) => row.status === "unavailable")).toBe(true);
    expect(nfts.every((row) => row.contract === WATCH_TEST_TOKEN)).toBe(true);
  });

  it("annotates exact-contract shared holdings and never matches by symbol", () => {
    const first = walletWith(WATCH_TEST_ADDRESS, [100, 101]);
    const second = walletWith(SECOND, [100, 101]);
    let brief = buildBriefing([first, second]);
    const shared = brief.findings.find(
      (row) =>
        row.contract === WATCH_TEST_TOKEN &&
        row.asset === "erc20" &&
        row.wallets[0]?.id === first.id,
    );
    expect(shared?.shared).toHaveLength(1);
    expect(shared?.shared?.[0].wallet.id).toBe(second.id);
    expect(shared?.shared?.[0].delta).toBe("+3");
    expect(shared?.shared?.[0].beforeBlock).toBe(100);
    expect(shared?.shared?.[0].afterBlock).toBe(101);
    expect(shared?.incompatible).toBe(false);

    second.snapshots = second.snapshots.map((snapshot) => {
      const copy = clone(snapshot);
      copy.tokens = copy.tokens.map((token) => ({
        ...token,
        contract: FOURTH,
      }));
      return copy;
    });
    brief = buildBriefing([first, second]);
    const symbolOnly = brief.findings.filter(
      (row) => row.asset === "erc20" && row.delta === "+3",
    );
    expect(symbolOnly).toHaveLength(2);
    expect(symbolOnly.every((row) => row.shared === null)).toBe(true);
  });

  it("marks incompatible cross-wallet decimals as unknown", () => {
    const first = walletWith(WATCH_TEST_ADDRESS, [100, 101]);
    const second = walletWith(SECOND, [100, 101]);
    for (const snapshot of second.snapshots) {
      snapshot.tokens[0] = {
        ...snapshot.tokens[0]!,
        decimals: 6,
        quantity: snapshot.anchor.blockNumber === 100 ? "1" : "2",
        rawBalance: snapshot.anchor.blockNumber === 100 ? "1000000" : "2000000",
      };
    }
    const brief = buildBriefing([first, second]);
    const shared = brief.findings.find(
      (row) =>
        row.contract === WATCH_TEST_TOKEN &&
        row.asset === "erc20" &&
        row.wallets[0]?.id === first.id,
    );
    expect(shared?.incompatible).toBe(true);
    expect(shared?.shared?.[0].delta).toBeNull();
    expect(shared?.shared?.[0].decimals).toBe(6);
  });
});

describe("private watch briefing activity attribution", () => {
  function activityFinding(brief: ReturnType<typeof buildBriefing>) {
    return brief.findings.find((row) => row.transactionHash === TX_C);
  }

  it("keeps each wallet-relative movement attributable to its observer", () => {
    const first = walletWith(WATCH_TEST_ADDRESS, [100, 101]);
    const second = walletWith(SECOND, [100, 101]);
    const movement = second.snapshots[1]!.movements[0]!;
    movement.direction = "in";
    movement.quantity = "0.25";
    const finding = activityFinding(buildBriefing([first, second]));
    expect(finding?.observations).toHaveLength(2);
    const byWallet = new Map(
      finding?.observations.map((row) => [row.wallet.id, row] as const),
    );
    expect(byWallet.get(first.id)?.movements[0]?.direction).toBe("out");
    expect(byWallet.get(second.id)?.movements[0]?.direction).toBe("in");
    expect(byWallet.get(second.id)?.movements[0]?.quantity).toBe("0.25");
  });

  it("suppresses movement claims when statuses genuinely conflict", () => {
    const first = walletWith(WATCH_TEST_ADDRESS, [100, 101]);
    const second = walletWith(SECOND, [100, 101]);
    const tx = second.snapshots[1]!.transactions.find(
      (row) => row.hash === TX_C,
    )!;
    tx.status = "failed";
    second.snapshots[1]!.movements = [];
    const finding = activityFinding(buildBriefing([first, second]));
    expect(finding?.conflict).toBe(true);
    expect(finding?.category).toBe("failed-activity");
    expect(
      finding?.observations.every((row) => row.movements.length === 0),
    ).toBe(true);
  });

  it("distinguishes differing observation windows from a conflict", () => {
    const first = walletWith(WATCH_TEST_ADDRESS, [100, 101]);
    const before = clone(watchFixture(101));
    before.address = SECOND;
    before.transactions = [];
    before.movements = [];
    const after = clone(watchFixture(101));
    after.address = SECOND;
    after.anchor.blockNumber = 102;
    after.anchor.blockHash = `0x${"a".repeat(64)}`;
    const second = makeWatch(SECOND, [before, after]);
    const finding = activityFinding(buildBriefing([first, second]));
    expect(finding?.windowMixed).toBe(true);
    expect(finding?.conflict).toBe(false);
    expect(finding?.afterBaseline).toBeNull();
  });

  it("accumulates distinct source captures instead of overwriting by id", () => {
    const wallet = walletWith(WATCH_TEST_ADDRESS, [100, 101]);
    wallet.snapshots[0]!.citations[0]!.fetchedAt = "2026-09-01T00:00:00.000Z";
    wallet.snapshots[1]!.citations[0]!.fetchedAt = "2026-09-01T00:00:01.000Z";
    const finding = activityFinding(buildBriefing([wallet]));
    expect(finding?.sources).toHaveLength(2);
    expect(finding?.sources.map((row) => row.fetchedAt)).toEqual([
      "2026-09-01T00:00:00.000Z",
      "2026-09-01T00:00:01.000Z",
    ]);
  });

  it("classifies failed, new and older transactions without movement for a failure", () => {
    const first = watchFixture(100);
    first.address = WATCH_TEST_ADDRESS;
    const baseline = captureWatch(first, "Private label");
    const next = watchFixture(101);
    next.address = WATCH_TEST_ADDRESS;
    next.transactions = [
      ...first.transactions,
      {
        hash: `0x${"d".repeat(64)}`,
        blockNumber: 101,
        timestamp: next.anchor.timestamp,
        status: "success",
        method: "transfer",
        direction: "in",
        counterparty: WATCH_TEST_TOKEN,
        nativeValueEth: "0",
        movementCount: 1,
        movementCoverage: "complete",
        sourceIds: ["rpc"],
      },
      {
        hash: `0x${"e".repeat(64)}`,
        blockNumber: 101,
        timestamp: next.anchor.timestamp,
        status: "failed",
        method: "transfer",
        direction: "out",
        counterparty: WATCH_TEST_TOKEN,
        nativeValueEth: "0",
        movementCount: 1,
        movementCoverage: "complete",
        sourceIds: ["rpc"],
      },
      {
        hash: `0x${"f".repeat(64)}`,
        blockNumber: 98,
        timestamp: next.anchor.timestamp,
        status: "success",
        method: "transfer",
        direction: "in",
        counterparty: WATCH_TEST_TOKEN,
        nativeValueEth: "0",
        movementCount: 1,
        movementCoverage: "complete",
        sourceIds: ["rpc"],
      },
    ];
    next.movements = [
      {
        transactionHash: `0x${"d".repeat(64)}`,
        blockNumber: 101,
        timestamp: next.anchor.timestamp,
        direction: "in",
        kind: "erc20",
        symbol: "TEST",
        quantity: "1",
        contract: WATCH_TEST_TOKEN,
        tokenId: null,
        counterparty: SECOND,
        sourceIds: ["rpc"],
      },
      {
        transactionHash: `0x${"f".repeat(64)}`,
        blockNumber: 98,
        timestamp: next.anchor.timestamp,
        direction: "in",
        kind: "native",
        symbol: "ETH",
        quantity: "0.5",
        contract: null,
        tokenId: null,
        counterparty: SECOND,
        sourceIds: ["rpc"],
      },
    ];
    const wallet = captureWatch(next, "Private label", baseline);
    const activity = buildBriefing([wallet]).findings.filter(
      (row) => row.transactionHash !== null,
    );
    const byCategory = new Map(
      activity.map((row) => [row.category, row] as const),
    );
    expect(byCategory.get("new-activity")?.transactionStatus).toBe("success");
    expect(byCategory.get("new-activity")?.observations[0]?.movements).toHaveLength(
      1,
    );
    expect(byCategory.get("failed-activity")?.transactionStatus).toBe("failed");
    expect(byCategory.get("failed-activity")?.observations[0]?.movements).toEqual(
      [],
    );
    expect(byCategory.get("older-activity")?.afterBaseline).toBe(false);
  });
});

describe("private watch briefing states and filters", () => {
  it("reports an all-unsupported watchlist distinctly from a baseline", () => {
    const invalid = walletWith(SECOND, [100, 101]);
    invalid.snapshots[0]!.address = FOURTH;
    const brief = buildBriefing([invalid]);
    expect(brief.phase).toBe("unsupported");
    expect(brief.unsupported).toBe(1);
    expect(
      brief.wallets.find((row) => row.wallet.id === invalid.id)?.reason,
    ).toBe("invalid");
  });

  it("keeps a mixed baseline and unsupported state observable", () => {
    const baselineWallet = walletWith(WATCH_TEST_ADDRESS, [100]);
    const invalid = walletWith(SECOND, [100, 101]);
    invalid.snapshots[0]!.address = FOURTH;
    const brief = buildBriefing([baselineWallet, invalid]);
    expect(brief.phase).toBe("baseline");
    expect(brief.baselineOnly).toBe(1);
    expect(brief.unsupported).toBe(1);
  });

  it("keeps coverage gaps partial even when no change is found", () => {
    const first = watchFixture(100);
    first.address = WATCH_TEST_ADDRESS;
    const baseline = captureWatch(first, "Private label");
    const next = clone(watchFixture(101));
    next.address = WATCH_TEST_ADDRESS;
    next.nativeBalanceEth = first.nativeBalanceEth;
    next.tokens = clone(first.tokens);
    next.transactions = clone(first.transactions);
    next.movements = [];
    next.reconciliation.degradedSources = ["Activity discovery unavailable"];
    const wallet = captureWatch(next, "Private label", baseline);
    const brief = buildBriefing([wallet]);
    expect(brief.changed).toBe(false);
    expect(brief.partial).toBe(true);
    expect(brief.gaps).toContain("Activity discovery unavailable");
  });

  it("filters locally, recovers empty selections and never mutates saved data", () => {
    const first = walletWith(WATCH_TEST_ADDRESS, [100, 101], "Alpha");
    const second = walletWith(SECOND, [100, 101], "Beta");
    const before = JSON.stringify([first, second]);
    const brief = buildBriefing([first, second], second.id);
    expect(brief.walletCount).toBe(1);
    expect(
      brief.findings.every((row) =>
        row.wallets.every((wallet) => wallet.id === second.id),
      ),
    ).toBe(true);
    expect(buildBriefing([first], crypto.randomUUID()).phase).toBe("empty");
    expect(JSON.stringify([first, second])).toBe(before);
  });

  it("orders findings deterministically by category then recency", () => {
    const first = walletWith(WATCH_TEST_ADDRESS, [100, 101]);
    const second = walletWith(SECOND, [100, 101]);
    const forward = buildBriefing([first, second]).findings.map((row) => row.id);
    const reverse = buildBriefing([second, first]).findings.map((row) => row.id);
    expect(reverse).toEqual(forward);
    expect(buildBriefing([]).phase).toBe("empty");
  });
});

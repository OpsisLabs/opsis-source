import { describe, expect, it } from "vitest";
import { captureWatch } from "./model";
import { watchFixture } from "./fixture";
import { deriveWatchInbox, evaluateWatchConditions, setInboxAction } from "./inbox";

describe("Watch inbox", () => {
  it("derives changed evidence and resurfaces a new block after acknowledgement", () => {
    const first = captureWatch(watchFixture(100), "Wallet");
    const second = captureWatch(watchFixture(101), "Wallet", first);
    const [finding] = deriveWatchInbox([second], Date.parse("2026-09-22T00:00:00.000Z")).filter((row) => row.status === "changed");
    expect(finding.titleCode).toBe("balanceChanged");
    const acknowledged = setInboxAction(second, finding.evidenceId, { acknowledgedAt: "2026-09-22T00:00:00.000Z" });
    expect(deriveWatchInbox([acknowledged], Date.parse("2026-09-22T00:00:00.000Z")).find((row) => row.evidenceId === finding.evidenceId)?.acknowledged).toBe(true);
    const changedAgain = watchFixture(102);
    changedAgain.tokens[0].quantity = "6";
    changedAgain.tokens[0].rawBalance = "6000000000000000000";
    const third = captureWatch(changedAgain, "Wallet", acknowledged);
    expect(deriveWatchInbox([third]).some((row) => row.status === "changed" && !row.acknowledged)).toBe(true);
  });

  it("keeps a one-snapshot watch unfinished and unknown coverage explicit", () => {
    const baseline = captureWatch(watchFixture(100), "Wallet");
    expect(deriveWatchInbox([baseline])[0].status).toBe("unfinished");
  });

  it("preserves conditions and actions across refresh and ignores unrelated assets", () => {
    const baseline = captureWatch(watchFixture(100), "Wallet");
    const withPrivateState = { ...baseline, conditions: [{ id: crypto.randomUUID(), kind: "balance-change" as const, assetKey: "native", direction: "increase" as const, threshold: "10", unit: "ETH", decimals: 18, createdAt: new Date().toISOString() }] };
    const acknowledged = setInboxAction(withPrivateState, "evidence:one", { acknowledgedAt: new Date().toISOString() });
    const refreshed = captureWatch(watchFixture(101), "Wallet", acknowledged);
    expect(refreshed.conditions).toEqual(withPrivateState.conditions);
    expect(refreshed.inboxActions).toEqual(acknowledged.inboxActions);
    expect(deriveWatchInbox([refreshed]).some((row) => row.conditionId === refreshed.conditions?.[0].id)).toBe(false);
  });

  it("expires snoozes without background work", () => {
    const watch = captureWatch(watchFixture(100), "Wallet");
    const [item] = deriveWatchInbox([watch]);
    const snoozed = setInboxAction(watch, item.evidenceId, { snoozedUntil: new Date(Date.now() + 60_000).toISOString() });
    expect(deriveWatchInbox([snoozed], Date.now()).find((row) => row.evidenceId === item.evidenceId)?.snoozed).toBe(true);
    expect(deriveWatchInbox([snoozed], Date.now() + 120_000).find((row) => row.evidenceId === item.evidenceId)?.snoozed).toBe(false);
  });

  it("evaluates a saved condition with exact asset, decimals, delta, and block anchor", () => {
    const first = captureWatch(watchFixture(100), "Wallet");
    const condition = { id: crypto.randomUUID(), kind: "balance-change" as const, assetKey: "native", direction: "decrease" as const, threshold: "0.1", unit: "ETH", decimals: 18, createdAt: new Date().toISOString() };
    const watch = captureWatch(watchFixture(101), "Wallet", { ...first, conditions: [condition] });
    const [result] = evaluateWatchConditions(watch);
    expect(result.titleCode).toBe("conditionMet");
    expect(result.detailValues).toMatchObject({ assetKey: "native", decimals: "18", delta: "-0.1", anchorHash: watch.snapshots.at(-1)!.anchor.blockHash });
    expect(result.anchorHash).toBe(watch.snapshots.at(-1)!.anchor.blockHash);
  });

  it("keeps stale and provider-gap condition results explicitly unknown", () => {
    const first = captureWatch(watchFixture(100), "Wallet");
    const condition = { id: crypto.randomUUID(), kind: "balance-change" as const, assetKey: "native", direction: "any" as const, threshold: "0.1", unit: "ETH", decimals: 18, createdAt: new Date().toISOString() };
    const watch = captureWatch(watchFixture(101), "Wallet", { ...first, conditions: [condition] });
    const stale = evaluateWatchConditions(watch, Date.parse(watch.snapshots.at(-1)!.anchor.fetchedAt) + 600_001);
    expect(stale[0]).toMatchObject({ status: "unknown", titleCode: "conditionUnknown", detailValues: { reason: "stale" } });
    const withGap = { ...watch, snapshots: watch.snapshots.map((snapshot, index) => index === 1 ? { ...snapshot, reconciliation: { ...snapshot.reconciliation, degradedSources: ["rpc"] } } : snapshot) };
    const gap = evaluateWatchConditions(withGap);
    expect(gap[0]).toMatchObject({ status: "unknown", titleCode: "conditionUnknown", detailValues: { reason: "coverage-gap" } });
  });

  it("fails closed when retained anchors are non-monotonic", () => {
    const first = captureWatch(watchFixture(100), "Wallet");
    const condition = { id: crypto.randomUUID(), kind: "balance-change" as const, assetKey: "native", direction: "any" as const, threshold: "0.1", unit: "ETH", decimals: 18, createdAt: new Date().toISOString() };
    const latest = watchFixture(101);
    const malformed = { ...first, conditions: [condition], snapshots: [first.snapshots[0], { ...latest, anchor: { ...latest.anchor, blockNumber: 100 } }] };
    const items = deriveWatchInbox([malformed]);
    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({ titleCode: "coverageAttention", detailValues: expect.objectContaining({ gaps: "invalid-anchor" }) }),
      expect.objectContaining({ titleCode: "conditionUnknown", detailValues: expect.objectContaining({ reason: "invalid-anchor" }) }),
    ]));
  });
});

import { describe, expect, it } from "vitest";
import { captureWatch } from "./model";
import { watchFixture } from "./fixture";
import { deriveWatchInbox, setInboxAction } from "./inbox";

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
});

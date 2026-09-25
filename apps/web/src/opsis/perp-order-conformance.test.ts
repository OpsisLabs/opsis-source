import { describe, expect, it } from "vitest";
import { createPerpIntent, type PerpOrderIntent } from "./perp-order-lifecycle";
import {
  MAX_CONFORMANCE_TRACE_STEPS,
  runPerpOrderTrace,
  verifyPositionFlat,
} from "./perp-order-conformance";

const scope = {
  venueId: "venue-x",
  accountId: "account-a",
  marketId: "BTC-PERP",
};

function intent(): PerpOrderIntent {
  const result = createPerpIntent({
    ...scope,
    clientOrderId: "client-7",
    side: "sell",
    kind: "close",
    requestedSize: "1",
    reduceOnlyRequested: true,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const authAndSubmit = [
  { kind: "local" as const, action: "request-authorization" as const },
  {
    kind: "local" as const,
    action: {
      type: "record-authorization" as const,
      marker: "caller-asserted:opaque",
    },
  },
  { kind: "local" as const, action: "begin-submission" as const },
];

describe("perp order conformance harness", () => {
  it("runs bounded recovery traces without network access and preserves unknown on timeout/not-found", () => {
    const result = runPerpOrderTrace(intent(), [
      ...authAndSubmit,
      { kind: "local", action: "timeout" },
      {
        kind: "venue",
        event: { ...scope, clientOrderId: "client-7", type: "not-found" },
      },
    ]);
    expect(result).toMatchObject({
      ok: true,
      intent: { state: "submission-unknown" },
    });
    if (result.ok) expect(result.intent.orderId).toBeUndefined();
    expect(
      runPerpOrderTrace(
        intent(),
        Array(MAX_CONFORMANCE_TRACE_STEPS + 1).fill({
          kind: "local",
          action: "timeout",
        }),
      ),
    ).toMatchObject({ ok: false, error: "trace-too-long", applied: 0 });
  });

  it("correlates IDs and refuses duplicate/out-of-order regressions", () => {
    const opened = runPerpOrderTrace(intent(), [
      ...authAndSubmit,
      {
        kind: "venue",
        event: {
          ...scope,
          clientOrderId: "client-7",
          orderId: "venue-1",
          type: "open",
        },
      },
    ]);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(
      runPerpOrderTrace(opened.intent, [
        {
          kind: "venue",
          event: {
            ...scope,
            clientOrderId: "client-7",
            orderId: "venue-1",
            type: "accepted",
          },
        },
      ]),
    ).toMatchObject({ ok: false, error: "terminal-regression", applied: 0 });
    expect(
      runPerpOrderTrace(opened.intent, [
        {
          kind: "venue",
          event: {
            ...scope,
            clientOrderId: "wrong",
            orderId: "venue-1",
            type: "fill",
            cumulativeFilled: 1n,
          },
        },
      ]),
    ).toMatchObject({ ok: false, error: "client-id-mismatch" });
  });

  it("keeps partial fill plus cancel timeout uncertain and cumulative fill bounded", () => {
    const result = runPerpOrderTrace(intent(), [
      ...authAndSubmit,
      {
        kind: "venue",
        event: {
          ...scope,
          clientOrderId: "client-7",
          orderId: "venue-1",
          type: "open",
        },
      },
      { kind: "local", action: "request-cancel" },
      {
        kind: "venue",
        event: {
          ...scope,
          clientOrderId: "client-7",
          orderId: "venue-1",
          type: "fill",
          cumulativeFilled: 40000000n,
        },
      },
      { kind: "local", action: "timeout" },
      {
        kind: "venue",
        event: {
          ...scope,
          clientOrderId: "client-7",
          orderId: "venue-1",
          type: "fill",
          cumulativeFilled: 50000000n,
        },
      },
    ]);
    expect(result).toMatchObject({
      ok: true,
      intent: { state: "cancel-status-unknown", cumulativeFilled: 50000000n },
    });
    if (!result.ok) return;
    expect(
      runPerpOrderTrace(result.intent, [
        {
          kind: "venue",
          event: {
            ...scope,
            clientOrderId: "client-7",
            orderId: "venue-1",
            type: "fill",
            cumulativeFilled: 40000000n,
          },
        },
      ]),
    ).toMatchObject({ ok: false, error: "fill-regression" });
    expect(
      runPerpOrderTrace(result.intent, [
        {
          kind: "venue",
          event: {
            ...scope,
            clientOrderId: "client-7",
            orderId: "venue-1",
            type: "fill",
            cumulativeFilled: 100000001n,
          },
        },
      ]),
    ).toMatchObject({ ok: false, error: "fill-exceeds-request" });
  });

  it("retains final partial-fill evidence from a cancel acknowledgment", () => {
    const result = runPerpOrderTrace(intent(), [
      ...authAndSubmit,
      {
        kind: "venue",
        event: {
          ...scope,
          clientOrderId: "client-7",
          orderId: "venue-1",
          type: "open",
        },
      },
      { kind: "local", action: "request-cancel" },
      {
        kind: "venue",
        event: {
          ...scope,
          clientOrderId: "client-7",
          orderId: "venue-1",
          type: "canceled",
          cumulativeFilled: 25000000n,
        },
      },
    ]);
    expect(result).toMatchObject({
      ok: true,
      intent: { state: "canceled", cumulativeFilled: 25000000n },
    });
  });

  it("requires a fresh matching-account observation at or after close evidence", () => {
    const filled = runPerpOrderTrace(intent(), [
      ...authAndSubmit,
      {
        kind: "venue",
        event: {
          ...scope,
          clientOrderId: "client-7",
          orderId: "venue-1",
          type: "fill",
          cumulativeFilled: 100000000n,
        },
      },
    ]);
    expect(filled).toMatchObject({
      ok: true,
      intent: { state: "filled", positionStateVerified: false },
    });
    const scopeInput = {
      expectedAccountId: "acct-A",
      expectedPositionScope: "venue-x:BTC-PERP",
      nowMs: 1000,
      maxAgeMs: 20,
      notBeforeMs: 990,
    };
    expect(
      verifyPositionFlat({
        ...scopeInput,
        observation: {
          accountId: "acct-B",
          positionScope: "venue-x:BTC-PERP",
          observedAtMs: 995,
          size: 0n,
        },
      }),
    ).toEqual({ verified: false, reason: "wrong-account" });
    expect(
      verifyPositionFlat({
        ...scopeInput,
        observation: {
          accountId: "acct-A",
          positionScope: "venue-x:ETH-PERP",
          observedAtMs: 995,
          size: 0n,
        },
      }),
    ).toEqual({ verified: false, reason: "wrong-position-scope" });
    expect(
      verifyPositionFlat({
        ...scopeInput,
        observation: {
          accountId: "acct-A",
          positionScope: "venue-x:BTC-PERP",
          observedAtMs: 900,
          size: 0n,
        },
        maxAgeMs: 200,
      }),
    ).toEqual({ verified: false, reason: "before-close-evidence" });
    expect(
      verifyPositionFlat({
        ...scopeInput,
        observation: {
          accountId: "acct-A",
          positionScope: "venue-x:BTC-PERP",
          observedAtMs: 900,
          size: 0n,
        },
      }),
    ).toEqual({ verified: false, reason: "stale" });
    expect(
      verifyPositionFlat({
        ...scopeInput,
        observation: {
          accountId: "acct-A",
          positionScope: "venue-x:BTC-PERP",
          observedAtMs: 990,
          size: 0n,
        },
      }),
    ).toEqual({ verified: true, flat: true, observedAtMs: 990 });
    expect(
      verifyPositionFlat({
        ...scopeInput,
        observation: {
          accountId: "acct-A",
          positionScope: "venue-x:BTC-PERP",
          observedAtMs: 999,
          size: 0n,
        },
      }),
    ).toEqual({ verified: true, flat: true, observedAtMs: 999 });
    expect(
      verifyPositionFlat({
        ...scopeInput,
        observation: {
          accountId: "acct-A",
          positionScope: "venue-x:BTC-PERP",
          observedAtMs: 999,
          size: 1n,
        },
      }),
    ).toEqual({ verified: false, reason: "not-flat" });
    expect(
      verifyPositionFlat({
        ...scopeInput,
        notBeforeMs: 1001,
        observation: {
          accountId: "acct-A",
          positionScope: "venue-x:BTC-PERP",
          observedAtMs: 999,
          size: 0n,
        },
      }),
    ).toEqual({ verified: false, reason: "invalid-observation" });
  });
});

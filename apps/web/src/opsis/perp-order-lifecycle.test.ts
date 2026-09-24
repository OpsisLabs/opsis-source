import { describe, expect, it } from "vitest";
import {
  applyLocalAction,
  applyVenueEvent,
  createPerpIntent,
  parseBaseSize,
  retryGuard,
  type PerpOrderIntent,
} from "./perp-order-lifecycle";

function intent(): PerpOrderIntent {
  const result = createPerpIntent({
    clientOrderId: "opaque/client:17",
    side: "sell",
    kind: "close",
    requestedSize: "1.25000001",
    reduceOnlyRequested: true,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function submitted(source = intent()): PerpOrderIntent {
  return ok(applyLocalAction(ok(applyLocalAction(source, "request-authorization")), "begin-submission"));
}

function ok<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("pure perp order lifecycle model", () => {
  it("parses positive base sizes exactly and rejects unsupported precision", () => {
    expect(parseBaseSize("1.25000001")).toBe(125000001n);
    expect(parseBaseSize("0.00000001")).toBe(1n);
    expect(parseBaseSize("0")).toBeNull();
    expect(parseBaseSize("1.000000001")).toBeNull();
    expect(parseBaseSize("1e-3")).toBeNull();
  });

  it("requires reduceOnly to create reduce and close intents, without asserting venue enforcement", () => {
    expect(createPerpIntent({ clientOrderId: "x", side: "sell", kind: "reduce", requestedSize: "1", reduceOnlyRequested: false }))
      .toEqual({ ok: false, error: "reduce-only-required" });
    expect(intent().reduceOnlyRequested).toBe(true);
  });

  it("keeps local timeout and not-found unknown and exposes query-before-retry", () => {
    const pending = submitted();
    expect(pending.state).toBe("submission-unknown");
    expect(retryGuard(pending)).toBe("query-before-retry");
    const timedOut = ok(applyLocalAction(pending, "timeout"));
    expect(timedOut.state).toBe("submission-unknown");
    const notFound = ok(applyVenueEvent(timedOut, { clientOrderId: pending.clientOrderId, type: "not-found" }));
    expect(notFound.state).toBe("submission-unknown");
    expect(retryGuard(notFound)).toBe("query-before-retry");
    expect("submit" in notFound).toBe(false);
  });

  it("rejects mismatched client IDs and conflicting venue order IDs", () => {
    const accepted = ok(applyVenueEvent(submitted(), { clientOrderId: "opaque/client:17", orderId: "venue-1", type: "accepted" }));
    expect(applyVenueEvent(accepted, { clientOrderId: "other", orderId: "venue-1", type: "open" }))
      .toEqual({ ok: false, error: "client-id-mismatch" });
    expect(applyVenueEvent(accepted, { clientOrderId: accepted.clientOrderId, orderId: "venue-2", type: "open" }))
      .toEqual({ ok: false, error: "order-id-mismatch" });
    expect(applyVenueEvent(accepted, { clientOrderId: accepted.clientOrderId, type: "open" }))
      .toEqual({ ok: false, error: "order-id-required" });
  });

  it("requires submission context and never treats pending authorization as permission to submit", () => {
    const draft = intent();
    expect(applyVenueEvent(draft, { clientOrderId: draft.clientOrderId, orderId: "venue-1", type: "accepted" }))
      .toEqual({ ok: false, error: "invalid-transition" });
    const authPending = ok(applyLocalAction(draft, "request-authorization"));
    expect(retryGuard(authPending)).toBe("authorization-required");
    expect(applyVenueEvent(authPending, { clientOrderId: authPending.clientOrderId, orderId: "venue-1", type: "accepted" }))
      .toEqual({ ok: false, error: "invalid-transition" });
    expect(retryGuard(draft)).toBe("review-required");
    expect(applyLocalAction(draft, "begin-submission")).toEqual({ ok: false, error: "invalid-transition" });
  });

  it("preserves cancel-pending through a partial fill race, then accepts venue cancellation", () => {
    const open = ok(applyVenueEvent(submitted(), { clientOrderId: intent().clientOrderId, orderId: "venue-1", type: "open" }));
    const cancelPending = ok(applyLocalAction(open, "request-cancel"));
    expect(cancelPending.state).toBe("cancel-pending");
    const partial = ok(applyVenueEvent(cancelPending, { clientOrderId: open.clientOrderId, orderId: "venue-1", type: "fill", cumulativeFilled: 50000000n }));
    expect(partial.state).toBe("cancel-pending");
    expect(partial.cumulativeFilled).toBe(50000000n);
    expect(ok(applyVenueEvent(partial, { clientOrderId: open.clientOrderId, orderId: "venue-1", type: "canceled" })).state).toBe("canceled");
  });

  it("rejects regressing, oversized, and impossible post-terminal fills", () => {
    const source = submitted();
    const partial = ok(applyVenueEvent(source, { clientOrderId: source.clientOrderId, orderId: "venue-1", type: "fill", cumulativeFilled: 100000000n }));
    expect(applyVenueEvent(partial, { clientOrderId: source.clientOrderId, orderId: "venue-1", type: "fill", cumulativeFilled: 90000000n }))
      .toEqual({ ok: false, error: "fill-regression" });
    expect(applyVenueEvent(source, { clientOrderId: source.clientOrderId, orderId: "venue-1", type: "fill", cumulativeFilled: source.requestedSize + 1n }))
      .toEqual({ ok: false, error: "fill-exceeds-request" });
    const rejected = ok(applyVenueEvent(source, { clientOrderId: source.clientOrderId, orderId: "venue-1", type: "rejected" }));
    expect(rejected.state).toBe("rejected");
    expect(applyVenueEvent(rejected, { clientOrderId: source.clientOrderId, orderId: "venue-1", type: "open" }))
      .toEqual({ ok: false, error: "terminal-regression" });
  });

  it("labels full close only after venue cumulative fills cover size, with position verification separate", () => {
    const source = submitted();
    const filled = ok(applyVenueEvent(source, { clientOrderId: source.clientOrderId, orderId: "venue-1", type: "fill", cumulativeFilled: source.requestedSize }));
    expect(filled.state).toBe("filled");
    expect(filled.cumulativeFilled).toBe(filled.requestedSize);
    expect(filled.positionStateVerified).toBe(false);
  });

  it("preserves known orders on timeout and separates cancel-status uncertainty", () => {
    const source = submitted();
    const open = ok(applyVenueEvent(source, { clientOrderId: source.clientOrderId, orderId: "venue-1", type: "open" }));
    expect(applyLocalAction(open, "timeout")).toEqual({ ok: false, error: "invalid-transition" });
    expect(open.state).toBe("open");
    const partiallyFilled = ok(applyVenueEvent(open, {
      clientOrderId: source.clientOrderId,
      orderId: "venue-1",
      type: "fill",
      cumulativeFilled: 50000000n,
    }));
    expect(applyLocalAction(partiallyFilled, "timeout")).toEqual({ ok: false, error: "invalid-transition" });
    expect(partiallyFilled).toMatchObject({ state: "partially-filled", cumulativeFilled: 50000000n });

    const cancelPending = ok(applyLocalAction(open, "request-cancel"));
    const uncertain = ok(applyLocalAction(cancelPending, "timeout"));
    expect(uncertain.state).toBe("cancel-status-unknown");
    expect(retryGuard(uncertain)).toBe("query-before-cancel");
    const fill = ok(applyVenueEvent(uncertain, {
      clientOrderId: source.clientOrderId,
      orderId: "venue-1",
      type: "fill",
      cumulativeFilled: 50000000n,
    }));
    expect(fill.state).toBe("cancel-status-unknown");
    expect(applyVenueEvent(uncertain, { clientOrderId: source.clientOrderId, orderId: "venue-1", type: "canceled" }))
      .toMatchObject({ ok: true, value: { state: "canceled" } });
  });
});

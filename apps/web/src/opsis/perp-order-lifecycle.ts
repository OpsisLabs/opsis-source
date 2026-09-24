/**
 * Pure test/specification model for one perp order intent. This is not an
 * executable trading path and does not prove that a venue enforces reduceOnly.
 */
export const PERP_SIZE_DECIMALS = 8;
const SIZE_SCALE = 10n ** BigInt(PERP_SIZE_DECIMALS);

export type PerpIntentKind = "open" | "reduce" | "close";
export type PerpSide = "buy" | "sell";
export type PerpOrderState =
  | "review"
  | "authorization-pending"
  | "submission-unknown"
  | "cancel-status-unknown"
  | "accepted"
  | "open"
  | "partially-filled"
  | "filled"
  | "cancel-pending"
  | "canceled"
  | "rejected";

export type PerpOrderIntent = Readonly<{
  clientOrderId: string;
  side: PerpSide;
  kind: PerpIntentKind;
  reduceOnlyRequested: boolean;
  requestedSize: bigint;
  cumulativeFilled: bigint;
  orderId?: string;
  state: PerpOrderState;
  /** A close's filled size is not position-state verification. */
  positionStateVerified: false;
}>;

export type LifecycleError =
  | "invalid-client-id"
  | "invalid-size"
  | "reduce-only-required"
  | "invalid-transition"
  | "client-id-mismatch"
  | "order-id-mismatch"
  | "order-id-required"
  | "fill-regression"
  | "fill-exceeds-request"
  | "invalid-fill-state"
  | "terminal-regression";

export type Result<T> = { ok: true; value: T } | { ok: false; error: LifecycleError };

/** Parse a positive base size exactly, accepting at most eight decimal places. */
export function parseBaseSize(value: string): bigint | null {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,8}))?$/.exec(value);
  if (!match) return null;
  const fraction = (match[2] ?? "").padEnd(PERP_SIZE_DECIMALS, "0");
  const units = BigInt(match[1]) * SIZE_SCALE + BigInt(fraction || "0");
  return units > 0n ? units : null;
}

export function formatBaseSize(units: bigint): string {
  const whole = units / SIZE_SCALE;
  const fraction = (units % SIZE_SCALE).toString().padStart(PERP_SIZE_DECIMALS, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function createPerpIntent(input: {
  clientOrderId: string;
  side: PerpSide;
  kind: PerpIntentKind;
  requestedSize: string;
  reduceOnlyRequested: boolean;
}): Result<PerpOrderIntent> {
  if (!input.clientOrderId.trim()) return { ok: false, error: "invalid-client-id" };
  const requestedSize = parseBaseSize(input.requestedSize);
  if (requestedSize === null) return { ok: false, error: "invalid-size" };
  if (input.kind !== "open" && !input.reduceOnlyRequested) {
    return { ok: false, error: "reduce-only-required" };
  }
  return {
    ok: true,
    value: {
      clientOrderId: input.clientOrderId,
      side: input.side,
      kind: input.kind,
      reduceOnlyRequested: input.reduceOnlyRequested,
      requestedSize,
      cumulativeFilled: 0n,
      state: "review",
      positionStateVerified: false,
    },
  };
}

export type VenueOrderEvent = Readonly<{
  clientOrderId: string;
  orderId?: string;
  type: "accepted" | "open" | "fill" | "canceled" | "rejected" | "not-found";
  cumulativeFilled?: bigint;
}>;

export type LocalAction = "request-authorization" | "begin-submission" | "timeout" | "request-cancel";

/**
 * `begin-submission` means wallet authorization has already succeeded and
 * submission may have started. Timeouts preserve known venue states; a cancel
 * timeout is separately represented as cancel-status-unknown.
 */
export function applyLocalAction(intent: PerpOrderIntent, action: LocalAction): Result<PerpOrderIntent> {
  if (action === "request-authorization" && intent.state === "review") {
    return { ok: true, value: { ...intent, state: "authorization-pending" } };
  }
  if (action === "begin-submission" && intent.state === "authorization-pending") {
    return { ok: true, value: { ...intent, state: "submission-unknown" } };
  }
  if (action === "timeout" && intent.state === "submission-unknown") {
    return { ok: true, value: { ...intent, state: "submission-unknown" } };
  }
  if (action === "timeout" && intent.state === "cancel-pending") {
    return { ok: true, value: { ...intent, state: "cancel-status-unknown" } };
  }
  if (action === "request-cancel" && ["accepted", "open", "partially-filled"].includes(intent.state)) {
    return { ok: true, value: { ...intent, state: "cancel-pending" } };
  }
  return { ok: false, error: "invalid-transition" };
}

const terminalStates = new Set<PerpOrderState>(["filled", "canceled", "rejected"]);

/** Apply a correlated venue observation; `not-found` cannot resolve unknown. */
export function applyVenueEvent(intent: PerpOrderIntent, event: VenueOrderEvent): Result<PerpOrderIntent> {
  if (event.clientOrderId !== intent.clientOrderId) return { ok: false, error: "client-id-mismatch" };
  if (intent.orderId && !event.orderId) return { ok: false, error: "order-id-required" };
  if (intent.orderId && event.orderId !== intent.orderId) return { ok: false, error: "order-id-mismatch" };
  if (event.type !== "not-found" && !event.orderId?.trim()) return { ok: false, error: "order-id-required" };
  if (intent.state === "review" || intent.state === "authorization-pending") {
    return { ok: false, error: "invalid-transition" };
  }
  if (terminalStates.has(intent.state)) {
    return { ok: false, error: "terminal-regression" };
  }

  const withOrderId = event.orderId && !intent.orderId ? { ...intent, orderId: event.orderId } : intent;
  if (event.type === "not-found") return { ok: true, value: withOrderId };
  if (event.type === "accepted" || event.type === "open") {
    if (intent.state === "cancel-pending" || intent.state === "cancel-status-unknown" || intent.state === "partially-filled") return { ok: false, error: "terminal-regression" };
    return { ok: true, value: { ...withOrderId, state: event.type } };
  }
  if (event.type === "rejected") {
    if (intent.cumulativeFilled > 0n) return { ok: false, error: "invalid-transition" };
    return { ok: true, value: { ...withOrderId, state: "rejected" } };
  }
  if (event.type === "canceled") {
    if (intent.state !== "cancel-pending" && intent.state !== "cancel-status-unknown" && intent.state !== "submission-unknown" && intent.state !== "open" && intent.state !== "accepted" && intent.state !== "partially-filled") {
      return { ok: false, error: "invalid-transition" };
    }
    return { ok: true, value: { ...withOrderId, state: "canceled" } };
  }

  const filled = event.cumulativeFilled;
  if (filled === undefined) return { ok: false, error: "invalid-fill-state" };
  if (filled < intent.cumulativeFilled) return { ok: false, error: "fill-regression" };
  if (filled > intent.requestedSize) return { ok: false, error: "fill-exceeds-request" };
  if (filled === intent.cumulativeFilled) return { ok: true, value: withOrderId };
  if (filled === intent.requestedSize) return { ok: true, value: { ...withOrderId, cumulativeFilled: filled, state: "filled" } };
  if (filled === 0n) return { ok: false, error: "invalid-fill-state" };
  if (intent.state === "cancel-pending" || intent.state === "cancel-status-unknown") {
    return { ok: true, value: { ...withOrderId, cumulativeFilled: filled, state: intent.state } };
  }
  return { ok: true, value: { ...withOrderId, cumulativeFilled: filled, state: "partially-filled" } };
}

export type RetryGuard =
  | "review-required"
  | "authorization-required"
  | "initial-submission-only"
  | "query-before-retry"
  | "query-before-cancel"
  | "no-resubmit";

/** Advisory guard only: no function here can submit, and not-found stays unknown. */
export function retryGuard(intent: PerpOrderIntent): RetryGuard {
  if (intent.state === "submission-unknown") return "query-before-retry";
  if (intent.state === "cancel-status-unknown") return "query-before-cancel";
  if (intent.state === "review") return "review-required";
  if (intent.state === "authorization-pending") return "authorization-required";
  return "no-resubmit";
}

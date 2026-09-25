/**
 * Pure test/specification model for one perp order intent. This is not an
 * executable trading path and does not prove that a venue enforces reduceOnly.
 */
export const PERP_SIZE_DECIMALS = 8;
const SIZE_SCALE = 10n ** BigInt(PERP_SIZE_DECIMALS);
const MAX_BASE_SIZE_INPUT_LENGTH = 40;

function isBoundedNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

export type PerpIntentKind = "open" | "reduce" | "close";
export type PerpSide = "buy" | "sell";
export type PerpOrderState =
  | "review"
  | "authorization-pending"
  | "authorization-recorded"
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
  venueId: string;
  accountId: string;
  marketId: string;
  side: PerpSide;
  kind: PerpIntentKind;
  reduceOnlyRequested: boolean;
  requestedSize: bigint;
  cumulativeFilled: bigint;
  orderId?: string;
  state: PerpOrderState;
  /** A close's filled size is not position-state verification. */
  positionStateVerified: false;
  /** Caller-supplied marker only; this model does not cryptographically verify authorization. */
  authorizationMarker?: string;
}>;

export type LifecycleError =
  | "invalid-client-id"
  | "invalid-scope-id"
  | "invalid-authorization-marker"
  | "invalid-size"
  | "reduce-only-required"
  | "invalid-transition"
  | "client-id-mismatch"
  | "scope-mismatch"
  | "order-id-mismatch"
  | "order-id-required"
  | "fill-regression"
  | "fill-exceeds-request"
  | "invalid-fill-state"
  | "terminal-regression";

export type Result<T> = { ok: true; value: T } | { ok: false; error: LifecycleError };

/** Parse a positive base size exactly, accepting at most eight decimal places. */
export function parseBaseSize(value: string): bigint | null {
  if (typeof value !== "string") return null;
  if (value.length > MAX_BASE_SIZE_INPUT_LENGTH) return null;
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
  venueId: string;
  accountId: string;
  marketId: string;
  side: PerpSide;
  kind: PerpIntentKind;
  requestedSize: string;
  reduceOnlyRequested: boolean;
}): Result<PerpOrderIntent> {
  if (!input || typeof input !== "object") return { ok: false, error: "invalid-client-id" };
  if (!isBoundedNonEmptyString(input.clientOrderId, 128)) return { ok: false, error: "invalid-client-id" };
  if (!isBoundedNonEmptyString(input.venueId, 128) || !isBoundedNonEmptyString(input.accountId, 128) || !isBoundedNonEmptyString(input.marketId, 256)) {
    return { ok: false, error: "invalid-scope-id" };
  }
  const requestedSize = parseBaseSize(input.requestedSize);
  if (requestedSize === null) return { ok: false, error: "invalid-size" };
  if (input.kind !== "open" && !input.reduceOnlyRequested) {
    return { ok: false, error: "reduce-only-required" };
  }
  return {
    ok: true,
    value: {
      clientOrderId: input.clientOrderId,
      venueId: input.venueId,
      accountId: input.accountId,
      marketId: input.marketId,
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
  venueId: string;
  accountId: string;
  marketId: string;
  orderId?: string;
  type: "accepted" | "open" | "fill" | "canceled" | "rejected" | "not-found";
  cumulativeFilled?: bigint;
}>;

export type LocalAction = "request-authorization" | "begin-submission" | "timeout" | "request-cancel" | { type: "record-authorization"; marker: string };

/**
 * `begin-submission` requires an explicit caller-supplied authorization marker
 * (not cryptographically verified here) and records that submission may have started. Timeouts preserve known venue states; a cancel
 * timeout is separately represented as cancel-status-unknown.
 */
export function applyLocalAction(intent: PerpOrderIntent, action: LocalAction): Result<PerpOrderIntent> {
  if (typeof action !== "string" && action.type === "record-authorization" && intent.state === "authorization-pending") {
    if (!action.marker.trim() || action.marker.length > 512) return { ok: false, error: "invalid-authorization-marker" };
    return { ok: true, value: { ...intent, state: "authorization-recorded", authorizationMarker: action.marker } };
  }
  if (action === "request-authorization" && intent.state === "review") {
    return { ok: true, value: { ...intent, state: "authorization-pending" } };
  }
  if (action === "begin-submission" && intent.state === "authorization-recorded" && intent.authorizationMarker) {
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
  if (!event || typeof event !== "object") return { ok: false, error: "invalid-scope-id" };
  if (!isBoundedNonEmptyString(event.clientOrderId, 128)) return { ok: false, error: "invalid-client-id" };
  if (!isBoundedNonEmptyString(event.venueId, 128) || !isBoundedNonEmptyString(event.accountId, 128) || !isBoundedNonEmptyString(event.marketId, 256)) {
    return { ok: false, error: "invalid-scope-id" };
  }
  if (event.cumulativeFilled !== undefined && typeof event.cumulativeFilled !== "bigint") {
    return { ok: false, error: "invalid-fill-state" };
  }
  if (event.type !== "accepted" && event.type !== "open" && event.type !== "fill" && event.type !== "canceled" && event.type !== "rejected" && event.type !== "not-found") {
    return { ok: false, error: "invalid-transition" };
  }
  if (event.venueId !== intent.venueId || event.accountId !== intent.accountId || event.marketId !== intent.marketId) {
    return { ok: false, error: "scope-mismatch" };
  }
  if (event.orderId !== undefined && !isBoundedNonEmptyString(event.orderId, 128)) {
    return { ok: false, error: "order-id-required" };
  }
  if (event.clientOrderId !== intent.clientOrderId) return { ok: false, error: "client-id-mismatch" };
  if (intent.orderId && !event.orderId) return { ok: false, error: "order-id-required" };
  if (intent.orderId && event.orderId !== intent.orderId) return { ok: false, error: "order-id-mismatch" };
  if (event.type !== "not-found" && !event.orderId?.trim()) return { ok: false, error: "order-id-required" };
  if (intent.state === "review" || intent.state === "authorization-pending" || intent.state === "authorization-recorded") {
    return { ok: false, error: "invalid-transition" };
  }
  if (terminalStates.has(intent.state)) {
    return { ok: false, error: "terminal-regression" };
  }

  const withOrderId = event.orderId && !intent.orderId ? { ...intent, orderId: event.orderId } : intent;
  if (event.type === "not-found") return { ok: true, value: withOrderId };
  if (event.type === "accepted" || event.type === "open") {
    if (intent.state === "cancel-pending" || intent.state === "cancel-status-unknown" || intent.state === "partially-filled") return { ok: false, error: "terminal-regression" };
    if (event.type === "accepted" && intent.state !== "submission-unknown" && intent.state !== "accepted") return { ok: false, error: "terminal-regression" };
    if (event.type === "open" && intent.state !== "submission-unknown" && intent.state !== "accepted" && intent.state !== "open") return { ok: false, error: "terminal-regression" };
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
    const filled = event.cumulativeFilled;
    if (filled !== undefined) {
      if (filled < intent.cumulativeFilled) return { ok: false, error: "fill-regression" };
      if (filled > intent.requestedSize) return { ok: false, error: "fill-exceeds-request" };
      // A cancel acknowledgment can race a final fill; cumulative venue evidence
      // wins when it shows the requested amount was already completely filled.
      if (filled === intent.requestedSize) {
        return { ok: true, value: { ...withOrderId, cumulativeFilled: filled, state: "filled" } };
      }
      return { ok: true, value: { ...withOrderId, cumulativeFilled: filled, state: "canceled" } };
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
  if (intent.state === "authorization-recorded") return "initial-submission-only";
  return "no-resubmit";
}

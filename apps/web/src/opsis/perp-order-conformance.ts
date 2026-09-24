import {
  applyLocalAction,
  applyVenueEvent,
  type LocalAction,
  type PerpOrderIntent,
  type Result,
  type VenueOrderEvent,
} from "./perp-order-lifecycle";

/** A bounded deterministic recovery trace. This runner never calls a venue. */
export const MAX_CONFORMANCE_TRACE_STEPS = 256;
export type TraceStep = Readonly<{ kind: "local"; action: LocalAction } | { kind: "venue"; event: VenueOrderEvent }>;
export type TraceResult = Readonly<{ ok: true; intent: PerpOrderIntent; applied: number }> | Readonly<{
  ok: false; intent: PerpOrderIntent; applied: number; failedAt: number; error: string;
}>;

export function runPerpOrderTrace(initial: PerpOrderIntent, steps: readonly TraceStep[]): TraceResult {
  if (steps.length > MAX_CONFORMANCE_TRACE_STEPS) {
    return { ok: false, intent: initial, applied: 0, failedAt: 0, error: "trace-too-long" };
  }
  let current = initial;
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const next: Result<PerpOrderIntent> = step.kind === "local"
      ? applyLocalAction(current, step.action)
      : applyVenueEvent(current, step.event);
    if (!next.ok) return { ok: false, intent: current, applied: i, failedAt: i, error: next.error };
    current = next.value;
  }
  return { ok: true, intent: current, applied: steps.length };
}

export type PositionObservation = Readonly<{
  accountId: string;
  /** Stable venue+instrument scope or opaque venue-position key. */
  positionScope: string;
  observedAtMs: number;
  /** Signed position size in the same exact base units as the order model. */
  size: bigint;
}>;
export type PositionVerification = Readonly<{ verified: true; flat: true; observedAtMs: number }> | Readonly<{
  verified: false; reason: "wrong-account" | "wrong-position-scope" | "stale" | "future" | "before-close-evidence" | "invalid-observation" | "not-flat";
}>;

/** Flatness needs a fresh, matching account observation at or after explicit close evidence. */
export function verifyPositionFlat(input: {
  expectedAccountId: string;
  expectedPositionScope: string;
  observation: PositionObservation;
  nowMs: number;
  maxAgeMs: number;
  /** Same clock domain as observedAtMs; caller supplies close-fill/close evidence time. */
  notBeforeMs: number;
}): PositionVerification {
  const { expectedAccountId, expectedPositionScope, observation, nowMs, maxAgeMs, notBeforeMs } = input;
  if (!expectedAccountId.trim() || expectedAccountId.length > 128 || !expectedPositionScope.trim() || expectedPositionScope.length > 256 ||
    !observation.accountId.trim() || observation.accountId.length > 128 || !observation.positionScope.trim() || observation.positionScope.length > 256 || !Number.isFinite(nowMs) ||
    !Number.isFinite(observation.observedAtMs) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0 || !Number.isFinite(notBeforeMs) || notBeforeMs > nowMs) {
    return { verified: false, reason: "invalid-observation" };
  }
  if (observation.accountId !== expectedAccountId) return { verified: false, reason: "wrong-account" };
  if (observation.positionScope !== expectedPositionScope) return { verified: false, reason: "wrong-position-scope" };
  if (observation.observedAtMs > nowMs) return { verified: false, reason: "future" };
  if (nowMs - observation.observedAtMs > maxAgeMs) return { verified: false, reason: "stale" };
  if (observation.observedAtMs < notBeforeMs) return { verified: false, reason: "before-close-evidence" };
  if (observation.size !== 0n) return { verified: false, reason: "not-flat" };
  return { verified: true, flat: true, observedAtMs: observation.observedAtMs };
}

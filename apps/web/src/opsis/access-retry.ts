export type AccessRetryState = {
  automaticRetries: number;
  deadline: number | null;
};
export type AccessRetryEvent =
  | { type: "failure"; status?: number; retryAfter?: number; aborted?: boolean }
  | { type: "automatic" | "manual" | "success" | "abort" };

export function accessRetry(
  state: AccessRetryState,
  event: AccessRetryEvent,
  now: number,
): AccessRetryState {
  if (event.type === "success") return { automaticRetries: 0, deadline: null };
  if (event.type === "automatic") {
    if (state.deadline === null || now < state.deadline) return state;
    return { automaticRetries: state.automaticRetries + 1, deadline: null };
  }
  if (event.type !== "failure" || event.aborted || event.status !== 429 || state.automaticRetries >= 3) {
    return { ...state, deadline: null };
  }
  const wait = Number.isFinite(event.retryAfter) ? event.retryAfter! : 5;
  return { ...state, deadline: now + Math.min(60, Math.max(2, Math.ceil(wait))) * 1000 };
}

export function accessRetrySeconds(deadline: number | null, now: number): number {
  return deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
}

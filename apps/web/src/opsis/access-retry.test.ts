import { expect, it } from "vitest";
import { accessRetry, accessRetrySeconds, type AccessRetryState } from "./access-retry";

const initial: AccessRetryState = { automaticRetries: 0, deadline: null };
const now = 1000;

it("uses a stated wait or five seconds, clamped to two through sixty seconds", () => {
  for (const [retryAfter, seconds] of [[12, 12], [undefined, 5], [1, 2], [0, 2], [86400, 60], [NaN, 5]] as const) {
    const state = accessRetry(initial, { type: "failure", status: 429, retryAfter }, now);
    expect(state.deadline).toBe(now + seconds * 1000);
    expect(accessRetrySeconds(state.deadline, now)).toBe(seconds);
    expect(accessRetrySeconds(state.deadline, now + 1001)).toBe(seconds - 1);
    expect(accessRetrySeconds(state.deadline, now + 90000)).toBe(0);
  }
});

it("allows three automatic attempts, each only after its deadline", () => {
  let state = initial;
  let clock = now;
  for (let attempt = 1; attempt <= 3; attempt++) {
    state = accessRetry(state, { type: "failure", status: 429, retryAfter: 2 }, clock);
    expect(accessRetry(state, { type: "automatic" }, clock + 1999)).toEqual(state);
    clock += 2000;
    state = accessRetry(state, { type: "automatic" }, clock);
    expect(state).toEqual({ automaticRetries: attempt, deadline: null });
    expect(accessRetry(state, { type: "automatic" }, clock)).toEqual(state);
  }
  expect(accessRetry(state, { type: "failure", status: 429 }, clock)).toEqual(state);
});

it("resets the retry count and deadline on success", () => {
  const state = accessRetry({ automaticRetries: 3, deadline: now + 2000 }, { type: "success" }, now);
  expect(state).toEqual(initial);
  expect(accessRetry(state, { type: "failure", status: 429 }, now).deadline).toBe(now + 5000);
});

it("manual retry cancels the pending attempt without replenishing the page's automatic attempts", () => {
  const state = accessRetry({ automaticRetries: 2, deadline: now + 2000 }, { type: "manual" }, now);
  expect(state).toEqual({ automaticRetries: 2, deadline: null });
  expect(accessRetry(state, { type: "automatic" }, now + 90000)).toEqual(state);
  expect(accessRetry({ automaticRetries: 3, deadline: null }, { type: "manual" }, now).automaticRetries).toBe(3);
});

it("aborts cancel retries and aborted refusals schedule nothing", () => {
  const pending = { automaticRetries: 1, deadline: now + 2000 };
  for (const event of [{ type: "abort" }, { type: "failure", status: 429, aborted: true }] as const) {
    expect(accessRetry(pending, event, now)).toEqual({ automaticRetries: 1, deadline: null });
  }
});

it("does not retry server, network or invalid-response failures", () => {
  for (const status of [503, 500, 401, undefined]) {
    expect(accessRetry(initial, { type: "failure", status, retryAfter: 2 }, now)).toEqual(initial);
  }
  expect(accessRetrySeconds(null, now)).toBe(0);
});

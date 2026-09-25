import { it, expect } from "vitest";
import { validControls } from "./controls-model";
it("rejects incomplete/untrusted controls and wrong-scoped evidence", () => {
  const contract = `0x${"1".repeat(40)}`;
  for (const value of [
    null,
    {},
    { chainId: 1 },
    { kind: "observed", chainId: 4663, contract },
    { readings: { owner: { state: "observed", value: "anything" } } },
  ])
    expect(validControls(value, contract)).toBe(false);
});

it("requires the exact declared unknown-control scope before showing readings", () => {
  const contract = `0x${"1".repeat(40)}`;
  const observedAt = new Date(Date.now() - 1000).toISOString();
  const reading = { state: "unknown", reason: "reverted" };
  const value = {
    kind: "observed", chainId: 4663, contract, hasCode: true,
    methodVersion: "controls-v1", source: "robinhood-public-rpc",
    observedAt, expiresAt: new Date(Date.parse(observedAt) + 30000).toISOString(),
    anchor: { blockNumber: 32, blockHash: `0x${"a".repeat(64)}`, timestamp: observedAt, finality: "current_not_final" },
    readings: { owner: reading, paused: reading, implementation: reading, admin: reading, beacon: reading },
    coverage: { state: "partial", rpcCalls: 9, unknown: ["mint_permissions", "transfer_fees", "custom_roles", "other_proxy_patterns", "holder_concentration"] },
  };
  expect(validControls(value, contract)).toBe(true);
  expect(validControls({ ...value, coverage: { ...value.coverage, unknown: ["mint_permissions"] } }, contract)).toBe(false);
});

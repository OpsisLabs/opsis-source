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

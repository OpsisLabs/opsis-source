import { describe, expect, it } from "vitest";
import type { PrivateAnalysis } from "../private/api";
import { ResearchHistory, researchIdentityKey } from "./research-history";

const entity = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const result = { entity: { value: entity(1) } } as PrivateAnalysis;
const lookup = (n: number) => ({ entity: entity(n), task: "risk" as const, entityType: "token" as const, result });

describe("Research navigation memory", () => {
  it("compares padded and mixed-case addresses and transaction hashes by identity", () => {
    for (const length of [40, 64]) {
      const id = `0x${"aB".repeat(length / 2)}`;
      expect(researchIdentityKey(`  ${id}  `)).toBe(researchIdentityKey(id.toLowerCase()));
    }
    expect(researchIdentityKey("private note")).toBe("");
  });
  it("restores the result and its question without changing its observation time", () => {
    const history = new ResearchHistory(lookup(1));
    history.remember(lookup(2));
    expect(history.find(` ${entity(1)} `)).toEqual(lookup(1));
    expect(history.find(entity(1))?.result).toBe(result);
    expect(history.find(entity(2))?.task).toBe("risk");
    expect(new ResearchHistory().find(entity(1))).toBeUndefined();
  });
  it("keeps only four completed identities and refreshes an existing slot", () => {
    const history = new ResearchHistory();
    for (let n = 1; n <= 4; n++) history.remember(lookup(n));
    history.remember(lookup(1));
    history.remember(lookup(5));
    expect(history.find(entity(1))).toBeDefined();
    expect(history.find(entity(2))).toBeUndefined();
    history.remember({ ...lookup(1), result: null });
    expect(history.find(entity(1))?.result).toBe(result);
    history.remember({ ...lookup(6), entity: "not an identifier" });
    expect(history.find(entity(3))).toBeDefined();
  });
});

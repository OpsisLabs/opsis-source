import { describe, expect, it } from "vitest";
import { parseLabView } from "./lab-view";

describe("Lab URL view", () => {
  it.each(["atlas", "surface", "research"] as const)("opens %s", (view) => {
    expect(parseLabView(view)).toBe(view);
  });
  it.each([null, "", "scenario", "quant", "SURFACE", "unknown"])(
    "defaults %s to atlas",
    (view) => {
      expect(parseLabView(view)).toBe("atlas");
    },
  );
});

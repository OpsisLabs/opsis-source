import { describe, expect, it } from "vitest";
import { watchBuildEnabled } from "./availability";

describe("Watch build flag", () => {
  it("fails closed unless the flag is exactly true", () => {
    expect(watchBuildEnabled({})).toBe(false);
    expect(watchBuildEnabled({ VITE_WATCH_ENABLED: "TRUE" })).toBe(false);
    expect(watchBuildEnabled({ VITE_WATCH_ENABLED: "" })).toBe(false);
    expect(watchBuildEnabled({ VITE_WATCH_ENABLED: "false" })).toBe(false);
    expect(watchBuildEnabled({ VITE_WATCH_ENABLED: "true" })).toBe(true);
  });
});

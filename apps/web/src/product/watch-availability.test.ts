import { describe, expect, it } from "vitest";
import { watchBuildEnabled } from "./availability";

describe("Watch build flag compatibility", () => {
  it("fails closed unless the selected flag is exactly true", () => {
    expect(watchBuildEnabled({})).toBe(false);
    expect(watchBuildEnabled({ VITE_WATCH_ENABLED: "TRUE" })).toBe(false);
    expect(watchBuildEnabled({ VITE_WATCH_ENABLED: "" })).toBe(false);
  });
  it("reads the legacy flag when the new flag is absent", () => {
    expect(watchBuildEnabled({ VITE_SCOUT_WATCH_ENABLED: "true" })).toBe(true);
    expect(watchBuildEnabled({ VITE_SCOUT_WATCH_ENABLED: "false" })).toBe(false);
  });
  it("gives the new flag precedence, including an explicit disabled value", () => {
    expect(watchBuildEnabled({ VITE_WATCH_ENABLED: "false", VITE_SCOUT_WATCH_ENABLED: "true" })).toBe(false);
    expect(watchBuildEnabled({ VITE_WATCH_ENABLED: "", VITE_SCOUT_WATCH_ENABLED: "true" })).toBe(false);
    expect(watchBuildEnabled({ VITE_WATCH_ENABLED: "true", VITE_SCOUT_WATCH_ENABLED: "false" })).toBe(true);
  });
});

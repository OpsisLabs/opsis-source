import { describe, expect, it } from "vitest";
import { PUBLIC_PAGE_PATHS, robotsDirective } from "./public-pages";

describe("search indexing directive", () => {
  it.each([undefined, "", "false", "TRUE", "1", " true"])("keeps every page out of search results unless switched on (%j)", (setting) => {
    for (const path of [...PUBLIC_PAGE_PATHS, "/saved", "/no-such-page"]) {
      expect(robotsDirective(path, setting)).toBe("noindex, nofollow");
    }
  });

  it("lets only the listed public pages be indexed when switched on", () => {
    for (const path of PUBLIC_PAGE_PATHS) expect(robotsDirective(path, "true")).toBe("index, follow");
    expect(robotsDirective("/research/", "true")).toBe("index, follow");
    for (const path of ["/saved", "/vault", "/research/details", "/biggest-trades", "/swap", "/no-such-page", "/Research", "//research", ""]) {
      expect(robotsDirective(path, "true")).toBe("noindex, nofollow");
    }
  });
});

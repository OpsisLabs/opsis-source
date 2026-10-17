import { describe, expect, it } from "vitest";
import { scrollRegionByKey } from "./scroll-keys";

function region({ focusable = true, scrollWidth = 760, clientWidth = 336 } = {}) {
  return {
    scrollWidth,
    clientWidth,
    scrollLeft: 0,
    matches: (selector: string) => focusable && selector === '[role="region"][tabindex="0"]',
  };
}

describe("scrollRegionByKey", () => {
  it("scrolls a focusable overflowing region by arrows, Home and End within its range", () => {
    const element = region();
    expect(scrollRegionByKey(element, "ArrowRight")).toBe(true);
    expect(element.scrollLeft).toBe(40);
    expect(scrollRegionByKey(element, "End")).toBe(true);
    expect(element.scrollLeft).toBe(424);
    scrollRegionByKey(element, "ArrowRight");
    expect(element.scrollLeft).toBe(424);
    expect(scrollRegionByKey(element, "Home")).toBe(true);
    expect(element.scrollLeft).toBe(0);
    scrollRegionByKey(element, "ArrowLeft");
    expect(element.scrollLeft).toBe(0);
  });

  it("leaves other keys, regions that fit and elements that are not scroll regions alone", () => {
    expect(scrollRegionByKey(region(), "ArrowDown")).toBe(false);
    expect(scrollRegionByKey(region({ scrollWidth: 300 }), "ArrowRight")).toBe(false);
    expect(scrollRegionByKey(region({ focusable: false }), "ArrowRight")).toBe(false);
  });
});

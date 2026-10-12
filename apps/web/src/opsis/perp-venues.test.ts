import { describe, expect, it } from "vitest";
import { DIRECTORY_CHECKED_AT, REVIEW_AFTER_DAYS, PERP_VENUES, directoryNeedsReview, venuesForRegion } from "./perp-venues";

describe("reviewed perp directory", () => {
  it("groups only the reviewed facts in alphabetical order", () => {
    const names = (items: typeof PERP_VENUES) => items.map((item) => item.name);
    const us = venuesForRegion("us");
    expect(names(us.offered)).toEqual(["Coinbase", "Kalshi", "Kraken"]);
    expect(us.restricted).toEqual([]);
    expect(us.notOffered).toEqual([]);
    const ca = venuesForRegion("ca");
    expect(ca.offered).toEqual([]);
    expect(names(ca.restricted)).toEqual(["Coinbase"]);
    expect(names(ca.notOffered)).toEqual(["Kalshi", "Kraken"]);
    expect(venuesForRegion("other")).toEqual({ offered: [], restricted: [], notOffered: [] });
    expect(PERP_VENUES).toHaveLength(3);
  });
  it.each([null, undefined, "", "US", "invalid", 123, {}, ["us"]])("fails closed for unselected or invalid region %s", (region) => {
    expect(venuesForRegion(region)).toEqual({ offered: [], restricted: [], notOffered: [] });
  });
  it("marks review overdue only after 120 days and refuses an invalid date as fresh", () => {
    expect(DIRECTORY_CHECKED_AT).toBe("2026-10-12");
    expect(REVIEW_AFTER_DAYS).toBe(120);
    const checked = Date.parse(`${DIRECTORY_CHECKED_AT}T00:00:00Z`);
    expect(directoryNeedsReview(new Date(checked - 1))).toBe(false);
    expect(directoryNeedsReview(new Date(checked))).toBe(false);
    expect(directoryNeedsReview(new Date(checked + 120 * 86_400_000))).toBe(false);
    expect(directoryNeedsReview(new Date(checked + 120 * 86_400_000 + 1))).toBe(true);
    expect(directoryNeedsReview(new Date(""))).toBe(true);
  });
  it("uses only clean HTTPS official and evidence links", () => {
    for (const venue of PERP_VENUES) {
      for (const href of [venue.url, ...venue.sources.map((source) => source.url)]) {
        const url = new URL(href);
        expect(url.protocol).toBe("https:");
        expect(url.search).toBe("");
        expect(url.hash).toBe("");
        expect(url.username + url.password).toBe("");
        expect(href.toLowerCase()).not.toMatch(/ref|utm|affiliate/);
      }
    }
  });
});

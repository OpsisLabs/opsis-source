import { afterEach, expect, it, vi } from "vitest";
import { TOUR_COOKIE, tourWasSeen } from "./tour-cookie";
afterEach(() => vi.unstubAllGlobals());
it("reads the old tour cookie and gives the new cookie precedence", () => {
  vi.stubGlobal("document", { cookie: "chainscout_product_tour_seen_v1=1" });
  expect(tourWasSeen()).toBe(true);
  vi.stubGlobal("document", { cookie: `chainscout_product_tour_seen_v1=1; ${TOUR_COOKIE}=0` });
  expect(tourWasSeen()).toBe(false);
  vi.stubGlobal("document", { cookie: `chainscout_product_tour_seen_v1=0; ${TOUR_COOKIE}=1` });
  expect(tourWasSeen()).toBe(true);
  vi.stubGlobal("document", { cookie: "" });
  expect(tourWasSeen()).toBe(false);
});

import { afterEach, expect, it, vi } from "vitest";
import { TOUR_COOKIE, tourWasSeen } from "./tour-cookie";
afterEach(() => vi.unstubAllGlobals());
it("reads only the Opsis tour cookie", () => {
  vi.stubGlobal("document", { cookie: `other=1; ${TOUR_COOKIE}=1` });
  expect(tourWasSeen()).toBe(true);
  vi.stubGlobal("document", { cookie: `${TOUR_COOKIE}=0` });
  expect(tourWasSeen()).toBe(false);
  vi.stubGlobal("document", { cookie: "" });
  expect(tourWasSeen()).toBe(false);
});

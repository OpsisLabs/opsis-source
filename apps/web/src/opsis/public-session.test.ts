import { afterEach, expect, it } from "vitest";
import { clearPublicSession, publicSession } from "./public-session";
afterEach(clearPublicSession);
it("retains only the public forms in tab memory and clears them on lock", () => {
  const address = `0x${"a".repeat(40)}`;
  publicSession.research.entity = address;
  publicSession.research.task = "risk";
  publicSession.check.token = address;
  publicSession.check.amount = "1.5";
  expect(publicSession.research.entity).toBe(address);
  expect(publicSession.check.amount).toBe("1.5");
  expect(Object.keys(publicSession)).toEqual(["research", "check"]);
  clearPublicSession();
  expect(publicSession.research.entity).toBe("");
  expect(publicSession.research.result).toBeNull();
  expect(publicSession.check.token).toBe("");
  expect(publicSession.check.amount).toBe("");
  expect(publicSession.check.result).toBeNull();
});

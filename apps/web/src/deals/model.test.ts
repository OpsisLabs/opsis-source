import { expect, it } from "vitest";
import { shoppingLinks } from "./model";
const brief = { name: "Charizard", set: "Base Set", number: "4/102", printing: "Unlimited", condition: "Mint", grader: "PSA", grade: "9" };
it("keeps exact identity in encoded searches and distinguishes sold listings", () => {
  const links = shoppingLinks(brief);
  expect(new URL(links.listings).searchParams.get("_nkw")).toBe("Charizard Base Set 4/102 Unlimited Mint PSA 9");
  expect(new URL(links.listings).searchParams.has("LH_Sold")).toBe(false);
  expect(new URL(links.completed).searchParams.get("LH_Sold")).toBe("1");
});
it("cannot inject a destination or query option", () => {
  const url = new URL(shoppingLinks({ ...brief, name: "x&redirect=https://evil.example" }).listings);
  expect(url.hostname).toBe("www.ebay.com"); expect(url.searchParams.has("redirect")).toBe(false);
});
it("requires identity", () => expect(() => shoppingLinks({ ...brief, number: "" })).toThrow());

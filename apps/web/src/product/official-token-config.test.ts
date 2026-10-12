import { describe, expect, it } from "vitest";
import configuration from "./official-token.json";
import { resolveOfficialToken } from "./official-token-config";

// Synthetic identity used only in tests; it is not a Opsis contract.
const published = { status: "published", address: "0x1111111111111111111111111111111111111111", network: "Test network", chainId: 31337 };

describe("official token identity", () => {
  it("keeps the committed configuration valid", () => {
    expect(resolveOfficialToken(configuration).status).not.toBe("unavailable");
  });
  it("has no copyable identity before launch", () => {
    expect(resolveOfficialToken({ status: "not-launched", address: null, network: null, chainId: null })).toEqual({ status: "not-launched" });
  });
  it("returns exactly the reviewed address and network", () => {
    expect(resolveOfficialToken(published)).toEqual(published);
  });
  it.each([
    null, [], {}, { ...published, status: "not-launched" }, { ...published, address: null },
    { ...published, address: "0x123" }, { ...published, address: " 0x1111111111111111111111111111111111111111" },
    { ...published, address: "0x0000000000000000000000000000000000000000" },
    { ...published, address: "0x000000000000000000000000000000000000dEaD" },
    { ...published, address: "0x52908400098527886E0F7030069857D2E4169Ee7" },
    { ...published, network: "" }, { ...published, network: " Test network" },
    { ...published, network: "Test\u202enetwork" }, { ...published, network: "<script>" },
    { ...published, chainId: 0 }, { ...published, chainId: 1.5 }, { ...published, chainId: "4663" },
  ])("fails closed for invalid or contradictory configuration %#", (value) => {
    expect(resolveOfficialToken(value)).toEqual({ status: "unavailable" });
  });
});

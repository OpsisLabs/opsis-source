import { afterEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import {
  copyableContract,
  copyContract,
  parsePublicContract,
  publicContract,
  publishedContract,
} from "./public-contract";

// Synthetic identity for validation and clipboard tests; no deployed contract.
const fixture = {
  address: `0x${"1".repeat(40)}`,
  chain: "Robinhood Chain · 4663",
};
const empty = { address: "", chain: "" };
afterEach(() => vi.unstubAllEnvs());

describe("public contract field", () => {
  it("shows the published Opsis contract and cannot copy a placeholder", async () => {
    expect(publicContract).toEqual(publishedContract);
    expect(publishedContract.address).toBe(getAddress(publishedContract.address));
    expect(copyableContract(publicContract)).toBe(true);
    const writeText = vi.fn();
    for (const contract of [
      empty,
      { ...fixture, address: "—" },
      { ...fixture, address: `0x${"0".repeat(40)}` },
      { ...fixture, chain: " " },
    ]) {
      expect(copyableContract(contract)).toBe(false);
      expect(await copyContract(contract, { writeText })).toBe(false);
    }
    expect(writeText).not.toHaveBeenCalled();
  });

  it("accepts only the explicit Robinhood Chain identities", () => {
    for (const chain of [
      "4663",
      "Robinhood Chain 4663",
      "Robinhood Chain · 4663",
    ])
      expect(parsePublicContract(fixture.address, chain)).toEqual(fixture);
  });

  it("preserves an exact valid checksum and rejects a corrupted checksum", () => {
    const address = getAddress(`0x${"1234abcd".repeat(5)}`);
    expect(address).toMatch(/[A-F]/);
    expect(parsePublicContract(address, "4663").address).toBe(address);
    const index = address.search(/[A-F]/);
    const invalid =
      address.slice(0, index) +
      address[index].toLowerCase() +
      address.slice(index + 1);
    expect(parsePublicContract(invalid, "4663")).toEqual(empty);
  });

  it.each([
    [undefined, undefined],
    [fixture.address, undefined],
    [undefined, "4663"],
    ["", "4663"],
    [fixture.address, ""],
    [null, "4663"],
    [4663, "4663"],
    ["0x123", "4663"],
    [`0X${"1".repeat(40)}`, "4663"],
    [`0x${"g".repeat(40)}`, "4663"],
    [`0x${"0".repeat(40)}`, "4663"],
    [` ${fixture.address}`, "4663"],
    [`${fixture.address}\n`, "4663"],
    [fixture.address, "1"],
    [fixture.address, "Example chain · test fixture"],
    [fixture.address, "4663\n"],
    [fixture.address, " 4663"],
    [fixture.address, "toString"],
    [fixture.address, "__proto__"],
  ])(
    "fails closed for malformed or incomplete build settings (%s, %s)",
    (address, chain) => {
      expect(parsePublicContract(address, chain)).toEqual(empty);
    },
  );

  it("reads the public build settings and fails the whole pair closed", async () => {
    vi.stubEnv("VITE_PUBLIC_CONTRACT_ADDRESS", fixture.address);
    vi.stubEnv("VITE_PUBLIC_CONTRACT_CHAIN", "4663");
    vi.resetModules();
    expect((await import("./public-contract")).publicContract).toEqual(fixture);
    vi.stubEnv("VITE_PUBLIC_CONTRACT_CHAIN", "unsupported");
    vi.resetModules();
    expect((await import("./public-contract")).publicContract).toEqual(empty);
  });

  it("copies the exact checksummed address, never an abbreviated value or chain", async () => {
    const address = getAddress(`0x${"1234abcd".repeat(5)}`);
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await copyContract({ ...fixture, address }, { writeText })).toBe(
      true,
    );
    expect(writeText).toHaveBeenCalledExactlyOnceWith(address);
  });

  it("reports clipboard rejection and unsupported contexts without throwing", async () => {
    expect(await copyContract(fixture, undefined)).toBe(false);
    expect(
      await copyContract(fixture, {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      }),
    ).toBe(false);
  });
});

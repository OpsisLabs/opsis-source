import { describe, expect, it } from "vitest";
import { identifyEntity } from "../src/entities/identify.js";
import { classifyAddressResponse } from "../src/chain/resolver.js";

describe("identifyEntity", () => {
  it("detects transaction hashes", () => {
    expect(identifyEntity(`0x${"a".repeat(64)}`).type).toBe("transaction");
  });

  it("detects EVM addresses", () => {
    expect(identifyEntity(`0x${"b".repeat(40)}`).type).toBe("wallet");
  });

  it("marks unknown strings as unknown", () => {
    expect(identifyEntity("not-an-address").type).toBe("unknown");
  });
});

describe("provider-backed address classification", () => {
  it("distinguishes tokens, contracts, and wallets", () => {
    expect(classifyAddressResponse({ token: { symbol: "TEST" }, is_contract: true })).toBe("token");
    expect(classifyAddressResponse({ token: null, is_contract: true })).toBe("contract");
    expect(classifyAddressResponse({ token: null, is_contract: false })).toBe("wallet");
  });
});

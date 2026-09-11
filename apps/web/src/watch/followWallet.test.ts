import { describe, expect, it } from "vitest";
import {
  DEAD_ADDRESS,
  FOLLOW_PARTICIPANT_LIMIT,
  WATCH_SUPPORTED_CHAIN_IDS,
  ZERO_ADDRESS,
  classificationFromAddressObject,
  collectTransactionParticipants,
  isFollowableWallet,
  normalizePublicAddress,
  toFollowableWallet,
} from "./followWallet";

const WALLET = "0x9c34Fb7b54f05eba5D28Af3fF18f8dD9D66f7292";
const OTHER = "0x1111111111111111111111111111111111111111";
const CONTRACT = `0x${"c".repeat(40)}`;
const CHAIN = WATCH_SUPPORTED_CHAIN_IDS[0];
const TX_HASH = `0x${"a".repeat(64)}`;

describe("chain-aware follow contract", () => {
  it("follows a verified wallet on a supported chain", () => {
    expect(
      toFollowableWallet({ address: WALLET, chainId: CHAIN, classification: "wallet" }),
    ).toEqual({ address: WALLET, chainId: CHAIN, classification: "wallet" });
    expect(isFollowableWallet({ address: WALLET, chainId: CHAIN, classification: "wallet" })).toBe(true);
  });

  it("keeps an unknown classification as an honest public address", () => {
    const target = toFollowableWallet({ address: WALLET, chainId: CHAIN });
    expect(target?.classification).toBe("unknown");
  });

  it("never follows a classified contract, the zero address or the dead address", () => {
    expect(toFollowableWallet({ address: WALLET, chainId: CHAIN, classification: "contract" })).toBeNull();
    expect(toFollowableWallet({ address: ZERO_ADDRESS, chainId: CHAIN })).toBeNull();
    expect(toFollowableWallet({ address: DEAD_ADDRESS, chainId: CHAIN })).toBeNull();
  });

  it("fails closed on an unsupported chain", () => {
    expect(toFollowableWallet({ address: WALLET, chainId: 1 })).toBeNull();
    expect(toFollowableWallet({ address: WALLET, chainId: 0 })).toBeNull();
  });

  it("rejects malformed values instead of guessing a wallet", () => {
    for (const value of ["", "0x1234", TX_HASH, "not-an-address", null, undefined, 42]) {
      expect(normalizePublicAddress(value), String(value)).toBeNull();
      expect(toFollowableWallet({ address: value, chainId: CHAIN })).toBeNull();
    }
  });

  it("trims and preserves the address the user was shown", () => {
    expect(normalizePublicAddress(`  ${WALLET}  `)).toBe(WALLET);
  });
});

describe("transaction participants", () => {
  it("collects top-level, transfer and internal addresses once", () => {
    const participants = collectTransactionParticipants(
      {
        from: WALLET,
        to: { hash: OTHER },
        tokenTransfers: [
          { from: WALLET, to: OTHER },
          { from: OTHER, to: WALLET },
        ],
        internalTransactions: [{ from: OTHER, to: WALLET }],
      },
      { chainId: CHAIN },
    );
    expect(participants.map((row) => row.address)).toEqual([WALLET, OTHER]);
    expect(participants.every((row) => row.classification === "unknown")).toBe(true);
  });

  it("drops zero, dead, malformed and contract participants", () => {
    const participants = collectTransactionParticipants(
      {
        from: ZERO_ADDRESS,
        to: DEAD_ADDRESS,
        tokenTransfers: [{ from: "0x1234", to: WALLET }],
      },
      { chainId: CHAIN },
    );
    expect(participants.map((row) => row.address)).toEqual([WALLET]);
  });

  it("honors an explicit is_contract classification instead of dropping it", () => {
    const eoa = `0x${"e".repeat(40)}`;
    expect(classificationFromAddressObject({ is_contract: true })).toBe("contract");
    expect(classificationFromAddressObject({ is_contract: false })).toBe("wallet");
    expect(classificationFromAddressObject("0xabc")).toBeUndefined();
    const participants = collectTransactionParticipants(
      {
        internalTransactions: [
          {
            from: { hash: CONTRACT, is_contract: true },
            to: { hash: eoa, is_contract: false },
          },
        ],
      },
      { chainId: CHAIN },
    );
    expect(participants.map((row) => row.address)).toEqual([eoa]);
    expect(participants[0]?.classification).toBe("wallet");
  });

  it("lets a known contract win when the bare string was observed first", () => {
    const participants = collectTransactionParticipants(
      {
        from: CONTRACT,
        internalTransactions: [
          { from: { hash: CONTRACT, is_contract: true }, to: { hash: WALLET } },
        ],
      },
      { chainId: CHAIN },
    );
    expect(participants.map((row) => row.address)).toEqual([WALLET]);
  });

  it("lets a known contract win when the contract object is observed first", () => {
    const participants = collectTransactionParticipants(
      {
        from: { hash: CONTRACT, is_contract: true },
        // The bare string reappears later and must not re-introduce the contract.
        tokenTransfers: [{ from: CONTRACT, to: WALLET }],
      },
      { chainId: CHAIN },
    );
    expect(participants.map((row) => row.address)).toEqual([WALLET]);
  });

  it("records both sides once when an address appears as from and to", () => {
    const participants = collectTransactionParticipants(
      { tokenTransfers: [{ from: WALLET, to: WALLET }] },
      { chainId: CHAIN },
    );
    expect(participants).toEqual([
      {
        address: WALLET,
        chainId: CHAIN,
        classification: "unknown",
        sides: ["from", "to"],
      },
    ]);
  });

  it("exports a bounded participant limit for the panel", () => {
    expect(FOLLOW_PARTICIPANT_LIMIT).toBeGreaterThan(0);
  });

  it("returns nothing without facts or on an unsupported chain", () => {
    expect(collectTransactionParticipants(undefined, { chainId: CHAIN })).toEqual([]);
    expect(
      collectTransactionParticipants({ from: WALLET }, { chainId: 1 }),
    ).toEqual([]);
  });
});

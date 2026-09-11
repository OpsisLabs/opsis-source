import { describe, expect, it } from "vitest";
import {
  canFollow,
  explorerAddressUrl,
  explorerTxUrl,
  followHref,
  formatTimestamp,
  senderTypeKey,
  shortAddress,
  tradeSideKey,
} from "./model";

const EOA = `0x${"aa".repeat(20)}`;
const ZERO = `0x${"00".repeat(20)}`;
const DEAD = `0x${"00".repeat(18)}dead`;

describe("biggest trades follow handoff", () => {
  it("links only a valid public address through the plain watch handoff", () => {
    expect(followHref(EOA)).toBe(`/watch?address=${EOA.toLowerCase()}`);
    expect(followHref(ZERO)).toBeNull();
    expect(followHref(DEAD)).toBeNull();
    expect(followHref("0x123")).toBeNull();
    expect(followHref(null)).toBeNull();
  });

  it("never offers follow for contracts, unknown senders, or excluded addresses", () => {
    expect(
      canFollow({ transactionSender: EOA, transactionSenderType: "eoa" }),
    ).toBe(true);
    expect(
      canFollow({ transactionSender: EOA, transactionSenderType: "contract" }),
    ).toBe(false);
    expect(
      canFollow({ transactionSender: null, transactionSenderType: "unknown" }),
    ).toBe(false);
    expect(
      canFollow({ transactionSender: ZERO, transactionSenderType: "eoa" }),
    ).toBe(false);
  });

  it("keeps explorer links and labels deterministic", () => {
    expect(explorerTxUrl(`0x${"11".repeat(32)}`)).toBe(
      `https://robinhoodchain.blockscout.com/tx/0x${"11".repeat(32)}`,
    );
    expect(explorerTxUrl("0x11")).toBeNull();
    expect(explorerAddressUrl(EOA)).toBe(
      `https://robinhoodchain.blockscout.com/address/${EOA.toLowerCase()}`,
    );
    expect(shortAddress(EOA)).toBe("0xaaaaaa…aaaa");
    expect(shortAddress(null)).toBe("");
    expect(formatTimestamp("2026-09-11T00:00:00.000Z")).toBe(
      "2026-09-11T00:00:00.000Z",
    );
    expect(formatTimestamp("nonsense")).toBe("");
    expect(tradeSideKey("buy")).toBe("trades.side.buy");
    expect(senderTypeKey("contract")).toBe("trades.sender.contract");
  });
});

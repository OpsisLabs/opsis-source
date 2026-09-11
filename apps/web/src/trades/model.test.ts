import { describe, expect, it } from "vitest";
import {
  explorerAddressUrl,
  explorerTxUrl,
  followClassification,
  formatTimestamp,
  senderTypeKey,
  shortAddress,
  tradeSideKey,
} from "./model";

const EOA = `0x${"aa".repeat(20)}`;

describe("biggest trades helpers", () => {
  it("maps only a verified EOA to the shared wallet classification", () => {
    expect(followClassification("eoa")).toBe("wallet");
    expect(followClassification("contract")).toBe("contract");
    expect(followClassification("unknown")).toBe("unknown");
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

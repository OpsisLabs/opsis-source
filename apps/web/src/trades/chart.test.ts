import { describe, expect, it } from "vitest";
import { scatter, swapAmounts } from "./chart";
import type { ObservedTradeObservation } from "./api";

const token = (symbol: string) => ({
  address: `0x${"ab".repeat(20)}`,
  symbol,
  decimals: 18,
  reviewed: true,
});
const row = (
  notionalQuote: string,
  blockTime: string | null,
): ObservedTradeObservation => ({
  id: notionalQuote,
  notionalQuote,
  blockTime,
  side: "sell",
  baseAmount: "1.234567890123456789",
  quoteAmount: notionalQuote,
  baseToken: token("BASE"),
  quoteToken: token("QUOTE"),
  pool: `0x${"cd".repeat(20)}`,
  fee: 100,
  txHash: `0x${"12".repeat(32)}`,
  blockNumber: 100,
  blockHash: `0x${"34".repeat(32)}`,
  logIndex: 1,
  eventSender: null,
  eventRecipient: null,
  transactionSender: null,
  transactionSenderType: "unknown",
  followable: false,
});
const window = {
  fromTime: "2026-09-11T11:45:00Z",
  toTime: "2026-09-11T11:50:00Z",
};

describe("observed swap geometry", () => {
  it("projects real UTC times and quote amounts; log and linear are distinct", () => {
    const rows = [
      row("100", window.fromTime),
      row("1000", "2026-09-11T11:47:30Z"),
      row("10000", window.toTime),
    ];
    const log = scatter(rows, window, "log");
    expect(log.points.map(({ x, y }) => [x, y])).toEqual([
      [0, 1],
      [0.5, 0.5],
      [1, 0],
    ]);
    expect(log.ticks).toEqual([100, 1000, 10000]);
    expect(scatter(rows, window, "linear").points[1].y).toBe(0.9);
    expect(rows[1].notionalQuote).toBe("1000");
  });

  it("omits unknown times and unrepresentable/nonpositive values without inventing a point", () => {
    const rows = [
      row("12", null),
      row("20", "invalid"),
      row("0", window.toTime),
      row("-1", window.toTime),
      row("Infinity", window.toTime),
      row("9".repeat(400), window.toTime),
      row("0.000000000000000001", window.toTime),
    ];
    const result = scatter(rows, window, "log");
    expect(result.omitted).toBe(6);
    expect(result.points).toHaveLength(1);
    expect(Number.isFinite(result.points[0].y)).toBe(true);
    expect(scatter([], window, "log").points).toEqual([]);
  });

  it("centers identical timestamps when capture times are unavailable and expands a flat log scale", () => {
    const result = scatter(
      [row("1", window.toTime)],
      { fromTime: null, toTime: "invalid" },
      "log",
    );
    expect(result.points[0].x).toBe(0.5);
    expect(result.ticks).toEqual([1, 10]);
    expect(result.from).toBe(result.to);
  });

  it("keeps the captured UTC domain for empty or unplottable observations, without fabricating value ticks", () => {
    for (const rows of [[], [row("100", null)]]) {
      const result = scatter(rows, window, "log");
      expect(result.points).toEqual([]);
      expect(result.ticks).toEqual([]);
      expect(result.from).toBe(Date.parse(window.fromTime));
      expect(result.to).toBe(Date.parse(window.toTime));
      expect(result.omitted).toBe(rows.length);
    }
    const unknown = scatter([], { fromTime: null, toTime: "" }, "log");
    expect(Number.isNaN(unknown.from)).toBe(true);
    expect(Number.isNaN(unknown.to)).toBe(true);
  });

  it("retains exact inspection values alongside the geometry and expands the domain for returned events", () => {
    const timestamp = "2026-09-11T11:51:00Z";
    const result = scatter([row("3141.592653", timestamp)], window, "linear");
    expect(result.to).toBe(Date.parse(timestamp));
    expect(result.points[0]).toMatchObject({
      x: 1,
      y: 0,
      time: Date.parse(timestamp),
      value: 3141.592653,
    });
    expect(result.points[0].row.notionalQuote).toBe("3141.592653");
  });

  it("retains exact decimals and actual input/output tokens in both directions", () => {
    const sell = row("3141.592653", window.toTime);
    expect(swapAmounts(sell)).toEqual({
      input: { amount: "1.234567890123456789", token: sell.baseToken },
      output: { amount: "3141.592653", token: sell.quoteToken },
    });
    expect(swapAmounts({ ...sell, side: "buy" })).toEqual({
      input: { amount: "3141.592653", token: sell.quoteToken },
      output: { amount: "1.234567890123456789", token: sell.baseToken },
    });
  });
});

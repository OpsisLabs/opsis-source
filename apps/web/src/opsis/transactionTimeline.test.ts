import { describe, expect, it } from "vitest";
import { transactionReceiptOutcome, transactionTimelineRows } from "./transactionTimeline";

describe("transaction observations", () => {
  it("groups explicit facts into submitted, inclusion and receipt stages", () => {
    const hash = `0x${"a".repeat(64)}`;
    expect(transactionTimelineRows({
      from: `0x${"1".repeat(40)}`, to: `0x${"2".repeat(40)}`, valueEth: "0.25", status: "0x1",
      blockNumber: "0x7b", blockHash: hash, gasUsed: "0x5208",
      tokenTransfers: [{ value: "99" }], internalTransactions: [{ value: "88" }],
    })).toEqual([
      { stage: "submitted", key: "from", value: `0x${"1".repeat(40)}` },
      { stage: "submitted", key: "to", value: `0x${"2".repeat(40)}` },
      { stage: "submitted", key: "value", value: "0.25 ETH" },
      { stage: "inclusion", key: "block", value: "123" },
      { stage: "inclusion", key: "blockHash", value: hash },
      { stage: "receipt", key: "status", value: "success" },
      { stage: "receipt", key: "gas", value: "21000" },
    ]);
  });

  it("rejects malformed quantities and hashes while retaining valid fields", () => {
    expect(transactionTimelineRows({
      from: "0xsender", valueEth: "not a value", value: "0xgg", blockNumber: "0x2z",
      gasUsed: -1, blockHash: "0x123", status: "mystery",
    })).toEqual([{ stage: "receipt", key: "status", value: "unknown" }]);
  });

  it("keeps absent value unknown and does not infer a receipt result", () => {
    expect(transactionTimelineRows({ from: null, to: {}, status: "pending" })).toEqual([
      { stage: "receipt", key: "status", value: "pending" },
    ]);
  });

  it("maps receipt states to locale-neutral codes for the UI to translate", () => {
    expect(["0x1", "0x0", "ok", "error", "pending", "replaced", undefined].map(transactionReceiptOutcome))
      .toEqual(["success", "failed", "success", "failed", "pending", "unknown", "unknown"]);
  });

  it("uses raw wei only when the API has no formatted native value", () => {
    expect(transactionTimelineRows({ value: "0xde0b6b3a7640000", status: null })).toEqual([
      { stage: "submitted", key: "value", value: "1000000000000000000 wei" },
      { stage: "receipt", key: "status", value: "unknown" },
    ]);
  });
});

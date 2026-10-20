import { describe, expect, it } from "vitest";
import { watchFixture } from "./fixture";
import { snapshotCsv, snapshotFilename, snapshotJson } from "./snapshot-export";

const en = (english: string) => english;
const zh = (_english: string, chinese: string) => chinese;
const fixture = () => watchFixture(101, Date.parse("2026-10-20T12:00:00.000Z"));

describe("Watch snapshot exports", () => {
  it("preserves exact amounts as JSON strings and CSV text with source and block identity", () => {
    const snapshot = fixture();
    snapshot.tokens[0] = {
      ...snapshot.tokens[0],
      quantity: "12345678901234567890.123456789012345678901234567890123456",
      rawBalance: "12345678901234567890123456789012345678901234567890123456",
      decimals: 36,
    };
    snapshot.approvals = [{
      transactionHash: snapshot.transactions[1].hash,
      contract: snapshot.tokens[0].contract,
      spender: `0x${"4".repeat(40)}`,
      kind: "erc20", symbol: "TEST", active: true, unlimited: true,
      currentAmount: "115792089237316195423570985008687907853269984665640564039457584007913129639935",
      sourceIds: ["rpc"],
    }];
    const original = structuredClone(snapshot);
    const json = JSON.parse(snapshotJson(snapshot, en));
    expect(json).toMatchObject({
      header: { source: "Opsis Watch", disclaimer: "Not investment advice" },
      wallet: snapshot.address,
      blockNumber: "101", blockHash: snapshot.anchor.blockHash,
      time: snapshot.anchor.timestamp, checkedAt: snapshot.anchor.fetchedAt,
      ethBalance: "0.900000000000000001",
      tokens: [{ symbol: "TEST", contract: snapshot.tokens[0].contract,
        balance: snapshot.tokens[0].quantity, decimals: 36, rawBalance: snapshot.tokens[0].rawBalance }],
      transactions: [{ hash: snapshot.transactions[1].hash, time: snapshot.transactions[1].timestamp, summary: "Approval activity", nativeValueEth: "0.1", movements: [{ quantity: "0.1" }] }, {}],
      approvals: [{ token: "TEST", spender: snapshot.approvals[0].spender, unlimited: true, currentAmount: snapshot.approvals[0].currentAmount }],
      sources: [{ url: snapshot.citations[0].url }],
    });
    const csv = snapshotCsv(snapshot, en);
    expect(csv.startsWith('"Source","Opsis Watch","Not investment advice"\r\n')).toBe(true);
    for (const exact of [snapshot.nativeBalanceEth, snapshot.tokens[0].quantity, snapshot.tokens[0].rawBalance, snapshot.approvals[0].currentAmount, snapshot.anchor.blockHash]) {
      expect(csv).toContain(`"${exact}"`);
    }
    expect(snapshot).toEqual(original);
    expect(json.tokens[0]).not.toHaveProperty("value");
    expect(json).not.toHaveProperty("privacy");
  });

  it("escapes commas, quotes, LF and CRLF while JSON round-trips the displayed token text", () => {
    const snapshot = fixture();
    snapshot.tokens[0].symbol = 'A,"quoted"\nnext\r\nline';
    const csv = snapshotCsv(snapshot, en);
    expect(csv).toContain('"A,""quoted""\nnext\r\nline","0x3333333333333333333333333333333333333333"');
    expect(JSON.parse(snapshotJson(snapshot, en)).tokens[0].symbol).toBe(snapshot.tokens[0].symbol);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it.each(["=1+1", "+1", "-1", "@SUM(1)", "  =1", "\t=1", "\n=1", "\r=1"])("keeps spreadsheet metadata inert: %j", (symbol) => {
    const snapshot = fixture();
    snapshot.tokens[0].symbol = symbol;
    expect(snapshotCsv(snapshot, en)).toContain(`"'${symbol}"`);
    expect(JSON.parse(snapshotJson(snapshot, en)).tokens[0].symbol).toBe(symbol);
  });

  it("retains empty sections and unavailable coverage without inventing assets or values", () => {
    const snapshot = fixture();
    snapshot.tokens = [];
    snapshot.transactions = [];
    snapshot.movements = [];
    snapshot.reconciliation.degradedSources = ["blockscout:transactions"];
    snapshot.reconciliation.truncatedSections = ["tokens"];
    const json = JSON.parse(snapshotJson(snapshot, en));
    expect(json).toMatchObject({ tokens: [], transactions: [], approvals: [], reconciliation: snapshot.reconciliation });
    expect(json.header.coverage).toContain("missing coverage is not an empty history");
    const csv = snapshotCsv(snapshot, en);
    for (const heading of ["Tokens", "Recent transactions", "Approvals", "Observed transfers"]) expect(csv).toContain(`\r\n"${heading}"\r\n`);
    expect(csv).toContain('"Degraded sources","blockscout:transactions"');
    expect(csv).toContain('"Truncated sections","tokens"');
    expect(csv).not.toContain('"TEST"');
  });

  it("matches shown timeline order, unknown times and failed-call visibility", () => {
    const snapshot = fixture();
    const approval = {
      transactionHash: `0x${"e".repeat(64)}`, contract: snapshot.tokens[0].contract,
      spender: snapshot.address, kind: "erc20" as const, symbol: "TEST", active: false,
      unlimited: false, currentAmount: "0", sourceIds: ["rpc"],
    };
    snapshot.approvals = [approval];
    snapshot.transactions[1].status = "failed";
    snapshot.movements[0].quantity = "987654321";
    snapshot.approvals.push({ ...approval, transactionHash: snapshot.transactions[1].hash, currentAmount: "9999999" });
    const json = JSON.parse(snapshotJson(snapshot, en));
    expect(json.transactions.map((tx: { hash: string }) => tx.hash)).toEqual([
      snapshot.transactions[1].hash, snapshot.transactions[0].hash, approval.transactionHash,
    ]);
    expect(json.transactions[0]).toMatchObject({ summary: "Failed transaction", movements: [] });
    expect(json.transactions[2]).toMatchObject({ time: null, timeReason: "Transaction time unknown", blockNumber: null, summary: "Approval activity" });
    expect(json.approvals).toHaveLength(1);
    expect(json.approvals[0]).toMatchObject({ unlimited: false, active: false, currentAmount: "0" });
    const csv = snapshotCsv(snapshot, en);
    expect(csv).toContain("Transaction time unknown");
    expect(csv).not.toContain("987654321");
    expect(csv).not.toContain("9999999");
  });

  it("exports movement-only entries and displays hidden token characters as on screen", () => {
    const snapshot = fixture();
    snapshot.transactions = [];
    snapshot.movements[0].symbol = "T\u200bEST";
    const json = JSON.parse(snapshotJson(snapshot, en));
    expect(json.transactions).toMatchObject([{ summary: "Observed transfer", movements: [{ symbol: "T[U+200B]EST", quantity: "0.1" }] }]);
    expect(snapshotCsv(snapshot, en)).toContain("T[U+200B]EST");
  });

  it("localizes export copy and keeps filenames tied to the checked wallet and block", () => {
    const snapshot = fixture();
    expect(snapshotCsv(snapshot, zh)).toContain('"来源","Opsis Watch","非投资建议"');
    expect(snapshotCsv(snapshot, zh)).toContain('"已观察转账"');
    expect(JSON.parse(snapshotJson(snapshot, zh)).header.disclaimer).toBe("非投资建议");
    expect(JSON.parse(snapshotJson(snapshot, zh)).transactions[0].summary).toBe("已观察转账");
    for (const format of ["csv", "json"] as const) {
      expect(snapshotFilename(snapshot, format)).toBe(`opsis-watch-0x111111-111111-101.${format}`);
    }
  });
});

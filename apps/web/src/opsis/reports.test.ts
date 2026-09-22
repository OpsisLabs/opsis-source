import { expect, it } from "vitest";
import { adaptAnswer } from "../dashboard/adapters";
import { tradeReport, researchReport } from "./reports";
import { fixture, research } from "./test-fixtures";
import type { ExitCheckQuote } from "../exit-check/api";
import type { PrivateAnalysis } from "../private/api";
it("saved quotes retain original expiry, exact amounts, block and unknown impact", () => {
  const quote = fixture() as ExitCheckQuote;
  quote.input.amount = "1.234567890123456789";
  quote.quote!.priceImpactPercent = null;
  const report = tradeReport(quote, "WETH");
  expect(report.answer).toContain(quote.input.amount);
  expect(report.answer).toContain("Price impact: unknown");
  expect(report.answer).not.toContain("unknown%");
  expect(report.bullets.join("\n")).toContain(quote.expiresAt);
  expect(report.bullets.join("\n")).toContain(quote.anchor.blockHash);
  expect(report.bullets.join("\n")).toContain("Gas excluded");
});
it("unsupported quotes remain failures, including the requested output", () => {
  const quote = fixture() as ExitCheckQuote;
  quote.supported = false;
  quote.quote = null;
  quote.output = null;
  quote.reason = "no_v3_pool";
  const report = tradeReport(quote, "USDG");
  expect(report.answer).toContain("USDG · No observed quote (no_v3_pool)");
  expect(report.bullets.join("\n")).toContain("Execution is not proven");
});
it("research reports retain source times and do not make other-chain token handoffs", () => {
  const raw = research();
  const result = {
    ...raw,
    answer: adaptAnswer(raw.answer, { type: "token", id: raw.entity.value }),
  } as PrivateAnalysis;
  result.entity.chainId = 1;
  result.answer.citations[0].url = "https://user:password@example.com/evidence";
  const report = researchReport(result);
  expect(report.opsis).toBeUndefined();
  expect(report.sources[0].url).toBeNull();
  expect(report.sources[0].fetchedAt).toBe(
    result.answer.citations[0].fetchedAt,
  );
});

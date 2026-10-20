import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AnswerCard } from "./ChatPage";
import { adaptAnswer } from "./adapters";
import { detailedWidgets } from "../private/detailedWidgets";
import { translate } from "../i18n/translate";

vi.mock("../i18n", async (importOriginal) => ({
  ...await importOriginal<typeof import("../i18n")>(),
  useI18n: () => ({ t: (key: string) => translate("en", key) }),
}));

const address = `0x${"1".repeat(40)}`;
const other = `0x${"2".repeat(40)}`;
const facts = { symbol: "FIX", decimals: 6, recentTransfers: [
  { from: address, to: other, formattedValue: "1234.56789", tokenSymbol: "FIX" },
] };

describe("shared answer renderer", () => {
  it("retains the older app's default card layout and bar styling", () => {
    const answer = adaptAnswer({ answer: "Sample public evidence.", facts }, { type: "token", id: address });
    const html = renderToStaticMarkup(<AnswerCard ai={answer} onPivot={() => {}} />);
    expect(html).toContain("COPY ADDRESS");
    expect(html).toContain("SHARE");
    expect(html).toContain(`href="https://robinhoodchain.blockscout.com/token/${address}"`);
    expect(html).toContain('aria-label="View 0x1111…1111 on Blockscout"');
    expect(html).toContain("absolute inset-y-0 left-0 bg-[#fa6c34]/10");
    expect(html.indexOf("COPY ADDRESS")).toBeLessThan(html.indexOf("Sample public evidence."));
    expect(html).not.toContain("<details");
  });

  it("keeps precise token units available on the rendered detailed amount", () => {
    const answer = adaptAnswer({ answer: "Sample public evidence.", facts }, { type: "token", id: address });
    const html = renderToStaticMarkup(<AnswerCard ai={{ ...answer, widgets: detailedWidgets(facts, "token") }} onPivot={() => {}} layout="answer-first" />);
    expect(html).toContain("title=\"1,234.56789 FIX\"");
    expect(html).toContain("1,234.56… FIX");
    expect(html).toContain("<details");
    expect(html.indexOf("Sample public evidence.")).toBeLessThan(html.indexOf("COPY ADDRESS"));
  });
});

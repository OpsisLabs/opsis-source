import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SavedCheckComparison, { ComparisonResult } from "./SavedCheckComparison";
import { compareSavedChecks } from "./saved-checks";
import { researchReport } from "./reports";
import { research } from "./test-fixtures";
import type { PrivateAnalysis } from "../private/api";
const language = vi.hoisted(() => ({ chinese: false }));
vi.mock("./copy", () => ({
  useCopy: () => (en: string, zh: string) => (language.chinese ? zh : en),
}));

for (const chinese of [false, true]) {
  it(`renders honest comparison states and accessible evidence in ${chinese ? "Chinese" : "English"}`, () => {
    language.chinese = chinese;
    const a = researchReport(research() as unknown as PrivateAnalysis, true);
    const b = structuredClone(a);
    b.comparison!.observedAt = "2026-09-19T12:00:00.000Z";
    const markup = renderToStaticMarkup(
      <ComparisonResult
        comparison={compareSavedChecks(a.comparison, b.comparison)}
        earlier={a}
        later={b}
      />,
    );
    expect(markup).toContain(
      chinese ? "未知／无法比较" : "Unknown / not comparable",
    );
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('scope="row"');
    expect(markup).toContain("2026-09-18T12:00:00.000Z");
    expect(markup).toContain(
      chinese ? "地址不等于人数" : "Addresses are not people",
    );
    const legacy = { ...a, comparison: undefined };
    expect(
      renderToStaticMarkup(
        <SavedCheckComparison current={legacy} candidates={[]} />,
      ),
    ).toContain(
      chinese ? "没有用于对比的结构化证据" : "no typed comparison evidence",
    );
    expect(
      renderToStaticMarkup(
        <ComparisonResult
          comparison={compareSavedChecks(undefined, b.comparison)}
          earlier={legacy}
          later={b}
        />,
      ),
    ).toContain(
      chinese
        ? "不会从文字中推断数值"
        : "no values are inferred from their text",
    );
    expect(
      renderToStaticMarkup(
        <ComparisonResult
          comparison={{ state: "unavailable", reason: "different_size" }}
          earlier={a}
          later={b}
        />,
      ),
    ).toContain(chinese ? "输入数量不同" : "The entered amounts differ");
  });
}

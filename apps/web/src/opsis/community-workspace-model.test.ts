import { describe, expect, it } from "vitest";
import { deriveChangelog, reviewedChangelogEvidence } from "./community-model";
import {
  changelogDateLabel,
  changelogExcerpt,
  filterChangelog,
} from "./community-workspace-model";

const entries = deriveChangelog(reviewedChangelogEvidence);
describe("community workspace views of reviewed evidence", () => {
  it("formats the real reviewed date without a local timezone shift", () => {
    expect(changelogDateLabel("2026-10-14", "en")).toBe("Oct 14, 2026");
    expect(changelogDateLabel("2026-10-14", "zh-CN")).toBe("2026年10月14日");
  });
  it("filters local entries by topic and localized title or body, without changing their dates or text", () => {
    const research = filterChangelog(entries, "  holders  ", "research", "en");
    expect(research).toHaveLength(1);
    expect(research[0]).toBe(entries[0]);
    expect(filterChangelog(entries, "持有人", "all", "zh-CN")).toContain(
      entries[0],
    );
    expect(filterChangelog(entries, "holders", "watch", "en")).toEqual([]);
    expect(
      filterChangelog(entries, "rc/34-explorer-data/1", "all", "en"),
    ).toHaveLength(2);
    expect(filterChangelog(entries, "", "all", "en")).toEqual(entries);
  });
  it("makes bounded excerpts in either language and leaves concise updates verbatim", () => {
    expect(changelogExcerpt("A short update")).toBe("A short update");
    const en = "A reviewed update ".repeat(20);
    expect(changelogExcerpt(en).length).toBeLessThanOrEqual(161);
    expect(en.startsWith(changelogExcerpt(en).slice(0, -1))).toBe(true);
    const zh = "有日期和来源的更新。".repeat(30);
    expect(changelogExcerpt(zh)).toBe(`${zh.slice(0, 160)}…`);
    expect(
      entries.every((entry) => changelogExcerpt(entry.summary).length <= 161),
    ).toBe(true);
  });
});

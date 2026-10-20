import type { ChangelogEntry } from "./community-model";

export function filterChangelog(
  entries: readonly ChangelogEntry[],
  query: string,
  workspace: string,
  locale: string,
): ChangelogEntry[] {
  const needle = query.trim().toLocaleLowerCase();
  return entries.filter((entry) => {
    const title =
      locale === "zh-CN" ? (entry.titleZh ?? entry.title) : entry.title;
    const summary =
      locale === "zh-CN" ? (entry.summaryZh ?? entry.summary) : entry.summary;
    return (
      (workspace === "all" || entry.workspace === workspace) &&
      `${title} ${summary} ${entry.sourceLabel}`
        .toLocaleLowerCase()
        .includes(needle)
    );
  });
}

/** The full reviewed text remains in a disclosure beside this compact excerpt. */
export function changelogExcerpt(summary: string, max = 160): string {
  if (summary.length <= max) return summary;
  const lastSpace = summary.lastIndexOf(" ", max);
  return `${summary.slice(0, lastSpace > max / 2 ? lastSpace : max).trimEnd()}…`;
}

/** Format the reviewed UTC date, without shifting it to the browser's timezone. */
export function changelogDateLabel(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

import { capturedDate, type Call } from "./model";
import { callPerformance } from "./performance";

export function topicCounts(items: Call[]) {
  const counts = new Map<string, number>();
  for (const call of items)
    for (const token of new Set(call.tokens)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function activityDays(items: Call[], end = capturedDate) {
  const anchor = Date.parse(end + "T00:00:00Z");
  return Array.from({ length: 31 }, (_, i) => {
    const date = new Date(anchor - (30 - i) * 86400000)
      .toISOString()
      .slice(0, 10);
    const posts = items.filter((c) => c.publishedAt.slice(0, 10) === date);
    return {
      date,
      count: posts.length,
      chain: posts.filter((c) => c.chainTopic).length,
    };
  });
}

export function distribution(items: Call[]) {
  const values = items
    .map((c) => callPerformance(c).percent)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const n = values.length;
  return {
    count: n,
    median: n
      ? (values[Math.floor((n - 1) / 2)] + values[Math.floor(n / 2)]) / 2
      : null,
    best: n ? values[n - 1] : null,
    worst: n ? values[0] : null,
  };
}

export function sourceLabel(call: Call) {
  return call.sourceTextStatus === "post-text" ||
    call.sourceTextStatus === "reviewed-post"
    ? "Reviewed post"
    : "Partial text";
}

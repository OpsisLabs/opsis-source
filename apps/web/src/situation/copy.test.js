import { expect, it } from "vitest";
import { situationText } from "./copy.js";
import brief from "./eth-market-brief.json";
import news from "./news.json";
import { formatDuration, formatUtcRange } from "./eth-market-brief.js";

it("translates captured Opsis explanations and annotations without changing the capture", () => {
  const before = JSON.stringify({ brief, news });
  const texts = [
    ...brief.newsContext.flatMap((source) => [
      source.title,
      source.summary,
      source.whyItMatters,
    ]),
    ...news.events.flatMap((event) => [
      event.category,
      event.insight,
      event.watch,
      event.timeBasis,
      event.locationBasis,
      event.photoNote,
    ]),
    "All",
    "Policy",
    "Markets",
    "Macro",
    "Context",
    "Price action",
    "Watch next",
    "The globe is unavailable. News and chart controls remain accessible.",
  ];
  for (const text of texts) {
    expect(situationText(text, "zh-CN"), text).toMatch(/[\u3400-\u9fff]/);
    expect(situationText(text, "en")).toBe(text);
  }
  for (const event of news.events) {
    expect(situationText(event.title, "zh-CN")).toBe(event.title);
    expect(situationText(event.source, "zh-CN")).toBe(event.source);
    expect(situationText(event.sourceExcerpt, "zh-CN")).toBe(
      event.sourceExcerpt,
    );
  }
  expect(situationText("Unknown source wording", "zh-CN")).toBe(
    "Unknown source wording",
  );
  expect(situationText("toString", "zh-CN")).toBe("toString");
  expect(JSON.stringify({ brief, news })).toBe(before);
});
it("formats snapshot ages and date ranges in the selected language", () => {
  expect(formatDuration(0.5, "zh-CN")).toBe("<1分钟");
  expect(formatDuration(25, "zh-CN")).toBe("25分钟");
  expect(formatDuration(65, "zh-CN")).toBe("1小时 5分钟");
  expect(formatDuration(65)).toBe("1h 5m");
  expect(formatUtcRange(0, 3600000, "zh-CN")).toBe(
    "1970-01-01 00:00 UTC 至 1970-01-01 01:00 UTC",
  );
  expect(formatUtcRange(NaN, 0, "zh-CN")).toBe("");
});

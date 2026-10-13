import { describe, expect, it } from "vitest";
import {
  createSuggestionDraft,
  deriveChangelog,
  reviewedChangelogEvidence,
  suggestionMarkdown,
  suggestionExport,
  validateSuggestion,
} from "./community-model";

const fields = {
  whatWereYouTrying: "Compare two saved wallet checks",
  whatStoppedYou: "The missing activity state was hard to understand",
  contact: "support@opsis.example",
  creditName: "Reader",
  creditOptIn: true,
};

describe("community local suggestion", () => {
  it("validates the two required prompts and optional contact", () => {
    expect(validateSuggestion({ ...fields, whatWereYouTrying: "short" })).toContain("trying");
    expect(validateSuggestion({ ...fields, contact: "not-an-email" })).toContain("valid email");
    expect(validateSuggestion(fields)).toBeNull();
  });

  it("creates a bounded export shape and preserves its creation time", () => {
    const first = createSuggestionDraft(fields, new Date("2026-09-22T12:00:00Z"));
    expect(suggestionExport(first)).toContain('"version": 1');
    expect(suggestionMarkdown(first)).toContain("This is a local draft");
    expect(first.createdAt).toBe("2026-09-22T12:00:00.000Z");
  });
});

describe("evidence-derived changelog", () => {
  it("includes only shipped records with observation, verification and source evidence", () => {
    const entries = deriveChangelog([
      { id: "verified", releaseId: "r1", title: "Shipped", summary: "A", workspace: "research", status: "shipped", observedAt: "2026-09-20T00:00:00Z", verifiedAt: "2026-09-21T00:00:00Z", sourceLabel: "Release evidence", sourceUrl: null },
      { id: "draft", releaseId: "r2", title: "In progress", summary: "B", workspace: "watch", status: "in-progress", observedAt: "2026-09-22T00:00:00Z", verifiedAt: "2026-09-23T00:00:00Z", sourceLabel: "Release evidence", sourceUrl: null },
      { id: "missing", releaseId: "r3", title: "No proof", summary: "C", workspace: "lab", status: "shipped", observedAt: "2026-09-20T00:00:00Z", verifiedAt: null, sourceLabel: "", sourceUrl: null },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.date).toBe("2026-09-21");
  });
  it("publishes only verified, bilingual release entries without forbidden claims", () => {
    const entries = deriveChangelog(reviewedChangelogEvidence);
    expect(entries).toHaveLength(6);
    expect(entries).toHaveLength(reviewedChangelogEvidence.length);
    expect(entries.map((entry) => entry.id)).toEqual([
      "rc-29-perp-tools", "rc-25-biggest-trades-1", "rc-26-research",
      "rc-26-trade-check", "rc-26-watch", "rc-26-quant-lab",
    ]);
    expect(entries[0]).toMatchObject({
      releaseId: "29-perp-handoff", workspace: "check", date: "2026-10-12",
      observedAt: "2026-10-12T23:21:19Z", verifiedAt: "2026-10-12T23:40:00Z",
      sourceLabel: "Release 29 · rc/29-perp-handoff/1", sourceUrl: null,
      title: "Perp cost scenario: funding, liquidation estimate and venue directory",
      summary: "Model hypothetical perp holding cost, funding over a holding period and an estimated liquidation price from your own numbers, and compare assumption sets. A dated directory lists venues by the region you state, with conditions, sources and a review date. Opsis has no perp trading; the venue's own figure governs.",
    });
    expect(entries.every((entry, index) => index === 0 ||
      Date.parse(entries[index - 1].verifiedAt!) >= Date.parse(entry.verifiedAt!))).toBe(true);
    for (const entry of reviewedChangelogEvidence) {
      expect(entry.status).toBe("shipped");
      expect(Date.parse(entry.verifiedAt ?? "")).toBeGreaterThanOrEqual(Date.parse(entry.observedAt));
      expect(entry.titleZh && entry.summaryZh).toBeTruthy();
      expect(`${entry.title} ${entry.summary}`).not.toMatch(/\b(safe|unsafe|guaranteed|will|free|real-time|best|recommended|risk-free)\b/i);
    }
  });
});

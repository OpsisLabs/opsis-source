import { describe, expect, it } from "vitest";
import {
  createSuggestionDraft,
  deriveChangelog,
  suggestionMarkdown,
  suggestionExport,
  validateSuggestion,
} from "./community-model";

const fields = {
  whatWereYouTrying: "Compare two saved wallet checks",
  whatStoppedYou: "The missing activity state was hard to understand",
  contact: "reader@example.com",
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
});

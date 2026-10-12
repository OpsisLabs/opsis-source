import { describe, expect, it } from "vitest";
import { normalizeSavedIdentifiers } from "./compatibility";

describe("saved schema identifier compatibility", () => {
  it.each([
    ["chainscout_reviewed_reference", "opsis_reviewed_reference"],
    ["chainscout_reviewed_static_match", "opsis_reviewed_static_match"],
    ["chainscout_reviewed_launch_registry", "opsis_reviewed_launch_registry"],
    ["chainscout_reviewed_registry", "opsis_reviewed_registry"],
    ["chainscout_static_review", "opsis_static_review"],
    ["chainscout_supported", "opsis_supported"],
    ["chainscout_derived_normalization", "opsis_derived_normalization"],
    ["chainscout-reviewed-reference", "opsis-reviewed-reference"],
    ["chainscout-derived-normalization", "opsis-derived-normalization"],
  ])("normalizes %s without rewriting private text", (old, current) => {
    const input = { source: old, notes: old, nested: [{ provenance: { redistributionClass: old } }] };
    expect(normalizeSavedIdentifiers(input)).toEqual({
      source: current, notes: old, nested: [{ provenance: { redistributionClass: current } }],
    });
    expect(input.source).toBe(old);
    expect(normalizeSavedIdentifiers({ source: current })).toEqual({ source: current });
  });

  it("normalizes old fields recursively and preserves canonical fields", () => {
    const current = { opsisSourceRevision: null, rights: { opsisAuthored: ["schema"] }, opsisSummary: "private summary" };
    expect(normalizeSavedIdentifiers({
      chainscoutSourceRevision: null, rights: { chainscoutAuthored: ["schema"] }, chainScoutSummary: "private summary",
    })).toEqual(current);
    expect(normalizeSavedIdentifiers(current)).toEqual(current);
  });

  it("rejects ambiguous mixed field names", () => {
    expect(() => normalizeSavedIdentifiers({ chainscoutAuthored: ["old"], opsisAuthored: ["new"] })).toThrow("Ambiguous");
  });
});

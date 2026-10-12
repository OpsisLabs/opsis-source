/** Normalize only schema identifiers after decryption or on receipt. Never
 * rewrite ciphertext, authenticated backup metadata, private prose or URLs. */
const LEGACY_FIELDS: Record<string, string> = {
  chainscoutAuthored: "opsisAuthored",
  chainscoutSourceRevision: "opsisSourceRevision",
  chainScoutSummary: "opsisSummary",
};
const LEGACY_VALUES: Record<string, string> = {
  chainscout_reviewed_reference: "opsis_reviewed_reference",
  chainscout_reviewed_static_match: "opsis_reviewed_static_match",
  chainscout_reviewed_launch_registry: "opsis_reviewed_launch_registry",
  chainscout_reviewed_registry: "opsis_reviewed_registry",
  chainscout_static_review: "opsis_static_review",
  chainscout_supported: "opsis_supported",
  chainscout_derived_normalization: "opsis_derived_normalization",
  "chainscout-reviewed-reference": "opsis-reviewed-reference",
  "chainscout-derived-normalization": "opsis-derived-normalization",
};
const PROVENANCE_FIELDS = new Set([
  "source", "derivation", "redistributionClass", "registryStatus",
  "identityConfidence", "completeFor", "dataClass",
]);

export function normalizeSavedIdentifiers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeSavedIdentifiers);
  if (!value || typeof value !== "object") return value;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(input)) {
    const target = Object.hasOwn(LEGACY_FIELDS, key) ? LEGACY_FIELDS[key]! : key;
    if (target !== key && Object.hasOwn(input, target)) {
      throw new Error("Ambiguous compatibility fields");
    }
    const normalized = PROVENANCE_FIELDS.has(target) && typeof item === "string" && Object.hasOwn(LEGACY_VALUES, item)
      ? LEGACY_VALUES[item] : normalizeSavedIdentifiers(item);
    Object.defineProperty(output, target, { value: normalized, enumerable: true, writable: true, configurable: true });
  }
  return output;
}

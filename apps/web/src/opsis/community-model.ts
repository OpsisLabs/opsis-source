export const COMMUNITY_DRAFT_VERSION = 1 as const;

export type SuggestionDraft = {
  version: typeof COMMUNITY_DRAFT_VERSION;
  whatWereYouTrying: string;
  whatStoppedYou: string;
  contact: string;
  creditName: string;
  creditOptIn: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SuggestionFields = Pick<
  SuggestionDraft,
  "whatWereYouTrying" | "whatStoppedYou" | "contact" | "creditName" | "creditOptIn"
>;

export type ChangelogEvidence = {
  id: string;
  releaseId: string;
  title: string;
  summary: string;
  workspace: "research" | "check" | "watch" | "lab";
  status: "shipped" | "in-progress" | "blocked";
  observedAt: string;
  verifiedAt: string | null;
  sourceLabel: string;
  sourceUrl: string | null;
};

export type ChangelogEntry = ChangelogEvidence & {
  date: string;
};

const MAX_FIELD = 2_000;

function text(value: unknown, max = MAX_FIELD): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function iso(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

export function emptySuggestionFields(): SuggestionFields {
  return { whatWereYouTrying: "", whatStoppedYou: "", contact: "", creditName: "", creditOptIn: false };
}

export function validateSuggestion(fields: SuggestionFields): string | null {
  if (text(fields.whatWereYouTrying).length < 10) return "Tell us what you were trying to do.";
  if (text(fields.whatStoppedYou).length < 10) return "Tell us what stopped you.";
  if (text(fields.contact).length > 320) return "Contact details are too long.";
  if (text(fields.creditName).length > 160) return "The credit name is too long.";
  if (fields.contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(fields.contact))) {
    return "Use a valid email address or leave contact blank.";
  }
  return null;
}

export function createSuggestionDraft(fields: SuggestionFields, now = new Date()): SuggestionDraft {
  const timestamp = now.toISOString();
  return {
    version: COMMUNITY_DRAFT_VERSION,
    whatWereYouTrying: text(fields.whatWereYouTrying),
    whatStoppedYou: text(fields.whatStoppedYou),
    contact: text(fields.contact, 320),
    creditName: text(fields.creditName, 160),
    creditOptIn: Boolean(fields.creditOptIn),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function saveSuggestionDraft(fields: SuggestionFields, previous: SuggestionDraft | null, now = new Date()): SuggestionDraft {
  const next = createSuggestionDraft(fields, now);
  return previous ? { ...next, createdAt: previous.createdAt } : next;
}

export function suggestionExport(draft: SuggestionDraft): string {
  return JSON.stringify({ ...draft, exportedAt: new Date().toISOString() }, null, 2);
}

export function suggestionMarkdown(draft: SuggestionDraft): string {
  return [
    "# Opsis improvement suggestion",
    "",
    `What I was trying to do\n\n${draft.whatWereYouTrying}`,
    "",
    `What stopped me\n\n${draft.whatStoppedYou}`,
    ...(draft.contact ? ["", `Contact (optional)\n\n${draft.contact}`] : []),
    ...(draft.creditOptIn && draft.creditName ? ["", `Credit name\n\n${draft.creditName}`] : []),
    "",
    "This is a local draft. It has not been posted or sent.",
  ].join("\n");
}

export function deriveChangelog(records: readonly ChangelogEvidence[]): ChangelogEntry[] {
  return records
    .filter((record) => record.status === "shipped" && iso(record.observedAt) && iso(record.verifiedAt) && record.sourceLabel.trim())
    .map((record) => ({ ...record, date: new Date(record.verifiedAt as string).toISOString().slice(0, 10) }))
    .sort((a, b) => Date.parse(b.verifiedAt as string) - Date.parse(a.verifiedAt as string));
}

/** Only reviewed, dated evidence is eligible for public changelog copy. */
// Release 26's D18/D19 entries in docs/releases/26-opsis-workspaces.md are
// explicitly queued preview preparation: they say "No release advance, RC,
// production promotion or remote push." Keep them out until production
// verification exists; a preview deployment is not a shipped changelog item.
export const reviewedChangelogEvidence: readonly ChangelogEvidence[] = [];

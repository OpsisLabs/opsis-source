import source from "./sources.json";
import kaleo from "./assets/kaleo.jpg";
import ansem from "./assets/ansem.jpg";
import pentoshi from "./assets/pentoshi.jpg";

export type KolId = "kaleo" | "ansem" | "pentoshi";
export type Call = (typeof source.posts)[number];
export type Profile = (typeof source.profiles)[number] & { avatar: string };
const avatars: Record<string, string> = { kaleo, ansem, pentoshi };
export const profiles: Profile[] = source.profiles.map((p) => ({
  ...p,
  avatar: avatars[p.id],
}));
export const calls: Call[] = [...source.posts].sort((a, b) =>
  b.date.localeCompare(a.date),
);
export const capturedDate = source.capturedDate;
export const tokens = ["BTC", "ETH", "SOL", "PUMP", "HYPE", "ZEC", "ANSEM"];
export const profileFor = (id: string) => profiles.find((p) => p.id === id)!;
export function filterCalls(
  items: Call[],
  options: {
    profile?: string;
    token?: string;
    query?: string;
    type?: string;
    saved?: string[];
    oldest?: boolean;
  },
) {
  const query = (options.query ?? "").trim().toLowerCase();
  return items
    .filter(
      (c) =>
        (!options.profile || c.profile === options.profile) &&
        (!options.token || c.tokens.includes(options.token)) &&
        (!options.type ||
          (options.type === "targets"
            ? !!c.target
            : c.type === options.type)) &&
        (!options.saved || options.saved.includes(c.id)) &&
        (!query ||
          [
            profileFor(c.profile).name,
            profileFor(c.profile).handle,
            c.summary,
            c.type,
            ...c.tokens,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query)),
    )
    .sort((a, b) =>
      options.oldest
        ? a.date.localeCompare(b.date)
        : b.date.localeCompare(a.date),
    );
}
export function outcome(c: Call) {
  if (c.type === "Conditional target" || c.type === "Conditional setup")
    return "Conditional";
  if (c.target && c.deadline)
    return c.deadline >= capturedDate ? "Pending" : "Needs review";
  return "Unscored";
}
export function tokenCoverage(token: string) {
  const mentions = calls.filter((c) => c.tokens.includes(token));
  return {
    mentions,
    profiles: profiles.filter((p) => mentions.some((c) => c.profile === p.id)),
  };
}
export function receipt(c: Call) {
  const p = profileFor(c.profile);
  return {
    author: p.name,
    handle: p.handle,
    profile: p.url,
    source: c.url,
    published: c.date,
    tokens: c.tokens,
    summary: c.summary,
    classification: c.type,
    target: c.target,
    deadline: c.deadline,
    outcome: outcome(c),
    marketPerformance: null,
    accuracy: null,
    preparedContext: c.interpretation,
    capturedDate,
    coverage: source.coverage,
  };
}

import source from "./sources.json";
import kaleo from "./assets/kaleo.jpg";
import ansem from "./assets/ansem.jpg";
import pentoshi from "./assets/pentoshi.jpg";

import rover from "./assets/rover.jpg";
import adam from "./assets/adam.jpg";
import kook from "./assets/kook.jpg";
import nick from "./assets/nick.jpg";
import threadguy from "./assets/threadguy.jpg";
import wendy from "./assets/wendy.jpg";
import farmer from "./assets/farmer.jpg";
import ajc from "./assets/ajc.jpg";
import dan from "./assets/dan.jpg";
import clive from "./assets/clive.jpg";
import rekt from "./assets/rekt.jpg";
import five63 from "./assets/563.jpg";

export type KolId = string;
export type Call = (typeof source.posts)[number];
export type Profile = (typeof source.profiles)[number] & { avatar: string };
const avatars: Record<string, string> = {
  kaleo,
  ansem,
  pentoshi,
  rover,
  adam,
  kook,
  nick,
  threadguy,
  wendy,
  farmer,
  ajc,
  dan,
  clive,
  rekt,
  "563": five63,
};
export const profiles: Profile[] = source.profiles.map((p) => ({
  ...p,
  avatar: avatars[p.id],
}));
export const calls: Call[] = [...source.posts].sort((a, b) =>
  b.publishedAt.localeCompare(a.publishedAt),
);
export const capturedDate = source.capturedDate;
export const tokens = [...new Set(calls.flatMap((c) => c.tokens))].sort();
export const coverage = source.coverage;
export type HistoryWindow = "all" | "31" | "90";
export function windowCalls(
  items: Call[],
  window: HistoryWindow,
  chainOnly = false,
) {
  const end = Date.parse(capturedDate + "T23:59:59.999Z");
  const start =
    window === "all" ? -Infinity : end + 1 - Number(window) * 86400000;
  return items.filter(
    (c) =>
      Date.parse(c.publishedAt) >= start &&
      Date.parse(c.publishedAt) <= Math.min(end, Date.parse(source.capturedAt)) &&
      (!chainOnly || c.chainTopic),
  );
}
export function chainCount(id: string, items: Call[] = calls) {
  return items.filter((c) => c.profile === id && c.chainTopic).length;
}
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
        ? a.publishedAt.localeCompare(b.publishedAt)
        : b.publishedAt.localeCompare(a.publishedAt),
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
    published: c.publishedAt,
    chainTopic: c.chainTopic,
    sourceTextStatus: c.sourceTextStatus,
    originalExcerpt: c.quote,
    metadataUrl: c.metadataUrl,
    sourceSha256: c.sourceSha256,
    disclosedAffiliation: c.disclosedAffiliation,
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

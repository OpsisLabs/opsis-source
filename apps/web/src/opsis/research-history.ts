import type { ExplorerAnswerTask } from "../dashboard/types";
import type { PrivateAnalysis } from "../private/api";
import { publicIdentity } from "./model";

export function researchIdentityKey(value: string): string {
  return publicIdentity(value).toLowerCase();
}

type Lookup = {
  entity: string;
  task: ExplorerAnswerTask;
  entityType: "unknown" | "token";
  result: PrivateAnalysis | null;
};

/** A few completed lookups, owned by this mounted Research page; never persisted. */
export class ResearchHistory {
  private readonly results = new Map<string, Lookup>();

  constructor(initial?: Lookup) {
    if (initial) this.remember(initial);
  }

  remember(lookup: Lookup) {
    const key = researchIdentityKey(lookup.entity);
    if (!key || !lookup.result) return;
    this.results.delete(key);
    this.results.set(key, lookup);
    if (this.results.size > 4) this.results.delete(this.results.keys().next().value!);
  }

  find(entity: string): Lookup | undefined {
    return this.results.get(researchIdentityKey(entity));
  }
}

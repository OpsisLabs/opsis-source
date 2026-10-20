import { buildReceiptBatch, fromHex, type Hex } from "@rh-chain/shared";
export { buildReceiptBatch };
export type CalendarCommitment = { root: Hex; accepted: { calendar: string; proof: Uint8Array }[] };
export interface TimestampCalendar {
  submit(rootDigest: Hex): Promise<CalendarCommitment>;
  upgrade(commitment: CalendarCommitment): Promise<CalendarCommitment>;
}
/** No defaults or startup wiring: callers must admit calendars and inject transport. */
export class PublicTimestampCalendar implements TimestampCalendar {
  private readonly calendars: string[];
  constructor(calendars: string[], private readonly fetcher: typeof fetch) {
    this.calendars = [...new Set(calendars)];
    if (this.calendars.length < 2 || this.calendars.some((c) => {
      try { const u = new URL(c); return u.protocol !== "https:" || u.origin !== c || Boolean(u.username || u.password); } catch { return true; }
    })) throw new Error("At least two distinct calendar origins required");
  }
  private async request(calendar: string, root: Hex, submit: boolean): Promise<Uint8Array> {
    const raw = fromHex(root);
    const response = await this.fetcher(`${calendar}/${submit ? "digest" : `timestamp/${root.slice(2)}`}`, {
      method: submit ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/vnd.opentimestamps.v1", ...(submit ? { "Content-Type": "application/octet-stream" } : {}) },
      ...(submit ? { body: new Uint8Array(raw) } : {}),
    });
    if (!response.ok) throw new Error("Calendar unavailable");
    if (response.headers.get("content-type")?.split(";")[0] !== "application/vnd.opentimestamps.v1") throw new Error("Unexpected calendar response");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty calendar proof");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 1_000_000) throw new Error("Calendar proof too large"); chunks.push(value); }
    } finally { await reader.cancel(); }
    if (!size) throw new Error("Empty calendar proof");
    const proof = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { proof.set(chunk, offset); offset += chunk.length; }
    return proof;
  }
  async submit(root: Hex): Promise<CalendarCommitment> {
    fromHex(root);
    const results = await Promise.allSettled(this.calendars.map(async (calendar) => ({ calendar, proof: await this.request(calendar, root, true) })));
    const accepted = results.flatMap((r) => r.status === "fulfilled" ? [r.value] : []);
    if (!accepted.length) throw new Error("No calendar accepted commitment");
    return { root, accepted };
  }
  async upgrade(commitment: CalendarCommitment): Promise<CalendarCommitment> {
    fromHex(commitment.root);
    if (!commitment.accepted.length || commitment.accepted.some((a) => !this.calendars.includes(a.calendar))) throw new Error("Unknown calendar commitment");
    const accepted = await Promise.all(commitment.accepted.map(async (a) => {
      try { return { calendar: a.calendar, proof: await this.request(a.calendar, commitment.root, false) }; }
      catch { return a; }
    }));
    // Opaque bytes never establish a Bitcoin attestation here.
    return { root: commitment.root, accepted };
  }
}

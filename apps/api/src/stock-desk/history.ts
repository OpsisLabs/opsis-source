import type { GapHistory } from "@rh-chain/shared";
/** Release 40 may supply captured gap data after its source admission. */
export interface GapHistorySource {
  history(address: string): Promise<GapHistory>;
}
export class UnavailableGapHistory implements GapHistorySource {
  async history(
    _address: string,
  ): Promise<{ state: "unavailable"; reason: string }> {
    return {
      state: "unavailable",
      reason: "history unavailable in this release",
    };
  }
}

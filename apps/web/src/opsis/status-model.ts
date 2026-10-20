import type { Capabilities, CapabilityId, CapabilityStatus } from "./model";
import { DIRECTORY_CHECKED_AT, directoryNeedsReview } from "./perp-venues";
import { statusDetails } from "./status-copy";

export type Availability =
  "available" | "unavailable" | "not-enabled" | "stale" | "unknown";

/** A configuration flag is not a successful source observation. */
export function capabilityAvailability(
  row: Pick<CapabilityStatus, "id" | "enabled">,
  now = new Date(),
): Availability {
  if (!row.enabled) return "not-enabled";
  if (row.id === "perpHandoff")
    return directoryNeedsReview(now) ? "stale" : "available";
  return "unknown";
}

export function capabilityRows(capabilities: Capabilities): CapabilityStatus[] {
  if (capabilities.manifest) return capabilities.manifest.capabilities;
  const ids: CapabilityId[] = [
    "research",
    "tokenControls",
    "exitCheck",
    "watch",
    "rwa",
    "observedTrades",
    "perpHandoff",
    "swapPreview",
    "savedCheckComparisons",
  ];
  return ids.map((id) => {
    const copy = statusDetails[id];
    return {
      id,
      enabled: capabilities[id] === true,
      scope: copy.scope[0],
      origin: copy.origin[0],
      freshness: copy.freshness[0],
      coverage: copy.coverage[0],
      limits: copy.limits[0],
    };
  });
}

export function capabilityCheckedAt(id: CapabilityId): string | null {
  return id === "perpHandoff" ? DIRECTORY_CHECKED_AT : null;
}

import { resolveKnownAsset } from "../known-assets";
import { publicIdentity } from "../model";

export function searchIdentity(value: string) {
  return publicIdentity(value) || resolveKnownAsset(value)?.address || "";
}

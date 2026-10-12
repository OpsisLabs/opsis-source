export const TOUR_COOKIE = "opsis_product_tour_seen_v1";
const LEGACY_TOUR_COOKIE = "chainscout_product_tour_seen_v1";

export function tourWasSeen(): boolean {
  const entries = document.cookie.split(";").map(entry => entry.trim());
  for (const name of [TOUR_COOKIE, LEGACY_TOUR_COOKIE]) {
    const entry = entries.find(value => value.startsWith(`${name}=`));
    if (entry) return entry === `${name}=1`;
  }
  return false;
}

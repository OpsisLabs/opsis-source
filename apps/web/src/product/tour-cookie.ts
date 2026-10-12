export const TOUR_COOKIE = "opsis_product_tour_seen_v1";

export function tourWasSeen(): boolean {
  return document.cookie.split(";").map(entry => entry.trim()).includes(`${TOUR_COOKIE}=1`);
}

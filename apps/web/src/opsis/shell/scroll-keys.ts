import { useEffect } from "react";

const STEP = 40;

type ScrollRegion = Pick<HTMLElement, "matches" | "scrollWidth" | "clientWidth" | "scrollLeft">;

/**
 * Scroll a focused horizontal scroll region for an arrow, Home or End key. Returns whether the key was used.
 * WebKit focuses these regions but does not scroll them from the keyboard, so every engine gets the same keys.
 */
export function scrollRegionByKey(region: ScrollRegion, key: string): boolean {
  if (!region.matches('[role="region"][tabindex="0"]') || region.scrollWidth <= region.clientWidth) return false;
  const max = region.scrollWidth - region.clientWidth;
  const next = { ArrowLeft: region.scrollLeft - STEP, ArrowRight: region.scrollLeft + STEP, Home: 0, End: max }[key];
  if (next === undefined) return false;
  region.scrollLeft = Math.min(max, Math.max(0, next));
  return true;
}

export function useScrollRegionKeys() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof HTMLElement && scrollRegionByKey(event.target, event.key)) event.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}

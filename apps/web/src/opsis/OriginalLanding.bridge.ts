import { publicIdentity, workspaceLink } from "./model";

const destinations: Record<string, string> = {
  research: "/research",
  check: "/check",
  watch: "/watch",
  rwa: "/rwa",
  quant: "/lab",
  world: "/research/events",
  saved: "/saved",
  guide: "/guide",
  swap: "/swap",
};
export const defaultTools = Object.keys(destinations).filter((tool) => tool !== "swap");

/** Bind only to the current, same-origin film document. No private context crosses. */
export function connectFilm(
  filmDocument: Document,
  currentDocument: () => Document | null | undefined,
  navigate: (path: string) => void,
  enabledTools: readonly string[] = defaultTools,
  onLock?: () => void,
) {
  const enabled = enabledTools.filter((tool) => Object.hasOwn(destinations, tool));
  const receive = (event: Event) => {
    if (event.target !== filmDocument || filmDocument !== currentDocument()) return;
    const data = (event as CustomEvent).detail;
    if (data?.type === "opsis:lock") {
      onLock?.();
      return;
    }
    if (data?.type !== "opsis:open-tool" || typeof data.tool !== "string" ||
        !Object.hasOwn(destinations, data.tool) || !enabled.includes(data.tool)) return;
    const path = destinations[data.tool];
    const entity = typeof data.entity === "string" ? publicIdentity(data.entity) : null;
    navigate(path === "/research" && entity ? workspaceLink("/research", entity) : path);
  };
  const lock = filmDocument.getElementById("lock-preview");
  if (lock) lock.hidden = !onLock;
  filmDocument.addEventListener("opsis:navigate", receive);
  filmDocument.dispatchEvent(new Event("opsis:host-ready"));
  filmDocument.dispatchEvent(new CustomEvent("opsis:capabilities", { detail: { enabled } }));
  return () => filmDocument.removeEventListener("opsis:navigate", receive);
}

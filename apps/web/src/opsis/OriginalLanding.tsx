import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { publicIdentity, workspaceLink } from "./model";

const destinations: Record<string, string> = {
  explorer: "/research",
  research: "/research",
  swap: "/check",
  check: "/check",
  portfolio: "/saved",
  saved: "/saved",
  rwa: "/rwa",
  quant: "/lab",
  world: "/research/events",
  watch: "/watch",
  guide: "/guide",
};

/** Preserve the original film and scroll state without exposing preview credentials.
 * Events are bound to this exact same-origin document, never the host window. */
export default function OriginalLanding({ onLock }: { onLock?: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [visited, setVisited] = useState(location.pathname === "/");
  if (!visited && location.pathname === "/") setVisited(true);
  useEffect(() => () => cleanup.current?.(), []);
  useEffect(() => {
    frame.current?.contentDocument?.dispatchEvent(
      new Event(
        location.pathname === "/" ? "opsis:overview" : "opsis:workspace-open",
      ),
    );
  }, [location.pathname]);
  function connect() {
    cleanup.current?.();
    const document = frame.current?.contentDocument;
    if (!document) return;
    const receive = (event: Event) => {
      if (
        event.target !== document ||
        document !== frame.current?.contentDocument
      )
        return;
      const data = (event as CustomEvent).detail;
      if (data?.type === "opsis:lock") {
        onLock?.();
        return;
      }
      if (
        data?.type !== "opsis:open-tool" ||
        typeof data.tool !== "string" ||
        !Object.hasOwn(destinations, data.tool)
      )
        return;
      const path = destinations[data.tool];
      const entity =
        typeof data.entity === "string" ? publicIdentity(data.entity) : null;
      navigate(
        path === "/research" && entity
          ? workspaceLink("/research", entity)
          : path,
      );
    };
    const lock = document.getElementById("lock-preview");
    if (lock) lock.hidden = !onLock;
    document.addEventListener("opsis:navigate", receive);
    cleanup.current = () =>
      document.removeEventListener("opsis:navigate", receive);
    document.dispatchEvent(new Event("opsis:host-ready"));
    document.dispatchEvent(
      new Event(
        location.pathname === "/" ? "opsis:overview" : "opsis:workspace-open",
      ),
    );
  }
  if (!visited) return null;
  return (
    <iframe
      ref={frame}
      onLoad={connect}
      className="opsis-original-film"
      src="/opsis-site/index.html"
      title="Opsis overview — interactive chain"
      inert={location.pathname !== "/"}
      aria-hidden={location.pathname !== "/"}
    />
  );
}

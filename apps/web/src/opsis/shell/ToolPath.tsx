import { useLocation } from "react-router";
import { useCopy } from "../copy";
import { toolPathCopy } from "../shell-model";

export default function ToolPath() {
  const { pathname } = useLocation();
  const c = useCopy();
  if (
    ![
      "/research",
      "/check",
      "/lab",
      "/check/perp-scenario",
      "/research/events",
    ].includes(pathname)
  )
    return null;
  const path = toolPathCopy(pathname);
  return path && <p className="opsis-kicker opsis-tool-path">{c(...path)}</p>;
}

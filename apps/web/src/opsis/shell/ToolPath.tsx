import { useLocation } from "react-router";
import { useCopy } from "../copy";
import { toolPathCopy } from "../shell-model";

export default function ToolPath() {
  const { pathname } = useLocation();
  const c = useCopy();
  // The one path label on every tool page; pages do not render their own.
  const path = toolPathCopy(pathname);
  return path && <p className="opsis-kicker opsis-tool-path">{c(...path)}</p>;
}

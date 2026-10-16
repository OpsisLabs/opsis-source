import { Link, useLocation } from "react-router";
import { useCopy } from "./copy";
import type { Capabilities } from "./model";
import { toolGroups, toolIsActive } from "./shell-model";
import { ToolIcon } from "./shell/icons";

export default function ToolNavigation({
  capabilities,
  mobile = false,
  onNavigate,
}: {
  capabilities: Capabilities;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const c = useCopy();
  const prefix = mobile ? "menu" : "rail";
  const { pathname } = useLocation();
  return (
    <nav className="opsis-tool-rail" aria-label={c("Workspaces", "工作区")}>
      <Link
        to="/guide"
        className="opsis-rail-overview"
        aria-current={pathname === "/guide" ? "page" : undefined}
        onClick={onNavigate}
      >
        {c("Overview", "总览")}
      </Link>
      {toolGroups(capabilities).map((group) => (
        <section key={group.id} aria-labelledby={`${prefix}-${group.id}`}>
          <h2 id={`${prefix}-${group.id}`} className="opsis-rail-label">
            {c(...group.name)}
          </h2>
          {group.tools.map((tool) => (
            <Link
              key={tool.path}
              to={tool.path}
              aria-label={c(...tool.name)}
              aria-describedby={`${prefix}-purpose-${tool.icon}`}
              aria-current={
                toolIsActive(tool.path, pathname) ? "page" : undefined
              }
              onClick={onNavigate}
            >
              <ToolIcon name={tool.icon} />
              <span>
                {c(...tool.name)}
                <small id={`${prefix}-purpose-${tool.icon}`}>
                  {c(...tool.purpose)}
                </small>
              </span>
            </Link>
          ))}
          {!group.tools.length && (
            <p className="opsis-rail-empty">
              {c("No tools enabled", "未启用工具")}
            </p>
          )}
        </section>
      ))}
    </nav>
  );
}

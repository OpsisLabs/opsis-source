import { Activity, Users } from "lucide-react";
import { Link, useLocation } from "react-router";
import { useCopy } from "./copy";
import type { Capabilities } from "./model";
import { toolGroups, toolIsActive } from "./shell-model";
import { ToolIcon } from "./shell/icons";

function Utilities({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const c = useCopy();
  return (
    <div className="opsis-rail-utilities">
      <Link
        to="/guide"
        onClick={onNavigate}
        aria-current={pathname === "/guide" ? "page" : undefined}
      >
        <ToolIcon name="lab" />
        {c("Find your tool", "选择工具")}
      </Link>
      <Link
        to="/status"
        onClick={onNavigate}
        aria-current={pathname === "/status" ? "page" : undefined}
      >
        <Activity aria-hidden="true" />
        {c("Data status", "数据状态")}
      </Link>
      <Link
        to="/community"
        onClick={onNavigate}
        aria-current={pathname === "/community" ? "page" : undefined}
      >
        <Users aria-hidden="true" />
        {c("Community", "社区")}
      </Link>
    </div>
  );
}

export default function ToolNavigation({
  capabilities,
  mobile = false,
  onNavigate,
  publications = false,
}: {
  capabilities: Capabilities | null;
  mobile?: boolean;
  onNavigate?: () => void;
  publications?: boolean;
}) {
  const c = useCopy();
  const prefix = mobile ? "menu" : "rail";
  const { pathname } = useLocation();
  // Public reading pages need navigation, not an access request or invented capabilities.
  if (publications)
    return (
      <nav className="opsis-tool-rail" aria-label={c("Workspaces", "工作区")}>
        {(
          [
            ["/research", "research", "Look up", "查询"],
            ["/check", "check", "Before you trade", "交易之前"],
            ["/watch", "watch", "Keep watch", "持续关注"],
            ["/lab", "lab", "Explore data", "探索数据"],
          ] as const
        ).map(([path, icon, en, zh]) => (
          <section key={path}>
            <h2 className="opsis-rail-label">
              <Link
                to={path}
                onClick={onNavigate}
                className="opsis-rail-group-link"
              >
                <ToolIcon name={icon} />
                {c(en, zh)}
              </Link>
            </h2>
            {path === "/lab" &&
              [
                ["/docs", c("Docs", "文档")],
                ["/whitepaper", c("Whitepaper", "白皮书")],
              ].map(([href, label]) => (
                <Link
                  key={href}
                  to={href}
                  onClick={onNavigate}
                  aria-current={pathname === href ? "page" : undefined}
                >
                  {label}
                </Link>
              ))}
          </section>
        ))}
        <Link to="/saved" className="opsis-rail-overview" onClick={onNavigate}>
          <ToolIcon name="saved" />
          {c("Saved", "已保存")}
        </Link>
        <Utilities pathname={pathname} onNavigate={onNavigate} />
      </nav>
    );
  if (!capabilities) return null;
  // Utility pages collapse each group to its heading, as in the approved layout.
  const utility =
    ["/community", "/status", "/privacy", "/terms"].includes(pathname) &&
    !mobile;
  // The detailed evidence explorer belongs to Explore data in the approved D29 layout.
  const details = pathname === "/research/details";
  const groups = toolGroups(capabilities).map((group) =>
    details && group.id === "data" && capabilities.research
      ? {
          ...group,
          tools: [
            ...group.tools,
            {
              path: "/research/details",
              name: ["Detailed research", "详细研究"] as const,
              purpose: ["Inspect source evidence", "检查来源证据"] as const,
              icon: "research" as const,
            },
          ],
        }
      : group,
  );
  return (
    <nav className="opsis-tool-rail" aria-label={c("Workspaces", "工作区")}>
      <Link
        to="/saved"
        className="opsis-rail-overview"
        aria-current={pathname === "/saved" ? "page" : undefined}
        onClick={onNavigate}
      >
        <ToolIcon name="saved" />
        {c("Saved", "已保存")}
      </Link>
      {groups.map((group) => {
        const primaryTool = group.tools.find((tool) => tool.path !== "/saved");
        return (
          <section key={group.id} aria-labelledby={`${prefix}-${group.id}`}>
            <h2 id={`${prefix}-${group.id}`} className="opsis-rail-label">
              {utility && primaryTool ? (
                <Link to={primaryTool.path} onClick={onNavigate}>
                  <ToolIcon name={primaryTool.icon} />
                  {c(...group.name)}
                </Link>
              ) : (
                <>
                  {group.tools[0] && <ToolIcon name={group.tools[0].icon} />}
                  {c(...group.name)}
                </>
              )}
            </h2>
            {group.tools
              .filter((tool) => tool.path !== "/saved")
              .map((tool) => (
                <Link
                  key={tool.path}
                  to={tool.path}
                  aria-label={c(...tool.name)}
                  aria-describedby={`${prefix}-purpose-${tool.path.replaceAll("/", "-")}`}
                  aria-current={
                    toolIsActive(tool.path, pathname) &&
                    !(details && tool.path === "/research")
                      ? "page"
                      : undefined
                  }
                  onClick={onNavigate}
                >
                  <ToolIcon name={tool.icon} />
                  <span>
                    {c(...tool.name)}
                    <small
                      id={`${prefix}-purpose-${tool.path.replaceAll("/", "-")}`}
                    >
                      {c(...tool.purpose)}
                    </small>
                  </span>
                </Link>
              ))}
            {!group.tools.some((tool) => tool.path !== "/saved") && (
              <p className="opsis-rail-empty">
                {c("No tools enabled", "未启用工具")}
              </p>
            )}
          </section>
        );
      })}
      <Utilities pathname={pathname} onNavigate={onNavigate} />
    </nav>
  );
}

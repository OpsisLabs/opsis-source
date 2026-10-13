import { NavLink, useLocation } from "react-router";
import { useCopy } from "./copy";
import type { Capabilities } from "./model";
import { researchToolPaths, routeNames, tradeToolPaths } from "./shell-model";

export default function ToolNavigation({
  capabilities,
}: {
  capabilities: Capabilities;
}) {
  const c = useCopy();
  const { pathname } = useLocation();
  const trade = [
    "/check",
    "/check/perp-scenario",
    "/swap",
    "/simulate",
    "/stress-test",
  ].includes(pathname);
  const research =
    pathname.startsWith("/research") ||
    ["/rwa", "/biggest-trades"].includes(pathname);
  const paths = trade
    ? tradeToolPaths(capabilities)
    : research
      ? researchToolPaths(capabilities)
      : [];
  const description =
    pathname === "/watch"
      ? c("Compare saved wallet checks", "比较已保存的钱包核查")
      : pathname === "/lab"
        ? c("Explore data and scenarios", "探索数据与情景")
        : pathname === "/guide"
          ? c("Find a tool for your task", "按任务选择工具")
          : pathname === "/saved"
            ? c("Encrypted observations on this device", "此设备上的加密观察")
            : c("Tools and their data limits", "工具及其数据限制");
  if (!paths.length)
    return (
      <div className="opsis-tool-nav opsis-tool-description">
        <p>{description}</p>
      </div>
    );
  return (
    <nav
      className="opsis-tool-nav"
      aria-label={c("Workspace tools", "工作区工具")}
    >
      {paths.map((to) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            isActive || (to === "/research" && pathname === "/research/details")
              ? "active"
              : undefined
          }
        >
          {c(...routeNames[to])}
        </NavLink>
      ))}
    </nav>
  );
}

import { NavLink, useLocation } from "react-router";
import { useCopy } from "./copy";
import type { Capabilities } from "./model";
import { researchToolPaths, routeNames, tradeToolPaths } from "./shell-model";

export default function ToolNavigation({ capabilities }: { capabilities: Capabilities }) {
  const c = useCopy();
  const { pathname } = useLocation();
  const trade = ["/check", "/check/perp-scenario", "/swap", "/simulate", "/stress-test"].includes(pathname);
  const research = pathname.startsWith("/research") || ["/rwa", "/biggest-trades"].includes(pathname);
  const paths = trade ? tradeToolPaths(capabilities) : research ? researchToolPaths(capabilities) : [];
  if (!paths.length) return <div className="opsis-tool-nav" aria-hidden="true" />;
  return (
    <nav className="opsis-tool-nav" aria-label={c("Workspace tools", "工作区工具")}>
      <span>{c("EXPLORE", "探索")}</span>
      {paths.map((to) => (
        <NavLink key={to} to={to} end
          className={({ isActive }) => isActive || (to === "/research" && pathname === "/research/details") ? "active" : undefined}>
          {c(...routeNames[to])}
        </NavLink>
      ))}
    </nav>
  );
}

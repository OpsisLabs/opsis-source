import { NavLink, useLocation } from "react-router";
import { useCopy } from "./copy";
import type { Capabilities } from "./model";

export default function ToolNavigation({
  capabilities,
}: {
  capabilities: Capabilities;
}) {
  const c = useCopy();
  const { pathname } = useLocation();
  const trade = ["/check", "/swap", "/simulate", "/stress-test"].includes(
    pathname,
  );
  const research =
    pathname.startsWith("/research") ||
    ["/rwa", "/biggest-trades"].includes(pathname);
  const links: [string, string][] = trade
    ? [
        ["/check", c("Exit check", "退出核查")],
        ["/swap", c("Swap preview", "兑换预览")],
        ...(import.meta.env.VITE_TRADE_SIMULATOR_ENABLED === "true"
          ? [
              ["/simulate", c("Trade scenarios", "交易情景")] as [
                string,
                string,
              ],
            ]
          : []),
        ...(import.meta.env.VITE_PORTFOLIO_STRESS_TEST_ENABLED === "true"
          ? [
              ["/stress-test", c("Portfolio shocks", "投资组合冲击")] as [
                string,
                string,
              ],
            ]
          : []),
      ]
    : research
      ? [
          ["/research", c("Entity research", "实体研究")],
          ...(capabilities.rwa
            ? [["/rwa", c("Token claims", "代币声明")] as [string, string]]
            : []),
          ...(capabilities.observedTrades &&
          import.meta.env.VITE_OBSERVED_TRADES_ENABLED === "true"
            ? [
                ["/biggest-trades", c("Observed swaps", "已观察兑换")] as [
                  string,
                  string,
                ],
              ]
            : []),
          ...(import.meta.env.VITE_SITUATION_ROOM_ENABLED === "true"
            ? [
                ["/research/events", c("World & markets", "世界与市场")] as [
                  string,
                  string,
                ],
              ]
            : []),
        ]
      : [];
  if (!links.length) return null;
  return (
    <nav
      className="opsis-tool-nav"
      aria-label={c("Workspace tools", "工作区工具")}
    >
      <span>{c("EXPLORE", "探索")}</span>
      {links.map(([to, label]) => (
        <NavLink key={to} to={to} end>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

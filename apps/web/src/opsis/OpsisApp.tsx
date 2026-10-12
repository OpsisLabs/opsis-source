import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { useI18n } from "../i18n";
import { useCopy } from "./copy";
import {
  publicIdentity,
  workspaceIdentity,
  unlockPreview,
  workspaceLink,
  savedLink,
  type Capabilities,
} from "./model";
import { setOpsisPreviewToken } from "./preview-token";
import OriginalLanding from "./OriginalLanding";
import ToolOrientation from "./ToolOrientation";
import ToolNavigation from "./ToolNavigation";
import ToolWorkspace from "./ToolWorkspace";
import OpsisCopy from "./OpsisCopy";
import NavigationFeedback, { FrontDoorProgress, RouteReady } from "./NavigationFeedback";
import { chunks } from "./route-chunks";
import { landingTools, routeTitle } from "./shell-model";
import { initialTheme, persistTheme, savedTheme } from "./theme";
import { clearPublicSession } from "./public-session";
const Lab = lazy(chunks.Lab.load);
import "./opsis.css";
import "./legacy-theme.css";
import "./studio.css";

const publicAccess =
  import.meta.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
// A production beta build labels itself BETA; previews keep the PREVIEW label.
const betaRelease = import.meta.env.VITE_OPSIS_RELEASE_STAGE === "beta";

const SituationRoom = lazy(chunks.SituationRoom.load);
const Research = lazy(chunks.Research.load);
const TradeCheck = lazy(chunks.TradeCheck.load);
const Watch = lazy(chunks.Watch.load);
const Saved = lazy(chunks.Saved.load);
const Rwa = lazy(chunks.Rwa.load);
const Trades = lazy(chunks.Trades.load);
const Explorer = lazy(chunks.Explorer.load);
const Swap = lazy(chunks.Swap.load);
const Privacy = lazy(chunks.Privacy.load);
const Simulator = lazy(chunks.Simulator.load);
const Stress = lazy(chunks.Stress.load);
const Terms = lazy(chunks.Terms.load);
const Guide = lazy(chunks.Guide.load);
const Community = lazy(chunks.Community.load);

function Unavailable() {
  const c = useCopy();
  return (
    <section className="opsis-panel">
      <h1>{c("Not enabled on this deployment", "此部署中未启用")}</h1>
      <p>
        {c(
          "This service has not been enabled on both the browser and server. No lookup was sent.",
          "浏览器和服务器尚未同时启用此服务。未发送查询。",
        )}
      </p>
    </section>
  );
}
function PublicSearch({ hero = false }: { hero?: boolean }) {
  const c = useCopy();
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  return (
    <form
      className={hero ? "opsis-search hero-search" : "opsis-search"}
      onSubmit={(e) => {
        e.preventDefault();
        if (publicIdentity(value)) navigate(workspaceLink("/research", value));
      }}
    >
      <label className="sr-only" htmlFor={hero ? "hero-entity" : "nav-entity"}>
        {c("Public address or transaction hash", "公开地址或交易哈希")}
      </label>
      <input
        id={hero ? "hero-entity" : "nav-entity"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={c("Address or transaction hash", "地址或交易哈希")}
        autoComplete="off"
        spellCheck={false}
      />
      <button disabled={!publicIdentity(value)}>
        {c("Research →", "研究 →")}
      </button>
    </form>
  );
}
const PerpScenario = lazy(chunks.PerpScenario.load);

function Status({ capabilities }: { capabilities: Capabilities }) {
  const c = useCopy();
  const rows = capabilities.manifest?.capabilities ?? [
    { id: "research", enabled: capabilities.research, scope: "Robinhood Chain public-identifier research", origin: "live on request", freshness: "checked per request", coverage: "bounded by upstream source coverage", limits: "Provider health and complete coverage are unknown until each lookup." },
    { id: "tokenControls", enabled: capabilities.tokenControls ?? false, scope: "Robinhood Chain standard contract controls", origin: "live RPC on request", freshness: "block-anchored per request", coverage: "bounded evidence", limits: "Optional explorer enrichment may be unavailable." },
    { id: "exitCheck", enabled: capabilities.exitCheck, scope: "Robinhood Chain official Uniswap V3 standard fee tiers", origin: "live RPC on request", freshness: "block-anchored per quote", coverage: "bounded pools and RPC quota", limits: "Does not prove execution." },
    { id: "watch", enabled: capabilities.watch, scope: "Robinhood Chain user-triggered wallet snapshots", origin: "captured on user request", freshness: "snapshot timestamp; no background monitoring", coverage: "supported assets", limits: "Not continuous monitoring." },
    { id: "rwa", enabled: capabilities.rwa, scope: "Existing source-backed RWA verification checks", origin: "live on request", freshness: "checked per request", coverage: "bounded sources", limits: "Not an appraisal or proof of tradability." },
    { id: "observedTrades", enabled: capabilities.observedTrades, scope: "Robinhood Chain decoded Uniswap V3 Swap logs", origin: "live scan on request", freshness: "anchored to captured block window", coverage: "configured block and log caps", limits: "Observed swaps only; transfers are not trades." },
    { id: "swapPreview", enabled: capabilities.swapPreview ?? false, scope: "Robinhood Chain WETH/USDG quote preview", origin: "live quote on request", freshness: "short-lived quote", coverage: "WETH and USDG only", limits: "A preview, not an execution." },
  ];
  const details: Record<string, { label: [string, string]; scope: [string, string]; origin: [string, string]; freshness: [string, string]; coverage: [string, string]; limits: [string, string] }> = {
    research: { label: ["Research", "研究"], scope: ["Robinhood Chain public-identifier research", "Robinhood Chain 公开标识符研究"], origin: ["Live on request", "按请求实时查询"], freshness: ["Checked per request", "每次请求时检查"], coverage: ["Bounded by upstream source coverage", "受上游数据源覆盖范围限制"], limits: ["Provider health and complete coverage are unknown until each lookup.", "每次查询前，提供商运行状况和完整覆盖情况均未知。"] },
    tokenControls: { label: ["Standard contract controls", "标准合约控制"], scope: ["Robinhood Chain standard contract controls", "Robinhood Chain 标准合约控制"], origin: ["Live RPC on request", "按请求实时 RPC 查询"], freshness: ["Block-anchored per request", "每次请求锚定区块"], coverage: ["Owner, pause responses and three proxy slots only", "仅包括所有者、暂停响应和三个代理槽位"], limits: ["Mint privileges, custom roles, transfer taxes and concentration are not inferred.", "不会推断铸造权限、自定义角色、转账税或持仓集中度。"] },
    exitCheck: { label: ["Trade Check", "交易核查"], scope: ["Robinhood Chain official Uniswap V3 standard fee tiers", "Robinhood Chain 官方 Uniswap V3 标准费率层"], origin: ["Live RPC on request", "按请求实时 RPC 查询"], freshness: ["Block-anchored per quote", "每份报价锚定区块"], coverage: ["Bounded pools and configured RPC quota", "受限流动池及配置的 RPC 配额"], limits: ["Does not prove transferability, sellability or execution.", "不证明资产可转移、可出售或可成交。"] },
    watch: { label: ["Watch snapshots", "观察快照"], scope: ["Robinhood Chain user-triggered wallet snapshots", "Robinhood Chain 用户触发的钱包快照"], origin: ["Captured on user request", "按用户请求捕获"], freshness: ["Snapshot timestamp; no background monitoring", "显示快照时间；不在后台监控"], coverage: ["Supported assets and upstream discovery coverage", "受支持资产和上游发现覆盖范围"], limits: ["Not continuous monitoring; missing upstream data stays unknown.", "不提供持续监控；缺失的上游数据保持为未知。"] },
    rwa: { label: ["Stock-token check", "股票代币核查"], scope: ["Existing source-backed RWA verification checks", "现有有来源依据的 RWA 验证检查"], origin: ["Live on request", "按请求实时查询"], freshness: ["Checked per request", "每次请求时检查"], coverage: ["Bounded to supported sources and configured RPC quota", "受支持数据源及配置的 RPC 配额限制"], limits: ["Not an appraisal, eligibility decision or proof of tradability.", "不是估值、资格决定或可交易性证明。"] },
    swapPreview: { label: ["Swap preview", "兑换预览"], scope: ["Robinhood Chain WETH/USDG quote preview through the Uniswap Trade API", "通过 Uniswap Trade API 预览 Robinhood Chain WETH/USDG 报价"], origin: ["Live quote on request", "按请求实时报价"], freshness: ["Short-lived quote; Uniswap requotes before any trade", "短时有效报价；任何交易前由 Uniswap 重新报价"], coverage: ["WETH and USDG only", "仅限 WETH 和 USDG"], limits: ["A preview, not an execution; Opsis never signs or broadcasts.", "仅为预览，不会执行；Opsis 从不签名或广播交易。"] },
    observedTrades: { label: ["Big trades", "大额交易"], scope: ["Robinhood Chain decoded Uniswap V3 Swap logs", "Robinhood Chain 解码的 Uniswap V3 Swap 日志"], origin: ["Live scan on request", "按请求实时扫描"], freshness: ["Anchored to captured block window", "锚定已捕获的区块范围"], coverage: ["Configured block and log caps", "受配置的区块和日志上限限制"], limits: ["Observed swaps only; gaps and partial windows remain explicit; transfers are not trades.", "仅表示观察到的兑换；缺口和不完整范围会明确显示；转账不代表交易。"] },
  };
  return (
    <section className="opsis-panel">
      <h1>{c("Data status", "数据状态")}</h1>
      <p>
        {c(
          `Robinhood Chain · 4663. Server configuration only; provider health is unknown. ${capabilities.manifest?.build ? `Build ${capabilities.manifest.build}.` : "Build identifier unavailable."}`,
          `Robinhood Chain · 4663。此处仅显示服务器配置；提供商运行状况未知。${capabilities.manifest?.build ? `构建版本 ${capabilities.manifest.build}。` : "构建标识不可用。"}`,
        )}
      </p>
      <dl className="opsis-status">
        {rows.map((row) => {
          const copy = details[row.id];
          return <div key={row.id}>
            <dt>{c(...copy.label)}</dt>
            <dd>{row.enabled ? c("Enabled by server flag · health unknown", "服务器标志已启用 · 运行状况未知") : c("Disabled by server flag", "服务器标志已关闭")}</dd>
            <dd>{c("Scope", "范围")}: {c(...copy.scope)}</dd>
            <dd>{c("Origin", "来源")}: {c(...copy.origin)} · {c("Freshness", "时效")}: {c(...copy.freshness)}</dd>
            <dd>{c("Coverage", "覆盖范围")}: {c(...copy.coverage)}</dd>
            <dd>{c("Limits", "限制")}: {c(...copy.limits)}</dd>
          </div>
        })}
      </dl>
      <p>
        {c(
          "Perp opening and closing: unavailable. No venue is admitted for the intended Canada/US scope. Network, liquidity and protocol charges apply to external transactions.",
          "永续合约开仓和平仓：不可用。加拿大／美国目标范围尚无已准入的交易场所。外部交易涉及网络、流动性和协议费用。",
        )}
      </p>
    </section>
  );
}
function RedirectPublic({ to }: { to: "/research" | "/check" }) {
  const location = useLocation();
  return (
    <Navigate
      replace
      to={workspaceLink(
        to,
        workspaceIdentity(to, location.search),
      )}
    />
  );
}
export default function OpsisApp() {
  const c = useCopy();
  const { locale, setLocale } = useI18n();
  const location = useLocation();
  const [theme, setTheme] = useState(initialTheme);
  const [key, setKey] = useState("");
  const [access, setAccess] = useState<Capabilities | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    document.documentElement.classList.add("opsis-document");
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.append(meta);
    return () => {
      pending.current?.abort();
      setOpsisPreviewToken("");
      clearPublicSession();
      meta.remove();
      document.documentElement.classList.remove("opsis-document");
    };
  }, []);
  useEffect(() => {
    document.title = routeTitle(location.pathname, locale);
  }, [location.pathname, locale]);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => {
      if (!savedTheme()) setTheme(preference.matches ? "dark" : "light");
    };
    preference.addEventListener("change", follow);
    return () => preference.removeEventListener("change", follow);
  }, []);
  useEffect(() => {
    if (!access) return;
    const expires = Date.parse(access.expiresAt);
    const lock = () => {
      setOpsisPreviewToken("");
      clearPublicSession();
      setAccess(null);
      setError(!publicAccess);
    };
    const timer = window.setTimeout(lock, Math.max(0, expires - Date.now()));
    const wake = () => {
      if (Date.now() >= expires) lock();
    };
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [access]);
  async function unlock() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError(false);
    const credential = publicAccess ? "" : key;
    setKey("");
    try {
      const result = await unlockPreview(credential, controller.signal);
      if (!controller.signal.aborted) {
        setOpsisPreviewToken(credential, Date.parse(result.expiresAt));
        setAccess(result);
      }
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    if (!publicAccess || access || error) return;
    const controller = new AbortController();
    pending.current = controller;
    void unlockPreview("", controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setAccess(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [access, error]);
  return (
    <>
      {access && (
        <OriginalLanding
          {...{ enabledTools: landingTools(access) }}
          onLock={
            publicAccess
              ? undefined
              : () => {
                  setOpsisPreviewToken("");
                  clearPublicSession();
                  setAccess(null);
                  setError(false);
                }
          }
        />
      )}
      {access && <FrontDoorProgress />}
      <div
        className={`opsis ${access ? (location.pathname === "/" ? "opsis-overview" : "opsis-terminal") : ""}`}
        data-theme={theme}
        data-workspace={location.pathname.split("/")[1] || "overview"}
      >
        {access && location.pathname !== "/" && (
          <Link to="/" className="opsis-back">
            {c("← Back to overview", "← 返回总览")}
          </Link>
        )}
        <a href="#opsis-content" className="opsis-skip">
          {c("Skip to content", "跳至内容")}
        </a>
        <header className="opsis-header">
          <Link to="/" className="opsis-logo">
            OPSIS
          </Link>
          <div className="opsis-controls">
            {access && (
              <Link className="opsis-guide-link" to="/guide">
                {c("Find your tool ↗", "选择工具 ↗")}
              </Link>
            )}
            <button
              aria-pressed={theme === "dark"}
              onClick={() => {
                const next = theme === "dark" ? "light" : "dark";
                persistTheme(next);
                setTheme(next);
              }}
            >
              {theme === "dark"
                ? c("Theme: Dark", "主题：深色")
                : c("Theme: Light", "主题：浅色")}
            </button>
            <button onClick={() => setLocale(locale === "en" ? "zh-CN" : "en")}>
              {locale === "en" ? "中文" : "English"}
            </button>
            {access && !publicAccess && (
              <button
                onClick={() => {
                  setOpsisPreviewToken("");
                  clearPublicSession();
                  setAccess(null);
                  setError(false);
                }}
              >
                {c("Lock preview", "锁定预览")}
              </button>
            )}
          </div>
        </header>
        {!access && publicAccess ? (
          <main id="opsis-content" className="opsis-unlock">
            {error ? (
              <>
                <p role="alert">
                  {c("Opsis is temporarily unavailable.", "Opsis 暂时不可用。")}
                </p>
                <button onClick={() => setError(false)}>
                  {c("Retry", "重试")}
                </button>
              </>
            ) : (
              <>
                <p role="status">{c("Loading your tools…", "正在加载工具…")}</p>
                <div className="opsis-workspace-placeholder" aria-hidden="true">
                  <div /><div /><div />
                </div>
              </>
            )}
          </main>
        ) : !access ? (
          <main id="opsis-content" className="opsis-unlock">
            <p className="opsis-kicker">
              OPSIS / {c("PRIVATE PREVIEW", "私密预览")}
            </p>
            <h1>
              {c("Your tools,\none clear view.", "所有工具，\n一目了然。")}
            </h1>
            <p>
              {c(
                "An access key is required for this preparation build. Use test-only data. This is not an account or a wallet connection.",
                "此准备版本需要访问密钥。请仅使用测试数据。这不是账户或钱包连接。",
              )}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void unlock();
              }}
            >
              <label htmlFor="opsis-key">
                {c("Preview access key", "预览访问密钥")}
              </label>
              <input
                id="opsis-key"
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
              <button
                className="opsis-action"
                disabled={busy || !/^[a-f0-9]{64}$/.test(key)}
              >
                {busy
                  ? c("Checking…", "正在核查…")
                  : c("Open preview", "打开预览")}
              </button>
            </form>
            {error && (
              <p role="alert">
                {c(
                  "Preview unavailable or expired. Check the key and server configuration, then retry.",
                  "预览不可用或已过期。请检查密钥和服务器配置后重试。",
                )}
              </p>
            )}
          </main>
        ) : (
          <>
            <div className="opsis-navigation">
              <nav aria-label={c("Workspaces", "工作区")}>
                {[
                  [
                    "/research",
                    c("Research", "研究"),
                    c("Understand an asset", "理解资产"),
                  ],
                  [
                    "/check",
                    c("Trade Check", "交易核查"),
                    c("Check trading costs", "核查交易成本"),
                  ],
                  [
                    "/watch",
                    c("Watch", "观察"),
                    c("Compare wallet checks", "比较钱包核查"),
                  ],
                  [
                    "/lab",
                    c("Quant Lab", "量化实验室"),
                    c("Explore data & scenarios", "探索数据与情景"),
                  ],
                ].map(([path, label, purpose]) => (
                  <NavLink
                    key={path}
                    to={path}
                    aria-label={label}
                    aria-describedby={`workspace-purpose-${path.slice(1)}`}
                    className={({ isActive }) =>
                      isActive ||
                      (path === "/research" &&
                        ["/rwa", "/biggest-trades"].includes(
                          location.pathname,
                        )) ||
                      (path === "/check" &&
                        ["/swap", "/simulate", "/stress-test"].includes(
                          location.pathname,
                        ))
                        ? "active"
                        : undefined
                    }
                  >
                    {label}
                    <small id={`workspace-purpose-${path.slice(1)}`}>
                      {purpose}
                    </small>
                  </NavLink>
                ))}
              </nav>
              <PublicSearch />
            </div>
            <ToolNavigation capabilities={access} />
            <div className="opsis-preview-note">
              {c(
                betaRelease
                  ? "BETA · Robinhood Chain 4663"
                  : publicAccess
                    ? "PREVIEW · Robinhood Chain 4663"
                    : "PRIVATE PREVIEW · Test data only · Robinhood Chain 4663",
                betaRelease
                  ? "测试版 · Robinhood Chain 4663"
                  : publicAccess
                    ? "预览 · Robinhood Chain 4663"
                    : "私密预览 · 仅限测试数据 · Robinhood Chain 4663",
              )}
            </div>
            <NavigationFeedback capabilities={access} />
            <main id="opsis-content" className="opsis-content" tabIndex={-1}>
              <ToolOrientation capabilities={access} />
              <Suspense
                fallback={
                  <div className="opsis-workspace-placeholder" aria-hidden="true">
                    <div /><div /><div />
                  </div>
                }
              >
                <OpsisCopy>
                  <Routes>
                    <Route path="/" element={null} />
                    <Route
                      path="/research/events"
                      element={
                        import.meta.env.VITE_SITUATION_ROOM_ENABLED ===
                        "true" ? (
                          <ToolWorkspace>
                            <SituationRoom />
                          </ToolWorkspace>
                        ) : (
                          <Unavailable />
                        )
                      }
                    />
                    <Route
                      path="/research"
                      element={
                        access.research ? (
                          <Research
                            capabilities={access}
                          />
                        ) : (
                          <Unavailable />
                        )
                      }
                    />
                    <Route
                      path="/check"
                      element={
                        access.exitCheck &&
                        import.meta.env.VITE_EXIT_CHECK_ENABLED === "true" ? (
                          <TradeCheck
                            capabilities={access}
                          />
                        ) : (
                          <Unavailable />
                        )
                      }
                    />
                    <Route
                      path="/watch"
                      element={
                        access.watch &&
                        import.meta.env.VITE_SCOUT_WATCH_ENABLED === "true" ? (
                          <ToolWorkspace>
                            <Watch
                              tradeCheckEnabled={
                                access.exitCheck &&
                                import.meta.env.VITE_EXIT_CHECK_ENABLED ===
                                  "true"
                              }
                            />
                          </ToolWorkspace>
                        ) : (
                          <Unavailable />
                        )
                      }
                    />
                    <Route
                      path="/saved"
                      element={
                        <ToolWorkspace>
                          <Saved capabilities={access} />
                        </ToolWorkspace>
                      }
                    />
                    <Route
                      path="/vault"
                      element={
                        <Navigate to={savedLink(location.search)} replace />
                      }
                    />
                    <Route
                      path="/check/perp-scenario"
                      element={<PerpScenario />}
                    />
                    <Route path="/lab" element={<Lab />} />
                    <Route
                      path="/situation-room"
                      element={<Navigate to="/research/events" replace />}
                    />
                    <Route
                      path="/roadmap"
                      element={<Navigate to="/status" replace />}
                    />
                    <Route
                      path="/status"
                      element={<Status capabilities={access} />}
                    />
                    <Route
                      path="/rwa"
                      element={
                        access.rwa ? (
                          <ToolWorkspace>
                            <Rwa />
                          </ToolWorkspace>
                        ) : (
                          <Unavailable />
                        )
                      }
                    />
                    <Route
                      path="/biggest-trades"
                      element={
                        access.observedTrades &&
                        import.meta.env.VITE_OBSERVED_TRADES_ENABLED ===
                          "true" ? (
                          <ToolWorkspace>
                            <Trades />
                          </ToolWorkspace>
                        ) : (
                          <Unavailable />
                        )
                      }
                    />
                    <Route
                      path="/research/details"
                      element={
                        access.research ? (
                          <ToolWorkspace>
                            <Explorer />
                          </ToolWorkspace>
                        ) : (
                          <Unavailable />
                        )
                      }
                    />
                    <Route
                      path="/swap"
                      element={
                        access.swapPreview ? (
                          <ToolWorkspace>
                            <Swap />
                          </ToolWorkspace>
                        ) : (
                          <Unavailable />
                        )
                      }
                    />
                    <Route
                      path="/app"
                      element={<RedirectPublic to="/research" />}
                    />
                    <Route
                      path="/exit-check"
                      element={<RedirectPublic to="/check" />}
                    />
                    <Route
                      path="/simulate"
                      element={
                        access.swapPreview &&
                        import.meta.env.VITE_TRADE_SIMULATOR_ENABLED ===
                          "true" ? (
                          <ToolWorkspace>
                            <Simulator />
                          </ToolWorkspace>
                        ) : (
                          <Unavailable />
                        )
                      }
                    />
                    <Route
                      path="/stress-test"
                      element={
                        import.meta.env.VITE_PORTFOLIO_STRESS_TEST_ENABLED ===
                        "true" ? (
                          <ToolWorkspace>
                            <Stress />
                          </ToolWorkspace>
                        ) : (
                          <Unavailable />
                        )
                      }
                    />
                    <Route
                      path="/terms"
                      element={
                        <ToolWorkspace>
                          <Terms />
                        </ToolWorkspace>
                      }
                    />
                    <Route
                      path="/privacy"
                      element={
                        <ToolWorkspace>
                          <Privacy />
                        </ToolWorkspace>
                      }
                    />
                    <Route
                      path="/guide"
                      element={
                        <ToolWorkspace>
                          <Guide capabilities={access} />
                        </ToolWorkspace>
                      }
                    />
                    <Route path="/community" element={<Community />} />
                    <Route path="/changelog" element={<Navigate to="/community" replace />} />
                    <Route
                      path="*"
                      element={
                        <section className="opsis-panel">
                          <h1>{c("Not found", "未找到")}</h1>
                          <p>
                            {c(
                              "It has not been connected to this Opsis preview. Saved records and encrypted export remain available.",
                              "此工具尚未接入 Opsis 预览。已保存的记录和加密导出仍然可用。",
                            )}
                          </p>
                          <div className="opsis-tool-links">
                            <Link to="/research">{c("Open Research", "打开研究")}</Link>
                            <Link to="/guide">{c("Find your tool", "选择工具")}</Link>
                          </div>
                          <Link to="/saved">
                            {c(
                              "Open Saved and backups",
                              "打开已保存记录及备份",
                            )}
                          </Link>
                        </section>
                      }
                    />
                  </Routes>
                  <RouteReady />
                </OpsisCopy>
              </Suspense>
            </main>
            <footer className="opsis-footer">
              <Link to="/saved">{c("Saved", "已保存")}</Link>
              <Link to="/status">{c("Data status", "数据状态")}</Link>
              <Link to="/guide">{c("Find your tool", "选择工具")}</Link>
              <Link to="/community">{c("Community", "社区")}</Link>
              <Link to="/privacy">{c("Privacy", "隐私")}</Link>
              <Link to="/terms">{c("Terms", "条款")}</Link>
              <span>
                {c(
                  "Local encrypted records · No transaction execution",
                  "本地加密记录 · 不执行交易",
                )}
              </span>
            </footer>
          </>
        )}
      </div>
    </>
  );
}

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  unlockPreview,
  workspaceLink,
  type Capabilities,
} from "./model";
import { setOpsisPreviewToken } from "./preview-token";
import OriginalLanding from "./OriginalLanding";
import "./opsis.css";

const publicAccess =
  import.meta.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";

const SituationRoom = lazy(() => import("../situation/SituationRoom"));
const Research = lazy(() => import("./Research"));
const TradeCheck = lazy(() => import("./TradeCheck"));
const Watch = lazy(() => import("../watch/ScoutWatch"));
const Saved = lazy(() => import("../pages/Vault"));
const Rwa = lazy(() => import("../pages/RwaVerify"));
const Trades = lazy(() => import("../trades/BiggestTrades"));
const Explorer = lazy(() => import("../pages/PrivateExplorer"));
const Swap = lazy(() => import("../pages/ScoutSwap"));
const Privacy = lazy(() =>
  import("../pages/Legal").then((m) => ({ default: m.PrivacyPage })),
);
const Simulator = lazy(() => import("../simulator/TradeSimulator"));
const Stress = lazy(() => import("../stress/StressTest"));
const Terms = lazy(() =>
  import("../pages/Legal").then((m) => ({ default: m.TermsPage })),
);
const Guide = lazy(() => import("../pages/FeatureGuide"));

function Legacy({ children }: { children: ReactNode }) {
  return <div className="opsis-legacy">{children}</div>;
}
function Unavailable() {
  const c = useCopy();
  return (
    <section className="opsis-panel">
      <h1>{c("Not enabled in this preview", "此预览中未启用")}</h1>
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
function Lab() {
  const c = useCopy();
  return (
    <section className="opsis-panel">
      <p className="opsis-kicker">04 / {c("QUANT LAB", "量化实验室")}</p>
      <h1>
        {c("Start with a dataset you can trust.", "从可靠的数据集开始。")}
      </h1>
      <p>
        {c(
          "Dataset capture and cancellable statistical experiments are not implemented yet. No model results are available in this workspace.",
          "数据集采集和可取消的统计实验尚未实现。此工作区暂无模型结果。",
        )}
      </p>
      <a
        className="opsis-action"
        href="/quant/"
        target="_blank"
        rel="noreferrer"
      >
        {c("Open the frozen Quant Lab ↗", "打开冻结版量化实验室 ↗")}
      </a>
      <p className="opsis-small">
        {c(
          "Captured 10 September 2026. Separate legacy surface; not live market data.",
          "数据采集于 2026 年 9 月 10 日。独立的旧版界面；并非实时行情。",
        )}
      </p>
    </section>
  );
}
function Status({ capabilities }: { capabilities: Capabilities }) {
  const c = useCopy();
  return (
    <section className="opsis-panel">
      <h1>{c("Data status", "数据状态")}</h1>
      <p>
        {c(
          "Robinhood Chain · 4663. Availability reflects server configuration, not provider health. Each lookup reports its own evidence and errors.",
          "Robinhood Chain · 4663。可用性反映服务器配置，并非提供商运行状况。每次查询均报告自身的证据和错误。",
        )}
      </p>
      <dl className="opsis-status">
        {[
          [c("Research", "研究"), capabilities.research],
          [c("Exit quotes", "退出报价"), capabilities.exitCheck],
          [c("Watch snapshots", "观察快照"), capabilities.watch],
          [c("RWA verification", "RWA 验证"), capabilities.rwa],
          [c("Observed trades", "已观察交易"), capabilities.observedTrades],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt>{label}</dt>
            <dd>
              {value
                ? c(
                    "Server enabled · health unknown",
                    "服务器已启用 · 状态未知",
                  )
                : c("Unavailable", "不可用")}
            </dd>
          </div>
        ))}
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
        new URLSearchParams(location.search).get("entity") ?? "",
      )}
    />
  );
}
export default function OpsisApp() {
  const c = useCopy();
  const { locale, setLocale } = useI18n();
  const location = useLocation();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [key, setKey] = useState("");
  const [access, setAccess] = useState<Capabilities | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.append(meta);
    return () => {
      pending.current?.abort();
      setOpsisPreviewToken("");
      meta.remove();
    };
  }, []);
  useEffect(() => {
    document.title = `Opsis · ${location.pathname === "/" ? "Research workspace" : location.pathname.slice(1)}`;
  }, [location.pathname]);
  useEffect(() => {
    if (!access) return;
    const expires = Date.parse(access.expiresAt);
    const lock = () => {
      setOpsisPreviewToken("");
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
  useEffect(() => {
    if (access && location.pathname !== "/")
      document.getElementById("opsis-content")?.focus();
  }, [access, location.pathname]);
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
          onLock={
            publicAccess
              ? undefined
              : () => {
                  setOpsisPreviewToken("");
                  setAccess(null);
                  setError(false);
                }
          }
        />
      )}
      <div
        className={`opsis ${access ? (location.pathname === "/" ? "opsis-overview" : "opsis-terminal") : ""}`}
        data-theme={theme}
      >
        {access && location.pathname !== "/" && (
          <Link to="/" className="opsis-back">
            ← Back to overview
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
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark"
                ? c("Light theme", "浅色主题")
                : c("Dark theme", "深色主题")}
            </button>
            <button onClick={() => setLocale(locale === "en" ? "zh-CN" : "en")}>
              {locale === "en" ? "中文" : "English"}
            </button>
            {access && !publicAccess && (
              <button
                onClick={() => {
                  setOpsisPreviewToken("");
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
              <p role="status">{c("Loading Opsis…", "正在加载 Opsis…")}</p>
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
                  ["/research", c("Research", "研究")],
                  ["/check", c("Trade Check", "交易核查")],
                  ["/watch", c("Watch", "观察")],
                  ["/lab", c("Quant Lab", "量化实验室")],
                ].map(([path, label]) => (
                  <NavLink key={path} to={path}>
                    {label}
                  </NavLink>
                ))}
              </nav>
              <PublicSearch />
            </div>
            <div className="opsis-preview-note">
              {c(
                publicAccess
                  ? "PREVIEW · Robinhood Chain 4663"
                  : "PRIVATE PREVIEW · Test data only · Robinhood Chain 4663",
                publicAccess
                  ? "预览 · Robinhood Chain 4663"
                  : "私密预览 · 仅限测试数据 · Robinhood Chain 4663",
              )}
            </div>
            <main id="opsis-content" className="opsis-content" tabIndex={-1}>
              <Suspense
                fallback={
                  <p role="status">
                    {c("Loading workspace…", "正在加载工作区…")}
                  </p>
                }
              >
                <Routes>
                  <Route path="/" element={null} />
                  <Route
                    path="/research/events"
                    element={
                      import.meta.env.VITE_SITUATION_ROOM_ENABLED === "true" ? (
                        <Legacy>
                          <SituationRoom />
                        </Legacy>
                      ) : (
                        <Unavailable />
                      )
                    }
                  />
                  <Route
                    path="/research"
                    element={
                      access.research ? (
                        <Research key={location.search} capabilities={access} />
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
                        <TradeCheck key={location.search} />
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
                        <Legacy>
                          <Watch />
                        </Legacy>
                      ) : (
                        <Unavailable />
                      )
                    }
                  />
                  <Route
                    path="/saved"
                    element={
                      <Legacy>
                        <Saved />
                      </Legacy>
                    }
                  />
                  <Route
                    path="/vault"
                    element={<Navigate to="/saved" replace />}
                  />
                  <Route path="/lab" element={<Lab />} />
                  <Route
                    path="/status"
                    element={<Status capabilities={access} />}
                  />
                  <Route
                    path="/rwa"
                    element={
                      access.rwa ? (
                        <Legacy>
                          <Rwa />
                        </Legacy>
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
                        <Legacy>
                          <Trades />
                        </Legacy>
                      ) : (
                        <Unavailable />
                      )
                    }
                  />
                  <Route
                    path="/research/details"
                    element={
                      access.research ? (
                        <Legacy>
                          <Explorer />
                        </Legacy>
                      ) : (
                        <Unavailable />
                      )
                    }
                  />
                  <Route
                    path="/swap"
                    element={
                      <Legacy>
                        <Swap />
                      </Legacy>
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
                      import.meta.env.VITE_TRADE_SIMULATOR_ENABLED ===
                      "true" ? (
                        <Legacy>
                          <Simulator />
                        </Legacy>
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
                        <Legacy>
                          <Stress />
                        </Legacy>
                      ) : (
                        <Unavailable />
                      )
                    }
                  />
                  <Route
                    path="/terms"
                    element={
                      <Legacy>
                        <Terms />
                      </Legacy>
                    }
                  />
                  <Route
                    path="/privacy"
                    element={
                      <Legacy>
                        <Privacy />
                      </Legacy>
                    }
                  />
                  <Route
                    path="/guide"
                    element={
                      <Legacy>
                        <Guide />
                      </Legacy>
                    }
                  />
                  <Route
                    path="*"
                    element={
                      <section className="opsis-panel">
                        <h1>{c("This tool is parked", "此工具已暂缓")}</h1>
                        <p>
                          {c(
                            "It has not been connected to this Opsis preview. Saved records and encrypted export remain available.",
                            "此工具尚未接入 Opsis 预览。已保存的记录和加密导出仍然可用。",
                          )}
                        </p>
                        <Link to="/saved">
                          {c("Open Saved and backups", "打开已保存记录及备份")}
                        </Link>
                      </section>
                    }
                  />
                </Routes>
              </Suspense>
            </main>
            <footer className="opsis-footer">
              <Link to="/saved">{c("Saved", "已保存")}</Link>
              <Link to="/status">{c("Data status", "数据状态")}</Link>
              <Link to="/guide">{c("Help", "帮助")}</Link>
              <Link to="/privacy">{c("Privacy", "隐私")}</Link>
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

import { isWatchEnabled } from "../product/availability";
import { robotsDirective } from "../product/public-pages";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router";
import { useI18n } from "../i18n";
import { useCopy } from "./copy";
import {
  workspaceIdentity,
  unlockPreview,
  PreviewAccessError,
  workspaceLink,
  savedLink,
  type Capabilities,
} from "./model";
import { accessRetry, accessRetrySeconds, type AccessRetryEvent, type AccessRetryState } from "./access-retry";
import { setOpsisPreviewToken } from "./preview-token";
import OriginalLanding from "./OriginalLanding";
import ToolOrientation from "./ToolOrientation";
import WorkspaceShell from "./shell/WorkspaceShell";
import ToolPath from "./shell/ToolPath";
import ToolWorkspace from "./ToolWorkspace";
import Status from "./Status";
import OpsisCopy from "./OpsisCopy";
import NavigationFeedback, { FrontDoorProgress, RouteReady } from "./NavigationFeedback";
import { LoadBoundary } from "../product/LoadRecovery";
import { chunks } from "./route-chunks";
import { landingTools, routeTitle } from "./shell-model";
import { initialTheme, persistTheme, savedTheme } from "./theme";
import { clearPublicSession } from "./public-session";
const LaunchRadar = lazy(chunks.LaunchRadar.load);
const Lab = lazy(chunks.Lab.load);
const ReceiptVerify = lazy(chunks.ReceiptVerify.load);
import "./opsis.css";
import "./legacy-theme.css";
import "./studio.css";
import "./shell.css";
import "./workspace-identity.css";

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
const PerpScenario = lazy(chunks.PerpScenario.load);

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
  const [accessFailure, setAccessFailure] = useState<PreviewAccessError | null>(null);
  const retryState = useRef<AccessRetryState>({ automaticRetries: 0, deadline: null });
  const [retry, setRetry] = useState<AccessRetryState>({ automaticRetries: 0, deadline: null });
  const [countdown, setCountdown] = useState(0);
  const [retryWait, setRetryWait] = useState(0);
  const [accessAttempt, setAccessAttempt] = useState(0);
  const retryTimers = useRef<{ automatic?: number; countdown?: number }>({});
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const robots = useRef<HTMLMetaElement | null>(null);
  function clearRetryTimers() {
    window.clearTimeout(retryTimers.current.automatic);
    window.clearTimeout(retryTimers.current.countdown);
    retryTimers.current = {};
  }
  function updateRetry(event: AccessRetryEvent) {
    const now = Date.now();
    const next = accessRetry(retryState.current, event, now);
    retryState.current = next;
    setRetry(next);
    const seconds = accessRetrySeconds(next.deadline, now);
    setCountdown(seconds);
    setRetryWait(seconds);
  }
  useEffect(() => {
    document.documentElement.classList.add("opsis-document");
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.append(meta);
    robots.current = meta;
    return () => {
      pending.current?.abort();
      clearRetryTimers();
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
    if (robots.current) robots.current.content = robotsDirective(location.pathname, import.meta.env.VITE_OPSIS_INDEXABLE);
  }, [location.pathname]);
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
        clearRetryTimers();
        updateRetry({ type: "success" });
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
    if (!publicAccess || access) return;
    const controller = new AbortController();
    pending.current?.abort();
    pending.current = controller;
    void unlockPreview("", controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          clearRetryTimers();
          updateRetry({ type: "success" });
          setError(false);
          setAccessFailure(null);
          setAccess(result);
          setBusy(false);
        }
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted || (failure instanceof Error && failure.name === "AbortError")) return;
        const refused = failure instanceof PreviewAccessError ? failure : null;
        setAccessFailure(refused);
        setError(true);
        setBusy(false);
        updateRetry({ type: "failure", status: refused?.status, retryAfter: refused?.retryAfter });
      });
    return () => controller.abort();
  }, [access, accessAttempt]);
  useEffect(() => {
    const deadline = retry.deadline;
    if (deadline === null) return;
    const tick = () => {
      const seconds = accessRetrySeconds(deadline, Date.now());
      setCountdown(seconds);
      if (seconds > 0) retryTimers.current.countdown = window.setTimeout(tick, Math.min(1000, deadline - Date.now()));
    };
    const wake = () => {
      clearRetryTimers();
      // A hidden tab needs no countdown ticks or request until it is visible.
      if (document.hidden || retryState.current.deadline !== deadline) return;
      tick();
      retryTimers.current.automatic = window.setTimeout(() => {
        if (retryState.current.deadline !== deadline) return;
        clearRetryTimers();
        updateRetry({ type: "automatic" });
        setBusy(true);
        setAccessAttempt((attempt) => attempt + 1);
      }, Math.max(0, deadline - Date.now()));
    };
    wake();
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearRetryTimers();
      document.removeEventListener("visibilitychange", wake);
    };
  }, [retry.deadline]);
  // A stable list: the front door reconnects to the film whenever it changes.
  const enabledTools = useMemo(() => (access ? landingTools(access) : []), [access]);
  return (
    <>
      {access && (
        <OriginalLanding
          enabledTools={enabledTools}
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
        <a href="#opsis-content" className="opsis-skip">
          {c("Skip to content", "跳至内容")}
        </a>
        <WorkspaceShell
          capabilities={access}
          theme={theme}
          onTheme={() => {
            const next = theme === "dark" ? "light" : "dark";
            persistTheme(next);
            setTheme(next);
          }}
          locale={locale}
          onLocale={() => setLocale(locale === "en" ? "zh-CN" : "en")}
          stage={c(
            betaRelease ? "BETA" : publicAccess ? "PREVIEW" : "PRIVATE PREVIEW · Test data only",
            betaRelease ? "测试版" : publicAccess ? "预览" : "私密预览 · 仅限测试数据",
          )}
          onLock={access && !publicAccess ? () => {
            setOpsisPreviewToken("");
            clearPublicSession();
            setAccess(null);
            setError(false);
          } : undefined}
        />
        {!access && publicAccess ? (
          <main id="opsis-content" className="opsis-unlock">
            {error ? (
              <section className="opsis-access-unavailable" aria-labelledby="opsis-access-heading">
                <h1 id="opsis-access-heading">{c("A moment before opening Opsis", "打开 Opsis 前请稍候")}</h1>
                {accessFailure?.status === 429 ? (
                  <>
                    <p>{c(
                      "Too many requests came from this network connection in a short time. A shared connection counts as one. Nothing is wrong with your device.",
                      "此网络连接在短时间内发送了过多请求。共享连接按一个连接计算。您的设备没有问题。",
                    )}</p>
                    <p role="status" aria-live="polite" aria-atomic="true" className={retry.deadline === null ? undefined : "sr-only"}>
                      <span key={retry.deadline ?? (busy ? "checking" : "stopped")}>
                        {retry.deadline !== null
                          ? c(`Opsis is retrying. Next attempt in ${retryWait} seconds.`, `Opsis 正在重试。${retryWait} 秒后再次尝试。`)
                          : busy
                            ? c("Opsis is retrying…", "Opsis 正在重试…")
                            : c("Opsis stopped retrying. You can try again with Retry.", "Opsis 已停止重试。您可以点击“重试”再次尝试。")}
                      </span>
                    </p>
                    {retry.deadline !== null && <p aria-hidden="true">{c(`Opsis is retrying in ${countdown} ${countdown === 1 ? "second" : "seconds"}…`, `Opsis 正在等待重试，还剩 ${countdown} 秒…`)}</p>}
                  </>
                ) : (
                  <p role="alert">{c("Opsis is temporarily unavailable.", "Opsis 暂时不可用。")}</p>
                )}
                <button onClick={() => {
                  clearRetryTimers();
                  pending.current?.abort();
                  updateRetry({ type: "manual" });
                  setBusy(true);
                  setAccessAttempt((attempt) => attempt + 1);
                }}>
                  {c("Retry", "重试")}
                </button>
              </section>
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
            <NavigationFeedback capabilities={access} />
            <main id="opsis-content" className="opsis-content" tabIndex={-1}>
              <ToolPath />
              <LoadBoundary shell resetKey={location.pathname}>
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
                        isWatchEnabled() ? (
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
                      element={<PerpScenario capabilities={access} />}
                    />
                    <Route path="/research/launches" element={access.launchCards === true ? <ToolWorkspace><LaunchRadar enabled /></ToolWorkspace> : <Unavailable />} />
                    <Route path="/verify" element={access.receipts === true ? <ToolWorkspace><ReceiptVerify capabilities={access} /></ToolWorkspace> : <Unavailable />} />
                    <Route path="/lab" element={<Lab capabilities={access} />} />
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
                      element={<ToolWorkspace><Status capabilities={access} /></ToolWorkspace>}
                    />
                    <Route
                      path="/rwa"
                      element={
                        access.rwa ? (
                          <ToolWorkspace>
                            <Rwa stockDesk={access.stockDesk === true} />
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
                    <Route path="/community" element={<ToolWorkspace><Community /></ToolWorkspace>} />
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
              </LoadBoundary>
              <ToolOrientation capabilities={access} />
            </main>
            {/* Outside main so it stays the page's contentinfo landmark. */}
            <footer className="opsis-footer">
                <Link to="/saved">{c("Saved", "已保存")}</Link>
                <Link to="/status">{c("Data status", "数据状态")}</Link>
                <Link to="/community">{c("Community", "社区")}</Link>
                <Link to="/privacy">{c("Privacy", "隐私")}</Link>
                <Link to="/terms">{c("Terms", "条款")}</Link>
                <a href="https://github.com/OpsisLabs/opsis-source" target="_blank" rel="noopener noreferrer">
                  GitHub ↗
                </a>
                <span>
                  {c(
                    "Read-only research · Sources with read times",
                    "只读研究 · 来源附读取时间",
                  )}
                </span>
              </footer>
          </>
        )}
      </div>
    </>
  );
}

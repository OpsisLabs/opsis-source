import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Info,
  Search,
  Sparkles,
  Star,
  UserRound,
  X,
} from "lucide-react";
import { useI18n } from "../i18n";
import {
  calls,
  profiles,
  tokens,
  filterCalls,
  profileFor,
  receipt,
  windowCalls,
  chainCount,
  capturedDate,
  type HistoryWindow,
  type Call,
  type Profile,
} from "./model";
import {
  callPerformance,
  profilePerformance,
  priceEdition,
  formatPercent,
  paperPnl,
  formatMoney,
  assetReturnCurve,
  matchesScoringFilter,
  type ScoringFilter,
} from "./performance";
import "./kol.css";
import { encryptWorkspace, decryptWorkspace } from "./workspace";
import {
  readDeviceWorkspace,
  writeDeviceWorkspace,
  workspaceChannel,
  workspaceSource,
} from "./workspace";
import {
  ComparePanel,
  CoveragePanel,
  ResearchBrief,
  ScoringSummary,
} from "./ResearchPanels";
import { sourceLabel } from "./research";
import { MentionPrices, PriceContextPanel } from "./PriceContext";
import { priceContext } from "./reactions";
import tokenIdentities from "./token-identities.json";
const PerformanceChart = lazy(() => import("./PerformanceChart"));
type Translate = (en: string, zh: string) => string;
type View = "all" | "feed" | "moves" | "compare" | "watchlist" | "saved";
const dateLabel = (date: string) =>
  new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const timestamp = (seconds: number) =>
  new Date(seconds * 1000)
    .toISOString()
    .replace("T", " ")
    .replace(".000Z", " UTC");
const toggle = (items: string[], id: string) =>
  items.includes(id) ? items.filter((i) => i !== id) : [...items, id];
const tone = (value: number | null) =>
  value === null || value === 0
    ? ""
    : value > 0
      ? "is-positive"
      : "is-negative";

function Avatar({
  profile,
  large = false,
}: {
  profile: Profile;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <UserRound
      className={"kol-avatar " + (large ? "large" : "")}
      aria-label={profile.name}
    />
  ) : (
    <img
      className={"kol-avatar " + (large ? "large" : "")}
      src={profile.avatar}
      alt={profile.name + " X profile picture"}
      onError={() => setFailed(true)}
    />
  );
}
function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      className="kol-source-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}
function MethodContent({ L }: { L: Translate }) {
  return (
    <div className="kol-method-copy">
      <p>
        {L(
          "A consistent seven-day check on selected public calls. This is hypothetical call performance, not the KOL’s wallet P&L.",
          "对选定公开观点进行统一的七天观察。这是模拟观点表现，不是 KOL 钱包的实际盈亏。",
        )}
      </p>
      <ol>
        <li>
          <strong>{L("Start after the post.", "从发帖之后开始。")}</strong>{" "}
          {L(
            "Use an observed USD price near the first whole UTC hour after publication. Never use an earlier claimed fill.",
            "使用发帖后首个 UTC 整点附近的美元观测价格，不使用作者声称的更早成交价。",
          )}
        </li>
        <li>
          <strong>{L("Measure seven days.", "观察七天。")}</strong>{" "}
          {L(
            "Apply each stated direction on paper for seven days. Daily observations may be up to ten minutes from target hours, always after publication. Actual timestamps stay in the receipt.",
            "按各资产声明方向模拟观察七天。每日价格与目标整点偏差最多十分钟，且均在原帖发布后；记录保留实际时间。",
          )}
        </li>
        <li>
          <strong>{L("Weight calls equally.", "每条观点等权。")}</strong>{" "}
          {L(
            "Average token returns within each call, then average complete calls. No leverage. Dollar P&L is the average return on the chosen paper stake per call.",
            "先对同一观点中的代币收益等权平均，再对完整观点平均。不使用杠杆。美元盈亏按每条观点的模拟本金计算。",
          )}
        </li>
        <li>
          <strong>{L("Keep the gaps visible.", "保留数据缺口。")}</strong>{" "}
          {L(
            "Open observation windows are pending. Unverified conditions and unclear asset identities are excluded. Independently stated named-asset legs may be measured with explicit partial coverage; unidentified assets are never substituted.",
            "观察期未结束时标为等待。未经核验的条件和身份不明的资产不计分。独立且明确的资产观点可以单独衡量，并标明覆盖不完整；不替换未确认资产。",
          )}
        </li>
      </ol>
      <p>
        {L(
          "Gross returns exclude fees, spread, slippage and funding. Positive calls counts returns above zero, not fulfilled predictions. This selected sample is not a full track record or a current-week portfolio return. Commentary, bearish statements without verified short entries, satire and unresolved token identities remain unscored.",
          "毛收益不包含手续费、价差、滑点和资金费。正收益观点仅表示收益大于零，不代表预测命中。选定样本不是完整交易业绩或本周组合收益。评论、未核验的做空观点、讽刺和身份不明代币不评分。",
        )}
      </p>
      <div className="kol-method-source">
        <SourceLink href={priceEdition.providerDocs}>
          DefiLlama price data
        </SourceLink>
        <span>
          {L(
            "Cutoff: Sep 11, 2026 · 04:00 UTC",
            "截止：2026 年 9 月 11 日 04:00 UTC",
          )}
        </span>
      </div>
    </div>
  );
}
function CallDetail({
  call,
  saved,
  onSave,
  stake,
  L,
}: {
  call: Call;
  saved: boolean;
  onSave: () => void;
  stake: number;
  L: Translate;
}) {
  const [insight, setInsight] = useState(false);
  const result = callPerformance(call),
    p = profileFor(call.profile);
  function download() {
    const payload = {
      ...receipt(call),
      actualWalletPnl: null,
      tokenPriceContext: priceContext(call),
      paperPerformance: {
        ...result,
        stakePerCall: stake,
        pnl: result.percent === null ? null : paperPnl(result.percent, stake),
        method: priceEdition.method,
        priceCutoff: priceEdition.asOf,
      },
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `opsis-call-${call.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="kol-call-detail">
      <div className="kol-detail-source">
        <span>
          {L("Source summary / excerpt", "来源摘要 / 节选")} · {p.name}
        </span>
        <SourceLink href={call.url}>{L("Open on X", "在 X 打开")}</SourceLink>
      </div>
      <p className="kol-statement">{call.summary}</p>
      <details className="kol-source-context">
        <summary>
          {L("Inspect source evidence", "查看来源证据")} ·{" "}
          {L(
            sourceLabel(call),
            sourceLabel(call) === "Partial text" ? "部分文字" : "已审阅原帖",
          )}
        </summary>
        {call.quote && <blockquote>{call.quote}</blockquote>}
        <p>
          {L(
            "Summary and classification are Opsis's interpretation. Check the original wording, attached charts and any stated conditions before drawing a conclusion.",
            "摘要及分类属于 Opsis 的解读。请核验原文、附图及声明的条件，再作判断。",
          )}
        </p>
        <SourceLink href={call.url}>
          {L("Read original post", "阅读原帖")}
        </SourceLink>
      </details>
      {call.scoringCoverage && (
        <p className="kol-affiliation">{call.scoringCoverage}</p>
      )}
      {call.disclosedAffiliation && (
        <p className="kol-affiliation">{call.disclosedAffiliation}</p>
      )}
      <div className="kol-facts">
        <span>{call.type}</span>
        {call.chainTopic && (
          <span className="kol-chain-badge">Robinhood Chain</span>
        )}
        <span>
          {L("Posted ", "发布于 ")}
          {dateLabel(call.publishedAt)} ·{" "}
          {new Date(call.publishedAt).toISOString().slice(11, 16)} UTC
        </span>
        {call.deadline && (
          <span>
            {L("Target deadline ", "目标截止 ")}
            {dateLabel(call.deadline)}
          </span>
        )}
      </div>
      {result.percent !== null ? (
        <>
          <div className="kol-call-result">
            <div>
              <span>{L("7D call return", "7 日观点收益")}</span>
              <strong className={tone(result.percent)}>
                {formatPercent(result.percent)}
              </strong>
            </div>
            <div>
              <span>
                {L("Paper P&L on ", "模拟盈亏，本金 ")}${stake.toLocaleString()}
              </span>
              <strong className={tone(result.percent)}>
                {formatMoney(paperPnl(result.percent, stake))}
              </strong>
            </div>
            <p>
              {L(
                "Observed after publication. This does not verify the author’s entry or whether their target was met.",
                "发帖后的观测表现，不验证作者成交，也不判定目标是否命中。",
              )}
            </p>
          </div>
          <Suspense
            fallback={
              <div className="kol-chart-loading">
                {L("Loading price observations…", "正在加载价格观测…")}
              </div>
            }
          >
            <PerformanceChart
              series={result.observation.assets.map((a) => ({
                name: `${a.symbol} · ${a.direction === "short" ? L("short", "模拟做空") : L("long", "模拟做多")}`,
                values: assetReturnCurve(a),
              }))}
              label={L(
                "Token returns during the seven days after this call",
                "该观点发布后七天的代币收益",
              )}
            />
          </Suspense>
          <details className="kol-receipt-data">
            <summary>
              {L("See prices & calculation", "查看价格和计算方式")}
              <ChevronDown size={15} />
            </summary>
            <div>
              {result.observation.assets.map((a) => (
                <div className="kol-price-pair" key={a.id}>
                  <strong>
                    {a.symbol}{" "}
                    <small>
                      {a.direction === "short"
                        ? L("Paper short", "模拟做空")
                        : L("Paper long", "模拟做多")}
                    </small>
                  </strong>
                  <span>
                    $
                    {a.prices[0].price.toLocaleString("en-US", {
                      maximumFractionDigits: 4,
                    })}
                    <small>{timestamp(a.prices[0].timestamp)}</small>
                  </span>
                  <ArrowRight size={15} />
                  <span>
                    $
                    {a.prices[7].price.toLocaleString("en-US", {
                      maximumFractionDigits: 4,
                    })}
                    <small>{timestamp(a.prices[7].timestamp)}</small>
                  </span>
                </div>
              ))}
              <p>
                {L(
                  "Long return = (day 7 price ÷ first observation − 1) × 100. Paper short return is its negative. Verified asset legs use equal weights. No leverage; excludes fees, slippage, funding and borrow costs.",
                  "看多收益 =（第七天价格 ÷ 首次价格 − 1）×100；模拟做空收益取其负值。已核验资产等权。不加杠杆，未扣除手续费、滑点、资金费及借币成本。",
                )}
              </p>
              {result.observation.assets.map((asset) => {
                const identity = (
                  tokenIdentities as Record<
                    string,
                    { chain: string; contract: string; official: string }
                  >
                )[asset.symbol];
                return identity ? (
                  <p key={asset.id} className="kol-identity-proof">
                    <strong>
                      {asset.symbol} · {identity.chain}
                    </strong>
                    <code>{identity.contract}</code>
                    <SourceLink href={identity.official}>
                      {L("Official token identity", "官方代币身份")}
                    </SourceLink>
                  </p>
                ) : null;
              })}
              {result.observation.url && (
                <SourceLink href={result.observation.url}>
                  {L("Price source", "价格来源")}
                </SourceLink>
              )}
            </div>
          </details>
        </>
      ) : (
        <div className="kol-observation-state">
          <Info size={19} />
          <div>
            <strong>
              {result.observation.status === "pending"
                ? L("Seven-day window still open", "七天观察窗口尚未结束")
                : L("Not included in the performance score", "未计入表现评分")}
            </strong>
            <p>{result.observation.reason}</p>
            {result.observation.endAt && (
              <small>
                {L("Window ends ", "窗口结束于 ")}
                {timestamp(result.observation.endAt)}
              </small>
            )}
          </div>
        </div>
      )}
      {result.percent === null && <MentionPrices call={call} L={L} />}
      <div className="kol-detail-actions">
        <button
          className="kol-ai-button"
          onClick={() => setInsight(!insight)}
          aria-expanded={insight}
        >
          <Sparkles size={16} />
          {L("Explain this call", "解读此观点")}
          <ChevronDown size={15} />
        </button>
        <button
          className="kol-text-button"
          onClick={onSave}
          aria-pressed={saved}
        >
          <Bookmark size={15} fill={saved ? "currentColor" : "none"} />
          {saved ? L("Saved", "已保存") : L("Save receipt", "保存记录")}
        </button>
        <button className="kol-text-button" onClick={download}>
          <Download size={15} />
          {L("Export", "导出")}
        </button>
      </div>
      {insight && (
        <div
          className="kol-insight"
          role="region"
          aria-label={L("Call explanation", "观点解读")}
        >
          <span>
            <Sparkles size={14} />
            {L("Opsis insight", "Opsis 洞察")}
          </span>
          <p>{call.interpretation}</p>
          <small>
            {L(
              "Prepared AI context · based on the reviewed source",
              "预先准备的 AI 解读 · 基于已审阅来源",
            )}
          </small>
        </div>
      )}
    </div>
  );
}
function HistoryList({
  items,
  selected,
  onSelect,
  saved,
  onSave,
  stake,
  showAuthor = false,
  L,
}: {
  items: Call[];
  selected: string;
  onSelect: (id: string) => void;
  saved: string[];
  onSave: (id: string) => void;
  stake: number;
  showAuthor?: boolean;
  L: Translate;
}) {
  return (
    <div className="kol-history-list">
      {items.map((call) => {
        const result = callPerformance(call),
          open = selected === call.id;
        return (
          <article
            className={"kol-history-item " + (open ? "is-open" : "")}
            key={call.id}
          >
            <button
              className="kol-history-row"
              onClick={() => onSelect(open ? "" : call.id)}
              aria-expanded={open}
              aria-controls={`call-${call.id}`}
              aria-label={L("Inspect call ", "查看观点 ") + call.id}
            >
              {showAuthor && <Avatar profile={profileFor(call.profile)} />}
              <span className="kol-history-main">
                {showAuthor && (
                  <small>
                    {profileFor(call.profile).name} · {dateLabel(call.date)}
                  </small>
                )}
                <strong>{call.summary}</strong>
                <span>
                  {call.tokens.join(" · ")}
                  {!showAuthor && <> · {dateLabel(call.date)}</>}
                </span>
              </span>
              <span className={"kol-history-return " + tone(result.percent)}>
                {result.percent !== null
                  ? formatPercent(result.percent)
                  : result.observation.status === "pending"
                    ? L("Pending", "观察中")
                    : L("Unscored", "未评分")}
                <small>
                  {result.percent !== null
                    ? L("7D return", "7 日收益")
                    : result.observation.status === "pending"
                      ? L("7-day window", "7 天窗口")
                      : call.type}
                </small>
              </span>
              <ChevronDown size={17} />
            </button>
            {open && (
              <div id={`call-${call.id}`}>
                <CallDetail
                  call={call}
                  saved={saved.includes(call.id)}
                  onSave={() => onSave(call.id)}
                  stake={stake}
                  L={L}
                />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
export default function Tracker() {
  const { locale } = useI18n();
  const L: Translate = (en, zh) => (locale === "zh-CN" ? zh : en);
  const [view, setView] = useState<View>("all"),
    [profile, setProfile] = useState("");
  const [query, setQuery] = useState(""),
    [token, setToken] = useState(""),
    [sort, setSort] = useState("chain");
  const [historyWindow, setHistoryWindow] = useState<HistoryWindow>("all");
  const [chainOnly, setChainOnly] = useState(false);
  const [activityDate, setActivityDate] = useState("");
  const [feedAuthor, setFeedAuthor] = useState("");
  const [oldest, setOldest] = useState(false);
  const [pagination, setPagination] = useState({ key: "", page: 0 });
  const [watched, setWatched] = useState<string[]>([]),
    [saved, setSaved] = useState<string[]>([]);
  const [selected, setSelected] = useState(""),
    [historyFilter, setHistoryFilter] = useState<ScoringFilter>("all");
  const [insight, setInsight] = useState(false),
    [stake, setStake] = useState(1000),
    [compare, setCompare] = useState(false);
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [backupStatus, setBackupStatus] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [deviceEnvelope, setDeviceEnvelope] = useState<string | null>(null);
  const [deviceUnlocked, setDeviceUnlocked] = useState(false);
  const [deviceUnavailable, setDeviceUnavailable] = useState(false);
  const [deviceLoading, setDeviceLoading] = useState(true);
  const [deviceSnapshot, setDeviceSnapshot] = useState("");
  useEffect(() => {
    let active = true;
    void readDeviceWorkspace().then(
      (value) => {
        if (active) {
          setDeviceEnvelope(value);
          setDeviceLoading(false);
        }
      },
      () => {
        if (active) {
          setDeviceUnavailable(true);
          setDeviceLoading(false);
        }
      },
    );
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(workspaceChannel);
    if (channel)
      channel.onmessage = (event) => {
        if (event.data?.source === workspaceSource) return;
        setDeviceUnlocked(false);
        setDeviceSnapshot("");
        void readDeviceWorkspace().then(
          (value) => {
            if (active) setDeviceEnvelope(value);
          },
          () => {
            if (active) setDeviceUnavailable(true);
          },
        );
      };
    return () => {
      active = false;
      channel?.close();
    };
  }, []);
  const methodTrigger = useRef<HTMLButtonElement | null>(null);
  const method = useRef<HTMLDialogElement>(null),
    search = useRef<HTMLInputElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    returnFocus = useRef("");
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !method.current?.open
      ) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  const scopedCalls = useMemo(
    () => windowCalls(calls, historyWindow, chainOnly),
    [historyWindow, chainOnly],
  );
  const filteredCalls = useMemo(
    () => filterCalls(scopedCalls, { token, query }),
    [scopedCalls, token, query],
  );
  const summaries = useMemo(
    () =>
      new Map(
        profiles.map((p) => [p.id, profilePerformance(p.id, filteredCalls)]),
      ),
    [filteredCalls],
  );
  const statsFor = (id: string) => summaries.get(id)!;
  const ranked = [...profiles].sort((a, b) => {
    const ap = statsFor(a.id),
      bp = statsFor(b.id);
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "recent")
      return (bp.history[0]?.publishedAt ?? "").localeCompare(
        ap.history[0]?.publishedAt ?? "",
      );
    if (sort === "chain") {
      const delta =
        chainCount(b.id, filteredCalls) - chainCount(a.id, filteredCalls);
      if (delta) return delta;
    }
    return (
      (bp.percent ?? -Infinity) - (ap.percent ?? -Infinity) ||
      a.name.localeCompare(b.name)
    );
  });
  const visibleProfiles = ranked.filter(
    (p) =>
      (view !== "watchlist" || watched.includes(p.id)) &&
      statsFor(p.id).history.length > 0,
  );
  const person = profile ? profileFor(profile) : null,
    stats = person ? statsFor(person.id) : null;
  const visibleHistory = filterCalls(filteredCalls, {
    profile: profile || (view === "feed" ? feedAuthor : ""),
    saved: view === "saved" ? saved : undefined,
    oldest: view === "feed" && oldest,
  }).filter(
    (c) =>
      (!activityDate || !profile || c.publishedAt.startsWith(activityDate)) &&
      matchesScoringFilter(c, historyFilter),
  );
  const pageKey = [
    view,
    query,
    token,
    feedAuthor,
    historyFilter,
    oldest,
    historyWindow,
    chainOnly,
    saved.join(","),
  ].join("|");
  const currentPage =
    pagination.key === pageKey
      ? Math.min(
          pagination.page,
          Math.max(0, Math.ceil(visibleHistory.length / 12) - 1),
        )
      : 0;
  const sessionSnapshot = JSON.stringify({ watched, saved });
  const unsavedDevice = deviceUnlocked && sessionSnapshot !== deviceSnapshot;
  const save = (id: string) => setSaved((prev) => toggle(prev, id));
  function openProfile(id: string) {
    returnFocus.current = `kol-profile-${id}`;
    setProfile(id);
    setSelected("");
    setQuery("");
    setToken("");
    setHistoryFilter("all");
    setInsight(false);
    setCompare(false);
    setActivityDate("");
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => heading.current?.focus());
  }
  function back() {
    setProfile("");
    setSelected("");
    setQuery("");
    setToken("");
    setHistoryFilter("all");
    setActivityDate("");
    requestAnimationFrame(() =>
      document.getElementById(returnFocus.current)?.focus(),
    );
  }
  function changeView(next: View) {
    setView(next);
    setProfile("");
    setSelected("");
    setQuery("");
    setToken("");
    setHistoryFilter("all");
    setFeedAuthor("");
    setActivityDate("");
  }
  function inspectFromBrief(id: string) {
    setHistoryFilter("all");
    setActivityDate("");
    setSelected(id);
    requestAnimationFrame(() =>
      document.getElementById(`call-${id}`)?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "center",
      }),
    );
  }
  async function saveDevice() {
    setBackupBusy(true);
    setBackupStatus("");
    try {
      const snapshot = JSON.stringify({ watched, saved });
      const encrypted = await encryptWorkspace(
        { watched, saved },
        backupPassphrase,
      );
      await writeDeviceWorkspace(encrypted, deviceEnvelope);
      setDeviceEnvelope(encrypted);
      setDeviceUnlocked(true);
      setDeviceSnapshot(snapshot);
      setBackupStatus(
        L(
          "Saved encrypted on this device. Unlock with this passphrase on your next visit.",
          "已在本设备加密保存。下次访问请使用此口令解锁。",
        ),
      );
      setBackupPassphrase("");
    } catch {
      setBackupStatus(
        L(
          "Could not save. Storage may be unavailable or another tab changed this workspace. Unlock the latest copy before saving again.",
          "无法保存。存储可能不可用，或其他标签页已修改工作区。请先解锁最新副本。",
        ),
      );
    } finally {
      setBackupBusy(false);
    }
  }
  async function unlockDevice() {
    setBackupBusy(true);
    setBackupStatus("");
    try {
      const encrypted = await readDeviceWorkspace();
      if (!encrypted) throw new Error("Missing workspace");
      const restored = await decryptWorkspace(encrypted, backupPassphrase);
      setWatched((w) => [...new Set([...w, ...restored.watched])]);
      setSaved((s) => [...new Set([...s, ...restored.saved])]);
      setDeviceSnapshot(JSON.stringify(restored));
      setDeviceEnvelope(encrypted);
      setDeviceUnlocked(true);
      setBackupPassphrase("");
      setBackupStatus(
        L(
          "Workspace unlocked. Your current selections are merged; save again to keep new changes.",
          "工作区已解锁，已合并当前选择；再次保存可保留新更改。",
        ),
      );
    } catch {
      setBackupStatus(
        L(
          "Could not unlock. Check your passphrase; your saved workspace has not changed.",
          "无法解锁。请检查口令；已存工作区没有变化。",
        ),
      );
    } finally {
      setBackupBusy(false);
    }
  }
  function exportResults() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              capturedDate,
              filters: {
                historyWindow,
                chainOnly,
                token,
                query,
                profile: feedAuthor,
                status: historyFilter,
              },
              sources: visibleHistory.map(receipt),
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "opsis-selected-sources.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function backup() {
    setBackupBusy(true);
    setBackupStatus("");
    try {
      const content = await encryptWorkspace(
        { watched, saved },
        backupPassphrase,
      );
      const url = URL.createObjectURL(
        new Blob([content], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "opsis-kol-workspace.encrypted.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupStatus(
        L(
          "Encrypted backup downloaded. Keep your passphrase to restore it.",
          "已下载加密备份，请保留口令以便恢复。",
        ),
      );
      setBackupPassphrase("");
    } catch {
      setBackupStatus(
        L(
          "Use a passphrase of 12–1,024 characters.",
          "请使用 12 至 1,024 个字符的口令。",
        ),
      );
    } finally {
      setBackupBusy(false);
    }
  }
  async function restore(file: File) {
    setBackupBusy(true);
    setBackupStatus("");
    try {
      if (file.size > 100_000) throw new Error("file too large");
      const restored = await decryptWorkspace(
        await file.text(),
        backupPassphrase,
      );
      setWatched((w) => [...new Set([...w, ...restored.watched])]);
      setSaved((s) => [...new Set([...s, ...restored.saved])]);
      setBackupStatus(
        L(
          "Watchlist and saved calls restored and merged with this session.",
          "关注列表和已存观点已恢复并合并到本次会话。",
        ),
      );
      setBackupPassphrase("");
    } catch {
      setBackupStatus(
        L(
          "Could not restore: check your passphrase and use a valid KOL backup. Your current selections are unchanged.",
          "恢复失败：请检查口令和 KOL 备份文件。当前选择未改变。",
        ),
      );
    } finally {
      setBackupBusy(false);
    }
  }
  return (
    <section className="kol-surface">
      <div className="kol-breadcrumb">
        <span>
          QUANT LAB <ChevronRight size={12} /> KOL TRACKER
        </span>
        <span>
          {L("Source edition", "来源版本")} · {capturedDate}
        </span>
      </div>
      <header className="kol-header">
        <div>
          <h1>
            KOL {L("Tracker", "追踪器")}
            <span>.</span>
          </h1>
          <p>
            {L(
              "Follow the calls. See what happened next.",
              "追踪观点，查看后续表现。",
            )}
          </p>
        </div>
        <div className="kol-header-actions">
          <button
            className="kol-outline-button"
            onClick={() => {
              const node = document.getElementById(
                "kol-device-workspace",
              ) as HTMLDetailsElement;
              node.open = true;
              node.scrollIntoView({
                block: "center",
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "instant"
                  : "smooth",
              });
              node.querySelector("summary")?.focus();
            }}
          >
            <Bookmark size={14} />
            {L("Workspace", "工作区")}
            {watched.length + saved.length > 0 && (
              <span>{watched.length + saved.length}</span>
            )}
          </button>
          <button
            className="kol-method-button"
            onClick={(e) => {
              methodTrigger.current = e.currentTarget;
              method.current?.showModal();
            }}
          >
            <Info size={16} />
            {L("How we measure", "计算方式")}
          </button>
        </div>
      </header>
      <div className="kol-coverage-bar">
        <div>
          <strong>
            {profiles.length} {L("profiles", "个账号")}
          </strong>
          <span>
            {calls.length} {L("source posts", "篇原帖")} ·{" "}
            {calls.filter((c) => c.chainTopic).length}{" "}
            {L("on Robinhood Chain", "篇关于 Robinhood Chain")}
          </span>
        </div>
        <div className="kol-coverage-controls">
          <select
            aria-label={L("History window", "历史时间范围")}
            value={historyWindow}
            onChange={(e) => {
              setHistoryWindow(e.target.value as HistoryWindow);
              setSelected("");
              setActivityDate("");
            }}
          >
            <option value="all">
              {L("All captured history", "全部已收集历史")}
            </option>
            <option value="31">{L("Last 31 days", "最近 31 天")}</option>
            <option value="90">{L("Last 90 days", "最近 90 天")}</option>
          </select>
          <button
            className={"kol-outline-button " + (chainOnly ? "active" : "")}
            aria-pressed={chainOnly}
            onClick={() => {
              setChainOnly(!chainOnly);
              setSelected("");
              setActivityDate("");
            }}
          >
            {L("Robinhood Chain only", "仅 Robinhood Chain")}
          </button>
        </div>
      </div>
      {!person ? (
        <>
          <div className="kol-toolbar">
            <nav aria-label={L("KOL Tracker views", "KOL 追踪视图")}>
              {(
                [
                  ["all", "All KOLs", "全部 KOL"],
                  ["feed", "Call feed", "观点动态"],
                  ["moves", "Token moves", "代币走势"],
                  ["compare", "Compare", "比较"],
                  ["watchlist", "Watchlist", "关注列表"],
                  ["saved", "Saved calls", "已存观点"],
                ] as const
              ).map(([id, en, zh]) => (
                <button
                  key={id}
                  id={`kol-tab-${id}`}
                  onClick={() => changeView(id)}
                  aria-current={view === id ? "page" : undefined}
                >
                  {L(en, zh)}
                  {id === "watchlist" && watched.length > 0 && (
                    <span>{watched.length}</span>
                  )}
                  {id === "saved" && saved.length > 0 && (
                    <span>{saved.length}</span>
                  )}
                </button>
              ))}
            </nav>
            <div className="kol-filter-controls">
              <label className="kol-search">
                <Search size={16} />
                <input
                  ref={search}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label={L("Search KOL or token", "搜索 KOL 或代币")}
                  placeholder={L("Search KOL or token", "搜索 KOL 或代币")}
                />
                <kbd>/</kbd>
              </label>
              <select
                value={token}
                onChange={(e) => setToken(e.target.value)}
                aria-label={L("Filter token", "筛选代币")}
              >
                <option value="">{L("All coins", "全部代币")}</option>
                {tokens.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          {(view === "all" || view === "feed") && (
            <ScoringSummary
              items={filteredCalls.filter(
                (c) =>
                  view !== "feed" || !feedAuthor || c.profile === feedAuthor,
              )}
              active={historyFilter}
              onSelect={(filter) => {
                setView("feed");
                setHistoryFilter(filter);
                setSelected("");
              }}
              L={L}
            />
          )}
          {view === "moves" ? (
            <PriceContextPanel items={filteredCalls} L={L} />
          ) : view === "compare" ? (
            <ComparePanel items={filteredCalls} onOpen={openProfile} L={L} />
          ) : view !== "saved" && view !== "feed" ? (
            <div className="kol-board">
              <div className="kol-section-heading">
                <div>
                  <h2>
                    {view === "watchlist"
                      ? L("Your watchlist", "你的关注列表")
                      : L("The research leaderboard", "研究排行榜")}
                  </h2>
                  <p>
                    {L(
                      "Robinhood coverage first · seven-day paper results where measurable",
                      "优先 Robinhood 覆盖 · 可衡量观点的七日模拟结果",
                    )}{" "}
                    · {L("$1,000 paper stake", "模拟本金 $1,000")}
                  </p>
                </div>
                <label className="kol-sort">
                  <span>{L("Sort", "排序")}</span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    aria-label={L("Sort KOLs", "KOL 排序")}
                  >
                    <option value="chain">
                      {L("Robinhood coverage", "Robinhood 覆盖")}
                    </option>
                    <option value="return">{L("7D return", "7 日收益")}</option>
                    <option value="recent">
                      {L("Latest post", "最新发帖")}
                    </option>
                    <option value="name">{L("Name", "名称")}</option>
                  </select>
                </label>
              </div>
              <div
                className="kol-leader-table"
                role="table"
                aria-label={L(
                  "KOL seven-day call performance",
                  "KOL 七日观点表现",
                )}
              >
                <div className="kol-leader-head" role="row">
                  <span role="columnheader">KOL</span>
                  <span role="columnheader">
                    {L("Avg. 7D call P&L", "平均 7 日模拟盈亏")}
                  </span>
                  <span role="columnheader">
                    {L("Positive calls", "正收益观点")}
                  </span>
                  <span role="columnheader">
                    {L("Coins mentioned", "提及代币")}
                  </span>
                  <span role="columnheader">
                    {L("Latest post", "最新发帖")}
                  </span>
                  <span role="columnheader" className="sr-only">
                    {L("Actions", "操作")}
                  </span>
                </div>
                {visibleProfiles.map((p) => {
                  const s = statsFor(p.id),
                    pts = [...new Set(s.history.flatMap((c) => c.tokens))];
                  return (
                    <div
                      className="kol-leader-row"
                      role="row"
                      key={p.id}
                      data-kol={p.id}
                    >
                      <div role="cell" className="kol-leader-identity">
                        <span className="kol-rank">
                          {String(
                            ranked.findIndex((x) => x.id === p.id) + 1,
                          ).padStart(2, "0")}
                        </span>
                        <button
                          id={`kol-profile-${p.id}`}
                          className="kol-profile-button"
                          onClick={() => openProfile(p.id)}
                          aria-label={L("View ", "查看 ") + p.name}
                        >
                          <Avatar profile={p} />
                          <span>
                            <strong>{p.name}</strong>
                            <small>@{p.handle}</small>
                            {chainCount(p.id, scopedCalls) > 0 && (
                              <small className="kol-chain-badge">
                                RH · {chainCount(p.id, scopedCalls)}{" "}
                                {L("posts", "篇")}
                              </small>
                            )}
                          </span>
                        </button>
                      </div>
                      <div role="cell" className="kol-leader-pnl">
                        <button
                          onClick={() => openProfile(p.id)}
                          aria-label={
                            L("View performance for ", "查看表现 ") + p.name
                          }
                        >
                          <strong className={tone(s.percent)}>
                            {s.percent === null ? (
                              <span className="kol-coverage-only">
                                {L("Coverage only", "仅内容覆盖")}
                              </span>
                            ) : (
                              formatMoney(paperPnl(s.percent, 1000))
                            )}
                          </strong>
                          <small className={tone(s.percent)}>
                            {s.percent === null
                              ? L("No scored calls", "暂无评分观点")
                              : formatPercent(s.percent)}{" "}
                            {s.percent !== null && (
                              <span>{L("average return", "平均收益")}</span>
                            )}
                          </small>
                        </button>
                      </div>
                      <div role="cell" className="kol-leader-count">
                        <strong>
                          {s.complete.length ? s.positive : "—"}
                          <span> / {s.complete.length}</span>
                        </strong>
                        <small>
                          {s.complete.length} {L("scored", "已评分")} ·{" "}
                          {s.history.length}{" "}
                          {L("posts tracked", "篇已收集帖子")}
                        </small>
                      </div>
                      <div role="cell" className="kol-row-tokens">
                        {pts.length === 0 && (
                          <small className="kol-muted">
                            {L("Ecosystem", "生态")}
                          </small>
                        )}
                        {pts.slice(0, 3).map((t) => (
                          <button
                            key={t}
                            onClick={() => {
                              setView("feed");
                              setToken(t);
                              setSelected("");
                            }}
                            aria-label={L("Explore ", "探索 ") + t}
                          >
                            {t}
                          </button>
                        ))}
                        {pts.length > 3 && <span>+{pts.length - 3}</span>}
                      </div>
                      <div role="cell" className="kol-latest-date">
                        <time dateTime={s.history[0].date}>
                          {dateLabel(s.history[0].date)}
                        </time>
                        <small>
                          {s.pending
                            ? `${s.pending} ${L("awaiting 7D", "等待七天")}`
                            : L("History available", "可查看历史")}
                        </small>
                      </div>
                      <div role="cell" className="kol-row-actions">
                        <button
                          className={
                            "kol-icon " +
                            (watched.includes(p.id) ? "active" : "")
                          }
                          onClick={() => setWatched((w) => toggle(w, p.id))}
                          aria-label={L("Watch ", "关注 ") + p.name}
                          aria-pressed={watched.includes(p.id)}
                        >
                          <Star
                            size={17}
                            fill={
                              watched.includes(p.id) ? "currentColor" : "none"
                            }
                          />
                        </button>
                        <button
                          className="kol-icon"
                          onClick={() => openProfile(p.id)}
                          aria-label={L("Open ", "打开 ") + p.name}
                        >
                          <ArrowRight size={18} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {visibleProfiles.length === 0 && (
                <div className="kol-empty">
                  <UserRound size={25} />
                  <h3>
                    {view === "watchlist" && !watched.length
                      ? L("Your shortlist starts here", "从这里创建关注列表")
                      : L("No matching KOLs", "没有匹配的 KOL")}
                  </h3>
                  <p>
                    {view === "watchlist" && !watched.length
                      ? L(
                          "Star a KOL to start a shortlist. Use Workspace to keep it between visits.",
                          "为 KOL 加星以创建精选列表。使用工作区保留以供下次访问。",
                        )
                      : L(
                          "Try a name, handle or another coin.",
                          "尝试名称、账号或其他代币。",
                        )}
                  </p>
                  <button
                    className="kol-text-button"
                    onClick={() => changeView("all")}
                  >
                    {L("Show all KOLs", "显示全部 KOL")}
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
              <footer className="kol-board-footer">
                <span>
                  {L("In this view", "当前视图")} · {visibleProfiles.length}{" "}
                  KOLs · {filteredCalls.length} {L("posts", "帖子")} ·{" "}
                  {
                    filteredCalls.filter(
                      (c) => callPerformance(c).percent !== null,
                    ).length
                  }{" "}
                  {L("complete calls", "完整观点")}
                </span>
                <span>
                  {L(
                    "Paper performance · no verified wallet P&L",
                    "模拟表现 · 无核验钱包盈亏",
                  )}
                </span>
              </footer>
            </div>
          ) : (
            <div className="kol-board">
              <div className="kol-section-heading">
                <div>
                  <h2>
                    {view === "feed"
                      ? L("Every call, with the context", "每条观点及其背景")
                      : L("Saved source receipts", "已保存来源记录")}
                  </h2>
                  <p>
                    {L(
                      view === "feed"
                        ? "Search the archive, narrow a thesis, then inspect its evidence."
                        : "Your research shortlist. Save an encrypted workspace below to keep it.",
                      view === "feed"
                        ? "搜索档案、筛选论点，再核验其证据。"
                        : "你的研究精选。请在下方加密保存工作区以便保留。",
                    )}
                  </p>
                </div>
                <button
                  className="kol-outline-button"
                  disabled={!visibleHistory.length}
                  onClick={exportResults}
                >
                  <Download size={14} />
                  {L("Export sources", "导出来源")}
                </button>
              </div>
              <div className="kol-feed-filters">
                {view === "feed" && (
                  <select
                    value={feedAuthor}
                    onChange={(e) => {
                      setFeedAuthor(e.target.value);
                      setSelected("");
                    }}
                    aria-label={L("Filter feed author", "筛选动态作者")}
                  >
                    <option value="">{L("All authors", "所有作者")}</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  value={historyFilter}
                  onChange={(e) => {
                    setHistoryFilter(e.target.value as ScoringFilter);
                    setSelected("");
                  }}
                  aria-label={L("Filter feed status", "筛选动态状态")}
                >
                  <option value="all">{L("All posts", "全部帖子")}</option>
                  <option value="eligible">
                    {L("Eligible calls", "符合条件的观点")}
                  </option>
                  <option value="scored">
                    {L("Scored calls", "已评分观点")}
                  </option>
                  <option value="pending">
                    {L("Awaiting results", "等待结果")}
                  </option>
                  <option value="unscored">
                    {L("Unscored posts", "未评分帖子")}
                  </option>
                  <option value="unavailable">
                    {L("Missing price evidence", "缺少价格证据")}
                  </option>
                </select>
                {view === "feed" && (
                  <select
                    value={oldest ? "oldest" : "newest"}
                    onChange={(e) => {
                      setOldest(e.target.value === "oldest");
                      setSelected("");
                    }}
                    aria-label={L("Feed order", "动态排序")}
                  >
                    <option value="newest">
                      {L("Newest first", "最新优先")}
                    </option>
                    <option value="oldest">
                      {L("Oldest first", "最早优先")}
                    </option>
                  </select>
                )}
                <span role="status">
                  {visibleHistory.length} {L("matching sources", "个匹配来源")}
                </span>
              </div>
              {visibleHistory.length ? (
                <HistoryList
                  items={visibleHistory.slice(
                    currentPage * 12,
                    (currentPage + 1) * 12,
                  )}
                  selected={selected}
                  onSelect={setSelected}
                  saved={saved}
                  onSave={save}
                  stake={1000}
                  showAuthor
                  L={L}
                />
              ) : (
                <div className="kol-empty">
                  <Bookmark size={25} />
                  <h3>
                    {view === "feed"
                      ? L("No matching sources", "没有匹配来源")
                      : L("No saved calls in this view", "当前视图无已存观点")}
                  </h3>
                  <p>
                    {L(
                      view === "feed"
                        ? "Clear a filter or try a different coin."
                        : "Open a call and save its source receipt, or clear your filters.",
                      "请清除筛选，或打开观点并保存来源记录。",
                    )}
                  </p>
                  <button
                    className="kol-text-button"
                    onClick={() => {
                      setQuery("");
                      setToken("");
                      setFeedAuthor("");
                      setHistoryFilter("all");
                      setHistoryWindow("all");
                      setChainOnly(false);
                    }}
                  >
                    {L("Clear filters", "清除筛选")}
                  </button>
                </div>
              )}
              {visibleHistory.length > 12 && (
                <div className="kol-pagination">
                  <span>
                    {currentPage * 12 + 1}–
                    {Math.min((currentPage + 1) * 12, visibleHistory.length)} /{" "}
                    {visibleHistory.length}
                  </span>
                  <button
                    className="kol-outline-button"
                    disabled={currentPage === 0}
                    onClick={() => {
                      setPagination({ key: pageKey, page: currentPage - 1 });
                      setSelected("");
                    }}
                  >
                    {L("Previous", "上一页")}
                  </button>
                  <button
                    className="kol-outline-button"
                    disabled={(currentPage + 1) * 12 >= visibleHistory.length}
                    onClick={() => {
                      setPagination({ key: pageKey, page: currentPage + 1 });
                      setSelected("");
                    }}
                  >
                    {L("Next", "下一页")}
                  </button>
                </div>
              )}
            </div>
          )}
          {view === "all" && (
            <section className="kol-recent">
              <div className="kol-section-heading">
                <div>
                  <h2>{L("Latest from the watch desk", "最新观点")}</h2>
                  <p>
                    {L(
                      "Start with a statement. Open it for the context.",
                      "从观点出发，点击查看背景。",
                    )}
                  </p>
                </div>
                <button
                  className="kol-text-button"
                  onClick={() => changeView("feed")}
                >
                  {L("Explore all calls", "浏览全部观点")}
                  <ArrowRight size={14} />
                </button>
              </div>
              <HistoryList
                items={filteredCalls.slice(0, 3)}
                selected={selected}
                onSelect={setSelected}
                saved={saved}
                onSave={save}
                stake={1000}
                showAuthor
                L={L}
              />
            </section>
          )}
        </>
      ) : (
        stats && (
          <div className="kol-profile-view">
            <button className="kol-back" onClick={back}>
              <ArrowLeft size={16} />
              {L("All KOLs", "全部 KOL")}
            </button>
            <div className="kol-profile-header">
              <Avatar profile={person} large />
              <div>
                <h2 ref={heading} tabIndex={-1}>
                  {person.name}
                </h2>
                <SourceLink href={person.url}>@{person.handle}</SourceLink>
              </div>
              <div className="kol-profile-header-actions">
                <button
                  className={
                    "kol-outline-button " +
                    (watched.includes(person.id) ? "active" : "")
                  }
                  onClick={() => setWatched((w) => toggle(w, person.id))}
                  aria-pressed={watched.includes(person.id)}
                >
                  {watched.includes(person.id) ? (
                    <Check size={16} />
                  ) : (
                    <Star size={16} />
                  )}
                  {watched.includes(person.id)
                    ? L("Watching", "已关注")
                    : L("Watch KOL", "关注 KOL")}
                </button>
                <button
                  className="kol-ai-button"
                  onClick={() => setInsight(!insight)}
                  aria-expanded={insight}
                >
                  <Sparkles size={16} />
                  {L("Opsis brief", "Opsis 简报")}
                </button>
              </div>
            </div>
            <div className="kol-profile-coverage">
              <span>
                {L("Selected archive", "选定档案")}:{" "}
                {dateLabel(person.firstPostAt)} – {dateLabel(person.lastPostAt)}{" "}
                · {person.spanDays} {L("day span", "天跨度")} ·{" "}
                {person.postCount} {L("posts", "篇帖子")}
              </span>
              <span>
                {person.chainPostCount}{" "}
                {L("Robinhood Chain posts", "篇 Robinhood Chain 帖子")} ·{" "}
                {person.activeDays} {L("dates represented", "个发帖日期")}
              </span>
              {person.affiliation && (
                <span>
                  {L(
                    "Builder affiliation: discusses own ecosystem products.",
                    "开发者关联：讨论自己的生态产品。",
                  )}
                </span>
              )}
              <small>
                {L(
                  "Selected posts, not a complete daily archive. Metrics below follow your date, chain and coin filters.",
                  "选定帖子，非完整每日档案。下方指标遵循日期、公链和代币筛选。",
                )}
              </small>
            </div>
            {stats.percent !== null ? (
              <div className="kol-profile-metrics">
                <div>
                  <span>{L("7D call return", "7 日观点收益")}</span>
                  <strong className={tone(stats.percent)}>
                    {formatPercent(stats.percent)}
                  </strong>
                  <small>
                    {stats.percent === null
                      ? L(
                          "No scored calls in this selection",
                          "本次筛选暂无评分观点",
                        )
                      : L("Average after publication", "发帖后的平均表现")}
                  </small>
                </div>
                <div>
                  <span>{L("Paper P&L / call", "每条观点模拟盈亏")}</span>
                  <strong className={tone(stats.percent)}>
                    {stats.percent === null
                      ? "—"
                      : formatMoney(paperPnl(stats.percent, stake))}
                  </strong>
                  <small>
                    {L("On a ", "按 ")}${stake.toLocaleString()}
                    {L(" paper stake", " 模拟本金")}
                  </small>
                </div>
                <div>
                  <span>{L("Positive calls", "正收益观点")}</span>
                  <strong>
                    {stats.positive}
                    <em> / {stats.complete.length}</em>
                  </strong>
                  <small>
                    {L("Completed 7-day observations", "完整七日观察")}
                  </small>
                </div>
                <div>
                  <span>{L("Scored calls", "已评分观点")}</span>
                  <strong>{stats.complete.length}</strong>
                  <small>
                    {stats.pending} {L("pending", "观察中")} ·{" "}
                    {stats.excluded + stats.unavailable}{" "}
                    {L("unscored", "未评分")}
                  </small>
                </div>
              </div>
            ) : (
              <div className="kol-profile-metrics">
                <div>
                  <span>{L("7D call return", "7 日观点收益")}</span>
                  <strong>—</strong>
                  <small>
                    {L(
                      "No scored calls in this selection",
                      "本次筛选暂无评分观点",
                    )}
                  </small>
                </div>
                <div>
                  <span>{L("Posts tracked", "已收集帖子")}</span>
                  <strong>{stats.history.length}</strong>
                  <small>
                    {L("Original, timestamped X posts", "带时间戳的 X 原帖")}
                  </small>
                </div>
                <div>
                  <span>{L("Robinhood coverage", "Robinhood 覆盖")}</span>
                  <strong>
                    {stats.history.filter((c) => c.chainTopic).length}
                  </strong>
                  <small>
                    {L("Explicit chain discussion", "明确讨论公链")}
                  </small>
                </div>
                <div>
                  <span>{L("Active dates", "活动日期")}</span>
                  <strong>
                    {new Set(stats.history.map((c) => c.date)).size}
                  </strong>
                  <small>
                    {L(
                      "Dates represented in this selection",
                      "当前筛选涵盖的发帖日期",
                    )}
                  </small>
                </div>
              </div>
            )}
            <ScoringSummary
              items={stats.history.filter(
                (c) => !activityDate || c.publishedAt.startsWith(activityDate),
              )}
              active={historyFilter}
              onSelect={(filter) => {
                setHistoryFilter(filter);
                setSelected("");
                requestAnimationFrame(() =>
                  document
                    .querySelector(".kol-profile-history")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                );
              }}
              L={L}
            />
            {insight && (
              <ResearchBrief
                items={stats.history}
                name={person.name}
                onInspect={inspectFromBrief}
                L={L}
              />
            )}
            <CoveragePanel
              items={stats.history}
              date={activityDate}
              token={token}
              onDate={(date) => {
                setActivityDate(date);
                setSelected("");
              }}
              onToken={(token) => {
                setToken(token);
                setActivityDate("");
                setSelected("");
              }}
              L={L}
            />
            {stats.curve ? (
              <section className="kol-performance-panel">
                <div className="kol-section-heading">
                  <div>
                    <h3>
                      {L("What happened after the call", "发帖之后发生了什么")}
                    </h3>
                    <p>
                      {L(
                        "Average price change · day 0 to day 7 after publication",
                        "平均价格变化 · 发布后第 0 天至第 7 天",
                      )}
                    </p>
                  </div>
                  <div className="kol-chart-controls">
                    <button
                      className={
                        "kol-outline-button " + (compare ? "active" : "")
                      }
                      onClick={() => setCompare(!compare)}
                      aria-pressed={compare}
                    >
                      {L("Compare KOLs", "比较 KOL")}
                    </button>
                    <label>
                      {L("Paper stake", "模拟本金")}
                      <select
                        value={stake}
                        onChange={(e) => setStake(Number(e.target.value))}
                        aria-label={L(
                          "Paper stake per call",
                          "每条观点模拟本金",
                        )}
                      >
                        <option value={100}>$100</option>
                        <option value={1000}>$1,000</option>
                        <option value={10000}>$10,000</option>
                      </select>
                    </label>
                  </div>
                </div>
                {compare ? (
                  <ComparePanel
                    key={person.id}
                    items={filteredCalls}
                    initial={[person.id]}
                    onOpen={openProfile}
                    L={L}
                  />
                ) : (
                  <Suspense
                    fallback={
                      <div className="kol-chart-loading">
                        {L("Loading observations…", "正在加载观测…")}
                      </div>
                    }
                  >
                    <PerformanceChart
                      series={
                        stats.curve
                          ? [{ name: person.name, values: stats.curve }]
                          : []
                      }
                      label={L(
                        "Average seven-day call return, normalized by days after publication",
                        "按发布后天数归一化的平均七日观点收益",
                      )}
                    />
                  </Suspense>
                )}
                <div className="kol-chart-note">
                  <span>
                    {L(
                      compare
                        ? "Up to 3 profiles · same filters · equal call weights · gross of costs"
                        : "Different publication dates · equal call weights · gross of costs",
                      "发布日期不同 · 观点等权 · 未扣除成本",
                    )}
                  </span>
                  <button
                    className="kol-text-button"
                    onClick={(e) => {
                      methodTrigger.current = e.currentTarget;
                      method.current?.showModal();
                    }}
                  >
                    {L("Methodology", "计算方法")}
                    <ArrowUpRight size={13} />
                  </button>
                </div>
              </section>
            ) : (
              <div className="kol-no-score">
                <Info size={18} />
                <div>
                  <strong>
                    {L(
                      "Coverage without a performance score",
                      "内容覆盖暂无表现评分",
                    )}
                  </strong>
                  <p>
                    {L(
                      "Explore the reporting and original sources below. No complete seven-day price observations are available for this selection.",
                      "在下方查看报道和原始来源。本次筛选暂无完整七日价格观察。",
                    )}
                  </p>
                </div>
                <button
                  className="kol-text-button"
                  onClick={() => {
                    changeView("compare");
                  }}
                >
                  {L("Compare coverage", "比较覆盖")}
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
            <section className="kol-profile-history">
              <div className="kol-section-heading">
                <div>
                  <h3>{L("Call history", "观点历史")}</h3>
                  <p>
                    {L(
                      "Selected source posts, with a separate status for every call.",
                      "选定来源帖子，每条观点均显示独立状态。",
                    )}
                  </p>
                </div>
                <div className="kol-history-controls">
                  <select
                    value={token}
                    onChange={(e) => {
                      setToken(e.target.value);
                      setSelected("");
                    }}
                    aria-label={L("Filter profile coins", "筛选个人代币")}
                  >
                    <option value="">{L("All coins", "全部代币")}</option>
                    {[
                      ...new Set(
                        calls
                          .filter((c) => c.profile === person.id)
                          .flatMap((c) => c.tokens),
                      ),
                    ].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  <select
                    value={historyFilter}
                    onChange={(e) => {
                      setHistoryFilter(e.target.value as ScoringFilter);
                      setSelected("");
                    }}
                    aria-label={L("Filter call status", "筛选观点状态")}
                  >
                    <option value="all">{L("All posts", "全部帖子")}</option>
                    <option value="eligible">
                      {L("Eligible calls", "符合条件的观点")}
                    </option>
                    <option value="scored">
                      {L("Scored calls", "已评分观点")}
                    </option>
                    <option value="pending">
                      {L("Awaiting results", "等待结果")}
                    </option>
                    <option value="unscored">
                      {L("Unscored posts", "未评分帖子")}
                    </option>
                    <option value="unavailable">
                      {L("Missing price evidence", "缺少价格证据")}
                    </option>
                  </select>
                </div>
              </div>
              {activityDate && (
                <div className="kol-date-filter">
                  <span>
                    {L("History on", "历史日期")} {activityDate} UTC
                  </span>
                  <button
                    className="kol-text-button"
                    onClick={() => setActivityDate("")}
                  >
                    {L("Clear date", "清除日期")}
                    <X size={13} />
                  </button>
                </div>
              )}
              {visibleHistory.length ? (
                <HistoryList
                  items={visibleHistory}
                  selected={selected}
                  onSelect={setSelected}
                  saved={saved}
                  onSave={save}
                  stake={stake}
                  L={L}
                />
              ) : (
                <div className="kol-empty">
                  <h3>{L("No calls in this view", "此视图没有观点")}</h3>
                  <button
                    className="kol-text-button"
                    onClick={() => {
                      setToken("");
                      setActivityDate("");
                      setHistoryFilter("all");
                      setHistoryWindow("all");
                      setChainOnly(false);
                    }}
                  >
                    {L("Show all posts", "显示全部帖子")}
                  </button>
                </div>
              )}
            </section>
          </div>
        )
      )}
      <details className="kol-backup" id="kol-device-workspace">
        <summary>
          {L("Research workspace", "研究工作区")} ·{" "}
          {deviceEnvelope
            ? deviceUnlocked
              ? L("Unlocked", "已解锁")
              : L("Encrypted copy on this device", "本设备有加密副本")
            : L("Keep your watchlist & receipts", "保留关注列表及记录")}{" "}
          {unsavedDevice ? L("· Unsaved changes", "· 有未保存更改") : ""}
        </summary>
        <p>
          {L(
            "Save encrypted on this device to keep your watchlist and receipts across visits, or download a portable backup. Use a passphrase of at least 12 characters; you need it to unlock again. New changes require Save. Nothing is uploaded.",
            "在本设备加密保存关注列表和记录，或下载便携备份。口令至少 12 个字符，下次解锁仍需使用。新更改需要点击保存。不会上传数据。",
          )}
        </p>
        <div className="kol-backup-form">
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={1024}
            aria-label={L("Backup passphrase", "备份口令")}
            placeholder={L(
              "Passphrase · at least 12 characters",
              "口令 · 至少 12 个字符",
            )}
            value={backupPassphrase}
            onChange={(e) => setBackupPassphrase(e.target.value)}
          />
          {deviceEnvelope && !deviceUnlocked ? (
            <button
              className="kol-ai-button"
              disabled={
                backupBusy ||
                deviceLoading ||
                backupPassphrase.length < 12 ||
                deviceUnavailable
              }
              onClick={unlockDevice}
            >
              {L("Unlock saved workspace", "解锁已存工作区")}
            </button>
          ) : (
            <button
              className="kol-ai-button"
              disabled={
                backupBusy ||
                deviceLoading ||
                backupPassphrase.length < 12 ||
                deviceUnavailable
              }
              onClick={saveDevice}
            >
              {L("Save on this device", "保存在本设备")}
            </button>
          )}
          {deviceUnlocked && (
            <button
              className="kol-outline-button"
              disabled={backupBusy}
              onClick={() => {
                setWatched([]);
                setSaved([]);
                setDeviceUnlocked(false);
                setDeviceSnapshot("");
                setBackupPassphrase("");
                setBackupStatus(
                  L(
                    "Locked. The encrypted copy stays on this device.",
                    "已锁定。加密副本仍保留在本设备。",
                  ),
                );
              }}
            >
              {unsavedDevice
                ? L("Lock without saving changes", "锁定且不保存更改")
                : L("Lock workspace", "锁定工作区")}
            </button>
          )}
          <button
            className="kol-outline-button"
            disabled={backupBusy || backupPassphrase.length < 12}
            onClick={backup}
          >
            {L("Download backup", "下载备份")}
          </button>
          <input
            type="file"
            aria-label={L("Restore encrypted backup", "恢复加密备份")}
            accept="application/json,.json"
            disabled={backupBusy || backupPassphrase.length < 12}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void restore(file);
            }}
          />
        </div>
        {deviceUnavailable && (
          <p>
            {L(
              "Browser storage is unavailable. You can still download and restore encrypted files.",
              "浏览器存储不可用，仍可下载及恢复加密文件。",
            )}
          </p>
        )}
        {unsavedDevice && (
          <p>
            {L(
              "Save your changes or download a backup before locking.",
              "锁定前请保存更改或下载备份。",
            )}
          </p>
        )}
        <p role="status">{backupStatus}</p>
      </details>
      <footer className="kol-page-footer">
        <span>
          {L(
            "Real profiles. Original posts. Inspectable calculations.",
            "真实账号、原始帖子、可核验计算。",
          )}
        </span>
        <span>
          {L("Selected history · not a live feed", "选定历史 · 非实时信息流")}
        </span>
      </footer>
      <dialog
        ref={method}
        className="kol-method-dialog"
        onClose={() => methodTrigger.current?.focus()}
        aria-labelledby="kol-method-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) method.current?.close();
        }}
      >
        <div className="kol-dialog-heading">
          <div>
            <small>
              {L("THE RECEIPTS BEHIND THE NUMBER", "数字背后的记录")}
            </small>
            <h2 id="kol-method-title">
              {L("How 7-day performance works", "七日表现如何计算")}
            </h2>
          </div>
          <button
            className="kol-icon"
            aria-label={L("Close methodology", "关闭计算方法")}
            onClick={() => method.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <MethodContent L={L} />
      </dialog>
    </section>
  );
}

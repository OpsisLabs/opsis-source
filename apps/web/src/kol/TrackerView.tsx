import {
  lazy,
  Suspense,
  useEffect,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  Clock3,
  Download,
  ExternalLink,
  Globe2,
  Info,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  X,
  UserRound,
  Plus,
  ListFilter,
  Network,
  History,
} from "lucide-react";
import { useI18n } from "../i18n";
import {
  calls,
  profiles,
  tokens,
  capturedDate,
  filterCalls,
  outcome,
  profileFor,
  receipt,
  tokenCoverage,
  type Call,
  type Profile,
} from "./model";
const CallTimeline = lazy(() => import("./CallTimeline"));
import "./kol.css";

type Tab = "Feed" | "KOLs" | "Coins" | "Timeline" | "Compare" | "Saved";
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
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="kol-source-link"
    >
      {children}
      <ArrowUpRight size={13} />
    </a>
  );
}
const dateLabel = (date: string) =>
  new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const toggle = (items: string[], id: string) =>
  items.includes(id) ? items.filter((i) => i !== id) : [...items, id];

function CallCard({
  call,
  L,
  selected,
  saved,
  save,
  selectProfile,
  inspect,
}: {
  call: Call;
  L: (en: string, zh: string) => string;
  selected: Call;
  saved: string[];
  save: (call: Call) => void;
  selectProfile: (id: string) => void;
  inspect: (call: Call) => void;
}) {
  const p = profileFor(call.profile);
  return (
    <article
      className={"kol-call " + (call.id === selected.id ? "selected" : "")}
      data-call-id={call.id}
    >
      <div className="kol-call-top">
        <button
          className="kol-author"
          onClick={() => selectProfile(p.id)}
          aria-label={L("Filter " + p.name, "筛选 " + p.name)}
        >
          <Avatar profile={p} />
          <span>
            <strong>{p.name}</strong>
            <span className="kol-handle">@{p.handle}</span>
          </span>
        </button>
        <time dateTime={call.date}>{dateLabel(call.date)}</time>
        <button
          className={"kol-icon " + (saved.includes(call.id) ? "active" : "")}
          aria-pressed={saved.includes(call.id)}
          aria-label={L("Save receipt " + call.id, "保存记录 " + call.id)}
          onClick={() => save(call)}
        >
          <Bookmark
            size={16}
            fill={saved.includes(call.id) ? "currentColor" : "none"}
          />
        </button>
      </div>
      <button
        className="kol-call-body"
        onClick={() => inspect(call)}
        aria-label={L("Inspect call " + call.id, "查看记录 " + call.id)}
      >
        <div className="kol-token-list">
          {call.tokens.map((t) => (
            <span className="kol-token" key={t}>
              {t}
            </span>
          ))}
        </div>
        <p>
          {call.id === "2097697759365116405"
            ? "“$100K+ by the end of September.”"
            : call.summary}
        </p>
      </button>
      <div className="kol-call-foot">
        <span className={"kol-badge " + (call.target ? "amber" : "mint")}>
          {call.type}
        </span>
        <span className="kol-deadline">
          {call.deadline
            ? L("Due ", "截止 ") + dateLabel(call.deadline)
            : L("No fixed deadline", "无固定期限")}
        </span>
        <SourceLink href={call.url}>{L("Open post", "原帖")}</SourceLink>
        <button
          className="kol-inspect-link"
          onClick={() => inspect(call)}
          aria-label={L("Inspect source " + call.id, "查看来源 " + call.id)}
        >
          <ArrowRight size={15} />
        </button>
      </div>
    </article>
  );
}

export default function Tracker() {
  const { locale } = useI18n();
  const L = (en: string, zh: string) => (locale === "zh-CN" ? zh : en);
  const [tab, setTab] = useState<Tab>("Feed");
  const [who, setWho] = useState("");
  const [token, setToken] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [oldest, setOldest] = useState(false);
  const [selected, setSelected] = useState<Call>(
    calls.find((c) => c.id === "2097697759365116405")!,
  );
  const [saved, setSaved] = useState<string[]>([]);
  const [watched, setWatched] = useState<string[]>(profiles.map((p) => p.id));
  const [insight, setInsight] = useState(false);
  const [notice, setNotice] = useState("");
  const [manageQuery, setManageQuery] = useState("");
  const manage = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement) &&
        !manage.current?.open
      ) {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);
  const compareCalls = calls.filter((c) => c.target && c.deadline);
  const person = profileFor(selected.profile);
  const visible = filterCalls(calls, {
    profile: who,
    token,
    query,
    type,
    saved: tab === "Saved" ? saved : undefined,
    oldest,
  });
  const inspect = useCallback((call: Call) => {
    setSelected(call);
    setInsight(false);
  }, []);
  const selectProfile = (id: string) => {
    setWho(who === id ? "" : id);
    setToken("");
    setQuery("");
    setType("");
    setTab("Feed");
    const call = calls.find((c) => c.profile === id);
    if (call) inspect(call);
  };
  const selectCoin = (symbol: string) => {
    setToken(symbol === token ? "" : symbol);
    setWho("");
    setQuery("");
    setType("");
    if (tab !== "Coins" && tab !== "Timeline") setTab("Feed");
  };
  const reset = () => {
    setWho("");
    setToken("");
    setQuery("");
    setType("");
    setOldest(false);
  };
  const save = (call: Call) => {
    setSaved((s) => toggle(s, call.id));
    setNotice(
      saved.includes(call.id)
        ? L("Receipt removed", "已移除记录")
        : L("Receipt saved for this session", "本次会话中已保存"),
    );
  };
  const exportCall = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(receipt(selected), null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "chainscout-call-" + selected.id + ".json";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(L("Source receipt downloaded", "已下载来源记录"));
  };
  return (
    <div className="kol-surface">
      <div className="kol-breadcrumb">
        <span>
          <Globe2 size={13} /> QUANT LAB <ArrowRight size={11} /> KOL TRACKER
        </span>
        <span>{L("SOURCE EDITION", "来源版本")} · 10 SEP 2026</span>
      </div>
      <header className="kol-header">
        <div>
          <h1>
            {L("KOL Tracker", "KOL 追踪器")}
            <span>.</span>
          </h1>
          <p>
            {L(
              "The timeline behind the conviction.",
              "洞察每一份观点背后的时间线。",
            )}
          </p>
        </div>
        <div className="kol-header-actions">
          <label className="kol-search">
            <Search size={16} />
            <input
              ref={searchInput}
              aria-label={L("Search KOL or token", "搜索 KOL 或代币")}
              placeholder={L("Search @handle or token…", "搜索账号或代币…")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setTab("Feed");
              }}
            />
            <kbd>/</kbd>
          </label>
          <button
            className="kol-primary"
            onClick={() => {
              setManageQuery("");
              manage.current?.showModal();
            }}
          >
            <Plus size={17} />
            {L("Watch KOL", "关注 KOL")}
          </button>
        </div>
      </header>
      <nav
        className="kol-tabs"
        aria-label={L("KOL Tracker views", "KOL 追踪视图")}
      >
        {(
          ["Feed", "KOLs", "Coins", "Timeline", "Compare", "Saved"] as Tab[]
        ).map((t, i) => (
          <button
            key={t}
            id={"kol-tab-" + t.toLowerCase()}
            aria-pressed={tab === t}
            onClick={() => {
              setTab(t);
              reset();
            }}
          >
            {
              [
                L("Feed", "动态"),
                "KOLs",
                L("Coins", "代币"),
                L("Timeline", "时间线"),
                L("Compare", "比较"),
                L("Saved", "已保存"),
              ][i]
            }
            {t === "Saved" && saved.length > 0 && (
              <span className="kol-counter">{saved.length}</span>
            )}
          </button>
        ))}
        <span className="kol-coverage">
          <ShieldCheck size={13} />
          {L("13 reviewed posts · 3 KOLs", "13 条已审阅帖子 · 3 位 KOL")}
        </span>
      </nav>
      <div className="kol-filter-bar">
        <div className="kol-token-filters">
          <button
            className={!token ? "active" : ""}
            aria-pressed={!token}
            onClick={() => setToken("")}
          >
            {L("All", "全部")}
          </button>
          {tokens.map((t) => (
            <button
              key={t}
              className={token === t ? "active" : ""}
              aria-pressed={token === t}
              onClick={() => selectCoin(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="kol-session">
          <Clock3 size={12} />
          {L("Saved for this session", "仅在本次会话中保存")}
        </span>
      </div>
      <main className="kol-workspace">
        <aside className="kol-left">
          <section className="kol-panel">
            <div className="kol-panel-title">
              <h2>{L("Your KOL list", "KOL 列表")}</h2>
              <span>
                {watched.length}
                <Users size={13} />
              </span>
            </div>
            {profiles.map((p) => (
              <div
                className={
                  "kol-profile-row " + (who === p.id ? "selected" : "")
                }
                key={p.id}
              >
                <button
                  className="kol-profile-main"
                  id={"kol-profile-" + p.id}
                  aria-pressed={who === p.id}
                  onClick={() => selectProfile(p.id)}
                >
                  <Avatar profile={p} large />
                  <span>
                    <strong>{p.name}</strong>
                    <span className="kol-handle">@{p.handle}</span>
                    <small>
                      {calls.filter((c) => c.profile === p.id).length}{" "}
                      {L("reviewed posts", "条已审阅帖子")}
                    </small>
                  </span>
                </button>
                <button
                  className={
                    "kol-icon kol-star " +
                    (watched.includes(p.id) ? "active" : "")
                  }
                  aria-label={L("Watch " + p.name, "关注 " + p.name)}
                  aria-pressed={watched.includes(p.id)}
                  onClick={() => setWatched((w) => toggle(w, p.id))}
                >
                  <Star
                    size={16}
                    fill={watched.includes(p.id) ? "currentColor" : "none"}
                  />
                </button>
                <div className="kol-profile-coins">
                  {tokens
                    .filter((t) =>
                      calls.some(
                        (c) => c.profile === p.id && c.tokens.includes(t),
                      ),
                    )
                    .map((t) => (
                      <button
                        className="kol-token"
                        key={t}
                        onClick={() => {
                          setWho(p.id);
                          setToken(t);
                          setTab("Feed");
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  <SourceLink href={p.url}>X</SourceLink>
                </div>
              </div>
            ))}
          </section>
          <section className="kol-panel kol-overlap">
            <div className="kol-panel-title">
              <h2>{L("Coins mentioned", "提及的代币")}</h2>
              <Network size={14} />
            </div>
            <table>
              <caption className="sr-only">
                Token mentions within the 13 reviewed posts
              </caption>
              <thead>
                <tr>
                  <th>KOL</th>
                  {tokens.slice(0, 5).map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id}>
                    <th>{p.name}</th>
                    {tokens.slice(0, 5).map((t) => {
                      const n = calls.filter(
                        (c) => c.profile === p.id && c.tokens.includes(t),
                      ).length;
                      return (
                        <td key={t}>
                          <button
                            className={
                              "kol-mention " + (n ? "has-mention" : "")
                            }
                            aria-label={
                              p.name + " " + t + ": " + n + " reviewed posts"
                            }
                            onClick={() => {
                              setWho(p.id);
                              setToken(t);
                              setTab("Feed");
                            }}
                          >
                            {n || "—"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p>{L("Within this selected post set", "仅统计所选帖子")}</p>
          </section>
          <button
            className="kol-shortcut"
            onClick={() => {
              setTab("Compare");
              reset();
            }}
          >
            <Users size={16} />
            {L("Compare KOL calls", "比较 KOL 观点")}
            <ArrowRight size={15} />
          </button>
          <button
            className="kol-shortcut"
            onClick={() => {
              setTab("Saved");
              reset();
            }}
          >
            <Bookmark size={16} />
            {L("Saved receipts", "保存的记录")}
            <span>{saved.length}</span>
          </button>
        </aside>
        <section className="kol-center">
          {(tab === "Feed" || tab === "Saved") && (
            <div className="kol-panel kol-feed-panel">
              <div className="kol-panel-title">
                <h2>
                  {tab === "Saved"
                    ? L("Saved receipts", "保存的记录")
                    : who
                      ? profileFor(who).name + L(" · history", " · 历史")
                      : L("Call feed", "观点动态")}
                </h2>
                <div className="kol-feed-filters">
                  <label>
                    <ListFilter size={13} />
                    <select
                      aria-label={L("Call type", "观点类型")}
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                    >
                      <option value="">{L("All types", "全部类型")}</option>
                      <option value="targets">
                        {L("Price targets", "价格目标")}
                      </option>
                      <option value="Self-reported holdings">
                        {L("Holdings", "自述持仓")}
                      </option>
                      <option value="Bullish opinion">
                        {L("Opinions", "观点")}
                      </option>
                    </select>
                  </label>
                  <button
                    className="kol-icon"
                    aria-label={L("Reverse date order", "反转日期排序")}
                    onClick={() => setOldest((v) => !v)}
                  >
                    <ArrowDownUp size={14} />
                  </button>
                </div>
              </div>
              {(who || token || query || type) && (
                <div className="kol-filter-status">
                  <span>
                    {visible.length} {L("matching posts", "条匹配帖子")}
                  </span>
                  <button onClick={reset}>
                    {L("Clear filters", "清除筛选")}
                    <X size={12} />
                  </button>
                </div>
              )}
              <div className="kol-feed-scroll">
                {visible.length ? (
                  visible.map((c) => (
                    <CallCard
                      call={c}
                      key={c.id}
                      L={L}
                      selected={selected}
                      saved={saved}
                      save={save}
                      selectProfile={selectProfile}
                      inspect={inspect}
                    />
                  ))
                ) : (
                  <div className="kol-empty">
                    <Bookmark size={28} />
                    <h3>
                      {tab === "Saved"
                        ? L("Build your receipt collection", "建立您的记录集")
                        : L("No matching source posts", "没有匹配的来源帖子")}
                    </h3>
                    <p>
                      {tab === "Saved"
                        ? L(
                            "Save an original call to return to its context.",
                            "保存观点以便再次查看背景。",
                          )
                        : L(
                            "Try another KOL, coin or search term.",
                            "请尝试其他 KOL、代币或关键词。",
                          )}
                    </p>
                    <button
                      onClick={() => {
                        reset();
                        setTab("Feed");
                      }}
                    >
                      {L("Explore the feed", "浏览动态")}
                      <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div className="kol-feed-end">
                <ShieldCheck size={13} />
                {visible.length}{" "}
                {L(
                  "source-linked posts · curated history",
                  "条带有来源的帖子 · 精选历史",
                )}
              </div>
            </div>
          )}
          {tab === "KOLs" && (
            <div className="kol-panel kol-explore-panel">
              <div className="kol-panel-title">
                <h2>{L("Meet the voices", "认识这些作者")}</h2>
                <Users size={16} />
              </div>
              <p className="kol-subcopy">
                {L(
                  "Real profiles. Inspect the history before following the thesis.",
                  "真实账号。先查看历史，再判断观点。",
                )}
              </p>
              {profiles.map((p) => (
                <article className="kol-directory-card" key={p.id}>
                  <Avatar profile={p} large />
                  <div>
                    <h3>{p.name}</h3>
                    <SourceLink href={p.url}>@{p.handle}</SourceLink>
                    <p>
                      {calls.filter((c) => c.profile === p.id).length}{" "}
                      {L("reviewed posts", "条已审阅帖子")}
                    </p>
                  </div>
                  <button
                    className="kol-primary"
                    onClick={() => selectProfile(p.id)}
                  >
                    {L("History", "历史")}
                    <ArrowRight size={14} />
                  </button>
                </article>
              ))}
            </div>
          )}
          {tab === "Coins" && (
            <div className="kol-panel kol-explore-panel">
              <div className="kol-panel-title">
                <h2>{L("Who's talking about what", "谁在讨论什么")}</h2>
                <Network size={16} />
              </div>
              <p className="kol-subcopy">
                {L(
                  "Explore mentions across this reviewed source set.",
                  "探索此来源集中的代币讨论。",
                )}
              </p>
              <div className="kol-coin-board">
                {tokens
                  .filter((t) => !token || t === token)
                  .map((t) => {
                    const coverage = tokenCoverage(t);
                    return (
                      <button
                        className="kol-coin-card"
                        key={t}
                        onClick={() => {
                          setToken(t);
                          setWho("");
                          setTab("Feed");
                        }}
                      >
                        <span className="kol-coin-head">
                          <strong>{t}</strong>
                          <ArrowUpRight size={16} />
                        </span>
                        <span className="kol-coin-count">
                          {coverage.mentions.length}
                          <small>{L("reviewed mentions", "次提及")}</small>
                        </span>
                        <div className="kol-avatar-stack">
                          {coverage.profiles.map((p) => (
                            <Avatar profile={p} key={p.id} />
                          ))}
                          <span>{coverage.profiles.length} KOLs</span>
                        </div>
                        <span className="kol-coin-bottom">
                          {L("Inspect calls", "查看观点")}
                          <ArrowRight size={13} />
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
          {tab === "Timeline" && (
            <div className="kol-panel kol-explore-panel">
              <div className="kol-panel-title">
                <h2>{L("Call timeline", "观点时间线")}</h2>
                <History size={16} />
              </div>
              <p className="kol-subcopy">
                {L(
                  "Every marker is an original post. Select one to inspect it.",
                  "每个标记都对应原帖，点击即可查看。",
                )}
              </p>
              <Suspense
                fallback={
                  <div className="kol-timeline-chart kol-empty" role="status">
                    {L("Loading source timeline…", "正在加载来源时间线…")}
                  </div>
                }
              >
                <CallTimeline onSelect={inspect} token={token} />
              </Suspense>
              <p className="kol-chart-note">
                {L(
                  "Dates only · same-day posts can overlap · source activity, not price performance",
                  "仅显示日期 · 同日帖子可能重叠 · 这是来源活动，不是价格表现",
                )}
              </p>
              <div className="kol-timeline-list">
                {filterCalls(calls, { token }).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => inspect(c)}
                    className={selected.id === c.id ? "selected" : ""}
                  >
                    <Avatar profile={profileFor(c.profile)} />
                    <span>
                      <strong>{profileFor(c.profile).name}</strong>
                      <small>{c.tokens.join(" · ")}</small>
                    </span>
                    <time>{dateLabel(c.date)}</time>
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
            </div>
          )}
          {tab === "Compare" && (
            <div className="kol-panel kol-explore-panel">
              <div className="kol-panel-title">
                <h2>
                  {L("Same token. Different calls.", "同一代币，不同观点。")}
                </h2>
                <Users size={16} />
              </div>
              <p className="kol-subcopy">
                {L(
                  "Compare what was actually said, with conditions intact.",
                  "比较原始观点，同时保留完整条件。",
                )}
              </p>
              <div className="kol-compare-cards">
                {compareCalls.map((c) => (
                  <article
                    className={
                      "kol-compare-card " +
                      (selected.id === c.id ? "selected" : "")
                    }
                    key={c.id}
                  >
                    <div className="kol-person">
                      <Avatar profile={profileFor(c.profile)} />
                      <div>
                        <strong>{profileFor(c.profile).name}</strong>
                        <span className="kol-handle">
                          @{profileFor(c.profile).handle}
                        </span>
                      </div>
                    </div>
                    <span className="kol-badge amber">{outcome(c)}</span>
                    <div className="kol-compare-target">
                      BTC <ArrowRight size={20} />
                      <strong>{c.target}</strong>
                    </div>
                    <p>{c.summary}</p>
                    <dl>
                      <div>
                        <dt>{L("Posted", "发布")}</dt>
                        <dd>{dateLabel(c.date)}</dd>
                      </div>
                      <div>
                        <dt>{L("Deadline", "截止")}</dt>
                        <dd>{dateLabel(c.deadline!)}</dd>
                      </div>
                      <div>
                        <dt>{L("Accuracy", "准确率")}</dt>
                        <dd>{L("Not graded", "未评分")}</dd>
                      </div>
                    </dl>
                    <button className="kol-primary" onClick={() => inspect(c)}>
                      {L("Inspect conditions", "查看条件")}
                      <ArrowRight size={14} />
                    </button>
                    <SourceLink href={c.url}>
                      {L("Original post", "原帖")}
                    </SourceLink>
                  </article>
                ))}
              </div>
              <div className="kol-method-note">
                <Info size={17} />
                <p>
                  {L(
                    "These calls were posted on different dates. Ansem's call also depends on a weekly-close condition. Neither is assigned a win rate or trading P&L.",
                    "两条观点的发布日期不同，Ansem 的观点还取决于周线收盘条件。两者均未计算胜率或交易盈亏。",
                  )}
                </p>
              </div>
            </div>
          )}
        </section>
        <aside className="kol-right">
          <section className="kol-panel kol-inspector" key={selected.id}>
            <div className="kol-panel-title">
              <h2>{L("Call inspector", "观点检查器")}</h2>
              <span className="kol-micro">
                {L("SOURCE RECEIPT", "来源记录")}
              </span>
            </div>
            <div className="kol-person">
              <Avatar profile={person} />
              <div>
                <strong>{person.name}</strong>
                <SourceLink href={person.url}>@{person.handle}</SourceLink>
              </div>
              <button
                className={
                  "kol-icon " + (saved.includes(selected.id) ? "active" : "")
                }
                aria-label={L("Save selected receipt", "保存所选记录")}
                aria-pressed={saved.includes(selected.id)}
                onClick={() => save(selected)}
              >
                <Bookmark
                  size={16}
                  fill={saved.includes(selected.id) ? "currentColor" : "none"}
                />
              </button>
            </div>
            <div className="kol-target-block">
              <div className="kol-target-eyebrow">
                {selected.tokens.join(" / ")}{" "}
                <span
                  className={
                    "kol-badge " +
                    (outcome(selected) !== "Unscored" ? "amber" : "")
                  }
                >
                  {outcome(selected)}
                </span>
              </div>
              <div
                className={
                  "kol-target " + (!selected.target ? "kol-target-text" : "")
                }
              >
                {selected.target || selected.type}
              </div>
              <p>
                {L("Published", "发布于")} {dateLabel(selected.date)}, 2026
              </p>
            </div>
            <p className="kol-selected-summary">{selected.summary}</p>
            <SourceLink href={selected.url}>
              {L("Open original on X", "在 X 查看原帖")}
            </SourceLink>
            {selected.deadline && (
              <div className="kol-deadline-track">
                <div>
                  <span>{dateLabel(selected.date)}</span>
                  <small>{L("Posted", "发布")}</small>
                </div>
                <Clock3 size={21} />
                <div>
                  <span>{dateLabel(selected.deadline)}</span>
                  <small>{L("Deadline", "截止")}</small>
                </div>
              </div>
            )}
            <dl className="kol-facts">
              <div>
                <dt>{L("Classification", "分类")}</dt>
                <dd>{selected.type}</dd>
              </div>
              <div>
                <dt>{L("Deadline", "期限")}</dt>
                <dd>
                  {selected.deadline
                    ? dateLabel(selected.deadline) + ", 2026"
                    : L("Not fixed", "未固定")}
                </dd>
              </div>
              <div>
                <dt>{L("Outcome", "结果")}</dt>
                <dd>{L("Not evaluated", "尚未评估")}</dd>
              </div>
              <div>
                <dt>{L("Accuracy", "准确率")}</dt>
                <dd>{L("Not yet graded", "尚未评分")}</dd>
              </div>
            </dl>
            <details className="kol-price-details">
              <summary>
                <ArrowDownUp size={14} />
                {L("Price reaction", "价格变化")}
                <ChevronDown size={14} />
              </summary>
              <p>
                {L(
                  "No historical price series is attached to this edition. Returns and outcomes remain unknown, rather than inferred from a bullish post.",
                  "此版本未附历史价格序列。收益和结果保持未知，不根据看涨帖子推断。",
                )}
              </p>
            </details>
            <button
              className="kol-primary kol-explain"
              id="kol-explain"
              aria-expanded={insight}
              onClick={() => setInsight((v) => !v)}
            >
              <Sparkles size={16} />
              {L("Explain this call", "解释此观点")}
              <ChevronDown size={14} />
            </button>
            {insight && (
              <div className="kol-insight" id="kol-insight">
                <h3>
                  <Sparkles size={14} />
                  {L("Scout insight", "Scout 洞察")}
                </h3>
                <p>{selected.interpretation}</p>
                <div className="kol-insight-check">
                  <ShieldCheck size={14} />
                  <span>
                    {L(
                      "Check the target, deadline and conditions against the original post.",
                      "请对照原帖检查目标、期限和条件。",
                    )}
                  </span>
                </div>
                <small>
                  {L(
                    "Prepared AI context · source-based interpretation",
                    "预先准备的 AI 背景 · 基于来源的解读",
                  )}
                </small>
              </div>
            )}
            <button className="kol-export" onClick={exportCall}>
              <Download size={14} />
              {L("Download source receipt", "下载来源记录")}
              <ExternalLink size={12} />
            </button>
          </section>
          <section className="kol-panel kol-compact-compare">
            <div className="kol-panel-title">
              <h2>{L("Compare BTC targets", "比较 BTC 目标")}</h2>
              <button
                className="kol-icon"
                aria-label="Open comparison"
                onClick={() => {
                  setTab("Compare");
                  reset();
                }}
              >
                <ArrowUpRight size={14} />
              </button>
            </div>
            {compareCalls.map((c) => (
              <button key={c.id} onClick={() => inspect(c)}>
                <Avatar profile={profileFor(c.profile)} />
                <strong>{profileFor(c.profile).name}</strong>
                <span>{c.target}</span>
                <small>{outcome(c)}</small>
              </button>
            ))}
            <p>
              {L("Different dates and conditions.", "发布日期和条件不同。")}
            </p>
          </section>
        </aside>
      </main>
      <footer className="kol-footer">
        <span>
          <ShieldCheck size={13} />
          {L("Original posts linked", "附有原帖链接")}
        </span>
        <span>
          {L(
            "Curated history · opinions are not scored as predictions",
            "精选历史 · 观点不作为预测评分",
          )}
        </span>
        <span>
          {L("Captured", "采集于")} {capturedDate}
        </span>
      </footer>
      <div
        className={"kol-toast " + (notice ? "visible" : "")}
        role="status"
        onAnimationEnd={() => setNotice("")}
      >
        {notice && <Check size={15} />} {notice}
      </div>
      <dialog ref={manage} className="kol-dialog">
        <div className="kol-panel-title">
          <h2>{L("Your source watchlist", "来源关注列表")}</h2>
          <button
            className="kol-icon"
            aria-label={L("Close watchlist", "关闭关注列表")}
            onClick={() => manage.current?.close()}
          >
            <X size={19} />
          </button>
        </div>
        <p>
          {L(
            "Choose from the profiles with reviewed source history. Selections stay in this session.",
            "从已审阅历史的账号中选择。选择仅保留在本次会话中。",
          )}
        </p>
        <label className="kol-search">
          <Search size={15} />
          <input
            autoFocus
            aria-label={L("Find reviewed KOL", "查找已审阅 KOL")}
            placeholder={L("Search reviewed profiles…", "搜索已审阅账号…")}
            value={manageQuery}
            onChange={(e) => setManageQuery(e.target.value)}
          />
        </label>
        {profiles
          .filter((p) =>
            (p.name + p.handle)
              .toLowerCase()
              .includes(manageQuery.toLowerCase()),
          )
          .map((p) => (
            <button
              className="kol-watch-option"
              key={p.id}
              onClick={() => setWatched((w) => toggle(w, p.id))}
              aria-pressed={watched.includes(p.id)}
            >
              <Avatar profile={p} />
              <span>
                <strong>{p.name}</strong>
                <small>@{p.handle}</small>
              </span>
              {watched.includes(p.id) ? (
                <Check size={18} />
              ) : (
                <Plus size={18} />
              )}
            </button>
          ))}
        {!profiles.some((p) =>
          (p.name + p.handle).toLowerCase().includes(manageQuery.toLowerCase()),
        ) && (
          <p className="kol-empty">
            {L(
              "No reviewed profile found. This edition covers KALEO, Ansem and Pentoshi.",
              "未找到已审阅账号。此版本覆盖 KALEO、Ansem 和 Pentoshi。",
            )}
          </p>
        )}
        <button className="kol-primary" onClick={() => manage.current?.close()}>
          {L("Done", "完成")}
          <ArrowRight size={15} />
        </button>
      </dialog>
    </div>
  );
}

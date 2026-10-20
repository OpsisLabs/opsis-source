import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useCopy } from "./copy";
import { ExplorerLink } from "./ExplorerLink";
import { sortLaunches, type LaunchFeed } from "./launch-model";
import {
  filterLaunches,
  initialRadarState,
  launchRowKey,
  startLaunchRadar,
  type LaunchpadFilter,
  type LaunchWindow,
} from "./launch-radar-model";
import { Dispute } from "./LaunchCard";
import "./launches.css";
export function LaunchFeedView({
  feed,
  filter = "all",
  newRows,
}: {
  feed: LaunchFeed;
  filter?: LaunchpadFilter;
  newRows?: ReadonlySet<string>;
}) {
  const c = useCopy(),
    [sort, setSort] = useState<"time" | "launchpad" | "deployer">("time"),
    entries = filterLaunches(feed.entries, filter);
  return (
    <>
      <p>
        {c("Read window", "读取范围")}: {feed.minutes}{" "}
        {c("minutes ending at", "分钟，截至")} {feed.anchor.timestamp} ·{" "}
        {c("Block", "区块")} {feed.anchor.blockNumber}
      </p>
      <p>
        {c("Observed", "观测时间")}: {feed.observedAt} ·{" "}
        {c("Cache expires", "缓存到期")}: {feed.expiresAt}
      </p>
      <p>
        {feed.coverage.state === "partial"
          ? c(
              "Partial feed — bounded scans or unknown trading starts; coverage below.",
              "部分数据 — 扫描范围受限或交易开始时间未知；覆盖详情如下。",
            )
          : c("Covered read window", "已覆盖的读取范围")}
        <Dispute />
      </p>
      <details>
        <summary>{c("Read coverage", "读取覆盖")}</summary>
        <dl>
          {Object.entries(feed.coverage).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
            </div>
          ))}
        </dl>
      </details>
      <label>
        {c("Sort by", "排序方式")}{" "}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
        >
          <option value="time">
            {c("Time — newest first", "时间 — 最新在前")}
          </option>
          <option value="launchpad">{c("Launchpad", "发行平台")}</option>
          <option value="deployer">{c("Deployer", "部署者")}</option>
        </select>
      </label>
      <div className="launch-table">
        <table>
          <thead>
            <tr>
              <th>{c("Launch event time", "发行事件时间")}</th>
              <th>{c("Token", "代币")}</th>
              <th>{c("Launchpad", "发行平台")}</th>
              <th>{c("Deployer", "部署者")}</th>
              <th>T0</th>
            </tr>
          </thead>
          <tbody>
            {sortLaunches(entries, sort).map((row) => (
              <tr key={launchRowKey(row)}>
                <td>
                  {row.created.timestamp ??
                    `${c("Time unknown", "时间未知")} · ${c("Block", "区块")} ${row.created.blockNumber}`}
                </td>
                <td>
                  <Link
                    to={`/research?entity=${encodeURIComponent(row.token)}`}
                  >
                    {row.token}
                  </Link>
                  <ExplorerLink kind="token" value={row.token} />
                  {newRows?.has(launchRowKey(row)) && (
                    <span className="launch-new">{c("New", "新增")}</span>
                  )}
                </td>
                <td>
                  {row.launchpad}
                  <Dispute />
                </td>
                <td>
                  {row.deployer ??
                    row.unknownReasons.deployer ??
                    c(
                      "Unknown — event does not identify deployer",
                      "未知 — 事件未标识部署者",
                    )}
                  {row.deployer && <ExplorerLink kind="address" value={row.deployer} />}
                </td>
                <td>
                  {row.t0?.timestamp ??
                    row.unknownReasons.t0 ??
                    c(
                      "Unknown — trading start not established",
                      "未知 — 未确定交易开始",
                    )}
                  {row.partial && (
                    <p>
                      {c(
                        "Partial — bounded discovery",
                        "部分数据 — 发行发现范围受限",
                      )}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {entries.length === 0 && (
        <p>
          {c(
            "No launches found for these filters in the covered read window",
            "已覆盖读取范围内未发现符合筛选条件的发行事件",
          )}
        </p>
      )}
    </>
  );
}
function EnabledRadar() {
  const c = useCopy(),
    [state, setState] = useState(initialRadarState),
    [filter, setFilter] = useState<LaunchpadFilter>("all"),
    model = useRef<ReturnType<typeof startLaunchRadar> | undefined>(undefined);
  useEffect(() => {
    const radar = startLaunchRadar({ onChange: setState });
    model.current = radar;
    return () => radar.stop();
  }, []);
  return (
    <section className="launch-card">
      <h2>{c("Launch Radar", "发行雷达")}</h2>
      <p>
        {c("No ranking", "不作排名")} ·{" "}
        {c("Not investment advice", "非投资建议")}
      </p>
      <div
        className="launch-filters"
        role="group"
        aria-label={c("Launchpad filters", "发行平台筛选")}
      >
        {(
          [
            ["all", c("All", "全部")],
            ["pons", c("Pons", "Pons")],
            ["long", c("Long", "Long")],
            [
              "launcher",
              c("Uniswap Liquidity Launcher", "Uniswap 流动性发行器"),
            ],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="launch-controls">
        <label>
          {c("Time window", "时间范围")}{" "}
          <select
            aria-label={c("Time window", "时间范围")}
            value={state.minutes}
            onChange={(e) =>
              model.current?.setMinutes(Number(e.target.value) as LaunchWindow)
            }
          >
            <option value={10}>{c("10 min", "10 分钟")}</option>
            <option value={60}>{c("1 h", "1 小时")}</option>
            <option value={360}>{c("6 h", "6 小时")}</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={state.live}
            onChange={(e) => model.current?.setLive(e.target.checked)}
          />{" "}
          {c("Live", "实时刷新")}
        </label>
        {state.ageSeconds !== undefined && (
          <span role="timer">
            {c(
              `Updated ${state.ageSeconds}s ago`,
              `${state.ageSeconds} 秒前更新`,
            )}
          </span>
        )}
      </div>
      <p>
        {c(
          "Live refreshes every 60 seconds while this tab is visible; read limits still apply.",
          "实时刷新在此标签页可见时每 60 秒进行一次；仍受读取限额约束。",
        )}
      </p>
      {state.error && (
        <p role="status">
          {state.feed
            ? c(
                "Refresh failed — live paused. Last successful read shown.",
                "刷新失败 — 实时刷新已暂停。当前显示上次成功读取的数据。",
              )
            : c(
                "Launch feed unavailable — request failed",
                "发行列表不可用 — 请求失败",
              )}{" "}
          <button type="button" onClick={() => void model.current?.refresh()}>
            {c("Retry", "重试")}
          </button>
        </p>
      )}
      {state.feed ? (
        <LaunchFeedView
          feed={state.feed}
          filter={filter}
          newRows={state.newRows}
        />
      ) : (
        !state.error && (
          <p role="status">
            {c("Reading launch events…", "正在读取发行事件…")}
          </p>
        )
      )}
    </section>
  );
}
export default function LaunchRadar({ enabled }: { enabled: boolean }) {
  return enabled ? <EnabledRadar /> : null;
}

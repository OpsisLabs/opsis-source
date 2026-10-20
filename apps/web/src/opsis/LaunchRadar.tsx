import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useCopy } from "./copy";
import { readLaunches, sortLaunches, type LaunchFeed } from "./launch-model";
import { Dispute } from "./LaunchCard";
import "./launches.css";
export function LaunchFeedView({ feed }: { feed: LaunchFeed }) {
  const c = useCopy(),
    [sort, setSort] = useState<"time" | "launchpad" | "deployer">("time");
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
            {sortLaunches(feed.entries, sort).map((row, i) => (
              <tr key={`${row.token}-${i}`}>
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
      {feed.entries.length === 0 && (
        <p>
          {c(
            "No launches found in the covered read window",
            "已覆盖读取范围内未发现发行事件",
          )}
        </p>
      )}
      <p>{c("Not investment advice", "非投资建议")}</p>
    </>
  );
}
function EnabledRadar() {
  const c = useCopy(),
    [feed, setFeed] = useState<LaunchFeed>(),
    [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void readLaunches<LaunchFeed>(true, undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setFeed(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, []);
  return (
    <section className="launch-card">
      <h2>{c("Launch Radar", "发行雷达")}</h2>
      {feed ? (
        <LaunchFeedView feed={feed} />
      ) : (
        <p role="status">
          {error
            ? c(
                "Launch feed unavailable — request failed",
                "发行列表不可用 — 请求失败",
              )
            : c("Reading launch events…", "正在读取发行事件…")}
        </p>
      )}
    </section>
  );
}
export default function LaunchRadar({ enabled }: { enabled: boolean }) {
  return enabled ? <EnabledRadar /> : null;
}

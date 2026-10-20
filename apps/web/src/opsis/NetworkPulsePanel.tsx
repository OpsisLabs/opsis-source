import { useEffect, useRef, useState } from "react";
import { useCopy } from "./copy";
import type { Capabilities } from "./model";
import { fetchNetworkPulse, networkPulseEnabled, NetworkPulseError, pulseReasons, shouldRefreshPulse, type NetworkPulse, type PulseValue } from "./network-pulse";

export default function NetworkPulsePanel({ capabilities, previewKey }: { capabilities: Capabilities; previewKey: string }) {
  const c = useCopy();
  const enabled = networkPulseEnabled(capabilities);
  const panel = useRef<HTMLElement>(null);
  const [pulse, setPulse] = useState<NetworkPulse | null>(null);
  const [failure, setFailure] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    let active = true, inView = false, pending = false, stopped = false, nextReadAt = 0;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const visible = () => inView && document.visibilityState === "visible";
    const tick = () => {
      clearTimeout(timer);
      setNow(Date.now());
      if (!active || stopped || !visible()) return;
      if (shouldRefreshPulse(enabled, visible(), pending, nextReadAt, Date.now())) {
        pending = true;
        nextReadAt = Date.now() + 30_000;
        controller = new AbortController();
        void fetchNetworkPulse(previewKey, controller.signal).then(result => {
          if (active) { setPulse(result); setFailure(false); }
        }).catch(error => {
          if (!active || controller?.signal.aborted) return;
          setFailure(true);
          if (error instanceof NetworkPulseError) {
            nextReadAt = Math.max(nextReadAt, Date.now() + error.retryAfter * 1000);
            if (error.status === 404 || error.status === 401 || error.status === 403) stopped = true;
          }
        }).finally(() => {
          pending = false;
          if (active) tick();
        });
      }
      timer = setTimeout(tick, Math.max(1000, nextReadAt - Date.now()));
    };
    const observer = new IntersectionObserver(entries => {
      inView = entries.some(entry => entry.isIntersecting);
      tick();
    });
    if (panel.current) observer.observe(panel.current);
    document.addEventListener("visibilitychange", tick);
    return () => {
      active = false;
      clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("visibilitychange", tick);
      controller?.abort();
    };
  }, [enabled, previewKey]);

  const show = <T,>(field: PulseValue<T> | undefined, format: (value: T) => string) => !field
    ? c("Unknown · not read yet", "未知 · 尚未读取")
    : field.reason !== null ? `${c("Unknown", "未知")} · ${c(...pulseReasons[field.reason])}` : format(field.value);
  const stale = pulse && now - Date.parse(pulse.observedAt) > 60_000;
  return (
    <section ref={panel} className="utility-ws-panel network-pulse" aria-labelledby="network-pulse-title">
      <header>
        <h2 id="network-pulse-title">{c("Network now", "网络现况")}</h2>
        <span className="utility-ws-mono">Robinhood Chain · 4663</span>
      </header>
      {!enabled ? <p>{c("Not enabled · server flag off", "未启用 · 服务器标志已关闭")}</p> : <>
        <p role="status">{failure
          ? c("Refresh unavailable. Retained observations keep their original time.", "刷新不可用。保留的观测仍显示原始时间。")
          : stale ? c("Observation is over 60 seconds old.", "观测时间已超过 60 秒。")
            : pulse ? c("Observed", "已观测") : c("Waiting for a network read…", "等待读取网络数据…")}
          {pulse && <> · <time dateTime={pulse.observedAt}>{pulse.observedAt}</time></>}
        </p>
        <dl className="network-pulse-facts">
          <div><dt>{c("Latest block", "最新区块")}</dt><dd>{show(pulse?.latestBlock, value => value.number)}</dd>
            <dd>{c("Age at observation", "观测时区块年龄")}: {show(pulse?.latestAgeSeconds, value => `${value} ${c("s", "秒")}`)}</dd></div>
          <div><dt>{c("Safe block (RPC tag)", "Safe 区块（RPC 标签）")}</dt><dd>{show(pulse?.safeBlock, value => value.number)}</dd>
            <dd>{c("Lag behind latest", "落后最新区块")}: {show(pulse?.safeLagBlocks, value => `${value} ${c("blocks", "个区块")}`)} · {show(pulse?.safeLagSeconds, value => `${value} ${c("s", "秒")}`)}</dd></div>
          <div><dt>{c("Gas price", "Gas 价格")}</dt><dd>{show(pulse?.gasPriceGwei, value => `${value} gwei`)}</dd></div>
          <div><dt>ETH/USD · Chainlink</dt><dd>{show(pulse?.ethUsd, value => `${value} USD`)}</dd>
            <dd>{c("Feed updated at", "喂价更新时间")}: {show(pulse?.ethUsdUpdatedAt, value => value)}</dd></div>
          <div><dt>{c("RPC read latency", "RPC 读取延迟")}</dt><dd>{show(pulse?.rpcLatencyMs, value => `${value} ${c("ms", "毫秒")}`)}</dd></div>
        </dl>
        <p>{c("Refreshes every 30 seconds while this panel is visible; server cache 15 seconds. Latency measures the server's batch read, not your browser or network-wide uptime.", "面板可见时每 30 秒刷新；服务器缓存 15 秒。延迟衡量服务器批量读取耗时，不代表浏览器延迟或全网在线率。")}</p>
        <details>
          <summary>{c("Sources and limits", "来源与限制")}</summary>
          <p>{c("Four independent RPC reads in one batch; current, not final. The safe tag is reported by the provider. Gas price is a current suggestion, not a transaction fee quote. ETH/USD uses the reviewed 8-decimal feed; updates older than 24 hours are unknown.", "四次独立 RPC 读取合并为一批；当前数据，非最终确认。safe 标签由提供商报告。Gas 价格是当前建议值，不是交易费用报价。ETH/USD 使用已查阅的 8 位小数喂价；超过 24 小时未更新则为未知。")}</p>
          {pulse && <dl className="utility-ws-facts">
            <div><dt>{c("RPC source", "RPC 来源")}</dt><dd>{pulse.source.rpc === "drpc" ? c("dRPC Robinhood Chain gateway", "dRPC Robinhood Chain 网关") : c("Robinhood public RPC", "Robinhood 公共 RPC")}</dd></div>
            <div><dt>{c("Chainlink feed", "Chainlink 喂价")}</dt><dd>{pulse.source.feed}</dd></div>
            <div><dt>{c("Latest block hash", "最新区块哈希")}</dt><dd>{show(pulse.latestBlock, value => value.hash)}</dd></div>
            <div><dt>{c("Safe block hash", "Safe 区块哈希")}</dt><dd>{show(pulse.safeBlock, value => value.hash)}</dd></div>
          </dl>}
        </details>
      </>}
    </section>
  );
}

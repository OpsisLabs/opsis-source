import { useMemo, useState } from "react";
import { Link } from "react-router";
import { workspaceLink } from "../opsis/model";
import type { VaultWatch, VaultWatchCondition } from "../vault/types";
import { useCopy } from "../opsis/copy";
import { deriveWatchInbox, type WatchInboxItem } from "./inbox";
import { visibleTokenText } from "../opsis/explorer-facts";
import { tokenLabel } from "./holdings";
import "./watch.css";

function conditionReason(reason: string | undefined, chinese: boolean): string {
  const labels = {
    baseline: ["baseline only", "仅有基线"],
    stale: ["stale observation", "观察已过期"],
    "coverage-gap": ["provider coverage gap", "提供方覆盖缺口"],
    "decimals-changed": ["token decimals changed", "代币精度已变化"],
    "not-comparable": ["not comparable", "无法比较"],
    "invalid-anchor": ["invalid block anchor", "区块锚点无效"],
    missing: ["asset missing", "资产缺失"],
  } as const;
  const value = labels[reason as keyof typeof labels];
  return value?.[chinese ? 1 : 0] ?? (chinese ? "未知" : "unknown");
}

export default function WatchInbox({
  watches,
  onAcknowledge,
  onSnooze,
  onRestore,
  onSaveCondition,
  onRemoveCondition,
  busy = false,
}: {
  watches: VaultWatch[];
  onAcknowledge?: (item: WatchInboxItem) => void;
  onSnooze?: (item: WatchInboxItem, until: string) => void;
  onRestore?: (item: WatchInboxItem) => void;
  onSaveCondition?: (watchId: string, condition: VaultWatchCondition) => void;
  onRemoveCondition?: (watchId: string, conditionId: string) => void;
  busy?: boolean;
}) {
  const c = useCopy();
  const items = deriveWatchInbox(watches);
  const visible = items.filter((item) => !item.acknowledged && !item.snoozed);
  const [showReviewed, setShowReviewed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const selectedEntry = visible.find((entry) => entry.id === selectedId);
  const groups = ["changed", "unfinished", "unknown"] as const;
  const reviewed = items.filter((item) => item.acknowledged || item.snoozed);
  const assetLabel = (item: WatchInboxItem) => {
    const token = watches
      .find((watch) => watch.id === item.watchId)
      ?.snapshots.flatMap((snapshot) => snapshot.tokens)
      .find((token) => token.contract === item.assetContract);
    return token
      ? tokenLabel(token, c)
      : visibleTokenText(item.titleValues?.label ?? c("Asset", "资产"));
  };
  const title = (item: WatchInboxItem) =>
    ({
      baseline: c("Baseline saved", "已保存基线"),
      balanceChanged: c(
        `${assetLabel(item)} changed`,
        `${assetLabel(item)} 已变化`,
      ),
      coverageUnknown: c(
        `${assetLabel(item)} coverage unknown`,
        `${assetLabel(item)} 覆盖未知`,
      ),
      coverageAttention: c("Coverage needs attention", "覆盖需要注意"),
      conditionMet: c("Saved condition met", "已达到保存条件"),
      conditionUnknown: c(
        "Saved condition cannot be evaluated",
        "无法评估保存条件",
      ),
      conditionMissing: c(
        "Saved condition has no matching evidence",
        "保存条件没有匹配证据",
      ),
    })[item.titleCode];
  const detail = (item: WatchInboxItem) =>
    ({
      baseline: c(
        "Check again to compare a later observation.",
        "再次检查以比较后续观察。",
      ),
      balanceDelta: `${item.detailValues?.before ?? c("unknown", "未知")} → ${item.detailValues?.after ?? c("unknown", "未知")} (${item.detailValues?.delta ?? c("unknown", "未知")})`,
      notComparable: c(
        "The two observations cannot be compared exactly.",
        "两次观察无法精确比较。",
      ),
      coverage: c(
        "Some source coverage is unavailable or bounded.",
        "部分来源覆盖不可用或受限。",
      ),
      conditionMet: c(
        `Observed change reached ${item.detailValues?.threshold ?? ""} ${item.assetContract ? assetLabel(item) : visibleTokenText(item.detailValues?.unit ?? "")}.`,
        `观察到的变化达到 ${item.detailValues?.threshold ?? ""} ${item.assetContract ? assetLabel(item) : visibleTokenText(item.detailValues?.unit ?? "")}。`,
      ),
      conditionUnknown: c(
        `Comparable same-unit evidence is unavailable (${conditionReason(item.detailValues?.reason, false)}).`,
        `没有可比较的同单位证据（${conditionReason(item.detailValues?.reason, true)}）。`,
      ),
      conditionMissing: c(
        "The selected asset was not returned in this observation.",
        "此次观察没有返回所选资产。",
      ),
    })[item.detailCode];
  const stateLabel = (entry: WatchInboxItem) =>
    entry.status === "changed"
      ? c("Changed", "已变化")
      : entry.status === "unfinished"
        ? c("Unfinished", "未完成")
        : c("Unknown coverage", "未知覆盖");
  const openLinks = (entry: WatchInboxItem) => (
    <div className="mt-2 flex flex-wrap gap-3">
      {entry.status === "unfinished" && (
        <Link
          className="opsis-text-link"
          to={workspaceLink("/research", entry.address)}
        >
          {c("Fresh research →", "重新研究 →")}
        </Link>
      )}
      {entry.assetContract &&
        /^0x[a-fA-F0-9]{40}$/.test(entry.assetContract) && (
          <Link
            className="opsis-text-link"
            to={workspaceLink("/check", entry.assetContract)}
          >
            {c("Fresh trade check →", "重新交易核查 →")}
          </Link>
        )}
    </div>
  );
  const actions = (entry: WatchInboxItem) => (
    <div className="flex flex-wrap gap-2">
      <button
        className="opsis-action"
        type="button"
        disabled={busy}
        onClick={() => onAcknowledge?.(entry)}
      >
        {c("Acknowledge", "确认")}
      </button>
      <button
        className="opsis-text-link"
        type="button"
        disabled={busy}
        onClick={() =>
          onSnooze?.(
            entry,
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          )
        }
      >
        {c("Snooze 1 day", "暂停 1 天")}
      </button>
    </div>
  );
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        assetKey: string;
        direction: "any" | "increase" | "decrease";
        threshold: string;
      }
    >
  >({});
  const assetOptions = useMemo(
    () =>
      watches.map((watch) => ({
        watch,
        assets: [
          { key: "native", label: "ETH", unit: "ETH", decimals: 18 },
          ...watch.snapshots
            .at(-1)!
            .tokens.filter(
              (token) =>
                Number.isInteger(token.decimals) && token.decimals <= 78,
            )
            .map((token) => ({
              key: token.contract,
              label: tokenLabel(token, c),
              unit: (token.symbol || token.contract).slice(0, 32),
              decimals: token.decimals,
            })),
        ],
      })),
    [watches, c],
  );
  return (
    <section
      className="watch-panel watch-inbox min-w-0 max-w-full [overflow-wrap:anywhere]"
      aria-labelledby="watch-inbox-title"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="watch-kicker">
            {c("WATCH · ON DEMAND", "WATCH · 按需检查")}
          </p>
          <h2 id="watch-inbox-title" className="text-2xl">
            {c("What changed / unfinished / unknown", "变化／未完成／未知")}
          </h2>
          <p className="mt-1 text-sm opacity-70">
            {c(
              "Derived from saved snapshots. No background monitoring.",
              "仅根据已保存快照生成。没有后台监控。",
            )}
          </p>
        </div>
        <span className="text-sm">
          {visible.length} {c("needs attention", "项待处理")}
        </span>
      </div>
      {!visible.length ? (
        <p className="mt-5 text-sm opacity-70">
          {c(
            "No open findings. Acknowledgement is tied to this exact evidence.",
            "没有待处理发现。确认状态与这条确切证据绑定。",
          )}
        </p>
      ) : (
        <>
          <div
            className="watch-inbox-filters"
            role="group"
            aria-label={c("Filter inbox", "筛选收件箱")}
          >
            {["all", ...groups].map((value) => (
              <button
                key={value}
                type="button"
                className="watch-button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {value === "all"
                  ? c("All items", "全部项目")
                  : value === "changed"
                    ? c("Changed", "已变化")
                    : value === "unfinished"
                      ? c("Unfinished", "未完成")
                      : c("Unknown coverage", "未知覆盖")}
                <span>
                  {value === "all"
                    ? visible.length
                    : visible.filter((entry) => entry.status === value).length}
                </span>
              </button>
            ))}
          </div>
          <div
            className={`watch-inbox-layout${selectedEntry ? " has-selection" : ""}`}
          >
            <div className="watch-inbox-groups">
              {groups
                .filter((group) => filter === "all" || filter === group)
                .map((group) => {
                  const entries = visible.filter(
                    (entry) => entry.status === group,
                  );
                  if (!entries.length) return null;
                  return (
                    <section className="watch-inbox-group" key={group}>
                      <h3>
                        {group === "changed"
                          ? c("Changed", "已变化")
                          : group === "unfinished"
                            ? c("Unfinished", "未完成")
                            : c("Unknown coverage", "未知覆盖")}{" "}
                        <span>{entries.length}</span>
                      </h3>
                      {entries.map((entry) => (
                        <article
                          className="watch-inbox-row"
                          key={entry.id}
                          data-selected={selectedId === entry.id || undefined}
                        >
                          <button
                            className="watch-inbox-select"
                            type="button"
                            aria-pressed={selectedId === entry.id}
                            onClick={() => setSelectedId(entry.id)}
                          >
                            <span className="watch-inbox-state" aria-hidden>
                              {group === "changed"
                                ? "↔"
                                : group === "unfinished"
                                  ? "◷"
                                  : "?"}
                            </span>
                            <span className="watch-inbox-summary">
                              <span>{title(entry)}</span>
                              <small>
                                {entry.label} · {entry.address}
                              </small>
                              <small>{detail(entry)}</small>
                            </span>
                            <span className="watch-inbox-time">
                              {new Date(entry.capturedAt).toLocaleDateString()}
                              <small>
                                {entry.blockNumber === null
                                  ? c("block unknown", "区块未知")
                                  : `${c("Block", "区块")} ${entry.blockNumber}`}
                              </small>
                            </span>
                            <span aria-hidden>→</span>
                          </button>
                        </article>
                      ))}
                    </section>
                  );
                })}
            </div>
            {selectedEntry ? (
              <aside
                className="watch-inbox-detail"
                aria-label={c("Selected finding", "所选发现")}
              >
                <header>
                  <div>
                    <p className="watch-kicker">{stateLabel(selectedEntry)}</p>
                    <h3>{title(selectedEntry)}</h3>
                  </div>
                  <button
                    type="button"
                    className="watch-button"
                    onClick={() => setSelectedId(null)}
                    aria-label={c("Close finding", "关闭发现")}
                  >
                    ×
                  </button>
                </header>
                <p className="watch-notice">{detail(selectedEntry)}</p>
                {selectedEntry.detailCode === "balanceDelta" && (
                  <div className="watch-delta-values">
                    <div>
                      <span>{c("Previous value", "先前数值")}</span>
                      <strong>
                        {selectedEntry.detailValues?.before ??
                          c("Unknown", "未知")}
                      </strong>
                    </div>
                    <span aria-hidden>→</span>
                    <div>
                      <span>{c("New value", "新数值")}</span>
                      <strong>
                        {selectedEntry.detailValues?.after ??
                          c("Unknown", "未知")}
                      </strong>
                    </div>
                  </div>
                )}
                <dl className="watch-inbox-metadata">
                  <div>
                    <dt>{c("Wallet", "钱包")}</dt>
                    <dd>{selectedEntry.label}</dd>
                  </div>
                  <div>
                    <dt>{c("Address", "地址")}</dt>
                    <dd>{selectedEntry.address}</dd>
                  </div>
                  <div>
                    <dt>{c("Observed", "观察时间")}</dt>
                    <dd>
                      {new Date(selectedEntry.capturedAt).toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt>{c("Not checked since", "上次检查")}</dt>
                    <dd>
                      {new Date(selectedEntry.notCheckedSince).toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt>{c("Evidence source", "证据来源")}</dt>
                    <dd>{c("Saved Watch snapshots", "已保存的 Watch 快照")}</dd>
                  </div>
                  {selectedEntry.anchorHash && (
                    <div>
                      <dt>{c("Anchor", "锚点")}</dt>
                      <dd>{selectedEntry.anchorHash}</dd>
                    </div>
                  )}
                </dl>
                {openLinks(selectedEntry)}
                <div className="watch-inbox-detail-actions">
                  {actions(selectedEntry)}
                </div>
              </aside>
            ) : (
              <aside className="watch-inbox-detail watch-inbox-placeholder">
                <span aria-hidden>↗</span>
                <h3>{c("Read the evidence", "阅读证据")}</h3>
                <p className="watch-small">
                  {c(
                    "Select an item to inspect its observation, source and review controls.",
                    "选择项目以查看观察、来源与复核操作。",
                  )}
                </p>
              </aside>
            )}
          </div>
        </>
      )}
      {reviewed.length > 0 && (
        <div className="mt-5">
          <button
            type="button"
            className="opsis-text-link"
            onClick={() => setShowReviewed((value) => !value)}
          >
            {showReviewed
              ? c("Hide reviewed / snoozed", "隐藏已确认／暂停")
              : c(
                  `Show reviewed / snoozed (${reviewed.length})`,
                  `显示已确认／暂停（${reviewed.length}）`,
                )}
          </button>
          {showReviewed && (
            <div className="mt-3 space-y-2">
              {reviewed.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 border border-[var(--line)] p-3 text-sm"
                >
                  <span>
                    {title(entry)} ·{" "}
                    {entry.snoozed
                      ? c("snoozed", "已暂停")
                      : c("reviewed", "已确认")}
                  </span>
                  <button
                    type="button"
                    className="opsis-text-link"
                    disabled={busy}
                    onClick={() => onRestore?.(entry)}
                  >
                    {c("Restore", "恢复")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="mt-6 border-t border-[var(--line)] pt-5">
        <h3 className="text-lg">{c("Saved conditions", "已保存条件")}</h3>
        <p className="mt-1 text-sm opacity-70">
          {c(
            "Choose an observed asset and exact threshold. Conditions use retained same-unit evidence only.",
            "选择已观察资产和精确阈值。条件只使用已保留的同单位证据。",
          )}
        </p>
        {assetOptions.map(({ watch, assets }) => {
          const draft = drafts[watch.id] ?? {
            assetKey: assets[0]?.key ?? "native",
            direction: "any" as const,
            threshold: "",
          };
          const selected =
            assets.find((asset) => asset.key === draft.assetKey) ?? assets[0];
          return (
            <div
              key={watch.id}
              className="mt-3 border border-[var(--line)] p-3"
            >
              <div className="text-sm font-semibold">{watch.label}</div>
              <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-4 [&>*]:min-w-0 [&>*]:max-w-full">
                <select
                  // WebKit counts a long option's text as overflow of the
                  // page at phone width unless the control clips it.
                  className="w-full overflow-hidden text-ellipsis"
                  aria-label={c("Observed asset", "已观察资产")}
                  value={draft.assetKey}
                  onChange={(event) =>
                    setDrafts((old) => ({
                      ...old,
                      [watch.id]: { ...draft, assetKey: event.target.value },
                    }))
                  }
                >
                  {assets.map((asset) => (
                    <option key={asset.key} value={asset.key}>
                      {asset.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={c("Direction", "方向")}
                  value={draft.direction}
                  onChange={(event) =>
                    setDrafts((old) => ({
                      ...old,
                      [watch.id]: {
                        ...draft,
                        direction: event.target.value as typeof draft.direction,
                      },
                    }))
                  }
                >
                  <option value="any">{c("Any change", "任意变化")}</option>
                  <option value="increase">{c("Increase", "增加")}</option>
                  <option value="decrease">{c("Decrease", "减少")}</option>
                </select>
                <input
                  inputMode="decimal"
                  pattern="[0-9]+([.][0-9]+)?"
                  aria-label={c("Exact threshold", "精确阈值")}
                  placeholder={c("Exact threshold", "精确阈值")}
                  value={draft.threshold}
                  onChange={(event) =>
                    setDrafts((old) => ({
                      ...old,
                      [watch.id]: { ...draft, threshold: event.target.value },
                    }))
                  }
                />
                <button
                  type="button"
                  className="opsis-action"
                  disabled={
                    busy ||
                    !selected ||
                    !/^\d{1,78}(?:\.\d{1,78})?$/.test(draft.threshold) ||
                    !/[1-9]/.test(draft.threshold)
                  }
                  onClick={() => {
                    if (!selected) return;
                    onSaveCondition?.(watch.id, {
                      id: crypto.randomUUID(),
                      kind: "balance-change",
                      assetKey: selected.key,
                      direction: draft.direction,
                      threshold: draft.threshold,
                      unit: selected.unit,
                      decimals: selected.decimals,
                      createdAt: new Date().toISOString(),
                    });
                  }}
                >
                  {c("Save condition", "保存条件")}
                </button>
              </div>
              {(watch.conditions ?? []).map((condition) => (
                <div
                  key={condition.id}
                  className="mt-2 flex flex-wrap justify-between gap-2 text-xs opacity-75"
                >
                  <span>
                    {condition.assetKey} {condition.direction} ≥{" "}
                    {condition.threshold}{" "}
                    {assets.find((asset) => asset.key === condition.assetKey)
                      ?.label ?? visibleTokenText(condition.unit)}
                  </span>
                  <button
                    type="button"
                    className="opsis-text-link"
                    disabled={busy}
                    onClick={() => onRemoveCondition?.(watch.id, condition.id)}
                  >
                    {c("Remove", "删除")}
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

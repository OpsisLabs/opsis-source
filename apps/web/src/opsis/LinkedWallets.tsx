import { useEffect, useMemo, useRef, useState } from "react";
import type { FundingLink, LinkedWalletGraph } from "@rh-chain/shared";
import { ExplorerLink } from "./ExplorerLink";
import { EvidenceChart } from "../charts/EvidenceChart";
import { linkedBubbleOption } from "./linked-wallets-chart";
import { useCopy } from "./copy";
import { loadLinkedWallets, shareText } from "./linked-wallets-model";
import { ReceiptDownload } from "./ReceiptDownload";
import "./linked-wallets.css";

export default function LinkedWallets({
  token,
  enabled,
}: {
  token: string;
  enabled: boolean;
}) {
  const c = useCopy();
  const [data, setData] = useState<LinkedWalletGraph | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  if (!enabled) return null;
  async function run() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError(false);
    setData(null);
    try {
      const result = await loadLinkedWallets(token, enabled, controller.signal);
      if (!controller.signal.aborted) setData(result);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section
      className="opsis-panel linked-wallets"
      aria-label={c("Wallets linked by funding", "资金关联钱包")}
    >
      <h2>{c("Wallets linked by funding", "资金关联钱包")}</h2>
      <p className="opsis-small">
        {c(
          "Linked wallets are inferences from funding. Linked wallets may belong to different people, and one actor can avoid links. Hubs are excluded. Not investment advice.",
          "关联钱包是根据资金往来作出的推断。关联钱包可能属于不同的人，同一行为主体也可能避开关联。已排除枢纽地址。非投资建议。",
        )}
      </p>
      <p>
        {c(
          "Top 100 explorer holders; pools, burns and the token contract are separate. Holder selection is not block-pinned; balances and supply are read at the anchor. Only strong links form groups.",
          "区块浏览器前 100 名持有人；流动池、销毁地址与代币合约单列。持有人名单未锚定区块；余额与供应量在锚定区块读取。仅强关联用于分组。",
        )}
      </p>
      <button
        type="button"
        className="opsis-action"
        disabled={busy}
        onClick={() => void run()}
      >
        {busy
          ? c("Reading funding links…", "正在读取资金关联…")
          : c("Check funding links", "检查资金关联")}
      </button>
      {error && (
        <p role="alert">
          {c(
            "Observation refused or unavailable. The source, budget or anchor could not be verified.",
            "观察已拒绝或不可用。无法验证数据源、预算或锚定区块。",
          )}
        </p>
      )}
      {data && <LinkedWalletObservation data={data} />}
    </section>
  );
}

export function LinkedWalletObservation({ data }: { data: LinkedWalletGraph }) {
  const c = useCopy();
  const unknown = c("Unknown", "未知");
  const option = useMemo(
    () => linkedBubbleOption(data, unknown),
    [data, unknown],
  );
  const kind = (link: FundingLink) =>
    ({
      first_funding: c("First funding", "首次入金"),
      same_signer_multi_buy: c("Same-signer multi-buy", "同一签名者多地址购买"),
      shared_hub: c("Shared hub funding (weak)", "共同枢纽入金（弱关联）"),
      same_second: c("Buys in the same second (weak)", "同秒购买（弱关联）"),
    })[link.kind];
  const links = (rows: FundingLink[]) =>
    rows.map((link, i) => (
      <li key={`${link.from}:${link.to}:${i}`}>
        <span>
          {kind(link)}: {link.from}<ExplorerLink kind="address" value={link.from} /> → {link.to}<ExplorerLink kind="address" value={link.to} />
          {link.via && (
            <>
              {" "}
              · {c("via", "经由")} {link.via}<ExplorerLink kind="address" value={link.via} />
            </>
          )}
        </span>
        {link.transactionHashes.map((hash) => (
          <span key={hash}>
            {c("Transaction", "交易")} {hash}<ExplorerLink kind="tx" value={hash} />
          </span>
        ))}
      </li>
    ));
  const share = (value: LinkedWalletGraph["totals"]["largestGroup"]) =>
    shareText(value, c("Unknown", "未知"));
  const reasonLabels: Record<string, string> = {
    "not checked (cap)": "未检查（达到上限）",
    "not checked (beyond top N)": "未检查（超出主要持有人范围）",
    "not checked (known hub)": "未检查（已知枢纽）",
    unavailable: "不可用",
    "Holder list not checked (cap)": "持有人名单未检查（达到上限）",
    "Holder list unavailable": "持有人名单不可用",
    "Top-holder selection incomplete": "主要持有人名单不完整",
    "Supply not checked (cap)": "供应量未检查（达到上限）",
    "Supply unavailable": "供应量不可用",
    "Supply unavailable or zero": "供应量不可用或为零",
    "Balance read cap reached": "已达到余额读取上限",
    "Balance unavailable": "余额不可用",
    "Anchor balance not checked": "锚定区块余额未检查",
    "Per-wallet page cap reached": "已达到单钱包分页上限",
    "Funding read budget or cap reached": "已达到入金读取预算或上限",
    "Funding evidence unavailable": "入金证据不可用",
    "Launch facts partial or unavailable in bounded scan":
      "有限扫描中的开盘事实不完整或不可用",
    "Launch facts not checked (cap)": "开盘事实未检查（达到上限）",
    "Launch facts unavailable": "开盘事实不可用",
    "Hub classification not checked (cap)": "枢纽分类未检查（达到上限）",
    "Hub classification not checked": "枢纽分类未检查",
    "Hub classification unavailable": "枢纽分类不可用",
    "Large group cap reached": "已达到大型组上限",
  };
  const reason = (value: string) => {
    const beyond = /^not checked \(beyond top (\d+)\)$/.exec(value);
    if (beyond) return c(value, `未检查（不在前 ${beyond[1]} 名内）`);
    const detail = /^(not checked \(cap\)|unavailable): (.+)$/.exec(value);
    return c(
      value,
      detail
        ? `${reasonLabels[detail[1]!] ?? "未检查"}：${detail[2]}`
        : (reasonLabels[value] ?? "证据未检查或不可用"),
    );
  };
  return (
    <div aria-live="polite">
      <p>
        {data.state === "partial"
          ? c("Partial", "部分数据")
          : c("Finished within stated coverage", "已完成所述覆盖范围")}{" "}
        ·{" "}
        {data.servedFrom === "cache"
          ? c("Cached", "缓存")
          : c("Fresh observation", "新观察")}{" "}
        · {data.observedAt}
      </p>
      <p>
        {c("Block", "区块")} {data.anchor.blockNumber} ·{" "}
        {c("Current, not final", "当前，未最终确认")} · {data.anchor.blockHash}
      </p>
      <p>
        {c("Largest group", "最大组")}: {share(data.totals.largestGroup)} ·{" "}
        {c("Largest single wallet", "最大单一钱包")}:{" "}
        {share(data.totals.largestSingleWallet)}
      </p>
      <EvidenceChart
        option={option}
        label={c(
          "Top holders, coloured by funding group. Bubble size reflects supply share; exact values follow in tables.",
          "主要持有人，按资金关联组着色。气泡大小表示供应量占比；精确值见下表。",
        )}
      />
      <div className="opsis-table-wrap" tabIndex={0}>
        <table>
          <caption>{c("Holder table equivalent", "持有人等效表格")}</caption>
          <thead>
            <tr>
              <th>{c("Wallet", "钱包")}</th>
              <th>{c("Group", "组")}</th>
              <th>{c("Supply share", "供应量占比")}</th>
              <th>{c("First funding", "首次入金")}</th>
            </tr>
          </thead>
          <tbody>
            {data.holders.map((h) => (
              <tr key={h.wallet}>
                <td>{h.wallet}<ExplorerLink kind="address" value={h.wallet} /></td>
                <td>
                  {data.groups.findIndex((g) => g.members.includes(h.wallet)) +
                    1}
                </td>
                <td>{share(h.share)}</td>
                <td>
                  {h.funding === "checked"
                    ? c("Checked", "已检查")
                    : reason(h.funding)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="opsis-table-wrap" tabIndex={0}>
        <table>
          <caption>{c("Funding groups", "资金关联组")}</caption>
          <thead>
            <tr>
              <th>{c("Group / members", "组／成员")}</th>
              <th>{c("Supply share", "供应量占比")}</th>
              <th>{c("Links that formed the group", "构成组的关联")}</th>
            </tr>
          </thead>
          <tbody>
            {data.groups.map((g, i) => (
              <tr key={g.id}>
                <td>
                  {i + 1} ·{" "}
                  {g.status === "large group, review needed"
                    ? c("large group, review needed", "大型组，需要复核")
                    : g.status === "single wallet"
                      ? c("Single wallet", "单一钱包")
                      : c("Linked by funding", "资金关联")}
                  <ul>
                    {g.members.map((m) => (
                      <li key={m}>{m}<ExplorerLink kind="address" value={m} /></li>
                    ))}
                  </ul>
                </td>
                <td>{share(g.share)}</td>
                <td>
                  <ul>{links(g.links)}</ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>
          {c("Weak links — do not form groups", "弱关联 — 不用于分组")} (
          {data.weakLinks.length})
        </summary>
        <ul>{links(data.weakLinks)}</ul>
      </details>
      <details>
        <summary>
          {c("Large-group links held for review", "因大型组上限而待复核的关联")}{" "}
          ({data.cappedLinks.length})
        </summary>
        <ul>{links(data.cappedLinks)}</ul>
      </details>
      <details>
        <summary>
          {c(
            "Excluded pools, burns and token contract",
            "排除的流动池、销毁地址与代币合约",
          )}
        </summary>
        <ul>
          {data.excluded.map((h) => (
            <li key={h.wallet}>
              {h.wallet}<ExplorerLink kind={h.reason === "token" ? "token" : "address"} value={h.wallet} /> ·{" "}
              {
                {
                  pool: c("Pool", "流动池"),
                  burn: c("Burn address", "销毁地址"),
                  token: c("Token contract", "代币合约"),
                }[h.reason]
              }{" "}
              · {share(h.share)}
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary>
          {c("Excluded hubs", "排除的枢纽地址")} ({data.hubs.length})
        </summary>
        <ul>
          {data.hubs.map((h) => (
            <li key={h.wallet}>
              {h.wallet}<ExplorerLink kind="address" value={h.wallet} /> ·{" "}
              {
                {
                  registry: c("Reviewed registry", "已审阅注册表"),
                  contract: c("Contract", "合约"),
                  fan_out: c(
                    "Auto-flagged: fan-out above 50",
                    "自动标记：接收地址超过 50 个",
                  ),
                }[h.reason]
              }
              {h.reason === "fan_out" &&
                ` · ${c("funded wallets", "资助的地址")}: ${h.fanOut}`}
            </li>
          ))}
        </ul>
      </details>
      <h3>{c("Not-checked holders", "未检查的持有人")}</h3>
      {data.notChecked.length ? (
        <ul>
          {data.notChecked.map((h) => (
            <li key={h.wallet}>
              {h.wallet}<ExplorerLink kind="address" value={h.wallet} /> · {reason(h.reason)}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          {c(
            "None within the returned holder sample.",
            "返回的持有人样本中无此项。",
          )}
        </p>
      )}
      <ul>
        {data.coverage.reasons.map((r) => (
          <li key={r}>{reason(r)}</li>
        ))}
      </ul>
      <p className="opsis-small">
        {c(
          "Explorer calls / reserved credits / RPC calls",
          "浏览器调用／预留积分／RPC 调用",
        )}
        : {data.coverage.explorerCalls} /{" "}
        {data.coverage.explorerCreditsReserved} / {data.coverage.rpcCalls} ·{" "}
        {data.methodVersion} · {data.registryVersion}
      </p>
      {data.receipt && <ReceiptDownload receipt={data.receipt} />}
    </div>
  );
}

import { useEffect, useId, useState } from "react";
import { useCopy } from "./copy";
import {
  correctionUrl,
  readLaunches,
  type LaunchCardData,
  type LaunchFact,
} from "./launch-model";
import "./launches.css";
const names: Record<string, [string, string]> = {
  observed: ["Observed", "已观测"],
  readings: ["Standard control observations", "标准控制观测"],
  kind: ["Observation kind", "观测类别"],
  contract: ["Contract", "合约"],
  hasCode: ["Code present at anchor", "锚点存在代码"],
  observedAt: ["Observation time", "观测时间"],
  expiresAt: ["Expires at", "到期时间"],
  finality: ["Finality", "最终性"],
  current_not_final: ["Current, not final", "当前，尚未最终确认"],
  rpcCalls: ["RPC reads", "RPC 读取"],
  mint_permissions: ["Mint permissions — unchecked", "铸币权限 — 未检查"],
  transfer_fees: [
    "Transfer fees — unchecked by standard controls",
    "转账费用 — 标准控制未检查",
  ],
  custom_roles: ["Custom roles — unchecked", "自定义角色 — 未检查"],
  other_proxy_patterns: [
    "Other proxy patterns — unchecked",
    "其他代理模式 — 未检查",
  ],
  holder_concentration: [
    "Holder concentration — unchecked by standard controls",
    "持有者集中度 — 标准控制未检查",
  ],
  recipientKind: ["Recipient code classification", "接收者代码分类"],
  lock: ["Lock status", "锁定状态"],
  point: ["Event observation", "事件观测"],
  from: ["From", "发送方"],
  to: ["To", "接收方"],
  priceUsd: ["USD per pair token", "每枚配对代币的美元价格"],
  decimals: ["Token decimals", "代币小数位数"],
  available: ["Observed", "已观测"],
  partial: ["Partial", "部分数据"],
  unknown: ["Unknown", "未知"],
  unavailable: ["Unavailable", "不可用"],
  "sell reverted": ["Sell reverted", "卖出回退"],
  "early buyer": ["early buyer", "早期买入者"],
  "same-tx multi-buy": ["same-tx multi-buy", "同交易多地址买入"],
  "new wallet": ["new wallet", "新钱包"],
  byTag: ["By tag", "按标签"],
  transactions: ["Transactions", "交易"],
  wallet: ["Wallet", "钱包"],
  wallets: ["Wallets", "钱包"],
  tag: ["Tag", "标签"],
  count: ["Count in read window", "读取范围内数量"],
  launches: ["Launches", "发行记录"],
  token: ["Token", "代币"],
  launchTime: ["Launch time", "发行时间"],
  factory: ["Factory", "工厂"],
  liquidityHistory: ["Liquidity history", "流动性历史"],
  totalSupplyRaw: ["Total supply (raw units)", "总供应量（原始单位）"],
  balanceRaw: ["Balance (raw units)", "余额（原始单位）"],
  supplyShare: ["Supply share", "供应量占比"],
  numerator: ["Numerator", "分子"],
  denominator: ["Denominator", "分母"],
  decimal: ["Decimal (truncated)", "小数（截断）"],
  checked: ["Checked", "已检查"],
  discovered: ["Discovered", "已发现"],
  recipients: ["Recipients", "接收者"],
  recipientCount: ["Recipient count", "接收者数量"],
  transactionHash: ["Transaction", "交易"],
  signer: ["Transaction signer", "交易签署者"],
  deliveredRaw: ["Delivered (raw units)", "交付数量（原始单位）"],
  basis: ["Basis", "依据"],
  owner: ["Owner", "所有者"],
  paused: ["Paused response", "暂停响应"],
  implementation: ["Implementation", "实现"],
  admin: ["Admin", "管理员"],
  beacon: ["Beacon", "信标"],
  reason: ["Reason", "原因"],
  value: ["Value", "值"],
  state: ["State", "状态"],
  coverage: ["Read coverage", "读取覆盖"],
  limits: ["Limits", "限制"],
  source: ["Source", "来源"],
  anchor: ["Anchor", "锚点"],
  blockNumber: ["Block", "区块"],
  blockHash: ["Block hash", "区块哈希"],
  timestamp: ["Time", "时间"],
  methodVersion: ["Method version", "方法版本"],
  chainId: ["Chain", "链"],
  address: ["Address", "地址"],
  limitations: ["Limits", "限制"],
  unknownReasons: ["Unknown reasons", "未知原因"],
  recipient: ["Position recipient", "头寸接收者"],
  classification: ["Recipient code classification", "接收者代码分类"],
  positionId: ["Position ID", "头寸 ID"],
  lockStatus: ["Lock status", "锁定状态"],
  graduation: ["Graduation", "迁移"],
  initialize: ["Pool initialization", "池初始化"],
  poolTradingStart: ["Pool trading start", "池交易开始"],
  finalPositionRecipient: ["Final position recipient", "最终头寸接收者"],
  windows: ["Read windows", "读取窗口"],
  distributions: ["Deployer distributions", "部署者分发"],
  rule: ["Rule", "规则"],
  version: ["Version", "版本"],
  text: ["Exact rule text", "规则原文"],
  notionalUsd: ["Approximate USD size", "约合美元金额"],
  delaySeconds: ["Sell delay (seconds)", "卖出延迟（秒）"],
  spentRaw: ["Pair spent (raw units)", "支出配对代币（原始单位）"],
  boughtRaw: ["Token received (raw units)", "收到代币（原始单位）"],
  receivedRaw: ["Pair returned (raw units)", "收回配对代币（原始单位）"],
  roundTripCost: ["Round-trip cost ratio", "往返成本比率"],
  buyTax: ["Buy transfer tax inference", "买入转账税推算"],
  sellTax: ["Sell transfer tax inference", "卖出转账税推算"],
  inferredTax: ["Inferred tax ratio", "推算税率"],
  sentRaw: ["Sent (raw units)", "发送数量（原始单位）"],
  revertData: ["Revert data", "回退数据"],
};
export function Dispute({ url = correctionUrl() }: { url?: string | null }) {
  const c = useCopy();
  return url ? (
    <>
      {" "}
      ·{" "}
      <a href={url} target="_blank" rel="noreferrer">
        {c("Dispute", "提出异议")}
      </a>
    </>
  ) : null;
}
function State({ state, reason }: { state: string; reason?: string }) {
  const c = useCopy();
  return (
    <p className="launch-state">
      {c(...(names[state] ?? [state, state]))}
      <Dispute />
      {reason
        ? ` — ${reason}`
        : state === "unknown" || state === "unavailable"
          ? c(" — no verifiable observation supplied", " — 未提供可核实的观测")
          : ""}
    </p>
  );
}
function Value({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const c = useCopy();
  if (value === null || value === undefined)
    return (
      <span>{c("Unknown — no observation supplied", "未知 — 未提供观测")}</span>
    );
  if (typeof value !== "object")
    return (
      <span>
        {typeof value === "boolean"
          ? value
            ? c("Yes", "是")
            : c("No", "否")
          : c(...(names[String(value)] ?? [String(value), String(value)]))}
        {["early buyer", "same-tx multi-buy", "new wallet"].includes(
          String(value),
        ) && <Dispute />}
      </span>
    );
  if (depth > 10)
    return <span>{c("Unknown — nesting limit", "未知 — 超出嵌套上限")}</span>;
  if (Array.isArray(value))
    return value.length ? (
      <ul>
        {value.map((v, i) => (
          <li key={i}>
            <Value value={v} depth={depth + 1} />
          </li>
        ))}
      </ul>
    ) : (
      <p>{c("No entries in the covered window", "覆盖范围内无记录")}</p>
    );
  const record = value as Record<string, unknown>;
  const state = typeof record.state === "string" ? record.state : undefined;
  return (
    <>
      {state && (
        <State
          state={state}
          reason={
            typeof record.reason === "string"
              ? record.reason
              : state === "partial"
                ? c(
                    "Bounded reads; coverage below",
                    "读取范围受限；覆盖详情如下",
                  )
                : undefined
          }
        />
      )}
      <dl className="launch-values">
        {Object.entries(record)
          .filter(([k]) => !["state", "reason", "label"].includes(k))
          .map(([k, v]) => (
            <div key={k}>
              <dt>{c(...(names[k] ?? [k, k]))}</dt>
              <dd>
                <Value value={v} depth={depth + 1} />
              </dd>
            </div>
          ))}
      </dl>
    </>
  );
}
function Section({ title, fact }: { title: string; fact: LaunchFact }) {
  const c = useCopy();
  return (
    <section className="launch-fact">
      <h3>{title}</h3>
      <State
        state={fact.state}
        reason={
          fact.reason ??
          (fact.state === "partial"
            ? c(
                "Bounded read window; coverage below",
                "读取范围受限；覆盖详情如下",
              )
            : undefined)
        }
      />
      {fact.value !== undefined && <Value value={fact.value} />}
      {fact.coverage && (
        <details>
          <summary>{c("Read coverage", "读取覆盖")}</summary>
          <Value value={fact.coverage} />
        </details>
      )}
    </section>
  );
}
export function TagRule({
  tag,
}: {
  tag: {
    kind: string;
    wallet: string;
    transactionHash: string;
    rule: { text: string; version: string };
  };
}) {
  const c = useCopy(),
    id = useId();
  return (
    <tr>
      <td>
        <span
          tabIndex={0}
          className="launch-tooltip"
          title={`${tag.rule.text} (${tag.rule.version})`}
          aria-describedby={id}
        >
          {c(...(names[tag.kind] ?? [tag.kind, tag.kind]))}
          <span id={id} role="tooltip">
            {tag.rule.text} · {tag.rule.version}
          </span>
        </span>
        <Dispute />
      </td>
      <td>{tag.wallet}</td>
      <td>{tag.transactionHash}</td>
    </tr>
  );
}
export function LaunchCardView({ card }: { card: LaunchCardData }) {
  const c = useCopy();
  const launch = card.launch.value as
    | {
        launchpad?: string;
        created?: { timestamp: string };
        t0?: { timestamp: string };
        unknownReasons?: Record<string, string>;
        sourceNote?: string;
        confirmation?: string;
      }
    | undefined;
  const buyers = card.buyers.value as
    | {
        windows?: Array<{ tags?: Array<Parameters<typeof TagRule>[0]["tag"]> }>;
      }
    | undefined;
  return (
    <section className="launch-card">
      <h2>{c("Launch facts", "发行事实")}</h2>
      <p>
        {c("Anchor block", "锚定区块")} {card.anchor.blockNumber} ·{" "}
        {card.anchor.timestamp}
      </p>
      <p className="launch-address">{card.anchor.blockHash}</p>
      <section className="launch-fact">
        <h3>{c("Launchpad and trading start", "发行平台与交易开始")}</h3>
        <State
          state={card.launch.state}
          reason={
            card.launch.reason ??
            (card.launch.state === "partial"
              ? c(
                  "Bounded discovery and trading-start reads",
                  "发行及交易开始的读取范围受限",
                )
              : undefined)
          }
        />
        {launch && (
          <>
            <p>
              {launch.launchpad}
              <Dispute />
            </p>
            <p>
              {c("Launch event", "发行事件")}:{" "}
              {launch.created?.timestamp ?? c("Unknown", "未知")}
            </p>
            <p>
              T0:{" "}
              {launch.t0?.timestamp ??
                launch.unknownReasons?.t0 ??
                c(
                  "Unknown — trading start not established",
                  "未知 — 未确定交易开始",
                )}
            </p>
            <p>
              {launch.confirmation}
              <Dispute />
            </p>
            <p>{launch.sourceNote}</p>
            <Value value={launch.unknownReasons} />
          </>
        )}
        {card.launch.coverage && (
          <details>
            <summary>{c("Read coverage", "读取覆盖")}</summary>
            <Value value={card.launch.coverage} />
          </details>
        )}
      </section>
      <section className="launch-fact">
        <h3>{c("Wallet tag rules", "钱包标签规则")}</h3>
        <State
          state={card.buyers.state}
          reason={
            card.buyers.reason ??
            (card.buyers.state === "partial"
              ? c(
                  "Only covered transactions are tagged",
                  "仅标记覆盖范围内的交易",
                )
              : undefined)
          }
        />
        <div className="launch-table">
          <table>
            <thead>
              <tr>
                <th>{c("Tag and exact rule", "标签及规则原文")}</th>
                <th>{c("Signing wallet", "签署钱包")}</th>
                <th>{c("Transaction", "交易")}</th>
              </tr>
            </thead>
            <tbody>
              {buyers?.windows?.flatMap(
                (w, wi) =>
                  w.tags?.map((tag, i) => (
                    <TagRule key={`${wi}-${i}`} tag={tag} />
                  )) ?? [],
              )}
            </tbody>
          </table>
        </div>
        <p>
          {c(
            "Tag categories overlap; do not add their supply shares.",
            "标签类别可能重叠；请勿相加供应量占比。",
          )}
        </p>
        {card.buyers.coverage && (
          <details>
            <summary>{c("Read coverage and rules", "读取覆盖及规则")}</summary>
            <Value value={card.buyers.coverage} />
          </details>
        )}
      </section>
      <div className="launch-fact-grid">
        <Section
          title={c("Supply share by tag", "按标签划分的供应量占比")}
          fact={card.supplyByTag}
        />
        <Section
          title={c("Deployer history", "部署者历史")}
          fact={card.deployerHistory}
        />
        <Section
          title={c("Deployer distributions", "部署者分发")}
          fact={card.deployerDistributions}
        />
        <Section title={c("LP facts", "流动性头寸事实")} fact={card.lpStatus} />
        <Section title={c("Permissions", "权限")} fact={card.permissions} />
      </div>
      <section className="launch-fact">
        <h3>{c("Sell test", "卖出测试")}</h3>
        <p>
          {card.sellTest.label}
          <Dispute />
        </p>
        <p>
          {c(
            "Synthetic buy then sell; delayed sells use the same anchored state.",
            "合成买入后卖出；延迟卖出使用相同锚定状态。",
          )}
        </p>
        {card.sellTest.results.map((row, i) => (
          <article className="launch-simulation" key={i}>
            <p>
              {c("Approximate USD size", "约合美元金额")}:{" "}
              {String(row.notionalUsd)} · {c("Delay (seconds)", "延迟（秒）")}:{" "}
              {String(row.delaySeconds)}
            </p>
            <p>
              {String(row.label)}
              <Dispute />
            </p>
            <Value value={row} />
          </article>
        ))}
        <ul>
          {card.sellTest.limitations.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
        {card.sellTest.conversion !== undefined && (
          <details>
            <summary>{c("USD conversion source", "美元换算来源")}</summary>
            <Value value={card.sellTest.conversion} />
          </details>
        )}
      </section>
      <p>
        {c(
          "Simulation uses an overridden synthetic balance and empty hook data. Gas costs are excluded from the ratio. Token logs describe reported transfers. Delayed tests use this anchored state; future market conditions remain unknown. USD conversion has a separate source time.",
          "模拟使用覆盖的合成余额及空钩子数据。比率不含网络费用。代币日志仅描述其报告的转账。延迟测试使用此锚定状态；未来市场状况保持未知。美元换算有独立的来源时间。",
        )}
      </p>
      <p>{c("Not investment advice", "非投资建议")}</p>
    </section>
  );
}
function EnabledLaunchCard({ token }: { token: string }) {
  const c = useCopy(),
    [state, setState] = useState<{
      token: string;
      card?: LaunchCardData;
      error?: string;
    }>({ token });
  useEffect(() => {
    const controller = new AbortController();
    void readLaunches<LaunchCardData>(true, token, controller.signal)
      .then((card) => {
        if (!controller.signal.aborted) setState({ token, card });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ token, error: "unavailable" });
      });
    return () => controller.abort();
  }, [token]); // Request identity is the public token only.
  if (state.token !== token || (!state.card && !state.error))
    return (
      <p role="status">{c("Reading launch facts…", "正在读取发行事实…")}</p>
    );
  return state.card ? (
    <LaunchCardView card={state.card} />
  ) : (
    <p role="status">
      {c(
        "Launch facts unavailable — request failed",
        "发行事实不可用 — 请求失败",
      )}
    </p>
  );
}
export default function LaunchCard({
  enabled,
  token,
}: {
  enabled: boolean;
  token: string;
}) {
  return enabled ? <EnabledLaunchCard key={token} token={token} /> : null;
}

import { useEffect, useRef, useState } from "react";
import type { TokenControls } from "@rh-chain/shared";
import { privateApi } from "../dashboard/http";
import { useCopy } from "./copy";
import { validControls } from "./controls-model";

export default function ContractControls({ contract }: { contract: string }) {
  const c = useCopy();
  const [data, setData] = useState<TokenControls | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(Date.now);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!data) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [data]);
  async function run() {
    pending.current?.abort();
    const abort = new AbortController();
    pending.current = abort;
    setBusy(true);
    setError(false);
    setData(null);
    try {
      const result = await privateApi<unknown>(
        "/v1/private/opsis/controls",
        { contract },
        abort.signal,
      );
      if (!validControls(result, contract))
        throw new Error("Invalid observation");
      if (!abort.signal.aborted) {
        setData(result);
        setNow(Date.now());
      }
    } catch {
      if (!abort.signal.aborted) setError(true);
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  const labels = {
    owner: c("owner() response", "owner() 返回值"),
    paused: c("paused() response", "paused() 返回值"),
    implementation: c("ERC-1967 implementation slot", "ERC-1967 实现槽"),
    admin: c("ERC-1967 admin slot", "ERC-1967 管理员槽"),
    beacon: c("ERC-1967 beacon slot", "ERC-1967 信标槽"),
  };
  const uncheckedLabels = {
    mint_permissions: c("mint permissions", "铸币权限"),
    transfer_fees: c("transfer fees", "转账费用"),
    custom_roles: c("custom roles", "自定义角色"),
    other_proxy_patterns: c("other proxy patterns", "其他代理模式"),
    holder_concentration: c("holder concentration", "持有者集中度"),
  };
  return (
    <details className="opsis-panel">
      <summary>{c("Inspect contract controls", "检查合约控制")}</summary>
      <p>
        {c(
          "Check five standard getters/storage fields at one block. A zero owner or empty proxy slot does not prove that control was relinquished. Minting, taxes, custom roles and holder concentration remain unknown.",
          "在同一区块检查五个标准读取字段／存储槽。零所有者或空代理槽不证明已放弃控制权。铸币、税费、自定义角色及持有者集中度仍然未知。",
        )}
      </p>
      <p className="opsis-receipt">
        {c(
          "Sends only this public contract to Opsis and the configured Robinhood RPC. No wallet, saved amounts or private notes are sent.",
          "仅向 Opsis 和配置的 Robinhood RPC 发送此公开合约。不发送钱包、已保存数量或私人备注。",
        )}
      </p>
      <button
        className="opsis-action"
        disabled={busy}
        onClick={() => void run()}
      >
        {busy
          ? c("Reading controls…", "正在读取控制…")
          : c("Check standard controls", "核查标准控制")}
      </button>
      {error && (
        <p role="alert">
          {c(
            "Controls unavailable. The provider failed, was limited, or the block changed. No permission or safety conclusion follows.",
            "控制信息不可用。提供商失败、受限或区块发生变化。不代表任何权限或安全结论。",
          )}
        </p>
      )}
      {data && (
        <section aria-live="polite" data-testid="opsis-controls-result">
          <p className="opsis-kicker">
            {c("OBSERVED / PARTIAL COVERAGE", "已观察 / 部分覆盖")} ·{" "}
            {now >= Date.parse(data.expiresAt)
              ? c("STALE", "已过期")
              : c("CURRENT", "当前")}
          </p>
          <p>
            {c("Code at this block", "此区块的代码")}:{" "}
            {data.hasCode
              ? c(
                  "Present; not an ERC-20 verification",
                  "存在；并非 ERC-20 验证",
                )
              : c(
                  "No code observed; classification is not inferred",
                  "未观察到代码；不推断分类",
                )}
          </p>
          <div className="opsis-table-wrap">
            <table>
              <caption>
                {c("Standard control observations", "标准控制观察")}
              </caption>
              <thead>
                <tr>
                  <th>{c("Field", "字段")}</th>
                  <th>{c("Observed value", "观察值")}</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => (
                  <tr key={key}>
                    <th>{labels[key]}</th>
                    <td style={{ overflowWrap: "anywhere" }}>
                      {data.readings[key].state === "observed"
                        ? data.readings[key].value
                        : !data.hasCode
                          ? c("Not read — no code observed", "未读取 — 未观察到代码")
                          : data.readings[key].reason === "reverted"
                            ? c("Unknown — read reverted", "未知 — 读取已回退")
                            : c("Unknown — malformed response", "未知 — 响应格式无效")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="opsis-small">
            {c("Not evaluated by these standard reads", "这些标准读取未评估")}: {data.coverage.unknown.map((key) => uncheckedLabels[key]).join(" · ")}.
          </p>
          <p className="opsis-small">
            {data.source} · {data.observedAt} · {c("Block", "区块")}{" "}
            {data.anchor.blockNumber} ·{" "}
            {c("current, not final", "当前，未最终确认")}
          </p>
          <p className="opsis-identity">{data.anchor.blockHash}</p>
          <p>
            {c(
              "Getters may misrepresent behavior. These observations do not prove sellability, absence of privileges, or token safety.",
              "读取函数可能与实际行为不符。这些观察不证明可卖出、无特权或代币安全。",
            )}
          </p>
        </section>
      )}
    </details>
  );
}

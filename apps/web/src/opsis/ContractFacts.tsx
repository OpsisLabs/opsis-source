import type { ContractFact, ContractFacts as Facts } from "@rh-chain/shared";
import { useCopy } from "./copy";

export default function ContractFacts({ facts, address }: { facts: Facts; address: string }) {
  const c = useCopy();
  const unknown = (fact: ContractFact<unknown>) => fact.reason === "explorer_unavailable"
    ? c("Can't check (explorer unavailable)", "无法核查（区块浏览器不可用）")
    : fact.reason === "malformed" ? c("Can't check (malformed explorer data)", "无法核查（区块浏览器数据格式错误）")
      : c("Can't check (not reported by Blockscout)", "无法核查（Blockscout 未报告）");
  const state = (fact: ContractFact<boolean>, yes: string, no: string) => fact.value === true ? yes : fact.value === false ? no : unknown(fact);
  const rows: { label: string; fact: ContractFact<unknown>; value: string }[] = [
    { label: c("Source verification", "源代码验证"), fact: facts.sourceVerified, value: state(facts.sourceVerified, c("Source verified on Blockscout", "源代码已在 Blockscout 验证"), c("Source not verified on Blockscout", "源代码未在 Blockscout 验证")) },
    { label: c("Contract name as verified", "验证记录中的合约名称"), fact: facts.name, value: facts.name.value ?? unknown(facts.name) },
    { label: c("Compiler version", "编译器版本"), fact: facts.compilerVersion, value: facts.compilerVersion.value ?? unknown(facts.compilerVersion) },
    { label: c("Optimisation", "编译优化"), fact: facts.optimizationEnabled, value: state(facts.optimizationEnabled, c("On", "开启"), c("Off", "关闭")) },
    { label: c("Proxy reported by Blockscout", "Blockscout 报告的代理状态"), fact: facts.proxy, value: state(facts.proxy, c("Yes", "是"), c("No", "否")) },
    { label: c("Implementation address", "实现合约地址"), fact: facts.implementations, value: facts.implementations.value === null ? unknown(facts.implementations) : facts.implementations.value.length ? facts.implementations.value.join(", ") : c("None reported", "未报告实现地址") },
    { label: c("Verified at", "验证时间"), fact: facts.verifiedAt, value: facts.verifiedAt.value ?? unknown(facts.verifiedAt) },
  ];
  return <section className="opsis-panel research-contract-facts" aria-labelledby="contract-facts-title" data-testid="contract-facts">
    <h2 id="contract-facts-title">{c("Contract facts", "合约事实")}</h2>
    <p className="opsis-small">{c("Verified source does not mean the contract is safe.", "源代码已验证不代表合约安全。")}</p>
    <dl>{rows.map(({ label, fact, value }) => <div key={label}>
      <dt>{label}</dt>
      <dd>{value}<small>
        {c("Source", "来源")}: {fact.source ? <a href={fact.source.url} target="_blank" rel="noopener noreferrer">Blockscout ↗</a> : "Blockscout"}
        {" · "}{c("Read time", "读取时间")}: {fact.source ? <time dateTime={fact.source.fetchedAt}>{fact.source.fetchedAt}</time> : c("Unavailable", "不可用")}
      </small></dd>
    </div>)}</dl>
    <a href={`https://robinhoodchain.blockscout.com/address/${address}?tab=contract`} target="_blank" rel="noopener noreferrer">{c("View source on Blockscout ↗", "在 Blockscout 查看源代码 ↗")}</a>
  </section>;
}

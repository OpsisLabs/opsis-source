import {
  Children,
  isValidElement,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  Database,
  FileText,
  Info,
  Laptop,
  LockKeyhole,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { useCopy } from "../opsis/copy";
import "../opsis/utility-shell.css";
import "./legal-workspace.css";

type DocumentKind = "privacy" | "terms";

function PrivacyFlow() {
  const c = useCopy();
  return (
    <section className="legal-ws-flow" aria-labelledby="legal-flow-title">
      <h2 id="legal-flow-title">{c("How data flows", "数据如何流动")}</h2>
      <p>
        {c(
          "Public lookups go to the providers named in your privacy receipt. The encrypted Vault stays in this browser.",
          "公开查询会发送给隐私凭据中注明的提供方。加密保险库保留在此浏览器中。",
        )}
      </p>
      <div
        className="legal-ws-flow-path"
        role="img"
        aria-label={c(
          "Your browser sends public lookup requests to public data sources. The encrypted local Vault stays on this device and is not sent to providers.",
          "您的浏览器向公开数据来源发送公开查询请求。加密的本地保险库保留在此设备上，不会发送给提供方。",
        )}
      >
        <div className="legal-ws-browser">
          <h3>{c("Your browser", "您的浏览器")}</h3>
          <Laptop size={44} strokeWidth={1.25} aria-hidden="true" />
          <p>
            {c(
              "Search and analyze public data in Opsis",
              "在 Opsis 中搜索和分析公开数据",
            )}
          </p>
        </div>
        <div className="legal-ws-request">
          <span>{c("Public lookup request", "公开查询请求")}</span>
          <ArrowRight strokeWidth={1.25} aria-hidden="true" />
          <small>{c("Public identifier", "公开标识符")}</small>
        </div>
        <div className="legal-ws-providers">
          <h3>{c("Public data sources", "公开数据来源")}</h3>
          <Database size={40} strokeWidth={1.25} aria-hidden="true" />
          <p>
            {c("Providers return public chain data", "提供方返回公开链上数据")}
          </p>
        </div>
        <div className="legal-ws-local">
          <h3>{c("Encrypted local Vault", "加密的本地保险库")}</h3>
          <LockKeyhole size={38} strokeWidth={1.25} aria-hidden="true" />
          <p>
            {c("Saved records stay on this device", "保存的记录保留在此设备上")}
          </p>
          <small>{c("No provider connection", "不连接提供方")}</small>
        </div>
      </div>
    </section>
  );
}

export default function LegalWorkspace({
  kind,
  title,
  updated,
  children,
}: {
  kind: DocumentKind;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  const c = useCopy();
  const [selected, setSelected] = useState(() => {
    if (typeof window === "undefined") return "01";
    return /^#legal-section-(0[1-9]|alerts)$/.exec(window.location.hash)?.[1] ?? "01";
  });
  useEffect(() => {
    // Deep links from the document dock resolve after the lazy legal page mounts.
    const match = /^#legal-section-(0[1-9]|alerts)$/.exec(window.location.hash);
    if (!match) return;
    // The shared route-ready effect focuses the page heading first. Resolve
    // the public section anchor after that effect has completed.
    const frame = window.requestAnimationFrame(() => {
      const section = document.getElementById(`legal-section-${match[1]}`);
      section?.focus({ preventScroll: true });
      section?.scrollIntoView({ block: "start", behavior: "instant" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const root = document.querySelector(".legal-ws-reading");
    if (!root) return;
    const observer = new IntersectionObserver(
      () => {
        const top = root.getBoundingClientRect().top;
        const active = document.activeElement;
        if (active?.id.startsWith("legal-section-") && root.contains(active)) {
          const rect = active.getBoundingClientRect();
          if (rect.top >= top && rect.top < root.getBoundingClientRect().bottom) {
            setSelected(active.id.replace("legal-section-", ""));
            return;
          }
        }
        const sections = Array.from(root.querySelectorAll(".legal-ws-sections > section"));
        const current = sections.filter((section) => section.getBoundingClientRect().top <= top + 40).at(-1) ?? sections[0];
        if (current) setSelected(current.id.replace("legal-section-", ""));
      },
      { root, rootMargin: "0px 0px -65% 0px", threshold: 0 },
    );
    root
      .querySelectorAll(".legal-ws-sections > section")
      .forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [kind]);
  const sections = Children.toArray(children).filter((child) =>
    isValidElement<{ n: string; title: string }>(child),
  );
  const privacy = kind === "privacy";
  function goToSection(event: React.MouseEvent<HTMLAnchorElement>, n: string) {
    event.preventDefault();
    setSelected(n);
    const section = document.getElementById(`legal-section-${n}`);
    section?.focus({ preventScroll: true });
    section?.scrollIntoView({ block: "start", behavior: "instant" });
    window.history.replaceState(
      window.history.state,
      "",
      `#legal-section-${n}`,
    );
  }
  return (
    <div className={`legal-ws-page legal-ws-${kind}`}>
      <div className="legal-ws-grid">
        <nav
          className="legal-ws-index"
          aria-label={c("Document sections", "文档章节")}
        >
          <h2>{title}</h2>
          <ol>
            {sections.map((section) => (
              <li key={section.props.n}>
                <a
                  href={`#legal-section-${section.props.n}`}
                  aria-current={
                    selected === section.props.n ? "location" : undefined
                  }
                  onClick={(event) => goToSection(event, section.props.n)}
                >
                  <span>{section.props.n}</span>
                  {section.props.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="legal-ws-reading" aria-label={title} tabIndex={0}>
          {privacy ? (
            <PrivacyFlow />
          ) : (
            <div className="legal-ws-boundary">
              <Info size={24} strokeWidth={1.5} aria-hidden="true" />
              <div>
                <h2>
                  {c(
                    "Opsis does not sign or broadcast transactions",
                    "Opsis 不会签署或广播交易",
                  )}
                </h2>
                <a
                  href="#legal-section-03"
                  onClick={(event) => goToSection(event, "03")}
                >
                  {c("Read the read-only boundary", "阅读只读边界")}{" "}
                  <span aria-hidden="true">→</span>
                </a>
              </div>
            </div>
          )}
          <div className="legal-ws-sections">{children}</div>
        </article>
        <aside
          className="legal-ws-dock"
          aria-label={
            privacy
              ? c("Privacy at a glance", "隐私概览")
              : c("Document information", "文档信息")
          }
        >
          {privacy ? (
            <section className="legal-ws-dock-panel">
              <h2>{c("At a glance", "概览")}</h2>
              <div className="legal-ws-concept">
                <Shield size={24} strokeWidth={1.5} aria-hidden="true" />
                <div>
                  <h3>{c("Encrypted on this device", "在此设备上加密")}</h3>
                  <p>
                    {c(
                      "Vault records are encrypted in this browser before they enter local storage.",
                      "保险库记录在进入本地存储之前，会先在此浏览器中加密。",
                    )}
                  </p>
                </div>
              </div>
              <div className="legal-ws-concept">
                <FileText size={24} strokeWidth={1.5} aria-hidden="true" />
                <div>
                  <h3>{c("Lookups use public data", "查询使用公开数据")}</h3>
                  <p>
                    {c(
                      "Public identifiers go to the providers named in the on-screen privacy receipt.",
                      "公开标识符会发送给屏幕隐私凭据中注明的提供方。",
                    )}
                  </p>
                </div>
              </div>
              <div className="legal-ws-concept">
                <SlidersHorizontal
                  size={24}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <div>
                  <h3>{c("Your local choices", "您的本地选择")}</h3>
                  <p>
                    {c(
                      "The Vault supports encrypted backup export and local deletion with browser confirmation.",
                      "保险库支持导出加密备份，并可在浏览器确认后进行本地删除。",
                    )}
                  </p>
                </div>
              </div>
              <p className="legal-ws-updated">{updated}</p>
            </section>
          ) : (
            <>
              <section className="legal-ws-dock-panel">
                <h2>{c("Document information", "文档信息")}</h2>
                <dl>
                  <div>
                    <dt>{c("Document", "文档")}</dt>
                    <dd>{title}</dd>
                  </div>
                  <div>
                    <dt>{c("Last updated", "最后更新")}</dt>
                    <dd>{updated}</dd>
                  </div>
                  <div>
                    <dt>{c("Scope", "范围")}</dt>
                    <dd>{c("Opsis tools and data", "Opsis 工具与数据")}</dd>
                  </div>
                </dl>
              </section>
              <section className="legal-ws-dock-panel">
                <h2>{c("Contact", "联系方式")}</h2>
                <p>
                  {c(
                    "Support and security contact details are listed on the Privacy page.",
                    "支持与安全联系详情列于隐私页面。",
                  )}
                </p>
                <a href="/privacy#legal-section-08">
                  {c("Privacy and contact details", "隐私与联系详情")}{" "}
                  <span aria-hidden="true">→</span>
                </a>
              </section>
              <section className="legal-ws-dock-panel">
                <h2>{c("Related resources", "相关资源")}</h2>
                <a className="legal-ws-resource" href="/guide">
                  {c("Find your tool", "查找工具")}{" "}
                  <span aria-hidden="true">→</span>
                </a>
                <a className="legal-ws-resource" href="/status">
                  {c("Data status", "数据状态")}{" "}
                  <span aria-hidden="true">→</span>
                </a>
                <a className="legal-ws-resource" href="/privacy">
                  {c("Privacy", "隐私")} <span aria-hidden="true">→</span>
                </a>
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

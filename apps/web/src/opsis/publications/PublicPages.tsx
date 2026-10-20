import { useEffect, useState } from "react";
import {
  ArrowRight,
  Database,
  FileText,
  LockKeyhole,
  Monitor,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { Link, useLocation } from "react-router";
import { useI18n } from "../../i18n";
import { robotsDirective } from "../../product/public-pages";
import { useCopy } from "../copy";
import { initialTheme, persistTheme } from "../theme";
import WorkspaceShell from "../shell/WorkspaceShell";
import "../opsis.css";
import "../shell.css";
import "../workspace-identity.css";
import ContractAddress from "./ContractAddress";
import { docs, whitepaper } from "./content";
import "./publications.css";

export default function PublicPages() {
  const location = useLocation();
  const { locale, setLocale } = useI18n();
  const c = useCopy();
  const [theme, setTheme] = useState(initialTheme);
  const [activeSection, setActiveSection] = useState("");
  const [indexOpen, setIndexOpen] = useState(
    () =>
      typeof window === "undefined" ||
      !window.matchMedia("(max-width: 700px)").matches,
  );
  const isPaper = location.pathname.replace(/\/$/, "") === "/whitepaper";
  const title = isPaper
    ? c("Whitepaper", "白皮书")
    : c("Documentation", "文档");
  const intro = isPaper
    ? c(
        "The ideas, evidence and boundaries behind Opsis.",
        "Opsis 背后的理念、证据与边界。",
      )
    : c(
        "Understand the tools. Read the evidence. Keep your context.",
        "理解工具，阅读证据，保留背景。",
      );
  const sections = isPaper ? whitepaper : docs;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: "-88px 0px -65% 0px" },
    );
    sections.forEach(({ id }) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, [sections]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `Opsis · ${title}`;
    const canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    const previousCanonical = canonical?.href;
    const path = isPaper ? "/whitepaper" : "/docs";
    const url = new URL(path, previousCanonical || window.location.origin).href;
    canonical?.setAttribute("href", url);
    const values = [
      ['meta[name="description"]', intro],
      ['meta[property="og:title"]', `Opsis · ${title}`],
      ['meta[property="og:description"]', intro],
      ['meta[property="og:url"]', url],
      ['meta[name="twitter:title"]', `Opsis · ${title}`],
      ['meta[name="twitter:description"]', intro],
      [
        'meta[name="robots"]',
        robotsDirective(path, import.meta.env.VITE_OPSIS_INDEXABLE),
      ],
    ];
    const restore = values.map(([selector, value]) => {
      const element = document.querySelector<HTMLMetaElement>(selector);
      const before = element?.content;
      if (element) element.content = value;
      return () => {
        if (element && before !== undefined) element.content = before;
      };
    });
    return () => {
      document.title = previousTitle;
      if (previousCanonical) canonical?.setAttribute("href", previousCanonical);
      restore.forEach((fn) => fn());
    };
  }, [title, intro, isPaper]);

  useEffect(() => {
    if (location.hash) {
      // Only section identifiers from this publication are navigation targets.
      const id = location.hash.slice(1);
      if (id === "contract" || sections.some((section) => section.id === id))
        document.getElementById(id)?.scrollIntoView();
    } else window.scrollTo(0, 0);
  }, [location.pathname, location.hash, sections]);

  return (
    <div
      className="opsis opsis-terminal opsis-publication"
      data-theme={theme}
      data-workspace="publications"
    >
      <a className="opsis-skip" href="#publication-content">
        {c("Skip to content", "跳至内容")}
      </a>
      <WorkspaceShell
        capabilities={null}
        publications
        theme={theme}
        locale={locale}
        stage={c("Reading", "阅读")}
        onTheme={() => {
          const next = theme === "light" ? "dark" : "light";
          setTheme(next);
          persistTheme(next);
        }}
        onLocale={() => setLocale(locale === "en" ? "zh-CN" : "en")}
      />
      <main
        className="opsis-content publication-workspace"
        id="publication-content"
        tabIndex={-1}
      >
        <div className="publication-layout">
          <aside className="publication-index">
            <details
              open={indexOpen}
              onToggle={(event) => setIndexOpen(event.currentTarget.open)}
            >
              <summary>{title}</summary>
              <nav aria-label={c("On this page", "本页内容")}>
                {sections.map((section) => (
                  <a
                    href={`#${section.id}`}
                    key={section.id}
                    aria-current={
                      (activeSection || sections[0].id) === section.id
                        ? "location"
                        : undefined
                    }
                    onClick={() => setActiveSection(section.id)}
                  >
                    {c(...section.title)}
                  </a>
                ))}
                <a href="#contract">{c("Contract address", "合约地址")}</a>
              </nav>
            </details>
            <nav
              className="publication-switch"
              aria-label={c("Publications", "出版物")}
            >
              <Link to="/docs" aria-current={!isPaper ? "page" : undefined}>
                <FileText size={15} aria-hidden="true" />
                {c("Docs", "文档")}
              </Link>
              <Link
                to="/whitepaper"
                aria-current={isPaper ? "page" : undefined}
              >
                <FileText size={15} aria-hidden="true" />
                {c("Whitepaper", "白皮书")}
              </Link>
            </nav>
            <Link className="publication-return" to="/guide">
              {c("Open the tools ↗", "打开工具 ↗")}
            </Link>
          </aside>
          <article className="publication-reading" aria-label={title}>
            <header className="publication-hero">
              <h1>{title}</h1>
              <p className="publication-intro">{intro}</p>
            </header>
            <section
              className="publication-flow"
              aria-labelledby="publication-flow-title"
            >
              <h2 id="publication-flow-title">
                {c("Public reads, local context", "公开读取，本地背景")}
              </h2>
              <p>
                {c(
                  "Public lookups and your encrypted local Vault have separate boundaries.",
                  "公开查询与本地加密保险库具有各自的边界。",
                )}
              </p>
              <div className="publication-flow-nodes">
                <div className="publication-flow-node">
                  <h3>{c("Your browser", "您的浏览器")}</h3>
                  <Monitor aria-hidden="true" />
                  <p>{c("Research and local scenarios", "研究与本地情景")}</p>
                </div>
                <div className="publication-flow-arrow">
                  <span>{c("Public lookup request", "公开查询请求")}</span>
                  <span className="publication-flow-line">
                    <ArrowRight size={18} aria-hidden="true" />
                  </span>
                  <small>
                    {c("Identifier · submitted amount", "标识符 · 提交的数量")}
                  </small>
                </div>
                <div className="publication-flow-node">
                  <h3>{c("Public data sources", "公开数据源")}</h3>
                  <Database aria-hidden="true" />
                  <p>
                    {c("Source, time and coverage", "来源、时间与覆盖范围")}
                  </p>
                </div>
                <div className="publication-flow-node publication-flow-vault">
                  <h3>{c("Your local Vault", "您的本地保险库")}</h3>
                  <LockKeyhole aria-hidden="true" />
                  <p>{c("Encrypted in your browser", "在您的浏览器中加密")}</p>
                  <small>
                    {c(
                      "Notes and saved records stay local",
                      "备注与保存记录保留在本地",
                    )}
                  </small>
                </div>
              </div>
            </section>
            {sections.map((section) => (
              <section
                className="publication-section"
                id={section.id}
                key={section.id}
                aria-labelledby={`${section.id}-title`}
              >
                <h2 id={`${section.id}-title`}>{c(...section.title)}</h2>
                <div className="publication-section-body">
                  {section.paragraphs.map((paragraph, i) => (
                    <p key={i}>{c(...paragraph)}</p>
                  ))}
                  {section.items && (
                    <div className="publication-notes">
                      {section.items.map((item) => (
                        <section key={item.title[0]}>
                          <h3>{c(...item.title)}</h3>
                          <p>{c(...item.body)}</p>
                          {item.href && item.link && (
                            <Link to={item.href}>{c(...item.link)}</Link>
                          )}
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            ))}
            <footer className="publication-reading-footer">
              <p>
                {c(
                  "Research without connecting a wallet or signing up. Not investment advice.",
                  "研究无需连接钱包或注册。不构成投资建议。",
                )}
              </p>
              <nav aria-label={c("Further reading", "更多阅读")}>
                <Link to={isPaper ? "/docs" : "/whitepaper"}>
                  {isPaper ? c("Docs", "文档") : c("Whitepaper", "白皮书")}
                </Link>
                <Link to="/status">{c("Data status", "数据状态")}</Link>
                <Link to="/privacy">{c("Privacy", "隐私")}</Link>
                <Link to="/terms">{c("Terms", "条款")}</Link>
                <Link to="/">{c("Back to Opsis", "返回 Opsis")}</Link>
              </nav>
            </footer>
          </article>
          <aside
            className="publication-dock"
            aria-label={c("At a glance", "一目了然")}
          >
            <section
              id="contract"
              aria-labelledby="contract-title"
              className="publication-contract"
            >
              <h2 id="contract-title">{c("Contract address", "合约地址")}</h2>
              <ContractAddress />
            </section>
            <h2 className="publication-glance-title">
              {c("At a glance", "一目了然")}
            </h2>
            <div className="publication-glance-item">
              <span>
                <ShieldCheck aria-hidden="true" />
              </span>
              <div>
                <h3>
                  {c("Private context stays local", "私密背景保留在本地")}
                </h3>
                <p>
                  {c(
                    "Private notes and labels stay local.",
                    "私密备注和标签保留在本地。",
                  )}
                </p>
              </div>
            </div>
            <div className="publication-glance-item">
              <span>
                <FileText aria-hidden="true" />
              </span>
              <div>
                <h3>{c("Read the evidence", "阅读证据")}</h3>
                <p>{c("Every result has a scope.", "每份结果都有范围。")}</p>
                <Link to={isPaper ? "#method" : "#evidence"}>
                  {c("Sources and limits", "来源与限制")}{" "}
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </div>
            </div>
            <div className="publication-glance-item">
              <span>
                <SlidersHorizontal aria-hidden="true" />
              </span>
              <div>
                <h3>{c("Check availability", "核对可用性")}</h3>
                <p>
                  {c(
                    "Availability is deployment-specific; a planned capability is not a live service.",
                    "可用性取决于具体部署；计划中的能力并不等于已上线服务。",
                  )}
                </p>
                <Link to="/status">
                  {c("Data status", "数据状态")}{" "}
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </div>
            </div>
            <p className="publication-meta">
              {c(
                "Edition 1 · 19 October 2026",
                "第 1 版 · 2026 年 10 月 19 日",
              )}
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}

import { ALERTS_PRIVACY } from "@rh-chain/shared";
import { Link } from "react-router";
import { isCollectibleCatalogEnabled } from "../product/availability";
import { contactAddresses } from "../product/contact";
import { useI18n } from "../i18n";
import LanguageSwitcher from "../i18n/LanguageSwitcher";
import { OPSIS_PRESENTATION } from "../opsis/presentation";
import LegalWorkspace from "./LegalWorkspace";

function LogoMark({ className = "w-7 h-7" }: { className?: string }) {
  return <img src="/logo.svg" alt="Opsis" className={className} />;
}

function LegacyShell({
  tag,
  title,
  updated,
  children,
}: {
  tag: string;
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-[#1d1d1d] text-[#e9e0d1]">
      <a
        href="#legal-main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("legal-main")?.focus();
          window.history.replaceState(null, "", "#legal-main");
        }}
        className="fixed left-3 top-3 z-[120] -translate-y-24 bg-[#fa6c34] px-4 py-3 font-mono-d text-[10px] font-semibold text-[#1d1d1d] outline-none transition-transform focus:translate-y-0 focus-visible:ring-2 focus-visible:ring-white"
      >
        {t("legal.chrome.skip")}
      </a>
      <header className="flex min-h-[64px] flex-wrap items-center justify-between gap-3 border-b border-[#2e2e2e] px-4 py-2 md:px-12">
        <Link to="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center bg-[#fa6c34]">
            <LogoMark />
          </span>
          <span className="font-mono-d text-[11px] leading-4 text-[#9a938a]">
            Opsis
          </span>
        </Link>
        <LanguageSwitcher />
        <Link
          to="/"
          className="font-mono-d text-[11px] tracking-wider text-[#9a938a] transition-colors hover:text-[#e9e0d1]"
        >
          {t("legal.chrome.back")}
        </Link>
      </header>

      <main
        id="legal-main"
        tabIndex={-1}
        className="mx-auto max-w-[860px] px-6 py-16 [overflow-wrap:anywhere] outline-none md:px-12"
      >
        <div className="mb-10 flex items-center gap-3 border-y border-[#2e2e2e] py-3">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[#e9e0d1]" />
          <span className="font-mono-d text-[12px] text-[#9a938a]">{tag}</span>
          <span className="hatch h-3 flex-1 opacity-60" />
          <span className="font-mono-d text-[11px] text-[#635d5a]">
            {updated}
          </span>
        </div>
        <h1 className="text-[40px] font-medium leading-[1.05] tracking-[-0.03em] md:text-[52px]">
          {title}
        </h1>
        <div className="mt-12 space-y-12">{children}</div>
      </main>

      <footer className="border-t border-[#2e2e2e] px-6 py-8 text-center font-mono-d text-[10.5px] tracking-wider text-[#635d5a] md:px-12">
        {t("legal.chrome.footer")}
      </footer>
    </div>
  );
}

/** Opsis renders legal content inside its shell; the legacy build keeps its own chrome. */
function Shell(props: {
  kind: "privacy" | "terms";
  tag: string;
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return OPSIS_PRESENTATION ? (
    <LegalWorkspace {...props} />
  ) : (
    <LegacyShell {...props} />
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={OPSIS_PRESENTATION ? `legal-section-${n}` : undefined} tabIndex={OPSIS_PRESENTATION ? -1 : undefined}>
      <h2 className="flex items-baseline gap-4 text-[20px] font-medium tracking-[-0.01em] text-[#f0e8da]">
        <span className="font-mono-d text-[12px] text-[#635d5a]">{n}</span>
        {title}
      </h2>
      <div className="mt-4 space-y-4 border-l border-[#2e2e2e] pl-8 text-[14px] leading-relaxed text-[#9a938a]">
        {children}
      </div>
    </section>
  );
}

export function PrivacyPage() {
  const { t, locale } = useI18n();
  const collectibleCatalogEnabled = isCollectibleCatalogEnabled();
  let contact = null;
  try {
    contact = contactAddresses(import.meta.env.VITE_SUPPORT_EMAIL, import.meta.env.VITE_SECURITY_EMAIL);
  } catch {
    // A malformed setting must never become a rendered contact link.
  }
  return (
    <Shell
      kind="privacy"
      tag={t("legal.chrome.tag")}
      title={t("legal.privacy.title")}
      updated={t("legal.privacy.updated")}
    >
      <Section n="01" title={t("legal.privacy.s01.title")}>
        <p>{t("legal.privacy.s01.body")}</p>
      </Section>

      <Section n="02" title={t("legal.privacy.s02.title")}>
        <p>
          <span className="text-[#e9e0d1]">
            {t("legal.privacy.s02.privateMode.lead")}
          </span>{" "}
          {t("legal.privacy.s02.privateMode.body")}
        </p>
        <p>
          <span className="text-[#e9e0d1]">
            {t("legal.privacy.s02.cloudAccount.lead")}
          </span>{" "}
          {t("legal.privacy.s02.cloudAccount.body")}
        </p>
        <p>
          <span className="text-[#e9e0d1]">
            {t("legal.privacy.s02.vault.lead")}
          </span>{" "}
          {t("legal.privacy.s02.vault.body")}
        </p>
        <p>
          <span className="text-[#e9e0d1]">
            {t("legal.privacy.s02.portfolio.lead")}
          </span>{" "}
          {t("legal.privacy.s02.portfolio.body")}
        </p>
        <p>
          <span className="text-[#e9e0d1]">
            {t("legal.privacy.s02.usage.lead")}
          </span>{" "}
          {t("legal.privacy.s02.usage.body")}
        </p>
        <p>
          <span className="text-[#e9e0d1]">
            {t("legal.privacy.s02.rwa.lead")}
          </span>{" "}
          {t("legal.privacy.s02.rwa.body")}
        </p>
        <p>
          <span className="text-[#e9e0d1]">
            {t("legal.privacy.s02.collectible.lead")}
          </span>{" "}
          {t(
            collectibleCatalogEnabled
              ? "legal.privacy.s02.collectible.enabled"
              : "legal.privacy.s02.collectible.comingSoon",
          )}
        </p>
        <p>
          <span className="text-[#e9e0d1]">
            {t("product.feature.card-price-check.label")}.
          </span>{" "}
          {t("cards.privacy.collection")}
        </p>
        <p>
          <span className="text-[#e9e0d1]">
            {t("legal.privacy.s02.market.lead")}
          </span>{" "}
          {t("legal.privacy.s02.market.body")}
        </p>
        <p>
          <span className="text-[#e9e0d1]">
            {t("legal.privacy.s02.savedQueries.lead")}
          </span>{" "}
          {t("legal.privacy.s02.savedQueries.body")}
        </p>
        <p>
          <span className="text-[#e9e0d1]">
            {t("legal.privacy.s02.technical.lead")}
          </span>{" "}
          {t("legal.privacy.s02.technical.body")}
        </p>
      </Section>

      <Section n="alerts" title={locale === "en" ? "Opt-in alerts in Telegram" : "自愿启用的 Telegram 提醒"}>
        {ALERTS_PRIVACY[locale === "zh-CN" ? "zh-CN" : "en"].map((text) => <p key={text}>{text}</p>)}
      </Section>

      <Section n="03" title={t("legal.privacy.s03.title")}>
        <p>{t("legal.privacy.s03.body")}</p>
      </Section>

      <Section n="04" title={t("legal.privacy.s04.title")}>
        <p>{t("legal.privacy.s04.p1")}</p>
        <p>{t("legal.privacy.s04.p2")}</p>
        <p>{t("legal.privacy.s04.p3")}</p>
      </Section>

      <Section n="05" title={t("legal.privacy.s05.title")}>
        <p>{t("legal.privacy.s05.p1")}</p>
        <p>{t("legal.privacy.s05.p2")}</p>
        <p>{t("legal.privacy.s05.p3")}</p>
        <p>
          {t(
            collectibleCatalogEnabled
              ? "legal.privacy.s05.collectible.enabled"
              : "legal.privacy.s05.collectible.comingSoon",
          )}
        </p>
        <p>{t("cards.privacy.providers")}</p>
        <p>{t("legal.privacy.s05.p6")}</p>
      </Section>

      <Section n="06" title={t("legal.privacy.s06.title")}>
        <p>{t("legal.privacy.s06.p1")}</p>
        <p>{t("legal.privacy.s06.p2")}</p>
      </Section>

      <Section n="07" title={t("legal.privacy.s07.title")}>
        <p>{t("legal.privacy.s07.p1")}</p>
        <p>{t("legal.privacy.s07.p2")}</p>
      </Section>

      <Section n="08" title={t("legal.privacy.s08.title")}>
        <p>{t("legal.privacy.s08.prefix")}</p>
        <p>{!contact ? t("legal.privacy.s08.contact") : contact.support === contact.security ? <>
          {t("legal.privacy.s08.sharedPrefix")}
          <a className="underline" href={`mailto:${contact.support}`}>{contact.support}</a>
          {t("legal.privacy.s08.sharedSuffix")}
        </> : <>
          {t("legal.privacy.s08.supportPrefix")}
          <a className="underline" href={`mailto:${contact.support}`}>{contact.support}</a>
          {t("legal.privacy.s08.supportSuffix")}{locale === "en" ? " " : ""}
          {t("legal.privacy.s08.securityPrefix")}
          <a className="underline" href={`mailto:${contact.security}`}>{contact.security}</a>
          {t("legal.privacy.s08.securitySuffix")}
        </>}</p>
        <p>{t("legal.privacy.s08.suffix")}</p>
      </Section>
      <Section n="09" title={t("legal.privacy.s09.title")}>
        <p>{t("legal.privacy.s09.p1")}</p>
        <p>{t("legal.privacy.s09.p2")}</p>
      </Section>
    </Shell>
  );
}

export function TermsPage() {
  const { t } = useI18n();
  return (
    <Shell
      kind="terms"
      tag={t("legal.chrome.tag")}
      title={t("legal.terms.title")}
      updated={t("legal.terms.updated")}
    >
      <Section n="01" title={t("legal.terms.s01.title")}>
        <p>{t("legal.terms.s01.body")}</p>
      </Section>

      <Section n="02" title={t("legal.terms.s02.title")}>
        <p>{t("legal.terms.s02.body")}</p>
      </Section>

      <Section n="03" title={t("legal.terms.s03.title")}>
        <p>{t("legal.terms.s03.p1")}</p>
        <p>{t("legal.terms.s03.p2")}</p>
      </Section>

      <Section n="04" title={t("legal.terms.s04.title")}>
        <p>{t("legal.terms.s04.body")}</p>
      </Section>
      <Section n="05" title={t("legal.terms.s05.title")}>
        <p>{t("legal.terms.s05.body")}</p>
      </Section>

      <Section n="06" title={t("legal.terms.s06.title")}>
        <p>{t("legal.terms.s06.body")}</p>
      </Section>

      <Section n="07" title={t("legal.terms.s07.title")}>
        <p>{t("legal.terms.s07.body")}</p>
      </Section>

      <Section n="08" title={t("legal.terms.s08.title")}>
        <p>{t("legal.terms.s08.body")}</p>
      </Section>

      <Section n="09" title={t("legal.terms.s09.title")}>
        <p>{t("legal.terms.s09.body")}</p>
      </Section>
    </Shell>
  );
}

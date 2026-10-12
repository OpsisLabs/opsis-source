import { isCollectibleCatalogEnabled } from "../product/availability";
import { useI18n } from "../i18n";

function Shell({
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
  return (
    <article className="opsis-legal mx-auto max-w-[860px] [overflow-wrap:anywhere]">
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
    </article>
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
    <section>
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
  const { t } = useI18n();
  const collectibleCatalogEnabled = isCollectibleCatalogEnabled();
  return (
    <Shell
      tag={t("legal.chrome.tag")}
      title={t("legal.privacy.title")}
      updated={t("legal.privacy.updated")}
    >
      <Section n="01" title={t("legal.privacy.s01.title")}>
        <p>{t("legal.privacy.s01.body")}</p>
      </Section>

      <Section n="02" title={t("legal.privacy.s02.title")}>
        <p>
          <span className="text-[#e9e0d1]">{t("legal.privacy.s02.privateMode.lead")}</span>{" "}
          {t("legal.privacy.s02.privateMode.body")}
        </p>
        <p>
          <span className="text-[#e9e0d1]">{t("legal.privacy.s02.cloudAccount.lead")}</span>{" "}
          {t("legal.privacy.s02.cloudAccount.body")}
        </p>
        <p>
          <span className="text-[#e9e0d1]">{t("legal.privacy.s02.vault.lead")}</span>{" "}
          {t("legal.privacy.s02.vault.body")}
        </p>
        <p>
          <span className="text-[#e9e0d1]">{t("legal.privacy.s02.portfolio.lead")}</span>{" "}
          {t("legal.privacy.s02.portfolio.body")}
        </p>
        <p>
          <span className="text-[#e9e0d1]">{t("legal.privacy.s02.usage.lead")}</span>{" "}
          {t("legal.privacy.s02.usage.body")}
        </p>
        <p>
          <span className="text-[#e9e0d1]">{t("legal.privacy.s02.rwa.lead")}</span>{" "}
          {t("legal.privacy.s02.rwa.body")}
        </p>
        <p>
          <span className="text-[#e9e0d1]">{t("legal.privacy.s02.collectible.lead")}</span>{" "}
          {t(collectibleCatalogEnabled ? "legal.privacy.s02.collectible.enabled" : "legal.privacy.s02.collectible.comingSoon")}
        </p>
        <p><span className="text-[#e9e0d1]">{t("product.feature.card-price-check.label")}.</span> {t("cards.privacy.collection")}</p>
        <p>
          <span className="text-[#e9e0d1]">{t("legal.privacy.s02.market.lead")}</span>{" "}
          {t("legal.privacy.s02.market.body")}
        </p>
        <p>
          <span className="text-[#e9e0d1]">{t("legal.privacy.s02.savedQueries.lead")}</span>{" "}
          {t("legal.privacy.s02.savedQueries.body")}
        </p>
        <p>
          <span className="text-[#e9e0d1]">{t("legal.privacy.s02.technical.lead")}</span>{" "}
          {t("legal.privacy.s02.technical.body")}
        </p>
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
          {t(collectibleCatalogEnabled ? "legal.privacy.s05.collectible.enabled" : "legal.privacy.s05.collectible.comingSoon")}
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
        <p>{t("legal.privacy.s08.contact")}</p>
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

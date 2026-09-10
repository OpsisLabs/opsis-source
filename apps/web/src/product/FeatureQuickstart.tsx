import { useEffect, useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ArrowRight, BookOpenText, ShieldCheck, X } from "lucide-react";
import { Link } from "react-router";
import type { ProductFeature } from "./features";
import { useI18n } from "../i18n";

gsap.registerPlugin(useGSAP);

export default function FeatureQuickstart({
  feature,
  onDismiss,
}: {
  feature: ProductFeature;
  onDismiss: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = panel.current?.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = priorOverflow;
    };
  }, [onDismiss]);

  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(
      "[data-quickstart-panel]",
      { autoAlpha: 0, y: 14, scale: 0.985 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.3,
        ease: "power2.out",
        clearProps: "opacity,visibility,transform",
      },
    );
    gsap.fromTo(
      "[data-quickstart-step]",
      { autoAlpha: 0, x: -8 },
      {
        autoAlpha: 1,
        x: 0,
        duration: 0.25,
        stagger: 0.055,
        ease: "power2.out",
        clearProps: "opacity,visibility,transform",
      },
    );
  }, { scope: panel });

  return (
    <div className="fixed inset-0 z-[105] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onDismiss}
        className="absolute inset-0 bg-black/80 backdrop-blur-[3px]"
      />
      <div
        ref={panel}
        data-quickstart-panel
        role="dialog"
        aria-modal="true"
        aria-labelledby="feature-quickstart-title"
        aria-describedby="feature-quickstart-summary"
        className="product-rail-scroll relative max-h-[92vh] w-full overflow-y-auto border border-[#fa6c34]/55 bg-[#20201f] shadow-[0_28px_100px_rgba(0,0,0,0.72)] sm:max-w-[690px]"
        style={{ clipPath: "polygon(0 0,100% 0,100% calc(100% - 22px),calc(100% - 22px) 100%,0 100%)" }}
      >
        <div className="flex items-center justify-between border-b border-[#393633] px-5 py-4 sm:px-7">
          <p className="font-mono-d text-[9px] font-semibold tracking-[0.18em] text-[#fa6c34]">
            {feature.eyebrow}
          </p>
          <button
            ref={closeButton}
            type="button"
            onClick={onDismiss}
            aria-label={t("product.quickstart.closeAria", { feature: feature.label })}
            className="flex h-10 w-10 items-center justify-center border border-[#fa6c34]/40 text-[#fa6c34] outline-none transition-colors hover:border-[#fa6c34] hover:bg-[#fa6c34]/10 focus-visible:ring-2 focus-visible:ring-[#fa6c34]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-7 pt-7 sm:px-8 sm:pb-8">
          <p className="font-mono-d text-[8px] tracking-[0.18em] text-[#aaa19a]">{t("product.quickstart.eyebrow")}</p>
          <h2 id="feature-quickstart-title" className="mt-3 text-[34px] font-medium leading-none tracking-[-0.04em] text-[#f0e8da] sm:text-[46px]">
            {feature.label}
          </h2>
          <p id="feature-quickstart-summary" className="mt-4 max-w-[590px] text-[14px] leading-relaxed text-[#d8cfc7]">
            {feature.bestFor}
          </p>

          <ol className="mt-7 grid gap-2">
            {feature.steps.map((step, index) => (
              <li key={step} data-quickstart-step className="grid grid-cols-[42px_1fr] border border-[#3a3734] bg-[#242321]">
                <span className="flex items-center justify-center border-r border-[#3a3734] font-mono-d text-[11px] font-semibold text-[#fa6c34]">
                  0{index + 1}
                </span>
                <span className="px-4 py-4 text-[12.5px] leading-relaxed text-[#efe6dc]">{step}</span>
              </li>
            ))}
          </ol>

          <div className="mt-5 grid gap-px border border-[#3a3734] bg-[#3a3734] sm:grid-cols-2">
            <div className="bg-[#222721] p-4 sm:p-5">
              <p className="flex items-center gap-2 font-mono-d text-[8px] font-semibold tracking-[0.15em] text-[#bfe4af]"><ShieldCheck size={12} /> {t("product.quickstart.privacyTitle")}</p>
              <p className="mt-3 text-[11.5px] leading-relaxed text-[#d8cfc7]">{feature.privacy}</p>
            </div>
            <div className="bg-[#292320] p-4 sm:p-5">
              <p className="font-mono-d text-[8px] font-semibold tracking-[0.15em] text-[#ffd0bc]">{t("product.quickstart.boundaryTitle")}</p>
              <p className="mt-3 text-[11.5px] leading-relaxed text-[#d8cfc7]">{feature.boundary}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-[#393633] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-[390px] text-[10.5px] leading-relaxed text-[#aaa19a]">{t("product.quickstart.footer")}</p>
            <Link
              to={`/guide#${feature.id}`}
              onClick={onDismiss}
              className="inline-flex min-h-[42px] items-center justify-center gap-2 border border-[#fa6c34] px-4 font-mono-d text-[9px] font-semibold tracking-[0.12em] text-[#fa6c34] outline-none transition-colors hover:bg-[#fa6c34] hover:text-[#1d1d1d] focus-visible:ring-2 focus-visible:ring-[#fa6c34]"
            >
              <BookOpenText size={13} /> {t("product.quickstart.guide")} <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

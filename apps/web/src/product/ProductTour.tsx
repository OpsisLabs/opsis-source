import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import {
  ArrowLeft,
  ArrowRight,
  ChartNoAxesCombined,
  FilePenLine,
  LockKeyhole,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { Link } from "react-router";
import { useI18n } from "../i18n";
import LanguageSwitcher from "../i18n/LanguageSwitcher";

gsap.registerPlugin(useGSAP);

const TOTAL_STEPS = 3;

const STARTING_POINTS = [
  {
    icon: Search,
    titleKey: "product.tour.start.lookup.title",
    detailKey: "product.tour.start.lookup.detail",
    actionKey: "product.tour.start.lookup.action",
    path: "/app",
  },
  {
    icon: ChartNoAxesCombined,
    titleKey: "product.tour.start.portfolio.title",
    detailKey: "product.tour.start.portfolio.detail",
    actionKey: "product.tour.start.portfolio.action",
    path: "/vault?view=portfolio",
  },
  {
    icon: FilePenLine,
    titleKey: "product.tour.start.asset.title",
    detailKey: "product.tour.start.asset.detail",
    actionKey: "product.tour.start.asset.action",
    path: "/vault?view=assets",
  },
] as const;

function StepProgress({ step }: { step: number }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2" aria-label={t("product.tour.progress", { current: step + 1, total: TOTAL_STEPS })}>
      {Array.from({ length: TOTAL_STEPS }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`h-1 transition-[width,background-color] duration-200 ${
            index === step ? "w-8 bg-[#fa6c34]" : "w-3 bg-[#4a4541]"
          }`}
        />
      ))}
      <span className="ml-2 font-mono-d text-[9px] tracking-[0.15em] text-[#aaa19a]">
        0{step + 1} / 0{TOTAL_STEPS}
      </span>
    </div>
  );
}

export default function ProductTour({
  onDismiss,
}: {
  onDismiss: () => void;
}) {
  const [step, setStep] = useState(0);
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

  const advance = () => {
    const nextStep = Math.min(TOTAL_STEPS - 1, step + 1);
    setStep(nextStep);
    if (nextStep === TOTAL_STEPS - 1) {
      requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("[data-tour-choice]")?.focus());
    }
  };

  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set("[data-tour-panel], [data-tour-step]", { clearProps: "all" });
      return;
    }
    gsap.fromTo(
      "[data-tour-panel]",
      { autoAlpha: 0, y: 18, scale: 0.985 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.34, ease: "power2.out", clearProps: "opacity,visibility,transform" },
    );
  }, { scope: panel });

  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(
      "[data-tour-step]",
      { autoAlpha: 0, x: 8 },
      { autoAlpha: 1, x: 0, duration: 0.26, ease: "power2.out", clearProps: "opacity,visibility,transform" },
    );
  }, { scope: panel, dependencies: [step], revertOnUpdate: true });

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onDismiss}
        className="absolute inset-0 bg-black/80 backdrop-blur-[3px]"
      />
      <div
        ref={panel}
        data-tour-panel
        role="dialog"
        aria-modal="true"
        aria-label={t("product.tour.dialogAria")}
        aria-describedby="product-tour-description"
        className="product-rail-scroll relative max-h-[92vh] w-full overflow-y-auto border border-[#fa6c34]/55 bg-[#20201f] shadow-[0_28px_100px_rgba(0,0,0,0.72)] sm:max-w-[720px]"
        style={{ clipPath: "polygon(0 0,100% 0,100% calc(100% - 22px),calc(100% - 22px) 100%,0 100%)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#393633] px-5 py-4 sm:px-7">
          <StepProgress step={step} />
          <LanguageSwitcher />
          <button
            ref={closeButton}
            type="button"
            onClick={onDismiss}
            aria-label={t("product.tour.closeAria")}
            className="flex h-10 w-10 items-center justify-center border border-[#fa6c34]/35 text-[#fa6c34] outline-none transition-colors hover:border-[#fa6c34] hover:bg-[#fa6c34]/10 focus-visible:ring-2 focus-visible:ring-[#fa6c34]"
          >
            <X size={16} />
          </button>
        </div>

        <div data-tour-step key={step} className="px-5 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-9">
          {step === 0 && (
            <>
              <p className="font-mono-d text-[9px] font-semibold tracking-[0.2em] text-[#fa6c34]">{t("product.tour.welcome")}</p>
              <h2 className="mt-4 max-w-[600px] text-[36px] font-medium leading-[0.98] tracking-[-0.045em] text-[#f0e8da] sm:text-[52px]">
                {t("product.tour.step0.titleLead")} <span className="text-[#fa6c34]">{t("product.tour.step0.titleAccent")}</span>
              </h2>
              <p id="product-tour-description" className="mt-5 max-w-[600px] text-[14px] leading-relaxed text-[#b7aea2] sm:text-[15px]">
                {t("product.tour.step0.description")}
              </p>
              <div className="mt-7 grid gap-px border border-[#383838] bg-[#383838] sm:grid-cols-3">
                {(["product.tour.step0.badge1", "product.tour.step0.badge2", "product.tour.step0.badge3"] as const).map((item) => (
                  <div key={item} className="flex items-center gap-2 bg-[#242424] px-4 py-3 font-mono-d text-[8px] tracking-[0.1em] text-[#d6ccba]">
                    <ShieldCheck size={12} className="shrink-0 text-[#7fb069]" /> {t(item)}
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="font-mono-d text-[9px] font-semibold tracking-[0.2em] text-[#ffd0bc]">{t("product.tour.step1.eyebrow")}</p>
              <h2 className="mt-4 text-[34px] font-medium leading-none tracking-[-0.04em] text-[#f0e8da] sm:text-[46px]">{t("product.tour.step1.title")}</h2>
              <p id="product-tour-description" className="mt-4 max-w-[590px] text-[14px] leading-relaxed text-[#e0d7ce]">{t("product.tour.step1.description")}</p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <div className="border border-[#fa6c34]/45 bg-[#28221f] p-5 sm:p-6">
                  <span className="flex h-10 w-10 items-center justify-center border border-[#fa6c34]/40 bg-[#fa6c34]/10 text-[#fa6c34]"><Search size={17} /></span>
                  <p className="mt-5 font-mono-d text-[9px] tracking-[0.16em] text-[#ffd0bc]">{t("product.tour.step1.lookup.eyebrow")}</p>
                  <h3 className="mt-2 text-[22px] font-medium text-[#f0e8da]">{t("product.tour.step1.lookup.title")}</h3>
                  <p className="mt-3 text-[12.5px] leading-relaxed text-[#e0d7ce]">{t("product.tour.step1.lookup.description")}</p>
                </div>
                <div className="border border-[#4d5c47] bg-[#222721] p-5 sm:p-6">
                  <span className="flex h-10 w-10 items-center justify-center border border-[#7fb069]/40 bg-[#7fb069]/10 text-[#7fb069]"><LockKeyhole size={17} /></span>
                  <p className="mt-5 font-mono-d text-[9px] tracking-[0.16em] text-[#c8ecb8]">{t("product.tour.step1.save.eyebrow")}</p>
                  <h3 className="mt-2 text-[22px] font-medium text-[#f0e8da]">{t("product.tour.step1.save.title")}</h3>
                  <p className="mt-3 text-[12.5px] leading-relaxed text-[#e0d7ce]">{t("product.tour.step1.save.description")}</p>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="font-mono-d text-[9px] font-semibold tracking-[0.2em] text-[#ffd0bc]">{t("product.tour.step2.eyebrow")}</p>
              <h2 className="mt-4 text-[34px] font-medium leading-none tracking-[-0.04em] text-[#f0e8da] sm:text-[46px]">{t("product.tour.step2.title")}</h2>
              <p id="product-tour-description" className="mt-4 text-[14px] leading-relaxed text-[#e0d7ce]">{t("product.tour.step2.description")}</p>
              <div className="mt-7 grid gap-2">
                {STARTING_POINTS.map(({ icon: Icon, titleKey, detailKey, actionKey, path }) => (
                  <Link
                    key={path}
                    to={path}
                    onClick={onDismiss}
                    data-tour-choice
                    className="group flex items-center gap-4 border border-[#fa6c34]/30 bg-[#242321] p-4 outline-none transition-colors hover:border-[#fa6c34] hover:bg-[#2b2421] focus-visible:ring-2 focus-visible:ring-[#fa6c34] sm:px-5"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#fa6c34]/35 text-[#fa6c34]"><Icon size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium text-[#f0e8da]">{t(titleKey)}</span>
                      <span className="mt-0.5 block text-[10.5px] text-[#d8cfc7]">{t(detailKey)}</span>
                    </span>
                    <span className="hidden font-mono-d text-[8px] font-semibold tracking-[0.1em] text-[#fa6c34] sm:block">{t(actionKey)}</span>
                    <ArrowRight size={14} className="shrink-0 text-[#fa6c34] transition-transform group-hover:translate-x-1" />
                  </Link>
                ))}
              </div>
              <div className="mt-5 flex flex-col items-start justify-between gap-3 border-t border-[#383838] pt-5 sm:flex-row sm:items-center">
                <p className="max-w-[410px] text-[11px] leading-relaxed text-[#d8cfc7]">{t("product.tour.step2.footer")}</p>
                <Link to="/guide" onClick={onDismiss} className="font-mono-d text-[9px] font-semibold tracking-[0.12em] text-[#fa6c34] hover:text-[#ff956c]">{t("product.tour.step2.openStart")}</Link>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[#393633] bg-[#1d1d1d] px-5 py-4 sm:px-8">
          {step > 0 ? (
            <button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} className="flex items-center gap-2 font-mono-d text-[9px] tracking-[0.12em] text-[#9a938a] outline-none hover:text-[#f0e8da] focus-visible:ring-2 focus-visible:ring-[#fa6c34]">
              <ArrowLeft size={13} /> {t("product.tour.back")}
            </button>
          ) : (
            <button type="button" onClick={onDismiss} className="font-mono-d text-[9px] tracking-[0.12em] text-[#aaa19a] outline-none hover:text-[#f0e8da] focus-visible:ring-2 focus-visible:ring-[#fa6c34]">{t("product.tour.skip")}</button>
          )}
          {step < TOTAL_STEPS - 1 && (
            <button type="button" onClick={advance} className="clip-btn-sm flex items-center gap-2 bg-[#fa6c34] px-5 py-3 font-mono-d text-[9px] font-semibold tracking-[0.12em] text-[#1d1d1d] outline-none hover:bg-[#ff7c48] focus-visible:ring-2 focus-visible:ring-[#ffd0bc]">
              {step === 0 ? t("product.tour.next.explore") : t("product.tour.next.choose")} <ArrowRight size={13} />
            </button>
          )}
        </div>

        <p className="border-t border-[#2e2e2e] px-5 py-3 text-center text-[9.5px] leading-relaxed text-[#aaa19a] sm:px-8">
          {t("product.tour.footer.pre")}<span className="text-[#d2c7bc]">{t("product.tour.footer.highlight")}</span>{t("product.tour.footer.post")}
        </p>
      </div>
    </div>
  );
}

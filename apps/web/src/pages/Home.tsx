import Sidebar from "../sections/Sidebar";
import TopNav from "../sections/TopNav";
import Hero from "../sections/Hero";
import Safety from "../sections/Safety";
import Faq from "../sections/Faq";
import FooterCta from "../sections/FooterCta";
import AssetUniverse from "../sections/AssetUniverse";
import ProductWorkflow from "../sections/ProductWorkflow";
import AvailabilityMatrix from "../sections/AvailabilityMatrix";
import OfficialContract from "../product/OfficialContract";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useI18n } from "../i18n";

export default function Home() {
  const { t } = useI18n();
  const pageRef = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const heroTimeline = gsap.timeline({ defaults: { ease: "power3.out" } });
    heroTimeline
      .fromTo("[data-hero-reveal]", { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.55, stagger: 0.08 })
      .fromTo("[data-hero-line]", { yPercent: 115, rotate: 1.5 }, { yPercent: 0, rotate: 0, duration: 0.72, stagger: 0.09 }, "<0.04")
      .fromTo("[data-hero-art]", { x: 26, autoAlpha: 0, scale: 0.975 }, { x: 0, autoAlpha: 1, scale: 1, duration: 0.82 }, "<0.1")
      .fromTo("[data-hero-shape]", { scale: 0.84, autoAlpha: 0, transformOrigin: "50% 50%" }, { scale: 1, autoAlpha: 1, duration: 0.58, stagger: 0.09, clearProps: "transform,opacity,visibility" }, "<0.15");
    const elements = gsap.utils.toArray<HTMLElement>("[data-home-reveal]", pageRef.current);
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        gsap.fromTo(entry.target, { y: 16, autoAlpha: 0.72 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: "power2.out", clearProps: "transform,opacity,visibility" });
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08 });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, { scope: pageRef });
  return (
    <div ref={pageRef} className="marketing-page min-h-screen bg-[#1d1d1d]">
      <a href="#marketing-main" onClick={(event) => { event.preventDefault(); document.getElementById("marketing-main")?.focus(); window.history.replaceState(null, "", "#marketing-main"); }} className="fixed left-3 top-3 z-[120] -translate-y-24 bg-[#fa6c34] px-4 py-3 font-mono-d text-[10px] font-semibold text-[#1d1d1d] outline-none transition-transform focus:translate-y-0 focus-visible:ring-2 focus-visible:ring-white">{t("common.skipToContent")}</a>
      <Sidebar />
      <TopNav />
      <main id="marketing-main" tabIndex={-1} className="outline-none lg:pl-[220px]">
        <div className="pt-[60px]">
          <OfficialContract />
          <Hero />
          <AssetUniverse />
          <ProductWorkflow />
          <AvailabilityMatrix />
          <Safety />
          <Faq />
          <FooterCta />
        </div>
      </main>
    </div>
  );
}

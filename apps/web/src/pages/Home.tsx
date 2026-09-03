import TopNav from "../sections/TopNav";
import Hero from "../sections/Hero";
import Safety from "../sections/Safety";
import Faq from "../sections/Faq";
import FooterCta from "../sections/FooterCta";
import AssetUniverse from "../sections/AssetUniverse";
import ProductWorkflow from "../sections/ProductWorkflow";
import AvailabilityMatrix from "../sections/AvailabilityMatrix";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

export default function Home() {
  const pageRef = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const heroTimeline = gsap.timeline({ defaults: { ease: "power3.out" } });
    heroTimeline
      .fromTo("[data-hero-reveal]", { y: 8, autoAlpha: 0.7 }, { y: 0, autoAlpha: 1, duration: 0.3, stagger: 0.04, clearProps: "transform,opacity,visibility" })
      .fromTo("[data-hero-line]", { yPercent: 30 }, { yPercent: 0, duration: 0.4, stagger: 0.05, clearProps: "transform" }, 0)
      .fromTo("[data-hero-art]", { y: 12, autoAlpha: 0.8 }, { y: 0, autoAlpha: 1, duration: 0.45, clearProps: "transform,opacity,visibility" }, 0);
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
      <a href="#marketing-main" onClick={(event) => { event.preventDefault(); document.getElementById("marketing-main")?.focus(); window.history.replaceState(null, "", "#marketing-main"); }} className="fixed left-3 top-3 z-[120] -translate-y-24 bg-[#fa6c34] px-4 py-3 font-mono-d text-[10px] font-semibold text-[#1d1d1d] outline-none transition-transform focus:translate-y-0 focus-visible:ring-2 focus-visible:ring-white">SKIP TO MAIN CONTENT</a>
      <TopNav />
      <main id="marketing-main" tabIndex={-1} className="mx-auto max-w-[1600px] outline-none">
        <div className="pt-[72px]">
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

import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { Link, Outlet, useLocation } from "react-router";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import {
  ArrowLeftRight,
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  Boxes,
  ChartNoAxesCombined,
  CircleHelp,
  CodeXml,
  FilePenLine,
  House,
  Menu,
  MessageCircleQuestion,
  PackageSearch,
  Repeat2,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { PRODUCT_FEATURES, type ProductFeature } from "./features";
import ProductTour from "./ProductTour";
import { isProductFeatureEnabled } from "./availability";

gsap.registerPlugin(useGSAP);

const TOUR_COOKIE = "chainscout_product_tour_seen_v1";

function tourWasSeen() {
  return document.cookie
    .split(";")
    .some((entry) => entry.trim() === `${TOUR_COOKIE}=1`);
}

function rememberTourSeen() {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${TOUR_COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Strict${secure}`;
}

const ICONS: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  "private-explorer": Search,
  "scout-swap": ArrowLeftRight,
  "rwa-verify": BadgeCheck,
  "portfolio-intelligence": ChartNoAxesCombined,
  "collectible-catalog": PackageSearch,
  "market-inventory": Boxes,
  "replay-actions": Repeat2,
  "open-data-api": CodeXml,
  "manual-assets": FilePenLine,
};

function activeFeature(location: ReturnType<typeof useLocation>, feature: ProductFeature) {
  const target = new URL(feature.path, "https://chainscout.local");
  if (location.pathname !== target.pathname) return false;
  if (target.pathname !== "/vault") return true;
  const currentView = new URLSearchParams(location.search).get("view") ?? "assets";
  return currentView === target.searchParams.get("view");
}

function FeatureLink({
  feature,
  active,
  expanded,
  onExpand,
  onNavigate,
}: {
  feature: ProductFeature;
  active: boolean;
  expanded: boolean;
  onExpand: () => void;
  onNavigate?: () => void;
}) {
  const Icon = ICONS[feature.id] ?? ShieldCheck;
  const enabled = isProductFeatureEnabled(feature.id);
  return (
    <div
      data-feature={feature.id}
      data-feature-card
      data-active={active ? "true" : "false"}
      className={`mx-2 mb-1 overflow-hidden border transition-colors ${
        active
          ? "border-[#fa6c34] bg-[#fa6c34] shadow-[0_0_24px_rgba(250,108,52,0.12)]"
          : expanded
            ? "border-[#fa6c34]/65 bg-[#26211f]"
            : "border-[#fa6c34]/30 bg-[#211f1e] hover:border-[#fa6c34]/70 hover:bg-[#29221f]"
      }`}
    >
      <div className="flex min-h-[52px] items-stretch">
        {enabled ? <Link
          to={feature.path}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className="group flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ffd0bc]"
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center border transition-colors ${active ? "border-[#1d1d1d]/35 bg-[#1d1d1d]/10 text-[#1d1d1d]" : "border-[#fa6c34]/35 bg-[#fa6c34]/5 text-[#fa6c34] group-hover:bg-[#fa6c34]/12"}`}>
            <Icon size={13} />
          </span>
          <span className="min-w-0">
            <span className={`block truncate text-[12px] transition-colors ${active ? "font-semibold text-[#1d1d1d]" : "text-[#d6ccba] group-hover:text-[#fff7ec]"}`}>
              {feature.label}
            </span>
            <span className={`mt-0.5 block truncate font-mono-d text-[8px] tracking-[0.1em] ${active ? "text-[#522817]" : "text-[#79675f]"}`}>
              {feature.navHint}
            </span>
          </span>
        </Link> : <div
          aria-label={`${feature.label} is not enabled in this build`}
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left opacity-65"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-[#6b625d] bg-[#262321] text-[#81756f]">
            <Icon size={13} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] text-[#9b9088]">{feature.label}</span>
            <span className="mt-0.5 block truncate font-mono-d text-[8px] tracking-[0.1em] text-[#79675f]">NOT ENABLED IN THIS BUILD</span>
          </span>
        </div>}
        <button
          type="button"
          onClick={onExpand}
          aria-label={feature.helpLabel}
          aria-expanded={expanded}
          className={`flex w-11 shrink-0 items-center justify-center border-l outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ffd0bc] ${
            active
              ? "border-[#1d1d1d]/20 bg-[#1d1d1d]/10 text-[#1d1d1d] hover:bg-[#1d1d1d]/20"
              : expanded
                ? "border-[#fa6c34]/45 bg-[#fa6c34]/15 text-[#ff8a5c]"
                : "border-[#fa6c34]/25 bg-[#fa6c34]/5 text-[#fa6c34] hover:bg-[#fa6c34]/15 hover:text-[#ffb08f]"
          }`}
        >
          <CircleHelp size={14} />
        </button>
      </div>
      {expanded && (
        <div className="border-t border-[#fa6c34]/30 bg-[#1c1b1a] px-4 py-3" role="region" aria-label={`${feature.label} summary`}>
          <p className="text-[11px] leading-relaxed text-[#9a938a]">{feature.summary}</p>
          <Link
            to={`/guide#${feature.id}`}
            onClick={onNavigate}
            className="mt-2 inline-flex font-mono-d text-[9px] tracking-[0.12em] text-[#fa6c34] hover:text-[#ff8a5c]"
          >
            OPEN GUIDE →
          </Link>
        </div>
      )}
    </div>
  );
}

function ProductRail({
  onNavigate,
  onOpenTour,
}: {
  onNavigate?: () => void;
  onOpenTour: (trigger: HTMLButtonElement) => void;
}) {
  const location = useLocation();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col bg-[#1d1d1d]">
      <Link
        to="/"
        onClick={onNavigate}
        className="relative flex h-[72px] shrink-0 items-center gap-3 border-b border-[#2e2e2e] bg-[#fa6c34] px-5 text-[#1d1d1d]"
        style={{ clipPath: "polygon(0 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%)" }}
      >
        <img src="/logo.svg" alt="" className="h-7 w-7" />
        <span>
          <span className="block font-mono-d text-[11px] font-semibold tracking-[0.14em]">CHAINSCOUT</span>
          <span className="mt-0.5 block font-mono-d text-[8px] tracking-[0.16em] opacity-65">PRODUCT WORKSPACE</span>
        </span>
      </Link>

      <div className="product-rail-scroll flex-1 overflow-y-auto pb-5 pt-3">
        <button
          type="button"
          onClick={(event) => {
            onNavigate?.();
            onOpenTour(event.currentTarget);
          }}
          data-tour-trigger
          className="group mx-2 mb-4 flex w-[calc(100%-1rem)] items-center gap-3 border border-[#fa6c34] bg-[#fa6c34] px-3 py-3 text-left text-[#1d1d1d] outline-none transition-colors hover:bg-[#ff7c48] focus-visible:ring-2 focus-visible:ring-[#ffd0bc]"
          aria-label="Open the ChainScout 60-second tour"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-[#1d1d1d]/30 bg-[#1d1d1d]/10">
            <Sparkles size={14} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mono-d text-[9px] font-semibold tracking-[0.12em]">NEW HERE? TAKE THE TOUR</span>
            <span className="mt-1 block text-[10px] font-medium text-[#4b281b]">See how it fits together in 60 seconds</span>
          </span>
          <ArrowRight size={14} className="shrink-0 transition-transform group-hover:translate-x-1" />
        </button>
        {(["explore", "vault", "build"] as const).map((group) => (
          <section key={group} className="mt-2 first:mt-0" aria-label={group === "explore" ? "Explore tools" : group === "vault" ? "Private Vault tools" : "Developer tools"}>
            <p className="px-4 pb-2 font-mono-d text-[8px] tracking-[0.2em] text-[#5f5a55]">
              {group === "explore" ? "LOOK SOMETHING UP" : group === "vault" ? "SAVE & ORGANIZE PRIVATELY" : "BUILD WITH REVIEWED FACTS"}
            </p>
            {PRODUCT_FEATURES.filter((feature) => feature.group === group).map((feature) => (
              <FeatureLink
                key={feature.id}
                feature={feature}
                active={activeFeature(location, feature)}
                expanded={expanded === feature.id}
                onExpand={() => setExpanded((current) => current === feature.id ? null : feature.id)}
                onNavigate={onNavigate}
              />
            ))}
          </section>
        ))}
      </div>

      <nav className="shrink-0 space-y-1 border-t border-[#303030] bg-[#202020] p-3" aria-label="Product resources">
        {isProductFeatureEnabled("open-data-api") && <Link to="/developers" onClick={onNavigate} aria-current={location.pathname === "/developers" ? "page" : undefined} className={`flex items-center gap-3 border px-3 py-2.5 font-mono-d text-[10px] tracking-[0.08em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#fa6c34] ${location.pathname === "/developers" ? "border-[#fa6c34] bg-[#fa6c34] font-semibold text-[#1d1d1d]" : "border-[#fa6c34]/25 text-[#c0b6aa] hover:border-[#fa6c34]/65 hover:bg-[#fa6c34]/10 hover:text-[#fff7ec]"}`}>
          <CodeXml size={14} /> DEVELOPERS
        </Link>}
        <Link to="/docs" onClick={onNavigate} aria-current={location.pathname === "/docs" ? "page" : undefined} className={`flex items-center gap-3 border px-3 py-2.5 font-mono-d text-[10px] tracking-[0.08em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#fa6c34] ${location.pathname === "/docs" ? "border-[#fa6c34] bg-[#fa6c34] font-semibold text-[#1d1d1d]" : "border-[#fa6c34]/25 text-[#c0b6aa] hover:border-[#fa6c34]/65 hover:bg-[#fa6c34]/10 hover:text-[#fff7ec]"}`}>
          <BookOpenText size={14} /> TECH DOCS
        </Link>
        <Link to="/faq" onClick={onNavigate} aria-current={location.pathname === "/faq" ? "page" : undefined} className={`flex items-center gap-3 border px-3 py-2.5 font-mono-d text-[10px] tracking-[0.08em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#fa6c34] ${location.pathname === "/faq" ? "border-[#fa6c34] bg-[#fa6c34] font-semibold text-[#1d1d1d]" : "border-[#fa6c34]/25 text-[#c0b6aa] hover:border-[#fa6c34]/65 hover:bg-[#fa6c34]/10 hover:text-[#fff7ec]"}`}>
          <MessageCircleQuestion size={14} /> FAQ
        </Link>
        <Link to="/roadmap" onClick={onNavigate} className="flex items-center gap-3 border border-[#fa6c34]/25 px-3 py-2.5 font-mono-d text-[10px] tracking-[0.08em] text-[#c0b6aa] outline-none transition-colors hover:border-[#fa6c34]/65 hover:bg-[#fa6c34]/10 hover:text-[#fff7ec] focus-visible:ring-2 focus-visible:ring-[#fa6c34]">
          <Boxes size={14} /> ROADMAP
        </Link>
        <Link to="/" onClick={onNavigate} className="flex items-center gap-3 border border-[#fa6c34]/25 px-3 py-2.5 font-mono-d text-[10px] tracking-[0.08em] text-[#c0b6aa] outline-none transition-colors hover:border-[#fa6c34]/65 hover:bg-[#fa6c34]/10 hover:text-[#fff7ec] focus-visible:ring-2 focus-visible:ring-[#fa6c34]">
          <House size={14} /> MARKETING HOME
        </Link>
      </nav>
    </div>
  );
}

export default function ProductShell() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(() => {
    const forced = new URLSearchParams(window.location.search).get("tour") === "1";
    if (!import.meta.env.PROD && !forced) return false;
    return forced || !tourWasSeen();
  });
  const shell = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);
  const introduced = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);

  const rememberTourDismissal = () => {
    rememberTourSeen();
  };

  const openTour = (source?: HTMLElement) => {
    returnFocus.current = source ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setOpen(false);
    setTourOpen(true);
  };

  const closeTour = () => {
    rememberTourDismissal();
    setTourOpen(false);
    window.setTimeout(() => {
      const destination = returnFocus.current;
      if (destination?.isConnected) destination.focus();
      else {
        const visibleTrigger = Array.from(document.querySelectorAll<HTMLElement>("[data-tour-trigger]"))
          .find((element) => element.getClientRects().length > 0);
        if (visibleTrigger) visibleTrigger.focus();
        else trigger.current?.focus();
      }
      returnFocus.current = null;
    }, 0);
  };

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const panel = drawer.current;
    const focusables = panel?.querySelectorAll<HTMLElement>("a[href],button:not([disabled])");
    focusables?.[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !focusables?.length) return;
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
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  useGSAP(() => {
    const media = gsap.matchMedia();

    media.add("(prefers-reduced-motion: no-preference)", () => {
      const routeContent = shell.current?.querySelector("[data-route-content]");
      const routeSweep = shell.current?.querySelector("[data-route-sweep]");
      const activeCard = shell.current?.querySelector('[data-feature-card][data-active="true"]');
      const timeline = gsap.timeline({ defaults: { ease: "power2.out" } });

      if (!introduced.current) {
        timeline.fromTo(
          "[data-desktop-rail] [data-feature-card]",
          { autoAlpha: 0, x: -10 },
          { autoAlpha: 1, x: 0, duration: 0.28, stagger: 0.035, clearProps: "opacity,visibility,transform" },
          0,
        );
        introduced.current = true;
      }

      if (routeSweep) {
        timeline
          .fromTo(
            routeSweep,
            { autoAlpha: 0.85, scaleX: 0, transformOrigin: "left center" },
            { autoAlpha: 0.85, scaleX: 1, duration: 0.2, ease: "power1.inOut" },
            0,
          )
          .to(
            routeSweep,
            { autoAlpha: 0, scaleX: 0, transformOrigin: "right center", duration: 0.24, ease: "power1.inOut", clearProps: "transform,transformOrigin,visibility" },
            0.2,
          );
      }

      if (routeContent) {
        timeline
          .set(routeContent, { willChange: "transform,opacity" }, 0)
          .fromTo(
            routeContent,
            { autoAlpha: 0, y: 12 },
            { autoAlpha: 1, y: 0, duration: 0.42, clearProps: "opacity,visibility,transform,willChange" },
            0.1,
          );
      }

      if (activeCard) {
        timeline.fromTo(
          activeCard,
          { x: -5, scale: 0.985 },
          { x: 0, scale: 1, duration: 0.32, clearProps: "transform" },
          0.08,
        );
      }
    });

    media.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set("[data-route-content], [data-route-sweep], [data-feature-card]", {
        clearProps: "all",
      });
    });

    return () => media.revert();
  }, {
    scope: shell,
    dependencies: [location.pathname, location.search],
    revertOnUpdate: true,
  });

  useGSAP(() => {
    if (!open || !drawer.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(
      drawer.current,
      { x: -20, autoAlpha: 0.7 },
      { x: 0, autoAlpha: 1, duration: 0.28, ease: "power2.out", clearProps: "opacity,visibility,transform" },
    );
  }, { scope: shell, dependencies: [open] });

  return (
    <div ref={shell} className="min-h-screen bg-[#1d1d1d]">
      <div data-route-sweep aria-hidden="true" className="pointer-events-none fixed left-0 right-0 top-0 z-[65] h-[3px] origin-left bg-[#fa6c34] opacity-0 lg:left-[252px]" />
      <aside data-desktop-rail className="fixed inset-y-0 left-0 z-40 hidden w-[252px] border-r border-[#2e2e2e] lg:block" aria-label="ChainScout features">
        <ProductRail onOpenTour={openTour} />
      </aside>

      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="clip-btn-sm fixed bottom-4 right-4 z-50 flex min-h-[46px] items-center gap-2 border border-[#fa6c34]/50 bg-[#242424] px-4 font-mono-d text-[10px] tracking-[0.12em] text-[#fa6c34] shadow-[0_10px_40px_rgba(0,0,0,0.45)] lg:hidden"
      >
        <Menu size={15} /> FEATURES
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] lg:hidden" role="presentation">
          <button type="button" aria-label="Close feature menu" onClick={close} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            ref={drawer}
            role="dialog"
            aria-modal="true"
            aria-label="ChainScout feature menu"
            className="absolute inset-y-0 left-0 w-[min(88vw,340px)] border-r border-[#383838] shadow-2xl"
          >
            <button type="button" onClick={close} aria-label="Close feature menu" className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center border border-black/20 text-[#1d1d1d] hover:bg-black/10">
              <X size={17} />
            </button>
            <ProductRail onNavigate={() => setOpen(false)} onOpenTour={openTour} />
          </div>
        </div>
      )}

      <div data-route-content className="min-h-screen lg:pl-[252px]" aria-hidden={open || tourOpen ? true : undefined}>
        <Outlet />
      </div>
      {tourOpen && <ProductTour onDismiss={closeTour} />}
    </div>
  );
}

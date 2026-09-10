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
  ChevronDown,
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
  WalletCards,
  X,
} from "lucide-react";
import { PRODUCT_FEATURES, type ProductFeature } from "./features";
import FeatureQuickstart from "./FeatureQuickstart";
import ProductTour from "./ProductTour";
import { isProductFeatureEnabled } from "./availability";
import { cloudWorkspaceEnabled } from "../dashboard/cloudAvailability";

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
  "card-price-check": WalletCards,
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
      className={`mx-3 mb-1 overflow-hidden rounded-[3px] border transition-colors ${
        active
          ? "border-[#fa6c34] bg-[#fa6c34]"
          : expanded
            ? "border-[#5b4a42] bg-[#26211f]"
            : "border-[#373330] bg-[#201e1c] hover:border-[#705044] hover:bg-[#26221f]"
      }`}
    >
      <div className="flex min-h-[54px] items-stretch">
        {enabled ? <Link
          to={feature.path}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className="group flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ffd0bc]"
        >
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border transition-colors ${active ? "border-[#1d1d1d]/25 bg-[#1d1d1d]/10 text-[#1d1d1d]" : "border-[#4b403b] bg-[#27221f] text-[#fa6c34] group-hover:border-[#fa6c34]/55"}`}>
            <Icon size={16} />
          </span>
          <span className="min-w-0">
            <span className={`block text-[14px] leading-snug transition-colors ${active ? "font-semibold text-[#1d1d1d]" : "text-[#e9e0d1] group-hover:text-[#fff7ec]"}`}>
              {feature.label}
            </span>
            <span className={`mt-1 block text-[12px] leading-snug ${active ? "text-[#4b2114]" : "text-[#aaa39b]"}`}>
              {feature.navHint}
            </span>
          </span>
        </Link> : <div
          aria-label={`${feature.label} is coming soon`}
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-[#47413d] bg-[#24211f] text-[#a09790]">
            <Icon size={13} />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] leading-snug text-[#b8b0a7]">{feature.label}</span>
            <span className="mt-1 block text-[12px] text-[#aaa39b]">Coming soon</span>
          </span>
        </div>}
        <button
          type="button"
          onClick={onExpand}
          aria-label={feature.helpLabel}
          aria-expanded={expanded}
          className={`flex w-10 shrink-0 items-center justify-center border-l outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ffd0bc] ${
            active
              ? "border-[#1d1d1d]/20 bg-[#1d1d1d]/10 text-[#1d1d1d] hover:bg-[#1d1d1d]/20"
              : expanded
                ? "border-[#4d413b] bg-[#2a2421] text-[#ff8a5c]"
                : "border-[#383431] bg-transparent text-[#8f837b] hover:bg-[#2a2421] hover:text-[#fa6c34]"
          }`}
        >
          <CircleHelp size={14} />
        </button>
      </div>
      {expanded && (
        <div className="border-t border-[#383431] bg-[#1b1a19] px-4 py-3" role="region" aria-label={`${feature.label} summary`}>
          <p className="text-[14px] leading-relaxed text-[#b8b0a7]">{feature.summary}</p>
          <Link
            to={`/guide#${feature.id}`}
            onClick={onNavigate}
            className="mt-2 inline-flex min-h-10 items-center text-[14px] font-medium text-[#fa6c34] hover:text-[#ff8a5c]"
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
  const upcoming = PRODUCT_FEATURES.filter((feature) => !isProductFeatureEnabled(feature.id));

  return (
    <div className="flex h-full flex-col bg-[#1a1918]">
      <Link
        to="/"
        onClick={onNavigate}
        className="relative flex min-h-[72px] shrink-0 items-center gap-3 border-b border-[#34312f] px-4 py-3 text-[#f4ece4]"
      >
        <span className="clip-btn-sm flex h-11 w-11 items-center justify-center bg-[#fa6c34]"><img src="/logo.svg" alt="" className="h-6 w-6" /></span>
        <span>
          <span className="block text-[15px] font-semibold tracking-[-0.02em]">ChainScout</span>
          <span className="mt-0.5 block text-[12px] text-[#aaa39b]">Your private workspace</span>
        </span>
      </Link>

      <div className="product-rail-scroll min-h-0 flex-1 overflow-y-auto pb-4 pt-3">
        <button
          type="button"
          onClick={(event) => {
            onNavigate?.();
            onOpenTour(event.currentTarget);
          }}
          data-tour-trigger
          className="group mx-3 mb-4 flex w-[calc(100%-1.5rem)] items-center gap-3 rounded-[3px] border border-[#fa6c34] bg-[#fa6c34] px-3 py-3 text-left text-[#1d1d1d] outline-none transition-colors hover:bg-[#ff7c48] focus-visible:ring-2 focus-visible:ring-[#ffd0bc]"
          aria-label="Open the ChainScout 60-second tour"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-[#1d1d1d]/30 bg-[#1d1d1d]/10">
            <Sparkles size={14} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">New here? Take the tour</span>
            <span className="mt-1 block text-[12px] font-medium text-[#482116]">A clear 60-second overview</span>
          </span>
          <ArrowRight size={14} className="shrink-0 transition-transform group-hover:translate-x-1" />
        </button>
        {(["explore", "vault", "build"] as const).filter((group) => PRODUCT_FEATURES.some((feature) => feature.group === group && isProductFeatureEnabled(feature.id))).map((group) => (
          <section key={group} className="mt-2 first:mt-0" aria-label={group === "explore" ? "Explore tools" : group === "vault" ? "Private Vault tools" : "Developer tools"}>
            <p className="px-4 pb-2 pt-2 text-[12px] font-medium text-[#aaa39b]">
              {group === "explore" ? "Explore" : group === "vault" ? "Your Vault" : "Developers"}
            </p>
            {PRODUCT_FEATURES.filter((feature) => feature.group === group && isProductFeatureEnabled(feature.id)).map((feature) => (
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
        {upcoming.length > 0 && <details className="rail-upcoming mx-3 mt-4 border-y border-[#34312f] py-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-1 text-[14px] text-[#b8b0a7]">
            Coming soon <ChevronDown size={16} className="disclosure-chevron" />
          </summary>
          <div className="pt-2">
            {upcoming.map((feature) => <FeatureLink key={feature.id} feature={feature} active={false} expanded={expanded === feature.id} onExpand={() => setExpanded((current) => current === feature.id ? null : feature.id)} onNavigate={onNavigate} />)}
          </div>
        </details>}
      <nav className="mt-4 px-3" aria-label="Product resources">
        <p className="mb-2 px-1 text-[12px] font-medium text-[#aaa39b]">Help & resources</p>
        <div className="grid grid-cols-2 gap-1.5">
        <Link to="/guide" onClick={onNavigate} className="flex min-h-[44px] items-center gap-2 rounded-sm border border-[#393532] px-3 text-[14px] text-[#bdb4ac] transition-colors hover:border-[#6b4a3e] hover:text-[#fff7ec]">
          <BookOpenText size={13} /> Guide
        </Link>
        <Link to="/docs" onClick={onNavigate} aria-current={location.pathname === "/docs" ? "page" : undefined} className={`flex min-h-[44px] items-center gap-2 rounded-sm border px-3 text-[14px] transition-colors ${location.pathname === "/docs" ? "border-[#fa6c34] bg-[#fa6c34] font-semibold text-[#1d1d1d]" : "border-[#393532] text-[#bdb4ac] hover:border-[#6b4a3e] hover:text-[#fff7ec]"}`}>
          <BookOpenText size={13} /> Docs
        </Link>
        <Link to="/faq" onClick={onNavigate} aria-current={location.pathname === "/faq" ? "page" : undefined} className={`flex min-h-[44px] items-center gap-2 rounded-sm border px-3 text-[14px] transition-colors ${location.pathname === "/faq" ? "border-[#fa6c34] bg-[#fa6c34] font-semibold text-[#1d1d1d]" : "border-[#393532] text-[#bdb4ac] hover:border-[#6b4a3e] hover:text-[#fff7ec]"}`}>
          <MessageCircleQuestion size={13} /> FAQ
        </Link>
        <Link to="/" onClick={onNavigate} className="flex min-h-[44px] items-center gap-2 rounded-sm border border-[#393532] px-3 text-[14px] text-[#bdb4ac] transition-colors hover:border-[#6b4a3e] hover:text-[#fff7ec]">
          <House size={13} /> Home
        </Link>
        </div>
        <Link to="/roadmap" onClick={onNavigate} className="mt-1.5 flex min-h-[44px] items-center justify-center gap-2 text-[12px] text-[#aaa39b] transition-colors hover:text-[#d6ccc2]">
          <Boxes size={12} /> Product roadmap
        </Link>
      </nav>
      </div>
      <div className="shrink-0 border-t border-[#34312f] bg-[#1c1b1a] p-3">
        <Link to={cloudWorkspaceEnabled ? "/login" : "/app#local-history"} onClick={onNavigate} className="group flex min-h-[58px] items-center gap-3 rounded-sm border border-[#fa6c34] bg-[#2a211d] px-3 py-2 text-[#fff7ec] outline-none transition-colors hover:bg-[#fa6c34] hover:text-[#1d1d1d] focus-visible:ring-2 focus-visible:ring-[#ffd0bc]">
          <WalletCards size={18} className="shrink-0 text-[#fa6c34] group-hover:text-[#1d1d1d]" />
          <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold">{cloudWorkspaceEnabled ? "Connect wallet / sign in" : "Your encrypted chats"}</span><span className="mt-1 block text-[12px] text-[#c9a697] group-hover:text-[#4b2114]">{cloudWorkspaceEnabled ? "Optional · message signature only" : "Saved locally · unlock with your Vault"}</span></span>
          <ArrowRight size={14} className="shrink-0" />
        </Link>
      </div>
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
  const [quickstartOpen, setQuickstartOpen] = useState(false);
  const shell = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);
  const introduced = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const quickstartReturnFocus = useRef<HTMLElement | null>(null);
  const currentFeature = PRODUCT_FEATURES.find((feature) =>
    isProductFeatureEnabled(feature.id) && activeFeature(location, feature),
  );
  const modalOpen = tourOpen || quickstartOpen;

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

  const openQuickstart = (source: HTMLElement) => {
    if (!currentFeature) return;
    quickstartReturnFocus.current = source;
    setOpen(false);
    setQuickstartOpen(true);
  };

  const closeQuickstart = () => {
    setQuickstartOpen(false);
    window.setTimeout(() => {
      const destination = quickstartReturnFocus.current;
      if (destination?.isConnected) destination.focus();
      else {
        const visibleTrigger = Array.from(document.querySelectorAll<HTMLElement>("[data-quickstart-trigger]"))
          .find((element) => element.getClientRects().length > 0);
        visibleTrigger?.focus();
      }
      quickstartReturnFocus.current = null;
    }, 0);
  };

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const panel = drawer.current;
    const visibleFocusables = () => Array.from(panel?.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),summary") ?? []).filter((element) => element.getClientRects().length > 0);
    const focusables = visibleFocusables();
    focusables?.[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      const current = visibleFocusables();
      if (event.key !== "Tab" || !current.length) return;
      const first = current[0];
      const last = current[current.length - 1];
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
      const timeline = gsap.timeline({ defaults: { ease: "power2.out" } });

      if (!introduced.current) {
        timeline.fromTo(
          "[data-desktop-rail] [data-feature-card]",
          { x: -10 },
          { x: 0, duration: 0.28, stagger: 0.035, clearProps: "transform" },
          0,
        );
        introduced.current = true;
      }

      if (routeContent) {
        timeline
          .set(routeContent, { willChange: "transform" }, 0)
          .fromTo(
            routeContent,
            { y: 5 },
            { y: 0, duration: 0.22, clearProps: "transform,willChange" },
            0,
          );
      }
    });

    media.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set("[data-route-content], [data-feature-card]", {
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
      { x: -20 },
      { x: 0, duration: 0.28, ease: "power2.out", clearProps: "transform" },
    );
  }, { scope: shell, dependencies: [open] });

  return (
    <div ref={shell} className="product-shell min-h-screen bg-[#1d1d1d]">
      <a
        href="#product-main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("product-main")?.focus();
          window.history.replaceState(null, "", "#product-main");
        }}
        className="fixed left-3 top-3 z-[120] -translate-y-24 bg-[#fa6c34] px-4 py-3 font-mono-d text-[10px] font-semibold text-[#1d1d1d] outline-none transition-transform focus:translate-y-0 focus-visible:ring-2 focus-visible:ring-white"
      >
        SKIP TO MAIN CONTENT
      </a>
      <aside data-desktop-rail inert={modalOpen ? true : undefined} className="fixed inset-y-0 left-0 z-40 hidden w-[280px] border-r border-[#2e2e2e] lg:block" aria-label="ChainScout features">
        <ProductRail onOpenTour={openTour} />
      </aside>

      {currentFeature && !modalOpen && (
        <button
          type="button"
          data-quickstart-trigger
          onClick={(event) => openQuickstart(event.currentTarget)}
          className="clip-btn-sm fixed bottom-4 left-4 z-50 flex min-h-[46px] items-center gap-2 border border-[#fa6c34] bg-[#fa6c34] px-4 text-[14px] font-semibold text-[#1d1d1d] outline-none transition-colors hover:bg-[#ff8251] focus-visible:ring-2 focus-visible:ring-[#ffd0bc] lg:bottom-5 lg:left-auto lg:right-5"
          aria-haspopup="dialog"
          aria-label="Open how-to instructions for this page"
        >
          <CircleHelp size={14} /> HOW TO USE <span className="hidden sm:inline">· {currentFeature.shortLabel.toUpperCase()}</span>
        </button>
      )}

      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={modalOpen}
        className="clip-btn-sm fixed bottom-4 right-4 z-50 flex min-h-[46px] items-center gap-2 border border-[#fa6c34]/50 bg-[#242424] px-4 text-[14px] font-medium text-[#fa6c34] lg:hidden"
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
            <button type="button" onClick={close} aria-label="Close feature menu" className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-sm border border-[#514a45] bg-[#242424] text-[#e9e0d1] hover:bg-[#333]">
              <X size={17} />
            </button>
            <ProductRail onNavigate={() => setOpen(false)} onOpenTour={openTour} />
          </div>
        </div>
      )}

      <div id="product-main" tabIndex={-1} data-route-content inert={open || modalOpen ? true : undefined} className="min-h-screen outline-none lg:pl-[280px]" aria-hidden={open || modalOpen ? true : undefined}>
        <Outlet />
      </div>
      {tourOpen && <ProductTour onDismiss={closeTour} />}
      {quickstartOpen && currentFeature && (
        <FeatureQuickstart feature={currentFeature} onDismiss={closeQuickstart} />
      )}
    </div>
  );
}

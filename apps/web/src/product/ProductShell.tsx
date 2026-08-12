import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { Link, Outlet, useLocation } from "react-router";
import {
  ArrowLeftRight,
  BadgeCheck,
  BookOpenText,
  Boxes,
  ChartNoAxesCombined,
  CircleHelp,
  FilePenLine,
  House,
  Menu,
  PackageSearch,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { PRODUCT_FEATURES, type ProductFeature } from "./features";

const ICONS: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  "private-explorer": Search,
  "scout-swap": ArrowLeftRight,
  "rwa-verify": BadgeCheck,
  "portfolio-intelligence": ChartNoAxesCombined,
  "collectible-catalog": PackageSearch,
  "market-inventory": Boxes,
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
  return (
    <div className={`border-t border-[#303030] ${active ? "bg-[#272523]" : "bg-transparent"}`}>
      <div className="flex min-h-[52px] items-stretch">
        <Link
          to={feature.path}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className="group flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center border ${active ? "border-[#fa6c34]/60 bg-[#fa6c34]/10 text-[#fa6c34]" : "border-[#383838] text-[#635d5a] group-hover:text-[#d6ccba]"}`}>
            <Icon size={13} />
          </span>
          <span className="min-w-0">
            <span className={`block truncate text-[12px] ${active ? "text-[#f0e8da]" : "text-[#9a938a] group-hover:text-[#d6ccba]"}`}>
              {feature.label}
            </span>
            <span className="mt-0.5 block truncate font-mono-d text-[8px] tracking-[0.1em] text-[#5f5a55]">
              {feature.eyebrow}
            </span>
          </span>
        </Link>
        <button
          type="button"
          onClick={onExpand}
          aria-label={feature.helpLabel}
          aria-expanded={expanded}
          className={`flex w-11 shrink-0 items-center justify-center border-l border-[#303030] transition-colors ${expanded ? "text-[#fa6c34]" : "text-[#5f5a55] hover:text-[#e9e0d1]"}`}
        >
          <CircleHelp size={14} />
        </button>
      </div>
      {expanded && (
        <div className="border-t border-[#303030] bg-[#202020] px-4 py-3" role="region" aria-label={`${feature.label} summary`}>
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

function ProductRail({ onNavigate }: { onNavigate?: () => void }) {
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

      <div className="no-bar flex-1 overflow-y-auto pb-5 pt-4">
        {(["explore", "vault"] as const).map((group) => (
          <section key={group} className="mt-2 first:mt-0" aria-label={group === "explore" ? "Explore tools" : "Private Vault tools"}>
            <p className="px-4 pb-2 font-mono-d text-[8px] tracking-[0.2em] text-[#5f5a55]">
              {group === "explore" ? "EXPLORE · READ ONLY" : "LOCAL VAULT · ENCRYPTED"}
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

      <nav className="shrink-0 border-t border-[#303030] bg-[#202020] p-3" aria-label="Product resources">
        <Link
          to="/guide"
          onClick={onNavigate}
          className={`flex items-center gap-3 px-3 py-2.5 font-mono-d text-[10px] tracking-[0.08em] ${location.pathname === "/guide" ? "text-[#fa6c34]" : "text-[#9a938a] hover:text-[#e9e0d1]"}`}
        >
          <BookOpenText size={14} /> FEATURE GUIDE
        </Link>
        <Link to="/roadmap" onClick={onNavigate} className="flex items-center gap-3 px-3 py-2.5 font-mono-d text-[10px] tracking-[0.08em] text-[#9a938a] hover:text-[#e9e0d1]">
          <Boxes size={14} /> ROADMAP
        </Link>
        <Link to="/" onClick={onNavigate} className="flex items-center gap-3 px-3 py-2.5 font-mono-d text-[10px] tracking-[0.08em] text-[#9a938a] hover:text-[#e9e0d1]">
          <House size={14} /> MARKETING HOME
        </Link>
      </nav>
    </div>
  );
}

export default function ProductShell() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);

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

  return (
    <div className="min-h-screen bg-[#1d1d1d]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] border-r border-[#2e2e2e] lg:block" aria-label="ChainScout features">
        <ProductRail />
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
            <ProductRail onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="min-h-screen lg:pl-[252px]" aria-hidden={open ? true : undefined}>
        <Outlet />
      </div>
    </div>
  );
}

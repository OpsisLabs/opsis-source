import { useEffect, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { Menu, Plus, Power, Search, ShieldCheck, Unplug, Wallet, X } from "lucide-react";
import { createSession, getUsage, listSessions, SAMPLE_TX, SAMPLE_WALLET } from "./api";
import { useAuth } from "./store";
import { useWallet } from "./walletStore";
import { hasMetaMask, shortAddress } from "./wallet";
import type { ChatSession, Usage, User } from "./types";

/** Horizontal load bar used for the quota gauges. */
function Gauge({ label, used, cap, accent }: { label: string; used: number; cap: number; accent: string }) {
  const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="hud-label">{label}</span>
        <span className="font-num text-[10px] text-[#6d8ba3]">
          {used}
          <span className="text-[#405a70]">/{cap}</span>
        </span>
      </div>
      <div className="relative h-[3px] w-full bg-[#12202e]">
        <div className="h-full transition-all duration-700" style={{ width: `${pct}%`, background: accent, boxShadow: `0 0 8px ${accent}` }} />
      </div>
    </div>
  );
}

function WalletButton() {
  const { wallet, connecting, error, connect, disconnect } = useWallet();
  const [showErr, setShowErr] = useState(false);

  useEffect(() => {
    if (error) setShowErr(true);
  }, [error]);

  if (!hasMetaMask()) {
    return (
      <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className="hud-chip">
        <Wallet size={11} />
        <span className="hidden sm:inline">INSTALL METAMASK</span>
        <span className="sm:hidden">METAMASK</span>
      </a>
    );
  }

  if (wallet) {
    const onChain = wallet.chainId === 4663;
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2.5 border border-[#3ff5c0]/30 bg-[#3ff5c0]/8 px-3.5 py-2">
          <span className={`hud-blink h-1.5 w-1.5 rounded-full ${onChain ? "bg-[#3ff5c0]" : "bg-[#ffc24d]"}`} />
          <span className="font-num text-[11px] text-[#cfe3f5]">{shortAddress(wallet.address)}</span>
          <span className="hud-label hidden xl:inline">{onChain ? "RH · 4663" : "WRONG NET"}</span>
        </div>
        <button
          onClick={disconnect}
          className="flex h-[36px] w-[36px] items-center justify-center border border-[#3fd0ff]/16 text-[#405a70] transition-colors hover:border-[#ff5c7c]/50 hover:text-[#ff5c7c]"
          aria-label="Disconnect wallet"
        >
          <Unplug size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={connect}
        disabled={connecting}
        className="hud-chip border-[#3fd0ff]/40 bg-[#3fd0ff]/12 text-[#3fd0ff] disabled:opacity-50"
      >
        <Wallet size={11} />
        {connecting ? "LINKING…" : "CONNECT"}
      </button>
      {showErr && error && (
        <div className="hud-module absolute right-0 top-[46px] z-50 w-[280px] p-3.5 text-[11.5px] leading-relaxed text-[#ff5c7c]">
          {error}
          <button onClick={() => setShowErr(false)} className="hud-label ml-2 underline">
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}

function Rail({
  sessions,
  usage,
  user,
  creating,
  onNewChat,
  onLogout,
  onNavigate,
}: {
  sessions: ChatSession[];
  usage: Usage | null;
  user: User | null;
  creating: boolean;
  onNewChat: () => void;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  const name = user?.username ?? user?.email ?? (user?.walletAddress ? shortAddress(user.walletAddress) : undefined);

  return (
    <>
      <Link to="/" onClick={onNavigate} className="relative flex h-[64px] shrink-0 items-center gap-3 border-b border-[#3fd0ff]/12 px-5">
        <span className="relative flex h-8 w-8 items-center justify-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
            <circle cx="50" cy="50" r="44" fill="none" stroke="#3fd0ff" strokeOpacity="0.3" strokeWidth="3" />
            <g className="hud-spin">
              <circle cx="50" cy="50" r="44" fill="none" stroke="#3fd0ff" strokeWidth="3" strokeDasharray="20 50" strokeLinecap="round" />
            </g>
          </svg>
          <span className="h-2 w-2 rounded-full bg-[#3fd0ff]" style={{ boxShadow: "0 0 10px #3fd0ff" }} />
        </span>
        <span className="hud-key text-[#eaf7ff]">
          RH EXPLORER
          <span className="hud-label mt-0.5 block">CHAIN 4663 · ONLINE</span>
        </span>
      </Link>

      <div className="p-4">
        <button onClick={onNewChat} disabled={creating} className="hud-chip w-full justify-center border-[#3fd0ff]/40 bg-[#3fd0ff]/12 py-3 text-[#3fd0ff] disabled:opacity-50">
          <Plus size={12} />
          {creating ? "INITIALIZING…" : "NEW SESSION"}
        </button>
      </div>

      <div className="flex items-center justify-between px-5 pb-2">
        <span className="hud-label">SESSION LOG</span>
        <span className="hud-label">{sessions.length}</span>
      </div>

      <div className="hud-scroll flex-1 overflow-y-auto">
        {sessions.map((s) => (
          <NavLink
            key={s.id}
            to={`/app/chat/${s.id}`}
            onClick={onNavigate}
            className={({ isActive }) =>
              `relative block border-t border-[#3fd0ff]/10 px-5 py-3 transition-colors ${
                isActive ? "bg-[#3fd0ff]/10 text-[#eaf7ff]" : "text-[#6d8ba3] hover:bg-[#3fd0ff]/5 hover:text-[#cfe3f5]"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute inset-y-0 left-0 w-[2px] bg-[#3fd0ff]" style={{ boxShadow: "0 0 10px #3fd0ff" }} />}
                <p className="truncate text-[12.5px]">
                  {s.title === "Untitled session" && s.entity ? `${s.entity.id.slice(0, 8)}…${s.entity.id.slice(-4)}` : s.title}
                </p>
                {s.entity && (
                  <p className="hud-label mt-1 truncate">
                    {s.entity.type} · {s.entity.id.slice(0, 8)}…{s.entity.id.slice(-4)}
                  </p>
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>

      <div className="space-y-4 border-t border-[#3fd0ff]/12 p-5">
        <Gauge label="AI MESSAGES" used={usage?.aiMessages ?? 0} cap={usage?.quota.aiMessages ?? 0} accent="#3fd0ff" />
        <Gauge label="CHAIN LOOKUPS" used={usage?.chainLookups ?? 0} cap={usage?.quota.chainLookups ?? 0} accent="#ffc24d" />
      </div>

      <div className="flex items-center gap-3 border-t border-[#3fd0ff]/12 px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center border border-[#3fd0ff]/30 bg-[#3fd0ff]/10 font-num text-[11px] text-[#3fd0ff]">
          {name?.[0]?.toUpperCase() ?? "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] text-[#a8c4da]">{name}</span>
          <span className="hud-label">OPERATOR</span>
        </span>
        <button onClick={onLogout} className="text-[#405a70] transition-colors hover:text-[#ff5c7c]" aria-label="Log out">
          <Power size={14} />
        </button>
      </div>
    </>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [drawer, setDrawer] = useState(false);

  const refresh = () => {
    listSessions()
      .then(setSessions)
      .catch((err) => console.error("failed to load sessions", err));
    getUsage()
      .then(setUsage)
      .catch((err) => console.error("failed to load usage", err));
  };
  useEffect(refresh, []);

  const newChat = async () => {
    setCreating(true);
    try {
      const s = await createSession("Untitled session");
      refresh();
      setDrawer(false);
      nav(`/app/chat/${s.id}`);
    } catch (err) {
      console.error("failed to create session", err);
    } finally {
      setCreating(false);
    }
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    try {
      const s = await createSession(v.length > 24 ? `${v.slice(0, 10)}…${v.slice(-6)}` : v, /^0x/.test(v) ? v : undefined);
      refresh();
      setQ("");
      nav(`/app/chat/${s.id}`, { state: { firstMessage: v } });
    } catch (err) {
      console.error("failed to resolve entity", err);
    }
  };

  const railProps = {
    sessions,
    usage,
    user,
    creating,
    onNewChat: newChat,
    onLogout: () => logout().then(() => nav("/")),
  };

  return (
    <div className="hud flex min-h-screen">
      <aside className="hud-deep fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r border-[#3fd0ff]/12 lg:flex">
        <Rail {...railProps} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside className="hud-deep absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-[#3fd0ff]/12">
            <button
              onClick={() => setDrawer(false)}
              className="absolute -right-11 top-3 flex h-9 w-9 items-center justify-center border border-[#3fd0ff]/20 bg-[#070c14] text-[#cfe3f5]"
              aria-label="Close menu"
            >
              <X size={16} />
            </button>
            <Rail {...railProps} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-[264px]">
        <header className="sticky top-0 z-30 flex h-[64px] items-center gap-3 border-b border-[#3fd0ff]/12 bg-[#04070c]/92 px-4 backdrop-blur md:px-6">
          <button
            onClick={() => setDrawer(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#3fd0ff]/16 text-[#cfe3f5] lg:hidden"
            aria-label="Open menu"
          >
            <Menu size={17} />
          </button>

          <form onSubmit={search} className="hud-module flex min-w-0 max-w-[620px] flex-1 items-center gap-3 px-4 transition-colors focus-within:border-[#3fd0ff]/40">
            <Search size={14} className="shrink-0 text-[#3fd0ff]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Acquire target — wallet, tx, token, or contract…"
              className="w-full bg-transparent py-2.5 text-[13px] text-[#eaf7ff] outline-none placeholder:text-[#405a70]"
            />
            <button type="submit" className="hud-label hidden shrink-0 transition-colors hover:text-[#3fd0ff] sm:block">
              SCAN ⏎
            </button>
          </form>

          <div className="hidden shrink-0 items-center gap-2 border border-[#3ff5c0]/24 bg-[#3ff5c0]/6 px-3 py-2 lg:flex">
            <ShieldCheck size={12} className="text-[#3ff5c0]" />
            <span className="hud-label text-[#3ff5c0]">READ-ONLY</span>
          </div>

          <WalletButton />

          <div className="hidden items-center gap-2 2xl:flex">
            <button onClick={() => setQ(SAMPLE_WALLET)} className="hud-chip">
              WALLET
            </button>
            <button onClick={() => setQ(SAMPLE_TX)} className="hud-chip">
              TX
            </button>
          </div>
        </header>

        <Outlet context={{ refreshSessions: refresh }} />
      </div>
    </div>
  );
}

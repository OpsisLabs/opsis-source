import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { LogOut, Menu, MessageSquarePlus, Search, ShieldCheck, Unplug, Wallet, X } from "lucide-react";
import { createSession, getUsage, listSessions, SAMPLE_TX, SAMPLE_WALLET } from "./api";
import { useAuth } from "./store";
import { useWallet } from "./walletStore";
import { hasMetaMask, shortAddress } from "./wallet";
import type { ChatSession, Usage, User } from "./types";

function LogoMark({ className = "w-6 h-6" }: { className?: string }) {
  return <img src="/logo.svg" alt="RH Chain AI Explorer" className={className} />;
}

function WalletButton() {
  const { wallet, connecting, error, connect, disconnect } = useWallet();
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const showError = Boolean(error && error !== dismissedError);

  if (!hasMetaMask()) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer"
        className="clip-btn-sm flex items-center gap-2 bg-[#2e2e2e] px-4 py-2.5 font-mono-d text-[10.5px] tracking-wider text-[#9a938a] transition-colors hover:text-[#e9e0d1]"
      >
        <Wallet size={13} />
        <span className="hidden sm:inline">INSTALL METAMASK</span>
        <span className="sm:hidden">METAMASK</span>
      </a>
    );
  }

  if (wallet) {
    const onChain = wallet.chainId === 4663;
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2.5 border border-[#7fb069]/40 bg-[#7fb069]/10 px-3.5 py-2.5">
          <span className={`h-1.5 w-1.5 rounded-full ${onChain ? "bg-[#7fb069]" : "bg-[#fa6c34]"}`} />
          <span className="font-mono-d text-[11px] text-[#d6ccba]">{shortAddress(wallet.address)}</span>
          <span className="hidden font-mono-d text-[9.5px] tracking-wider text-[#635d5a] xl:inline">
            {onChain ? "RH CHAIN · 4663" : "WRONG NETWORK"}
          </span>
        </div>
        <button
          onClick={disconnect}
          className="flex h-[38px] w-[38px] items-center justify-center border border-[#2e2e2e] text-[#635d5a] transition-colors hover:border-[#e0738a]/50 hover:text-[#e0738a]"
          aria-label="Disconnect wallet"
          title="Disconnect"
        >
          <Unplug size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={connect}
        disabled={connecting}
        className="clip-btn-sm flex items-center gap-2 bg-[#fa6c34] px-4 py-2.5 font-mono-d text-[10.5px] font-medium tracking-wider text-[#1d1d1d] transition-colors hover:bg-[#ff7038] disabled:opacity-60"
      >
        <Wallet size={13} />
        {connecting ? "CONNECTING…" : "CONNECT WALLET"}
      </button>
      {showError && error && (
        <div className="absolute right-0 top-[46px] z-50 w-[280px] border border-[#e0738a]/40 bg-[#242424] p-3.5 text-[11.5px] leading-relaxed text-[#e0738a]">
          {error}
          <button onClick={() => setDismissedError(error)} className="ml-2 font-mono-d text-[10px] text-[#9a938a] underline">
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}

function RailBody({
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
  const usagePct = usage ? Math.round((usage.aiMessages / usage.quota.aiMessages) * 100) : 0;
  // Wallet accounts have a username, email accounts have an address.
  const displayName =
    user?.username ?? user?.email ?? (user?.walletAddress ? shortAddress(user.walletAddress) : undefined);
  return (
    <>
      <Link
        to="/"
        onClick={onNavigate}
        className="relative block h-[64px] shrink-0 bg-[#fa6c34]"
        style={{ clipPath: "polygon(0 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%)" }}
      >
        <span className="absolute inset-0 flex items-center justify-center gap-2.5">
          <LogoMark />
          <span className="font-mono-d text-[11px] font-medium tracking-wider text-[#1d1d1d]">RH AI EXPLORER</span>
        </span>
      </Link>

      <div className="p-4">
        <button
          onClick={onNewChat}
          disabled={creating}
          className="clip-btn-sm flex w-full items-center justify-center gap-2 bg-[#e9e0d1] py-3 font-mono-d text-[11.5px] font-medium tracking-wide text-[#1d1d1d] transition-colors hover:bg-[#f0e8da] disabled:opacity-60"
        >
          <MessageSquarePlus size={14} />
          {creating ? "CREATING…" : "NEW SESSION"}
        </button>
      </div>

      <div className="px-5 pb-2 pt-1 font-mono-d text-[10.5px] tracking-wider text-[#635d5a]">SESSIONS</div>
      <div className="no-bar flex-1 overflow-y-auto">
        {sessions.map((s) => (
          <NavLink
            key={s.id}
            to={`/app/chat/${s.id}`}
            onClick={onNavigate}
            className={({ isActive }) =>
              `block border-t border-[#2e2e2e] px-5 py-3.5 transition-colors ${
                isActive ? "bg-[#242424] text-[#e9e0d1]" : "text-[#9a938a] hover:bg-[#202020] hover:text-[#e9e0d1]"
              }`
            }
          >
            <p className="truncate text-[13px]">
              {s.title === "Untitled session" && s.entity
                ? `${s.entity.id.slice(0, 8)}…${s.entity.id.slice(-4)}`
                : s.title}
            </p>
            {s.entity && (
              <p className="mt-1 truncate font-mono-d text-[10px] text-[#635d5a]">
                {s.entity.type.toUpperCase()} · {s.entity.id.slice(0, 8)}…{s.entity.id.slice(-4)}
              </p>
            )}
          </NavLink>
        ))}
      </div>

      {/* usage */}
      <div className="border-t border-[#2e2e2e] p-5">
        <div className="mb-2 flex items-center justify-between font-mono-d text-[10.5px] tracking-wider text-[#635d5a]">
          <span>AI MESSAGES</span>
          <span className="text-[#9a938a]">{usage ? `${usage.aiMessages}/${usage.quota.aiMessages}` : "-"}</span>
        </div>
        <div className="h-[3px] w-full bg-[#2e2e2e]">
          <div className="h-full bg-[#fa6c34] transition-all" style={{ width: `${usagePct}%` }} />
        </div>
        <div className="mb-2 mt-4 flex items-center justify-between font-mono-d text-[10.5px] tracking-wider text-[#635d5a]">
          <span>CHAIN LOOKUPS</span>
          <span className="text-[#9a938a]">{usage ? `${usage.chainLookups}/${usage.quota.chainLookups}` : "-"}</span>
        </div>
        <div className="h-[3px] w-full bg-[#2e2e2e]">
          <div
            className="h-full bg-[#d6ccba] transition-all"
            style={{ width: usage ? `${(usage.chainLookups / usage.quota.chainLookups) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {/* user */}
      <div className="flex items-center gap-3 border-t border-[#2e2e2e] px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2e2e2e] font-mono-d text-[11px] text-[#d6ccba]">
          {displayName?.[0]?.toUpperCase() ?? "?"}
        </span>
        <span className="flex-1 truncate text-[12.5px] text-[#9a938a]">{displayName}</span>
        <button onClick={onLogout} className="text-[#635d5a] transition-colors hover:text-[#e0738a]" aria-label="Log out">
          <LogOut size={15} />
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
  const [resolving, setResolving] = useState(false);
  const [shellError, setShellError] = useState("");
  const [drawer, setDrawer] = useState(false);
  const resolvingRef = useRef(false);

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
    setShellError("");
    try {
      const s = await createSession("Untitled session");
      refresh();
      setDrawer(false);
      nav(`/app/chat/${s.id}`);
    } catch (err) {
      console.error("failed to create session", err);
      setShellError(err instanceof Error ? err.message : "Could not create a new session. Try again.");
    } finally {
      setCreating(false);
    }
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (!v || resolvingRef.current) return;
    resolvingRef.current = true;
    setResolving(true);
    setShellError("");
    try {
      const s = await createSession(
        v.length > 24 ? `${v.slice(0, 10)}…${v.slice(-6)}` : v,
        /^0x/.test(v) ? v : undefined
      );
      refresh();
      setQ("");
      nav(`/app/chat/${s.id}`, { state: { firstMessage: v } });
    } catch (err) {
      console.error("failed to resolve entity", err);
      setShellError(err instanceof Error ? err.message : "Could not resolve that entity. Check the address or hash and try again.");
    } finally {
      resolvingRef.current = false;
      setResolving(false);
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
    <div className="flex min-h-screen bg-[#1d1d1d] text-[#e9e0d1]">
      {/* desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col border-r border-[#2e2e2e] bg-[#1d1d1d] lg:flex">
        <RailBody {...railProps} />
      </aside>

      {/* mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-[#2e2e2e] bg-[#1d1d1d]">
            <button
              onClick={() => setDrawer(false)}
              className="absolute -right-11 top-3 flex h-9 w-9 items-center justify-center border border-[#2e2e2e] bg-[#1d1d1d] text-[#e9e0d1]"
              aria-label="Close menu"
            >
              <X size={16} />
            </button>
            <RailBody {...railProps} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      {/* main */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-[260px]">
        {/* topbar */}
        <header className="sticky top-0 z-30 flex h-[64px] items-center gap-3 border-b border-[#2e2e2e] bg-[#1d1d1d]/95 px-4 backdrop-blur md:px-6">
          <button
            onClick={() => setDrawer(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#2e2e2e] text-[#e9e0d1] lg:hidden"
            aria-label="Open menu"
          >
            <Menu size={17} />
          </button>
          <form onSubmit={search} className="flex max-w-[640px] flex-1 items-center gap-3 border border-[#383838] bg-[#242424] px-4 transition-colors focus-within:border-[#fa6c34]">
            <Search size={15} className="shrink-0 text-[#635d5a]" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                if (shellError) setShellError("");
              }}
              aria-label="Wallet, token, contract, or transaction"
              aria-describedby={shellError ? "entity-search-error" : undefined}
              placeholder="Paste a wallet, tx hash, token, or contract…"
              className="w-full bg-transparent py-3 text-[13.5px] text-[#e9e0d1] outline-none placeholder:text-[#635d5a]"
            />
            <button
              type="submit"
              disabled={resolving || !q.trim()}
              className="hidden shrink-0 font-mono-d text-[10.5px] tracking-wider text-[#9a938a] transition-colors hover:text-[#fa6c34] disabled:cursor-not-allowed disabled:opacity-50 sm:block"
            >
              {resolving ? "RESOLVING…" : "RESOLVE ⏎"}
            </button>
          </form>
          <div className="hidden items-center gap-2 border border-[#2e2e2e] px-3 py-2 md:flex">
            <ShieldCheck size={13} className="text-[#7fb069]" />
            <span className="font-mono-d text-[10.5px] tracking-wider text-[#9a938a]">READ-ONLY</span>
          </div>
          <WalletButton />
          <div className="hidden items-center gap-2 xl:flex">
            <button
              onClick={() => setQ(SAMPLE_WALLET)}
              className="border border-[#2e2e2e] px-3 py-2 font-mono-d text-[10.5px] text-[#635d5a] transition-colors hover:border-[#383838] hover:text-[#e9e0d1]"
            >
              SAMPLE WALLET
            </button>
            <button
              onClick={() => setQ(SAMPLE_TX)}
              className="border border-[#2e2e2e] px-3 py-2 font-mono-d text-[10.5px] text-[#635d5a] transition-colors hover:border-[#383838] hover:text-[#e9e0d1]"
            >
              SAMPLE TX
            </button>
          </div>
        </header>

        {shellError && (
          <div
            id="entity-search-error"
            role="alert"
            className="border-b border-[#e0738a]/40 bg-[#e0738a]/10 px-4 py-3 text-[12.5px] text-[#e0738a] md:px-6"
          >
            {shellError}
          </div>
        )}

        <Outlet context={{ refreshSessions: refresh }} />
      </div>
    </div>
  );
}

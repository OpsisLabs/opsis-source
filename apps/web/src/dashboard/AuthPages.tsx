import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Wallet } from "lucide-react";
import { useAuth } from "./store";
import { USERNAME_REQUIRED } from "./api";
import { hasMetaMask } from "./wallet";

function LogoMark({ className = "w-7 h-7" }: { className?: string }) {
  return <img src="/logo.svg" alt="RH Chain AI Explorer" className={className} />;
}

function AuthLayout({
  title,
  sub,
  children,
  footer,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="hud flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[420px]">
        <Link to="/" className="mb-10 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center border border-[#3fd0ff]/30 bg-[#3fd0ff]/10">
            <LogoMark />
          </span>
          <span className="hud-key leading-4">
            RH CHAIN
            <br />
            AI EXPLORER
          </span>
        </Link>
        <div className="hud-module hud-brackets hud-glow p-8">
          <h1 className="text-[26px] font-light tracking-[-0.02em] text-[#eaf7ff]">{title}</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[#6d8ba3]">{sub}</p>
          {children}
        </div>
        <div className="mt-6 text-center text-[13px] text-[#6d8ba3]">{footer}</div>
        <p className="hud-label mt-10 block text-center leading-relaxed">
          READ-ONLY · NO TRANSACTIONS · NO APPROVALS
          <br />
          Informational only. Not financial advice.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="hud-label mb-2 block">{label}</span>
      <input
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-[#3fd0ff]/16 bg-[#070c14] px-4 py-3 text-[14px] text-[#eaf7ff] outline-none transition-colors placeholder:text-[#405a70] focus:border-[#3fd0ff]/50"
      />
    </label>
  );
}

/**
 * Wallet sign-in. Connecting requests one `personal_sign` to prove control of
 * the address — no transaction, no approvals. A wallet the API has not seen
 * before is asked for a username, reusing the signature already given so the
 * wallet only prompts once.
 */
function WalletAuth() {
  const { signInWithWallet } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [needsUsername, setNeedsUsername] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (name?: string) => {
    setBusy(true);
    setErr("");
    try {
      await signInWithWallet(name);
      nav("/app");
    } catch (ex) {
      if ((ex as { code?: string }).code === USERNAME_REQUIRED) setNeedsUsername(true);
      else setErr((ex as Error).message);
      setBusy(false);
    }
  };

  if (!hasMetaMask()) {
    return (
      <div className="mt-8 space-y-5">
        <p className="border border-[#ff5c7c]/40 bg-[#ff5c7c]/10 px-4 py-3 text-[12.5px] text-[#ff5c7c]">
          MetaMask was not detected in this browser.
        </p>
        <a
          href="https://metamask.io/download/"
          target="_blank"
          rel="noreferrer"
          className="hud-chip h-[52px] w-full justify-center border-[#3fd0ff]/40 bg-[#3fd0ff]/12 text-[12px] text-[#3fd0ff]"
        >
          <Wallet size={14} />
          INSTALL METAMASK
        </a>
      </div>
    );
  }

  if (needsUsername) {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      run(username);
    };
    return (
      <form onSubmit={submit} className="mt-8 space-y-5">
        <p className="hud-key text-[#3ff5c0]">WALLET VERIFIED</p>
        <Field
          label="USERNAME"
          type="text"
          value={username}
          onChange={setUsername}
          placeholder="3-20 letters, numbers, or _"
        />
        {err && <p className="border border-[#ff5c7c]/40 bg-[#ff5c7c]/10 px-4 py-3 text-[12.5px] text-[#ff5c7c]">{err}</p>}
        <button
          type="submit"
          disabled={busy || !username.trim()}
          className="hud-chip h-[52px] w-full justify-center border-[#3fd0ff]/50 bg-[#3fd0ff]/16 text-[12px] text-[#3fd0ff] disabled:opacity-40"
        >
          {busy ? "CREATING…" : "CLAIM USERNAME"}
        </button>
      </form>
    );
  }

  return (
    <div className="mt-8 space-y-5">
      {err && <p className="border border-[#ff5c7c]/40 bg-[#ff5c7c]/10 px-4 py-3 text-[12.5px] text-[#ff5c7c]">{err}</p>}
      <button
        type="button"
        onClick={() => run()}
        disabled={busy}
        className="hud-chip h-[52px] w-full justify-center border-[#3fd0ff]/50 bg-[#3fd0ff]/16 text-[12px] text-[#3fd0ff] disabled:opacity-40"
      >
        <Wallet size={14} />
        {busy ? "CHECK METAMASK…" : "CONNECT WALLET"}
      </button>
      <p className="hud-label leading-relaxed">
        MetaMask will ask you to sign a short message. It proves you control the
        address. It is not a transaction, moves no funds, and grants no approvals.
      </p>
    </div>
  );
}

export function LoginPage() {
  return (
    <AuthLayout
      title="Welcome back"
      sub="Sign in with your wallet to continue your Robinhood Chain research."
      footer={
        <>
          First time here?{" "}
          <Link to="/register" className="text-[#3fd0ff] underline decoration-[#3fd0ff]/40 underline-offset-4 hover:decoration-[#3fd0ff]">
            Create an account
          </Link>
        </>
      }
    >
      <WalletAuth />
    </AuthLayout>
  );
}

export function RegisterPage() {
  return (
    <AuthLayout
      title="Create your account"
      sub="Connect a wallet and pick a username. No email, no password. The free tier includes 500 AI messages and 5,000 chain lookups per month."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-[#3fd0ff] underline decoration-[#3fd0ff]/40 underline-offset-4 hover:decoration-[#3fd0ff]">
            Sign in
          </Link>
        </>
      }
    >
      <WalletAuth />
    </AuthLayout>
  );
}

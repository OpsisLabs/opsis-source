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
    <div className="dots flex min-h-screen items-center justify-center bg-[#1d1d1d] px-4">
      <div className="w-full max-w-[420px]">
        <Link to="/" className="mb-10 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center bg-[#fa6c34]">
            <LogoMark />
          </span>
          <span className="font-mono-d text-[12px] leading-4 text-[#9a938a]">
            RH CHAIN
            <br />
            AI EXPLORER
          </span>
        </Link>
        <div className="clip-panel border border-[#2e2e2e] bg-[#242424] p-8">
          <h1 className="text-[26px] font-medium tracking-[-0.02em] text-[#f0e8da]">{title}</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[#9a938a]">{sub}</p>
          {children}
        </div>
        <div className="mt-6 text-center text-[13px] text-[#9a938a]">{footer}</div>
        <p className="mt-10 text-center font-mono-d text-[10.5px] leading-relaxed text-[#635d5a]">
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
      <span className="mb-2 block font-mono-d text-[11px] tracking-wider text-[#635d5a]">{label}</span>
      <input
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-[#383838] bg-[#1d1d1d] px-4 py-3 text-[14px] text-[#e9e0d1] outline-none transition-colors placeholder:text-[#635d5a] focus:border-[#fa6c34]"
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
function WalletAuth({ variant }: { variant: "signin" | "signup" }) {
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
        <p className="border border-[#e0738a]/40 bg-[#e0738a]/10 px-4 py-3 text-[12.5px] text-[#e0738a]">
          MetaMask was not detected in this browser.
        </p>
        <a
          href="https://metamask.io/download/"
          target="_blank"
          rel="noreferrer"
          className="clip-btn flex h-[52px] w-full items-center justify-center gap-2 bg-[#e9e0d1] font-mono-d text-[12.5px] font-medium tracking-wide text-[#1d1d1d] transition-colors hover:bg-[#f0e8da]"
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
        <p className="font-mono-d text-[10.5px] tracking-wider text-[#7fb069]">WALLET VERIFIED</p>
        <Field
          label="USERNAME"
          type="text"
          value={username}
          onChange={setUsername}
          placeholder="3-20 letters, numbers, or _"
        />
        {err && <p className="border border-[#e0738a]/40 bg-[#e0738a]/10 px-4 py-3 text-[12.5px] text-[#e0738a]">{err}</p>}
        <button
          type="submit"
          disabled={busy || !username.trim()}
          className="clip-btn flex h-[52px] w-full items-center justify-center bg-[#fa6c34] font-mono-d text-[12.5px] font-medium tracking-wide text-[#1d1d1d] transition-colors hover:bg-[#ff7038] disabled:opacity-60"
        >
          {busy ? "CREATING…" : "CLAIM USERNAME"}
        </button>
      </form>
    );
  }

  return (
    <div className="mt-8 space-y-5">
      {err && <p className="border border-[#e0738a]/40 bg-[#e0738a]/10 px-4 py-3 text-[12.5px] text-[#e0738a]">{err}</p>}
      <button
        type="button"
        onClick={() => run()}
        disabled={busy}
        className={`clip-btn flex h-[52px] w-full items-center justify-center gap-2 font-mono-d text-[12.5px] font-medium tracking-wide text-[#1d1d1d] transition-colors disabled:opacity-60 ${
          variant === "signup" ? "bg-[#fa6c34] hover:bg-[#ff7038]" : "bg-[#e9e0d1] hover:bg-[#f0e8da]"
        }`}
      >
        <Wallet size={14} />
        {busy ? "CHECK METAMASK…" : "CONNECT WALLET"}
      </button>
      <p className="font-mono-d text-[10.5px] leading-relaxed text-[#635d5a]">
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
          <Link to="/register" className="text-[#e9e0d1] underline decoration-[#635d5a] underline-offset-4 hover:decoration-[#e9e0d1]">
            Create an account
          </Link>
        </>
      }
    >
      <WalletAuth variant="signin" />
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
          <Link to="/login" className="text-[#e9e0d1] underline decoration-[#635d5a] underline-offset-4 hover:decoration-[#e9e0d1]">
            Sign in
          </Link>
        </>
      }
    >
      <WalletAuth variant="signup" />
    </AuthLayout>
  );
}

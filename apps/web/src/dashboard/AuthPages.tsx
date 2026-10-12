import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Wallet } from "lucide-react";
import { useAuth } from "./store";
import { USERNAME_REQUIRED } from "./api";
import { hasMetaMask } from "./wallet";
import { cloudWorkspaceEnabled, cloudUnavailableMessage } from "./cloudAvailability";
import { useI18n } from "../i18n";

function LogoMark({ className = "w-7 h-7" }: { className?: string }) {
  return <img src="/logo.svg" alt="Opsis" className={className} />;
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
  const { t } = useI18n();
  return (
    <div className="dots flex min-h-screen items-center justify-center bg-[#1d1d1d] px-4">
      <div className="w-full max-w-[420px]">
        <Link to="/" className="mb-10 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center bg-[#fa6c34]">
            <LogoMark />
          </span>
          <span className="font-mono-d text-[12px] leading-4 text-[#9a938a]">
            {t("cloud.auth.brand")}
            <br />
            {t("cloud.auth.savedResearch")}
          </span>
        </Link>
        <div className="clip-panel border border-[#2e2e2e] bg-[#242424] p-8">
          <h1 className="text-[26px] font-medium tracking-[-0.02em] text-[#f0e8da]">{title}</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[#9a938a]">{sub}</p>
          {children}
        </div>
        <div className="mt-6 text-center text-[13px] text-[#9a938a]">{footer}</div>
        <p className="mt-10 text-center font-mono-d text-[10.5px] leading-relaxed text-[#635d5a]">
          {t("cloud.auth.readOnly")}
          <br />
          {t("cloud.auth.disclaimer")}
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
  const { t } = useI18n();
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
      nav("/cloud");
    } catch (ex) {
      if ((ex as { code?: string }).code === USERNAME_REQUIRED) setNeedsUsername(true);
      else setErr((ex as Error).message);
      setBusy(false);
    }
  };

  if (!cloudWorkspaceEnabled) {
    return <div className="mt-6 space-y-4">
      <p role="status" className="border border-[#fa6c34]/40 p-4 text-[14px] leading-relaxed text-[#e9e0d1]">{cloudUnavailableMessage()}</p>
      <Link to="/app" className="flex min-h-11 items-center justify-center bg-[#fa6c34] px-4 text-[14px] font-semibold text-[#1d1d1d]">{t("cloud.auth.openPrivateExplorer")}</Link>
      <Link to="/vault" className="flex min-h-11 items-center justify-center border border-[#766a60] px-4 text-[14px] text-[#e9e0d1]">{t("cloud.auth.openLocalVault")}</Link>
    </div>;
  }

  if (!hasMetaMask()) {
    return (
      <div className="mt-8 space-y-5">
        <p className="border border-[#e0738a]/40 bg-[#e0738a]/10 px-4 py-3 text-[12.5px] text-[#e0738a]">
          {t("cloud.auth.metamaskNotDetected")}
        </p>
        <a
          href="https://metamask.io/download/"
          target="_blank"
          rel="noreferrer"
          className="clip-btn flex h-[52px] w-full items-center justify-center gap-2 bg-[#e9e0d1] font-mono-d text-[12.5px] font-medium tracking-wide text-[#1d1d1d] transition-colors hover:bg-[#f0e8da]"
        >
          <Wallet size={14} />
          {t("cloud.auth.installMetamask")}
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
        <p className="font-mono-d text-[10.5px] tracking-wider text-[#7fb069]">{t("cloud.auth.walletVerified")}</p>
        <Field
          label={t("cloud.auth.username")}
          type="text"
          value={username}
          onChange={setUsername}
          placeholder={t("cloud.auth.usernamePlaceholder")}
        />
        {err && <p className="border border-[#e0738a]/40 bg-[#e0738a]/10 px-4 py-3 text-[12.5px] text-[#e0738a]">{err}</p>}
        <button
          type="submit"
          disabled={busy || !username.trim()}
          className="clip-btn flex h-[52px] w-full items-center justify-center bg-[#fa6c34] font-mono-d text-[12.5px] font-medium tracking-wide text-[#1d1d1d] transition-colors hover:bg-[#ff7038] disabled:opacity-60"
        >
          {busy ? t("cloud.auth.creating") : t("cloud.auth.claimUsername")}
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
        {busy ? t("cloud.auth.checkMetamask") : t("cloud.auth.connectWallet")}
      </button>
      <p className="font-mono-d text-[10.5px] leading-relaxed text-[#635d5a]">
        {t("cloud.auth.signatureNote")}
      </p>
    </div>
  );
}

export function LoginPage() {
  const { t } = useI18n();
  return (
    <AuthLayout
      title={cloudWorkspaceEnabled ? t("cloud.auth.login.title") : t("cloud.auth.login.titlePrivate")}
      sub={cloudWorkspaceEnabled ? t("cloud.auth.login.sub") : t("cloud.auth.login.subPrivate")}
      footer={
        <>
          {cloudWorkspaceEnabled ? t("cloud.auth.login.footerFirst") : t("cloud.auth.login.footerPrivate")}
          <Link to={cloudWorkspaceEnabled ? "/register" : "/guide"} className="text-[#e9e0d1] underline decoration-[#635d5a] underline-offset-4 hover:decoration-[#e9e0d1]">
            {cloudWorkspaceEnabled ? t("cloud.auth.login.createAccount") : t("cloud.auth.login.featureGuide")}
          </Link>
        </>
      }
    >
      <WalletAuth variant="signin" />
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { t } = useI18n();
  return (
    <AuthLayout
      title={cloudWorkspaceEnabled ? t("cloud.auth.register.title") : t("cloud.auth.register.titlePrivate")}
      sub={cloudWorkspaceEnabled ? t("cloud.auth.register.sub") : t("cloud.auth.register.subPrivate")}
      footer={
        <>
          {t("cloud.auth.register.footer")}{" "}
          <Link to="/login" className="text-[#e9e0d1] underline decoration-[#635d5a] underline-offset-4 hover:decoration-[#e9e0d1]">
            {t("cloud.auth.register.signIn")}
          </Link>
        </>
      }
    >
      <WalletAuth variant="signup" />
    </AuthLayout>
  );
}

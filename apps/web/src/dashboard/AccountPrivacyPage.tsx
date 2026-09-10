import { useState } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, Download, ShieldCheck, Trash2 } from "lucide-react";
import { deleteAccount, exportAccount } from "./api";
import { useAuth } from "./store";
import { useI18n } from "../i18n";

export default function AccountPrivacyPage() {
  const { t } = useI18n();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [error, setError] = useState("");
  const exact = "DELETE MY CHAINSCOUT ACCOUNT";

  const download = async () => {
    setBusy("export");
    setError("");
    try {
      const blob = await exportAccount();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `chainscout-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("cloud.privacy.errorExport"));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (confirmation !== exact || busy) return;
    setBusy("delete");
    setError("");
    try {
      await deleteAccount();
      // Leave the authenticated route before clearing React session state;
      // otherwise RequireAuth can win the render race and strand a successful
      // deletion on the sign-in screen instead of the public completion path.
      navigate("/", { replace: true });
      await logout();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("cloud.privacy.errorDelete"));
      setBusy(null);
    }
  };

  return (
    <div className="flex-1 px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="mx-auto max-w-[860px]">
        <div className="flex items-center gap-2.5 font-mono-d text-[10px] tracking-[0.16em] text-[#7fb069]">
          <ShieldCheck size={14} /> {t("cloud.privacy.eyebrow")}
        </div>
        <h1 className="mt-4 text-[34px] font-medium tracking-[-0.03em] text-[#f0e8da]">{t("cloud.privacy.title")}</h1>
        <p className="mt-4 max-w-[680px] text-[14px] leading-relaxed text-[#9a938a]">
          {t("cloud.privacy.intro")}
        </p>

        {error && <div role="alert" className="mt-6 border border-[#e0738a]/40 bg-[#e0738a]/10 px-5 py-4 text-[12.5px] text-[#e0738a]">{error}</div>}

        <section className="clip-panel mt-8 border border-[#383838] bg-[#242424] p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono-d text-[10px] tracking-[0.15em] text-[#d6ccba]">{t("cloud.privacy.downloadTitle")}</p>
              <p className="mt-3 max-w-[560px] text-[13px] leading-relaxed text-[#9a938a]">
                {t("cloud.privacy.downloadBody")}
              </p>
            </div>
            <button onClick={download} disabled={busy !== null} className="clip-btn-sm flex min-h-[44px] shrink-0 items-center justify-center gap-2 bg-[#e9e0d1] px-5 font-mono-d text-[10px] font-medium text-[#1d1d1d] disabled:opacity-50">
              <Download size={13} /> {busy === "export" ? t("cloud.privacy.preparing") : t("cloud.privacy.exportJson")}
            </button>
          </div>
        </section>

        <section className="clip-panel mt-5 border border-[#e0738a]/35 bg-[#e0738a]/5 p-6 sm:p-8">
          <div className="flex items-center gap-2.5 text-[#e0738a]">
            <AlertTriangle size={15} />
            <p className="font-mono-d text-[10px] tracking-[0.15em]">{t("cloud.privacy.deleteTitle")}</p>
          </div>
          <p className="mt-4 max-w-[680px] text-[13px] leading-relaxed text-[#9a938a]">
            {t("cloud.privacy.deleteBody")}
          </p>
          <label className="mt-6 block">
            <span className="font-mono-d text-[9.5px] tracking-wider text-[#635d5a]">{t("cloud.privacy.typePhrase")}</span>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={exact}
              autoComplete="off"
              className="mt-2 w-full border border-[#383838] bg-[#1d1d1d] px-4 py-3 font-mono-d text-[11px] text-[#e9e0d1] outline-none focus:border-[#e0738a]"
            />
          </label>
          <button onClick={remove} disabled={confirmation !== exact || busy !== null} className="mt-4 flex min-h-[44px] items-center justify-center gap-2 border border-[#e0738a]/50 bg-[#e0738a]/10 px-5 font-mono-d text-[10px] text-[#e0738a] transition-colors hover:bg-[#e0738a]/15 disabled:cursor-not-allowed disabled:opacity-40">
            <Trash2 size={13} /> {busy === "delete" ? t("cloud.privacy.deleting") : t("cloud.privacy.deleteAccount")}
          </button>
        </section>
      </div>
    </div>
  );
}

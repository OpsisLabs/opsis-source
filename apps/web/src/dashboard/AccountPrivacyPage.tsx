import { useState } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, Download, ShieldCheck, Trash2 } from "lucide-react";
import { deleteAccount, exportAccount } from "./api";
import { useAuth } from "./store";

export default function AccountPrivacyPage() {
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
      setError(requestError instanceof Error ? requestError.message : "Could not create the export.");
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
      await logout();
      navigate("/", { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Account deletion did not complete. Nothing was partially deleted.");
      setBusy(null);
    }
  };

  return (
    <div className="flex-1 px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="mx-auto max-w-[860px]">
        <div className="flex items-center gap-2.5 font-mono-d text-[10px] tracking-[0.16em] text-[#7fb069]">
          <ShieldCheck size={14} /> CLOUD ACCOUNT PRIVACY
        </div>
        <h1 className="mt-4 text-[34px] font-medium tracking-[-0.03em] text-[#f0e8da]">Your data stays under your control.</h1>
        <p className="mt-4 max-w-[680px] text-[14px] leading-relaxed text-[#9a938a]">
          Private Mode saves nothing. This page covers only the optional legacy cloud account: saved sessions, account activity, export, and deletion.
        </p>

        {error && <div role="alert" className="mt-6 border border-[#e0738a]/40 bg-[#e0738a]/10 px-5 py-4 text-[12.5px] text-[#e0738a]">{error}</div>}

        <section className="clip-panel mt-8 border border-[#383838] bg-[#242424] p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono-d text-[10px] tracking-[0.15em] text-[#d6ccba]">DOWNLOAD MY DATA</p>
              <p className="mt-3 max-w-[560px] text-[13px] leading-relaxed text-[#9a938a]">
                Get a versioned JSON file with your profile, saved sessions, messages, citation references, usage, and account audit events. Password and token hashes are excluded.
              </p>
            </div>
            <button onClick={download} disabled={busy !== null} className="clip-btn-sm flex min-h-[44px] shrink-0 items-center justify-center gap-2 bg-[#e9e0d1] px-5 font-mono-d text-[10px] font-medium text-[#1d1d1d] disabled:opacity-50">
              <Download size={13} /> {busy === "export" ? "PREPARING…" : "EXPORT JSON"}
            </button>
          </div>
        </section>

        <section className="clip-panel mt-5 border border-[#e0738a]/35 bg-[#e0738a]/5 p-6 sm:p-8">
          <div className="flex items-center gap-2.5 text-[#e0738a]">
            <AlertTriangle size={15} />
            <p className="font-mono-d text-[10px] tracking-[0.15em]">DELETE CLOUD ACCOUNT</p>
          </div>
          <p className="mt-4 max-w-[680px] text-[13px] leading-relaxed text-[#9a938a]">
            This permanently removes your account, sessions, messages, credentials, usage rows, and linked audit rows. It cannot erase public blockchain history or de-associated public provider documents.
          </p>
          <label className="mt-6 block">
            <span className="font-mono-d text-[9.5px] tracking-wider text-[#635d5a]">TYPE THE EXACT PHRASE TO CONTINUE</span>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={exact}
              autoComplete="off"
              className="mt-2 w-full border border-[#383838] bg-[#1d1d1d] px-4 py-3 font-mono-d text-[11px] text-[#e9e0d1] outline-none focus:border-[#e0738a]"
            />
          </label>
          <button onClick={remove} disabled={confirmation !== exact || busy !== null} className="mt-4 flex min-h-[44px] items-center justify-center gap-2 border border-[#e0738a]/50 bg-[#e0738a]/10 px-5 font-mono-d text-[10px] text-[#e0738a] transition-colors hover:bg-[#e0738a]/15 disabled:cursor-not-allowed disabled:opacity-40">
            <Trash2 size={13} /> {busy === "delete" ? "DELETING…" : "DELETE MY ACCOUNT"}
          </button>
        </section>
      </div>
    </div>
  );
}

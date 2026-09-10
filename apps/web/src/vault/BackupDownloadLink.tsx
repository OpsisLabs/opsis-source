import { useI18n } from "../i18n";

export function BackupDownloadLink({ download }: {
  download: { url: string; filename: string; text: string } | null;
}) {
  const { t } = useI18n();
  if (!download) return null;
  return <div className="mt-3 space-y-2 text-sm text-[#d6ccba]">
    <p role="status">{t("vault.backup.ready")}</p>
    <a href={download.url} download={download.filename}
      className="inline-flex min-h-11 items-center rounded-sm border border-[#fa6c34] px-3 py-2 text-[#fa6c34] underline underline-offset-4">
      {t("vault.backup.downloadPrepared")}
    </a>
    <p className="break-all text-xs">{download.filename}</p>
    <p className="text-xs">{t("vault.backup.blockedNote")}</p>
    <details>
      <summary className="cursor-pointer py-3 text-sm text-[#fa6c34]">{t("vault.backup.blockedTitle")}</summary>
      <p className="my-2 text-xs">{t("vault.backup.blockedInstructions", { filename: download.filename })}</p>
      <textarea readOnly aria-label={t("vault.backup.jsonAria")} value={download.text}
        onFocus={(event) => event.currentTarget.select()}
        className="h-40 w-full border border-[#383838] bg-[#1d1d1d] p-3 font-mono-d text-xs text-[#d6ccba]" />
      <p className="mt-2 text-xs">{t("vault.backup.keepPrivate")}</p>
    </details>
  </div>;
}

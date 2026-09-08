export function BackupDownloadLink({ download }: {
  download: { url: string; filename: string; text: string } | null;
}) {
  if (!download) return null;
  return <div className="mt-3 space-y-2 text-sm text-[#d6ccba]">
    <p role="status">Encrypted backup ready. Check your Downloads folder before closing this page.</p>
    <a href={download.url} download={download.filename}
      className="inline-flex min-h-11 items-center rounded-sm border border-[#fa6c34] px-3 py-2 text-[#fa6c34] underline underline-offset-4">
      Download prepared backup
    </a>
    <p className="break-all text-xs">{download.filename}</p>
    <p className="text-xs">Nothing downloaded? Click the link above and check whether your browser blocked the download. This is a snapshot from the time you exported. The link expires after five minutes or when you lock or leave. Keep this browser’s Vault intact until you have verified a backup; another browser will not automatically have your records.</p>
    <details>
      <summary className="cursor-pointer py-3 text-sm text-[#fa6c34]">Download blocked? Save encrypted text instead</summary>
      <p className="my-2 text-xs">Select the text below, copy it, and save it in a plain-text editor as {download.filename} (not .txt or rich text). Restore that file to verify it before relying on it. This contains encrypted records and wrapped keys, not your passphrase or readable chats.</p>
      <textarea readOnly aria-label="Encrypted backup JSON" value={download.text}
        onFocus={(event) => event.currentTarget.select()}
        className="h-40 w-full border border-[#383838] bg-[#1d1d1d] p-3 font-mono-d text-xs text-[#d6ccba]" />
      <p className="mt-2 text-xs">Keep this file private. Anyone with it can attempt to guess your passphrase.</p>
    </details>
  </div>;
}

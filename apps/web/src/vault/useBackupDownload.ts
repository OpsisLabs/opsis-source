import { useCallback, useEffect, useRef, useState } from "react";
import type { exportVault } from "./service";
import { VAULT_MAX_BACKUP_BYTES } from "./types";
import { translateCurrent } from "../i18n/translate";

type Backup = Awaited<ReturnType<typeof exportVault>>;
type Download = { url: string; filename: string; text: string };

export function backupBlob(backup: Backup): { blob: Blob; text: string } {
  const text = JSON.stringify(backup, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  if (blob.size > VAULT_MAX_BACKUP_BYTES) throw new Error(translateCurrent("vault.backup.exceedsSize"));
  return { blob, text };
}

// Keep an explicit, user-clickable link alive for browsers that block an
// automatic download after asynchronous encryption/storage work.
export function useBackupDownload() {
  const [download, setDownload] = useState<Download | null>(null);
  const resource = useRef<{ url: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const mounted = useRef(true);
  const dispose = useCallback(() => {
    if (resource.current) {
      clearTimeout(resource.current.timer);
      URL.revokeObjectURL(resource.current.url);
      resource.current = null;
    }
  }, []);
  const clear = useCallback(() => {
    dispose();
    setDownload(null);
  }, [dispose]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; dispose(); };
  }, [dispose]);
  const prepare = useCallback((backup: Backup) => {
    if (!mounted.current) return;
    const { blob, text } = backupBlob(backup);
    const url = URL.createObjectURL(blob);
    dispose();
    const filename = `opsis-encrypted-vault-${new Date().toISOString().slice(0, 10)}.json`;
    resource.current = { url, timer: setTimeout(clear, 5 * 60_000) };
    setDownload({ url, filename, text });
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    try { anchor.click(); } finally { anchor.remove(); }
  }, [clear, dispose]);
  return { download, prepare, clear };
}

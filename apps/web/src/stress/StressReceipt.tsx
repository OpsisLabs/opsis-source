import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import type { Shock, stress } from "./model";
import { receipt, renderReceipt } from "./receipt";

export function StressReceipt({
  result,
  shock,
  custom,
}: {
  result: ReturnType<typeof stress>;
  shock: Shock;
  custom: boolean;
}) {
  const { t, locale } = useI18n();
  const [include, setInclude] = useState(false);
  const [image, setImage] = useState<{
    preview: string;
    url: string;
    file: File;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0),
    url = useRef<string | null>(null);
  const clear = () => {
    generation.current++;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setImage(null);
    setBusy(false);
    setError("");
  };
  useEffect(
    () => () => {
      generation.current++;
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );
  const create = async () => {
    clear();
    const current = generation.current;
    setBusy(true);
    try {
      const blob = await renderReceipt(
        receipt(result, shock, custom, include),
        locale,
      );
      const preview = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("Preview failed"));
        reader.onerror = () => reject(new Error("Preview failed"));
        reader.readAsDataURL(blob);
      });
      if (generation.current !== current) return;
      url.current = URL.createObjectURL(blob);
      setImage({
        preview,
        url: url.current,
        file: new File([blob], "chainscout-stress-test.png", {
          type: "image/png",
        }),
      });
    } catch {
      if (generation.current === current) setError(t("stress.receipt.error"));
    } finally {
      if (generation.current === current) setBusy(false);
    }
  };
  const share = async () => {
    if (!image) return;
    try {
      await navigator.share({
        files: [image.file],
        title: t("stress.metadata.title"),
      });
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError"))
        setError(t("stress.receipt.shareError"));
    }
  };
  return (
    <section
      className="stress-panel stress-receipt"
      aria-label={t("stress.receipt.title")}
    >
      <h2>{t("stress.receipt.title")}</h2>
      <p>{t("stress.receipt.body")}</p>
      <label>
        <input
          type="checkbox"
          checked={include}
          onChange={(e) => {
            clear();
            setInclude(e.target.checked);
          }}
        />
        {t("stress.receipt.include")}
      </label>
      <button
        className="stress-primary"
        disabled={busy}
        onClick={() => void create()}
      >
        {t(busy ? "stress.receipt.busy" : "stress.receipt.create")}
      </button>
      {error && <p role="alert">{error}</p>}
      {image && (
        <>
          <p role="status">{t("stress.receipt.ready")}</p>
          <img
            src={image.preview}
            alt={t("stress.receipt.alt")}
            width={1200}
            height={1200}
          />
          <div className="stress-actions">
            <a
              className="stress-button"
              href={image.url}
              download="chainscout-stress-test.png"
            >
              {t("stress.receipt.download")}
            </a>
            {typeof navigator.canShare === "function" &&
              navigator.canShare({ files: [image.file] }) && (
                <button onClick={() => void share()}>
                  {t("stress.receipt.share")}
                </button>
              )}
          </div>
        </>
      )}
    </section>
  );
}

import { createPortal } from "react-dom";
import ContractAddress from "./publications/ContractAddress";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useI18n } from "../i18n";
import { connectFilm, defaultTools } from "./OriginalLanding.bridge";

/** Only named destinations and validated public identities cross the film boundary. */
export default function OriginalLanding({
  onLock,
  enabledTools = defaultTools,
}: {
  onLock?: () => void;
  enabledTools?: readonly string[];
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [filmDocument, setFilmDocument] = useState<Document | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { locale } = useI18n();
  const c = (en: string, zh: string) => (locale === "zh-CN" ? zh : en);
  const [visited, setVisited] = useState(location.pathname === "/");
  if (!visited && location.pathname === "/") setVisited(true);

  useEffect(() => {
    if (!filmDocument) return;
    return connectFilm(
      filmDocument,
      () => frame.current?.contentDocument,
      navigate,
      enabledTools,
      onLock,
    );
  }, [filmDocument, enabledTools, onLock, navigate]);

  useEffect(() => {
    filmDocument?.dispatchEvent(new CustomEvent("opsis:locale", { detail: { locale } }));
  }, [filmDocument, locale]);
  useEffect(() => {
    filmDocument?.dispatchEvent(new Event(
      location.pathname === "/" ? "opsis:overview" : "opsis:workspace-open",
    ));
  }, [filmDocument, location.pathname]);

  if (!visited) return null;
  return (
    <>
    <iframe
      ref={frame}
      onLoad={() => setFilmDocument(frame.current?.contentDocument ?? null)}
      className="opsis-original-film"
      src="/opsis-site/index.html"
      title={c("Opsis overview — interactive chain", "Opsis 概览 — 互动链条")}
      tabIndex={location.pathname === "/" ? 0 : -1}
      inert={location.pathname !== "/"}
      aria-hidden={location.pathname !== "/"}
    />
    {filmDocument?.getElementById("public-contract-hero") && createPortal(
      <ContractAddress compact />, filmDocument.getElementById("public-contract-hero")!,
    )}
    {filmDocument?.getElementById("public-contract") && createPortal(
      <ContractAddress />, filmDocument.getElementById("public-contract")!,
    )}
    </>
  );
}

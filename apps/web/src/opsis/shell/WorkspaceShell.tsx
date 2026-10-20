import { useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { useCopy } from "../copy";
import type { Capabilities } from "../model";
import ToolNavigation from "../ToolNavigation";
import ContractAddress from "../publications/ContractAddress";
import PublicSearch from "./PublicSearch";
import { closeToolMenu, openToolMenu } from "./menu";
import { useScrollRegionKeys } from "./scroll-keys";

export default function WorkspaceShell({
  capabilities,
  theme,
  locale,
  stage,
  onTheme,
  onLocale,
  onLock,
  publications = false,
}: {
  capabilities: Capabilities | null;
  theme: "light" | "dark";
  locale: string;
  stage: string;
  onTheme: () => void;
  onLocale: () => void;
  onLock?: () => void;
  publications?: boolean;
}) {
  const c = useCopy();
  const { pathname } = useLocation();
  const stockLookup = pathname === "/rwa" && capabilities?.rwa;
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useScrollRegionKeys();
  function close() {
    if (dialog.current) closeToolMenu(dialog.current, trigger.current);
    setOpen(false);
  }
  return (
    <>
      <header className="opsis-header opsis-topbar">
        <Link to="/" className="opsis-logo">
          Opsis
        </Link>
        <div className="opsis-topbar-tools">
          {(capabilities?.research || publications) && !stockLookup && (
            <PublicSearch />
          )}
          <ContractAddress compact />
          {!stockLookup && (
            <span className="opsis-chain">Robinhood Chain · 4663</span>
          )}
          {!stockLookup && <span className="opsis-stage">{stage}</span>}
          <div className="opsis-desktop-controls">
            <button
              aria-pressed={theme === "dark"}
              aria-label={
                theme === "dark"
                  ? c("Theme: Dark", "主题：深色")
                  : c("Theme: Light", "主题：浅色")
              }
              onClick={onTheme}
            >
              {theme === "dark" ? c("Dark", "深色") : c("Light", "浅色")}
            </button>
            <button onClick={onLocale}>
              {locale === "en" ? "中文" : "English"}
            </button>
            {onLock && (
              <button
                aria-label={c("Lock preview", "锁定预览")}
                onClick={onLock}
              >
                {c("Lock", "锁定")}
              </button>
            )}
          </div>
        </div>
        {/* A bilingual product keeps its language one tap away on a phone. */}
        <button className="opsis-phone-locale" onClick={onLocale}>
          {locale === "en" ? "中文" : "English"}
        </button>
        <button
          ref={trigger}
          className="opsis-menu-trigger"
          aria-label={c("Open menu", "打开菜单")}
          aria-expanded={open}
          aria-controls="opsis-tool-menu"
          onClick={() => {
            if (dialog.current) openToolMenu(dialog.current);
            setOpen(true);
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path d="M3 5h18M3 12h18M3 19h18" />
          </svg>
        </button>
      </header>
      <dialog
        ref={dialog}
        id="opsis-tool-menu"
        className="opsis-tool-menu"
        aria-label={c("Tool menu", "工具菜单")}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
      >
        <div className="opsis-menu-heading">
          <span className="opsis-logo">Opsis</span>
          <button onClick={close}>{c("Close menu", "关闭菜单")} ×</button>
        </div>
        <div className="opsis-mobile-controls">
          <button
            aria-pressed={theme === "dark"}
            aria-label={
              theme === "dark"
                ? c("Theme: Dark", "主题：深色")
                : c("Theme: Light", "主题：浅色")
            }
            onClick={onTheme}
          >
            {theme === "dark" ? c("Dark", "深色") : c("Light", "浅色")}
          </button>
          {onLock && (
            <button
              aria-label={c("Lock preview", "锁定预览")}
              onClick={() => {
                close();
                onLock();
              }}
            >
              {c("Lock", "锁定")}
            </button>
          )}
        </div>
        <p className="opsis-menu-context">Robinhood Chain · 4663 · {stage}</p>
        <ContractAddress compact />
        {(capabilities?.research || publications) && (
          <PublicSearch menu onNavigate={close} />
        )}
        {(capabilities || publications) && open && (
          <ToolNavigation
            capabilities={capabilities}
            publications={publications}
            mobile
            onNavigate={close}
          />
        )}
      </dialog>
      {(capabilities || publications) && (
        <aside className="opsis-desktop-rail">
          <ToolNavigation
            capabilities={capabilities}
            publications={publications}
          />
        </aside>
      )}
    </>
  );
}

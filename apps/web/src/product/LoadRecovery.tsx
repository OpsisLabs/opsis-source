import { Component, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { useCopy } from "../opsis/copy";
import { isLoadFailure, reloadAfterCodeFailure, reloadWithFreshCode } from "./load-recovery";
import "./load-recovery.css";

function RecoveryContent({ heading, explanation, button }: { heading: string; explanation: string; button: string }) {
  return <section className="opsis-load-recovery" role="alert">
    <h1>{heading}</h1>
    <p>{explanation}</p>
    <button type="button" onClick={reloadWithFreshCode}>{button}</button>
  </section>;
}

function ShellRecovery() {
  const c = useCopy();
  return <RecoveryContent
    heading={c("This page did not finish loading", "此页面未能完成加载")}
    explanation={c("Part of Opsis could not be downloaded, usually because the connection dropped. Nothing saved on this device was changed.", "Opsis 的部分内容未能下载，通常是因为连接中断。此设备上已保存的内容未被更改。")}
    button={c("Reload page", "重新加载页面")}
  />;
}

export function LoadRecovery({ shell = false }: { shell?: boolean }) {
  const { t } = useI18n();
  return shell ? <ShellRecovery /> : <RecoveryContent
    heading={t("common.loadRecovery.heading")}
    explanation={t("common.loadRecovery.explanation")}
    button={t("common.loadRecovery.reload")}
  />;
}

// `resetKey` clears a shown recovery screen when the route changes. It is not a
// React key: remounting on every navigation would drop the page being left
// before the next one is ready.
// Vite's "vite:preloadError" event is deliberately not intercepted: cancelling
// it makes a failed import resolve to nothing instead of rejecting, which would
// skip the retries. Left alone, the failure rejects the import, the retries run,
// and only a final failure reaches this boundary.
export class LoadBoundary extends Component<{ children: ReactNode; shell?: boolean; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };
  private handled = false;

  static getDerivedStateFromError(error: unknown) {
    if (!isLoadFailure(error)) throw error;
    return { failed: true };
  }

  private recover = () => {
    if (this.handled) return;
    this.handled = true;
    this.setState({ failed: true });
    reloadAfterCodeFailure();
  };

  componentDidUpdate(previous: { resetKey?: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) {
      this.handled = false;
      this.setState({ failed: false });
    }
  }

  componentDidCatch() {
    this.recover();
  }

  render() {
    return this.state.failed ? <LoadRecovery shell={this.props.shell} /> : this.props.children;
  }
}

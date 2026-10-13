import { Component, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { useCopy } from "../opsis/copy";
import { isLoadFailure, listenForPreloadError, reloadAfterCodeFailure } from "./load-recovery";
import "./load-recovery.css";

function RecoveryContent({ heading, explanation, button }: { heading: string; explanation: string; button: string }) {
  return <section className="opsis-load-recovery" role="alert">
    <h1>{heading}</h1>
    <p>{explanation}</p>
    <button type="button" onClick={() => window.location.reload()}>{button}</button>
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
export class LoadBoundary extends Component<{ children: ReactNode; shell?: boolean; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };
  private stopListening?: () => void;
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

  componentDidMount() {
    this.stopListening = listenForPreloadError({ shell: this.props.shell ?? false, recover: this.recover });
  }

  componentDidUpdate(previous: { resetKey?: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) {
      this.handled = false;
      this.setState({ failed: false });
    }
  }

  componentWillUnmount() {
    this.stopListening?.();
  }

  componentDidCatch() {
    this.recover();
  }

  render() {
    return this.state.failed ? <LoadRecovery shell={this.props.shell} /> : this.props.children;
  }
}

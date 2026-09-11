import { Component } from "react";
import Tracker from "./TrackerView";
export default class KolTracker extends Component<object, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <section
        role="alert"
        className="m-6 p-6 border border-orange-400 text-stone-200"
      >
        <h1>KOL Tracker could not load</h1>
        <p>The source edition is unavailable. Reload to retry.</p>
        <button onClick={() => window.location.reload()}>
          Reload KOL Tracker
        </button>
      </section>
    ) : (
      <Tracker />
    );
  }
}

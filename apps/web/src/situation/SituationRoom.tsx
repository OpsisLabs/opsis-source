import { Component, type ReactNode } from "react";
import Room from "./App.jsx";

// Keep failure recovery inside the existing shared navigation and header.
export default class SituationRoom extends Component<
  object,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render(): ReactNode {
    if (this.state.failed)
      return (
        <section
          role="alert"
          className="m-6 border border-[#fa6c34]/40 p-6 text-[#e9e0d1]"
        >
          <h1 className="text-xl">Situation Room could not load</h1>
          <p className="my-3">
            Reload the page to retry this published edition.
          </p>
          <button
            className="border border-[#fa6c34] px-4 py-2"
            onClick={() => window.location.reload()}
          >
            Reload Situation Room
          </button>
        </section>
      );
    return <Room />;
  }
}

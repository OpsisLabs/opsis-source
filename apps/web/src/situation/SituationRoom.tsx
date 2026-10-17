import { Component, type ReactNode } from "react";
import LoadFailure from "./LoadFailure";
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
    if (this.state.failed) return <LoadFailure />;
    return <Room />;
  }
}

import {
  readLaunches,
  type LaunchEntry,
  type LaunchFeed,
} from "./launch-model";

export type LaunchWindow = 10 | 60 | 360;
export type LaunchpadFilter = "all" | "pons" | "long" | "launcher";
export type LaunchRadarState = {
  minutes: LaunchWindow;
  live: boolean;
  error: boolean;
  feed?: LaunchFeed;
  updatedAt?: number;
  ageSeconds?: number;
  newRows: ReadonlySet<string>;
};
export const initialRadarState: LaunchRadarState = {
  minutes: 10,
  live: false,
  error: false,
  newRows: new Set(),
};
export function launchRowKey(row: LaunchEntry): string {
  return [
    row.adapter ?? row.launchpad,
    row.token.toLowerCase(),
    row.created.blockNumber ?? row.created.timestamp,
    row.created.transactionHash ?? "",
    row.created.logIndex ?? "",
  ].join(":");
}
export function filterLaunches(
  entries: LaunchEntry[],
  filter: LaunchpadFilter,
) {
  return entries.filter(
    (row) =>
      filter === "all" ||
      row.adapter === filter ||
      (filter === "launcher" && row.adapter === "instant"),
  );
}
export function startLaunchRadar({
  onChange,
  visibility = document,
  read = (minutes, signal) =>
    readLaunches<LaunchFeed>(true, undefined, signal, minutes),
}: {
  onChange: (state: LaunchRadarState) => void;
  visibility?: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  >;
  read?: (minutes: LaunchWindow, signal: AbortSignal) => Promise<LaunchFeed>;
}) {
  let state = { ...initialRadarState },
    controller: AbortController | undefined,
    polling: ReturnType<typeof setInterval> | undefined,
    clock: ReturnType<typeof setInterval> | undefined,
    stopped = false;
  const publish = (next: Partial<LaunchRadarState>) => {
    state = { ...state, ...next };
    onChange(state);
  };
  const abort = () => {
    controller?.abort();
    controller = undefined;
  };
  const refresh = async () => {
    if (stopped || visibility.visibilityState !== "visible") return;
    abort();
    const current = new AbortController();
    controller = current;
    try {
      const feed = await read(state.minutes, current.signal);
      if (stopped || current.signal.aborted) return;
      const previous =
        state.feed && new Set(state.feed.entries.map(launchRowKey));
      publish({
        feed,
        error: false,
        updatedAt: Date.now(),
        ageSeconds: 0,
        newRows: new Set(
          previous
            ? feed.entries.map(launchRowKey).filter((key) => !previous.has(key))
            : [],
        ),
      });
    } catch {
      if (!stopped && !current.signal.aborted) {
        // Pause automatic reads on refusals as well as provider failures.
        publish({ error: true, live: false });
        schedule();
      }
    } finally {
      if (controller === current) controller = undefined;
    }
  };
  const schedule = () => {
    clearInterval(polling);
    clearInterval(clock);
    if (stopped || visibility.visibilityState !== "visible") return;
    if (state.live) polling = setInterval(() => void refresh(), 60_000);
    clock = setInterval(() => {
      if (state.updatedAt !== undefined)
        publish({
          ageSeconds: Math.max(
            0,
            Math.floor((Date.now() - state.updatedAt) / 1000),
          ),
        });
    }, 1000);
  };
  const visibilityChanged = () => {
    abort();
    schedule();
    if (state.live || !state.feed) void refresh();
  };
  visibility.addEventListener("visibilitychange", visibilityChanged);
  schedule();
  void refresh();
  return {
    refresh,
    setMinutes(minutes: LaunchWindow) {
      if (stopped || minutes === state.minutes) return;
      abort();
      publish({
        minutes,
        feed: undefined,
        error: false,
        updatedAt: undefined,
        ageSeconds: undefined,
        newRows: new Set(),
      });
      schedule();
      void refresh();
    },
    setLive(live: boolean) {
      if (stopped) return;
      publish({ live });
      schedule();
    },
    stop() {
      stopped = true;
      abort();
      clearInterval(polling);
      clearInterval(clock);
      visibility.removeEventListener("visibilitychange", visibilityChanged);
    },
  };
}

export const CHART_COLORS = [
  "#fa6c34",
  "#c9a6ff",
  "#7fb069",
  "#7cc4f8",
  "#e0a96d",
  "#e0738a",
] as const;

export const darkGrid = {
  left: 12,
  right: 18,
  top: 28,
  bottom: 24,
  containLabel: true,
};

export const darkAxis = {
  axisLine: { lineStyle: { color: "#4a4642" } },
  axisTick: { show: false },
  axisLabel: { color: "#9a938a", fontSize: 9 },
  splitLine: { lineStyle: { color: "#302f2d" } },
};

export const darkTooltip = {
  backgroundColor: "#171717",
  borderColor: "#4a4642",
  borderWidth: 1,
  textStyle: {
    color: "#f0e8da",
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 10,
  },
};

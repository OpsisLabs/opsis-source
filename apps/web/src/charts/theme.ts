export const CHART_COLORS = [
  "#fa6c34",
  "#c9a6ff",
  "#7fb069",
  "#7cc4f8",
  "#e0a96d",
  "#e0738a",
] as const;

export const darkGrid = {
  left: 8,
  right: 16,
  top: 36,
  bottom: 16,
  containLabel: true,
};

export const darkAxis = {
  axisLine: { lineStyle: { color: "#4a4642" } },
  axisTick: { show: false },
  axisLabel: { color: "#b8b0a7", fontSize: 12, hideOverlap: true },
  splitLine: { lineStyle: { color: "#302f2d" } },
};

export const darkTooltip = {
  backgroundColor: "#171717",
  borderColor: "#4a4642",
  borderWidth: 1,
  textStyle: {
    color: "#f0e8da",
    fontFamily: "Inter, sans-serif",
    fontSize: 14,
  },
  confine: true,
};

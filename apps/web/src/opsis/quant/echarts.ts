import * as echarts from "echarts/core";
import { BarChart, HeatmapChart, LineChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapContinuousComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

// Keep the default canvas renderer and the implicit Cartesian grids used by
// the workbenches. TooltipComponent also registers axis pointers.
echarts.use([
  CanvasRenderer,
  LineChart,
  BarChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapContinuousComponent,
  AriaComponent,
]);

export { echarts };

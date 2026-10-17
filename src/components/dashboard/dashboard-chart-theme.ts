export const DASHBOARD_CHART_COLORS = [
  "var(--ca-chart-1)",
  "var(--ca-chart-2)",
  "var(--ca-chart-3)",
  "var(--ca-chart-4)",
  "var(--ca-chart-5)",
  "var(--ca-chart-6)",
  "var(--ca-chart-7)",
] as const;

export function getDashboardChartColor(index: number) {
  return DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length];
}

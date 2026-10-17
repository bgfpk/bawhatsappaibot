export type DashboardTone =
  | "brand"
  | "teal"
  | "cyan"
  | "blue"
  | "violet"
  | "amber"
  | "rose"
  | "neutral"
  | "green"
  | "red"
  | "gray";

export function dashboardToneClass(tone: DashboardTone = "neutral") {
  return `ca-tone-${tone}`;
}

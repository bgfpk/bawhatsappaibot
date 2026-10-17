export const CRM_PIPELINE_STAGE_ORDER = ["new", "contacted", "quotation", "negotiation", "payment", "won", "lost"] as const;

export type CrmPipelineCardDensity = "compact" | "comfortable";

export type CrmPipelineBoardPreferences = {
  visibleStages: string[];
  columnWidth: number;
  density: CrmPipelineCardDensity;
};

const DEFAULT_COLUMN_WIDTH = 260;
const MIN_COLUMN_WIDTH = 220;
const MAX_COLUMN_WIDTH = 380;

export const DEFAULT_CRM_PIPELINE_BOARD_PREFERENCES: CrmPipelineBoardPreferences = {
  visibleStages: [...CRM_PIPELINE_STAGE_ORDER],
  columnWidth: DEFAULT_COLUMN_WIDTH,
  density: "compact",
};

function clampColumnWidth(value: any) {
  const numeric = Math.round(Number(value || DEFAULT_COLUMN_WIDTH));
  if (!Number.isFinite(numeric)) return DEFAULT_COLUMN_WIDTH;
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, numeric));
}

export function normalizeCrmPipelineBoardPreferences(input: any = {}): CrmPipelineBoardPreferences {
  const visible = Array.isArray(input.visibleStages)
    ? input.visibleStages.filter((stage: any) => CRM_PIPELINE_STAGE_ORDER.includes(stage))
    : DEFAULT_CRM_PIPELINE_BOARD_PREFERENCES.visibleStages;
  return {
    visibleStages: visible.length > 0 ? Array.from(new Set(visible)) : [...CRM_PIPELINE_STAGE_ORDER],
    columnWidth: clampColumnWidth(input.columnWidth),
    density: input.density === "comfortable" ? "comfortable" : "compact",
  };
}

export function resetCrmPipelineBoardPreferences() {
  return { ...DEFAULT_CRM_PIPELINE_BOARD_PREFERENCES, visibleStages: [...CRM_PIPELINE_STAGE_ORDER] };
}

export function filterCrmPipelineStages<T extends { id: string }>(columns: T[] = [], preferences: CrmPipelineBoardPreferences = DEFAULT_CRM_PIPELINE_BOARD_PREFERENCES) {
  const visible = new Set(normalizeCrmPipelineBoardPreferences(preferences).visibleStages);
  return CRM_PIPELINE_STAGE_ORDER
    .map((id) => columns.find((column) => column.id === id))
    .filter((column): column is T => Boolean(column && visible.has(column.id)));
}

export function sortCrmPipelineLeadsByActivity<T extends { latestActivityAt?: number; updatedAt?: number; createdAt?: number }>(leads: T[] = []) {
  return leads.slice().sort((a, b) => (
    Number(b.latestActivityAt || 0) - Number(a.latestActivityAt || 0) ||
    Number(b.updatedAt || 0) - Number(a.updatedAt || 0) ||
    Number(b.createdAt || 0) - Number(a.createdAt || 0)
  ));
}

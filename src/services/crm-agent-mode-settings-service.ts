export function normalizeCrmAgentModeSettings(input: any = {}) {
  const categories = input.categories || {};
  const mode = input.mode === "advanced" ? "advanced" : "basic";
  const parsedMaxActions = Number(input.maxActions);
  const maxActions = Number.isFinite(parsedMaxActions)
    ? Math.max(1, Math.min(10, Math.round(parsedMaxActions)))
    : 5;
  return {
    enabled: input.enabled === true,
    mode,
    maxActions,
    categories: {
      updateStageStatus: categories.updateStageStatus !== false,
      fillMissingFields: categories.fillMissingFields !== false,
      createFollowUps: categories.createFollowUps !== false,
      assignLeads: categories.assignLeads !== false,
    },
  };
}

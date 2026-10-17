export const MAX_INSTRUCTION_CHARS = 100000;
export const MAX_LEARNED_CHARS = 100000;
export const CUSTOM_FIELD_INSTRUCTION_MAX_CHARS = 100000;
export const PRODUCT_DESCRIPTION_MAX_CHARS = 100000;
export const PRODUCT_EXTRA_NOTES_MAX_CHARS = 100000;

function clean(value: any) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

export function preserveClientTrainingText(value: any, _maxChars?: number) {
  return clean(value);
}

export function compactTextForAiContext(value: any, maxChars: number) {
  const text = clean(value);
  if (!text || !Number.isFinite(maxChars) || maxChars <= 0) return text;
  return text.length > maxChars ? text.slice(0, maxChars).trim() : text;
}

export function restoreOriginalClientTrainingText(value: any, rawValue: any, _maxChars?: number) {
  return clean(rawValue) || clean(value);
}

export function compactSavedAiTrainingConfig(config: any = {}) {
  const next = { ...(config || {}) };

  next.prompt = restoreOriginalClientTrainingText(next.prompt, next.prompt_raw);
  delete next.prompt_raw;
  next.learned_instructions = restoreOriginalClientTrainingText(next.learned_instructions, next.learned_instructions_raw);
  delete next.learned_instructions_raw;

  if (Array.isArray(next.customFields)) {
    next.customFields = next.customFields.map((field: any) => {
      if (!field || typeof field !== "object") return field;
      return {
        ...field,
        instructions: preserveClientTrainingText(field.instructions),
      };
    });
  }

  return {
    config: next,
    compacted: false,
    warning: "",
  };
}

export function sanitizeProductForAiCost(product: any = {}) {
  const next = { ...(product || {}) };
  next.description = preserveClientTrainingText(next.description || "");
  if (next.notes || next.extra_notes) {
    next.notes = preserveClientTrainingText(next.notes || next.extra_notes || "");
    next.extra_notes = next.notes;
  }
  if (Array.isArray(next.variations)) {
    next.variations = next.variations.map((variation: any) => ({
      ...variation,
      description: preserveClientTrainingText(variation?.description || ""),
      notes: preserveClientTrainingText(variation?.notes || ""),
    }));
  }
  return next;
}

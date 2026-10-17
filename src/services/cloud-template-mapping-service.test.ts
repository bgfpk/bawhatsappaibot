// src/services/cloud-template-mapping-service.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAutomationTemplateMapping,
} from "./cloud-template-mapping-service.ts";

test("normalizeAutomationTemplateMapping: normalizes valid mapping object", () => {
  const raw = {
    purpose: "fixed_followup",
    templateName: "followup_check",
    language: "en_US",
    status: "APPROVED",
    variableMapping: { "1": "customerName" },
  };

  const normalized = normalizeAutomationTemplateMapping(raw);
  assert.ok(normalized);
  assert.equal(normalized.purpose, "fixed_followup");
  assert.equal(normalized.templateName, "followup_check");
  assert.equal(normalized.language, "en_US");
  assert.equal(normalized.status, "APPROVED");
  assert.deepEqual(normalized.variableMapping, { "1": "customerName" });
});

test("normalizeAutomationTemplateMapping: rejects invalid input without purpose or templateName", () => {
  assert.equal(normalizeAutomationTemplateMapping(null), null);
  assert.equal(normalizeAutomationTemplateMapping({}), null);
  assert.equal(normalizeAutomationTemplateMapping({ purpose: "broadcast" }), null);
  assert.equal(normalizeAutomationTemplateMapping({ templateName: "my_tpl" }), null);
});

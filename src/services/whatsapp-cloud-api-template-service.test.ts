// src/services/whatsapp-cloud-api-template-service.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  extractTemplateBodyVariables,
  validateTemplateParameters,
  renderTemplatePreview,
} from "./whatsapp-cloud-api-template-service.ts";
import type { NormalizedMetaTemplate } from "./whatsapp-cloud-api-template-client.ts";

const sampleApprovedTemplate: NormalizedMetaTemplate = {
  id: "t1",
  name: "shipping_update",
  language: "en_US",
  status: "APPROVED",
  category: "UTILITY",
  components: [
    {
      type: "BODY",
      text: "Hi {{1}}, your order #{{2}} has shipped with tracking {{3}}.",
    },
  ],
};

const samplePendingTemplate: NormalizedMetaTemplate = {
  id: "t2",
  name: "promo_deal",
  language: "en_US",
  status: "PENDING",
  category: "MARKETING",
  components: [
    {
      type: "BODY",
      text: "Special deal for you: {{1}}",
    },
  ],
};

test("extractTemplateBodyVariables: finds all placeholder indexes in order", () => {
  const vars = extractTemplateBodyVariables(sampleApprovedTemplate);
  assert.deepEqual(vars, ["1", "2", "3"]);
});

test("extractTemplateBodyVariables: returns empty array when no placeholders", () => {
  const tpl: NormalizedMetaTemplate = {
    id: "t3",
    name: "simple",
    language: "en",
    status: "APPROVED",
    category: "UTILITY",
    components: [{ type: "BODY", text: "Thank you for contacting us." }],
  };
  assert.deepEqual(extractTemplateBodyVariables(tpl), []);
});

test("validateTemplateParameters: rejects non-approved templates", () => {
  const result = validateTemplateParameters(samplePendingTemplate, ["50% off"]);
  assert.equal(result.valid, false);
  assert.ok(result.error?.includes("template_not_approved"));
});

test("validateTemplateParameters: succeeds with array of parameters", () => {
  const result = validateTemplateParameters(sampleApprovedTemplate, [
    "Alice",
    "ORD-99",
    "TRK-777",
  ]);

  assert.equal(result.valid, true);
  assert.deepEqual(result.components, [
    {
      type: "body",
      parameters: [
        { type: "text", text: "Alice" },
        { type: "text", text: "ORD-99" },
        { type: "text", text: "TRK-777" },
      ],
    },
  ]);
});

test("validateTemplateParameters: succeeds with object parameters", () => {
  const result = validateTemplateParameters(sampleApprovedTemplate, {
    "1": "Bob",
    "2": "ORD-100",
    "3": "TRK-888",
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.components, [
    {
      type: "body",
      parameters: [
        { type: "text", text: "Bob" },
        { type: "text", text: "ORD-100" },
        { type: "text", text: "TRK-888" },
      ],
    },
  ]);
});

test("validateTemplateParameters: rejects missing parameter", () => {
  const result = validateTemplateParameters(sampleApprovedTemplate, [
    "Alice",
    "ORD-99",
    // missing 3rd
  ]);

  assert.equal(result.valid, false);
  assert.ok(result.error?.includes("missing_template_variable"));
});

test("validateTemplateParameters: rejects undefined/null string placeholders", () => {
  const result1 = validateTemplateParameters(sampleApprovedTemplate, [
    "Alice",
    "undefined",
    "TRK-123",
  ]);
  assert.equal(result1.valid, false);
  assert.ok(result1.error?.includes("invalid_template_variable"));

  const result2 = validateTemplateParameters(sampleApprovedTemplate, [
    "Alice",
    "[object Object]",
    "TRK-123",
  ]);
  assert.equal(result2.valid, false);
  assert.ok(result2.error?.includes("invalid_template_variable"));
});

test("renderTemplatePreview: renders readable text without HTML injection", () => {
  const preview = renderTemplatePreview(sampleApprovedTemplate, {
    "1": "John Doe",
    "2": "12345",
    "3": "DHL-999",
  });

  assert.equal(preview, "Hi John Doe, your order #12345 has shipped with tracking DHL-999.");
});

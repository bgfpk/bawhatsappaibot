import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_INSTRUCTION_CHARS,
  MAX_LEARNED_CHARS,
  PRODUCT_DESCRIPTION_MAX_CHARS,
  compactSavedAiTrainingConfig,
  sanitizeProductForAiCost,
  compactTextForAiContext,
} from "./instruction-compaction-service.ts";

test("long AI instructions are preserved on save without semantic compaction", () => {
  const instructions = [
    "Role: You are Dr. Ihsan Karim clinic booking assistant.",
    "Doctor info: Dr. Ihsan Karim is available Monday to Saturday.",
    "Timing: Book appointments only after asking preferred day and time.",
    "Fee/payment: Consultation fee is 3000 PKR and advance payment is required.",
    "Location exact reply: Clinic is at Main Boulevard, Lahore.",
    "Booking details: collect patient name, phone, age, issue, preferred slot.",
    "Payment proof rule: ask for screenshot after payment before confirming.",
    "Safety rules: never diagnose emergencies; tell urgent patients to call emergency services.",
    "Conversation behavior: stay polite, concise, and do not invent availability.",
  ].join("\n\n");

  const result = compactSavedAiTrainingConfig({ prompt: instructions, botName: "Mina", botGender: "female", business_type: "service" });

  assert.equal(result.compacted, false);
  assert.equal(result.warning, "");
  assert.equal(result.config.prompt, instructions);
  assert.match(result.config.prompt, /payment is required/);
  assert.match(result.config.prompt, /Location exact reply/);
  assert.match(result.config.prompt, /Payment proof rule/);
  assert.match(result.config.prompt, /Safety rules/);
});

test("short instructions are preserved without compaction", () => {
  const result = compactSavedAiTrainingConfig({ prompt: "Be concise and helpful." });
  assert.equal(result.compacted, false);
  assert.equal(result.config.prompt, "Be concise and helpful.");
});

test("existing raw instructions are restored instead of using compacted text", () => {
  const result = compactSavedAiTrainingConfig({
    prompt: "Short compacted paragraph.",
    prompt_raw: "Full booking flow with payment, location, appointment timing, and safety rules.",
    learned_instructions: "Compacted learned rules.",
    learned_instructions_raw: "Full learned rules with exact booking and proof-of-payment behavior.",
  });

  assert.equal(result.config.prompt, "Full booking flow with payment, location, appointment timing, and safety rules.");
  assert.equal(result.config.learned_instructions, "Full learned rules with exact booking and proof-of-payment behavior.");
});

test("custom field instructions are preserved in full on save", () => {
  const longInstructions = Array.from({ length: 40 }, () => "Ask for appointment date only when the customer wants booking.").join("\n");
  const result = compactSavedAiTrainingConfig({
    customFields: [{ name: "Appointment Date", instructions: longInstructions }],
  });
  assert.equal(result.compacted, false);
  assert.equal(result.config.customFields[0].name, "Appointment Date");
  assert.equal(result.config.customFields[0].instructions, longInstructions);
});

test("product descriptions are preserved in full on save without silent truncation", () => {
  const description = "Premium cotton shirt with delivery terms, COD rule, exchange policy, and exact care instructions.";
  const notes = Array.from({ length: 80 }, () => "Internal display and seasonal note.").join(" ");
  const product = sanitizeProductForAiCost({
    description,
    notes,
  });

  assert.equal(product.description, description);
  assert.equal(product.notes, notes);
});

test("runtime AI context compaction is available separately from full source storage", () => {
  const overLimit = "A".repeat(8000);
  const compacted = compactTextForAiContext(overLimit, 6000);
  assert.equal(compacted.length, 6000);
  assert.equal(compacted, "A".repeat(6000));
});

test("full user source text is preserved across training instructions", () => {
  const learned = "L".repeat(12000);
  const result = compactSavedAiTrainingConfig({ learned_instructions: learned });

  assert.equal(result.config.learned_instructions.length, 12000);
  assert.equal(result.config.learned_instructions, learned);
});

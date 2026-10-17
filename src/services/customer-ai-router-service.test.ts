import test from "node:test";
import assert from "node:assert/strict";

import { decideTrivialAiRoute } from "./customer-ai-router-service.ts";

test("router skips high-confidence filler with no active context", () => {
  const decision = decideTrivialAiRoute({ text: "ok" });
  assert.equal(decision.action, "skip_ai_no_reply");
  assert.equal(decision.reason, "high_confidence_filler");
});

test("router does not skip ambiguous yes/no with active incomplete record", () => {
  const decision = decideTrivialAiRoute({
    text: "yes",
    activeRecord: { recordStatus: "incomplete", missingFields: ["City"] },
  });
  assert.equal(decision.action, "use_ai");
  assert.equal(decision.reason, "active_incomplete_record");
});

test("router keeps filler with active incomplete record on AI path for contextual reply", () => {
  const decision = decideTrivialAiRoute({
    text: "ok",
    activeRecord: { recordStatus: "incomplete", missingFields: ["City"] },
  });
  assert.equal(decision.action, "use_ai");
  assert.equal(decision.reason, "active_record_filler_needs_contextual_reply");
});

test("active incomplete record answers direct question first", () => {
  const decision = decideTrivialAiRoute({
    text: "What is your package price?",
    activeRecord: { recordStatus: "incomplete", missingFields: ["City", "Budget"] },
  });
  assert.equal(decision.action, "use_ai");
  assert.equal(decision.reason, "answer_direct_before_field_collection");
});

test("waiting reply answers unresolved context before field collection", () => {
  const decision = decideTrivialAiRoute({
    text: "Waiting your reply",
    activeRecord: { recordStatus: "incomplete", missingFields: ["Phone"] },
  });
  assert.equal(decision.action, "use_ai");
  assert.equal(decision.reason, "answer_direct_before_field_collection");
});

test("property marketing use case uses AI answer path instead of field-only collection", () => {
  const decision = decideTrivialAiRoute({
    text: "Marketing of different properties for purchase",
    activeRecord: { recordStatus: "incomplete", missingFields: ["Name", "Phone", "Budget"] },
  });
  assert.equal(decision.action, "use_ai");
  assert.equal(decision.reason, "answer_direct_before_field_collection");
});

test("router keeps sensitive and media messages on existing AI flow", () => {
  assert.equal(decideTrivialAiRoute({ text: "refund now" }).action, "use_ai");
  assert.equal(decideTrivialAiRoute({ text: "ok", hasImage: true }).action, "use_ai");
});
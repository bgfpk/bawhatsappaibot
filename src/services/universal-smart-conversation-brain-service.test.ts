import test from "node:test";
import assert from "node:assert/strict";

import {
  SMART_BRAIN_BUSINESS_TYPES,
  type SmartBrainBusinessType,
} from "./universal-smart-conversation-brain-schema.ts";
import {
  __resetSmartBrainServiceTestDeps,
  __setSmartBrainServiceTestDeps,
  buildSmartBrainCustomerIntelligencePatch,
  buildSmartBrainFollowUpReason,
  buildSmartBrainPrivateAdminNote,
  canSmartBrainOverrideSourceOfTruth,
  clampSmartBrainConfidence,
  createDefaultSmartBrainResult,
  generateSmartBrainPlan,
  getSmartBrainGuidanceDecision,
  isSmartBrainResultUsableForLoggingOnly,
  normalizeSmartBrainBusinessType,
  sanitizeSmartBrainResult,
  shouldGenerateSmartBrainPlan,
  shouldUseBrainGuidance,
  summarizeSmartBrainForLog,
} from "./universal-smart-conversation-brain-service.ts";

test("default Brain result is safe and logging-only", () => {
  const result = createDefaultSmartBrainResult({ businessType: "products" });
  assert.equal(result.business_type, "ecommerce");
  assert.equal(result.intent, "general");
  assert.equal(result.risk_level, "low");
  assert.equal(result.should_use_flash, true);
  assert.equal(shouldUseBrainGuidance(result), false);
  assert.equal(canSmartBrainOverrideSourceOfTruth(result), false);
  assert.equal(isSmartBrainResultUsableForLoggingOnly(result), true);
});

test("invalid enum values are sanitized to safe defaults", () => {
  const result = sanitizeSmartBrainResult({
    business_type: "weird",
    intent: "diagnose",
    stage: "sold",
    risk_level: "critical",
    lead_quality: "gold",
    next_best_action: "promise_cure",
    recommended_reply_style: "aggressive",
  });
  assert.equal(result.business_type, "other");
  assert.equal(result.intent, "general");
  assert.equal(result.stage, "new");
  assert.equal(result.risk_level, "low");
  assert.equal(result.lead_quality, "cold");
  assert.equal(result.next_best_action, "answer");
  assert.equal(result.recommended_reply_style, "concise");
});

test("confidence is clamped", () => {
  assert.equal(clampSmartBrainConfidence(-5), 0);
  assert.equal(clampSmartBrainConfidence(2), 1);
  assert.equal(clampSmartBrainConfidence(0.42), 0.42);
  assert.equal(clampSmartBrainConfidence("not a number"), 0);
});

test("arrays are capped and long strings are trimmed", () => {
  const long = "x".repeat(500);
  const result = sanitizeSmartBrainResult({
    missing_required_fields: ["Phone", "Phone", long, "A", "B", "C", "D", "E", "F", "G"],
    facts_to_use: Array.from({ length: 20 }, (_, index) => `fact ${index}`),
    handoff_reason: long,
  });
  assert.deepEqual(result.missing_required_fields.slice(0, 2), ["Phone", "x".repeat(180)]);
  assert.equal(result.missing_required_fields.length, 8);
  assert.equal(result.facts_to_use.length, 8);
  assert.equal(result.handoff_reason.length, 180);
});

test("risky medical fields do not become customer-facing output in Phase A log", () => {
  const result = sanitizeSmartBrainResult({
    business_type: "clinic",
    intent: "appointment",
    risk_level: "high",
    medical_safety_context: {
      symptom: "chest pain and private medical details",
      unsafeAdvice: "diagnose immediately",
    },
    facts_to_use: ["private symptom text"],
  });
  const log = summarizeSmartBrainForLog(result);
  const serialized = JSON.stringify(log);
  assert.equal(log.business_type, "clinic");
  assert.equal(log.risk_level, "high");
  assert.equal(serialized.includes("chest pain"), false);
  assert.equal(serialized.includes("diagnose"), false);
  assert.equal(serialized.includes("private symptom"), false);
});

test("Phase A guidance cannot change behavior", () => {
  const result = sanitizeSmartBrainResult({
    confidence: 1,
    next_best_action: "handoff",
    should_handoff: true,
    should_skip_reply: true,
  });
  assert.equal(shouldUseBrainGuidance(result), false);
  assert.equal(canSmartBrainOverrideSourceOfTruth(result), false);
  assert.equal(summarizeSmartBrainForLog(result).enabled, false);
});

test("schema supports all universal business types", () => {
  for (const type of SMART_BRAIN_BUSINESS_TYPES) {
    assert.equal(normalizeSmartBrainBusinessType(type), type as SmartBrainBusinessType);
  }
  assert.equal(normalizeSmartBrainBusinessType("doctor"), "clinic");
  assert.equal(normalizeSmartBrainBusinessType("unknown business"), "other");
});

test("Brain generation is skipped for trivial filler messages", async () => {
  let called = false;
  __setSmartBrainServiceTestDeps({
    generateBackendText: async () => {
      called = true;
      return { text: "", provider: "deepinfra", model: "deepseek", promptTokens: 0, completionTokens: 0, cachedTokens: 0, estimatedCost: 0, requestStatus: "success", fallbackUsed: false, rawUsageSafe: {}, latencyMs: 0, telemetry: {} };
    },
  });
  try {
    const plan = await generateSmartBrainPlan({ businessType: "service", latestText: "ok" });
    assert.equal(plan.generated, false);
    assert.equal(plan.skippedReason, "trivial_or_filler");
    assert.equal(called, false);
  } finally {
    __resetSmartBrainServiceTestDeps();
  }
});

test("Brain generation is allowed for service quote inquiries", () => {
  const decision = shouldGenerateSmartBrainPlan({
    businessType: "service",
    latestText: "Need a quote for office cleaning visit",
  });
  assert.equal(decision.shouldRun, true);
  assert.equal(decision.reason, "service_or_quote_inquiry");
});

test("Brain generation is allowed for school admission inquiries", () => {
  const decision = shouldGenerateSmartBrainPlan({
    businessType: "school",
    latestText: "What is the admission process for grade 3?",
  });
  assert.equal(decision.shouldRun, true);
  assert.equal(decision.reason, "school_admission_inquiry");
});

test("Brain generation is allowed for clinic appointment inquiries and sanitizes medical risk", async () => {
  __setSmartBrainServiceTestDeps({
    generateBackendText: async () => ({
      text: JSON.stringify({
        business_type: "clinic",
        intent: "appointment",
        stage: "handoff_needed",
        risk_level: "high",
        lead_quality: "warm",
        next_best_action: "handoff",
        recommended_reply_style: "handoff_safe",
        medical_safety_context: { mode: "appointment_triage_only", avoid: "diagnosis" },
        confidence: 0.88,
        should_use_flash: true,
        should_handoff: true,
        should_skip_reply: false,
      }),
      provider: "deepinfra",
      model: "deepseek",
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      estimatedCost: 0,
      requestStatus: "success",
      fallbackUsed: false,
      rawUsageSafe: {},
      latencyMs: 0,
      telemetry: {},
    }),
  });
  try {
    const plan = await generateSmartBrainPlan({
      businessType: "clinic",
      latestText: "I need a doctor appointment for severe pain",
    });
    assert.equal(plan.generated, true);
    assert.equal(plan.model, "deepseek");
    assert.equal(plan.result.business_type, "clinic");
    assert.equal(plan.result.intent, "appointment");
    assert.equal(plan.result.risk_level, "high");
    assert.equal(plan.result.should_handoff, true);
    assert.equal(shouldUseBrainGuidance(plan.result), false);
  } finally {
    __resetSmartBrainServiceTestDeps();
  }
});

test("Brain output JSON sanitizes invalid enum confidence and long arrays", async () => {
  __setSmartBrainServiceTestDeps({
    generateBackendText: async () => ({
      text: JSON.stringify({
        business_type: "alien",
        intent: "promise",
        confidence: 10,
        facts_to_use: Array.from({ length: 20 }, (_, index) => `fact ${index}`),
      }),
      provider: "deepinfra",
      model: "deepseek",
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      estimatedCost: 0,
      requestStatus: "success",
      fallbackUsed: false,
      rawUsageSafe: {},
      latencyMs: 0,
      telemetry: {},
    }),
  });
  try {
    const plan = await generateSmartBrainPlan({
      businessType: "agency",
      latestText: "Need marketing package for leads",
    });
    assert.equal(plan.generated, true);
    assert.equal(plan.result.business_type, "other");
    assert.equal(plan.result.intent, "general");
    assert.equal(plan.result.confidence, 1);
    assert.equal(plan.result.facts_to_use.length, 8);
  } finally {
    __resetSmartBrainServiceTestDeps();
  }
});

test("JSON parse failure returns safe default", async () => {
  __setSmartBrainServiceTestDeps({
    generateBackendText: async () => ({ text: "not json", provider: "deepinfra", model: "deepseek", promptTokens: 0, completionTokens: 0, cachedTokens: 0, estimatedCost: 0, requestStatus: "success", fallbackUsed: false, rawUsageSafe: {}, latencyMs: 0, telemetry: {} }),
  });
  try {
    const plan = await generateSmartBrainPlan({
      businessType: "school",
      latestText: "Admission details for class 1",
    });
    assert.equal(plan.generated, false);
    assert.equal(plan.parseFailed, true);
    assert.equal(plan.skippedReason, "parse_failed");
    assert.equal(plan.result.business_type, "school");
    assert.equal(plan.result.intent, "general");
  } finally {
    __resetSmartBrainServiceTestDeps();
  }
});

test("DeepInfra blocked result returns safe default", async () => {
  let called = false;
  __setSmartBrainServiceTestDeps({
    generateBackendText: async () => {
      called = true;
      return { text: "", provider: "deepinfra", model: "deepseek", promptTokens: 0, completionTokens: 0, cachedTokens: 0, estimatedCost: 0, requestStatus: "failed", fallbackUsed: false, rawUsageSafe: {}, latencyMs: 0, telemetry: {}, fallbackReason: "deepinfra_unavailable_text_generation_blocked" } as any;
    },
  });
  try {
    const plan = await generateSmartBrainPlan({
      businessType: "service",
      latestText: "Need a service quote",
    });
    assert.equal(plan.generated, false);
    assert.equal(plan.skippedReason, "brain_generation_failed");
    assert.equal(plan.model, "");
    assert.equal(called, true);
  } finally {
    __resetSmartBrainServiceTestDeps();
  }
});

test("Phase B Brain output cannot affect customer reply or source-of-truth state", () => {
  const result = sanitizeSmartBrainResult({
    next_best_action: "handoff",
    should_handoff: true,
    should_skip_reply: true,
    confidence: 1,
  });
  assert.equal(shouldUseBrainGuidance(result), false);
  assert.equal(canSmartBrainOverrideSourceOfTruth(result), false);
});

test("high-confidence low-risk Brain result can be used as advisory guidance", () => {
  const result = sanitizeSmartBrainResult({
    business_type: "service",
    intent: "service_quote",
    stage: "interested",
    risk_level: "medium",
    lead_quality: "warm",
    next_best_action: "ask_one_field",
    recommended_reply_style: "qualifying",
    confidence: 0.82,
    should_use_flash: true,
  });
  assert.equal(shouldUseBrainGuidance(result), true);
  assert.deepEqual(getSmartBrainGuidanceDecision(result), { useGuidance: true, reason: "safe_high_confidence" });
});

test("low-confidence Brain result is not used as guidance", () => {
  const result = sanitizeSmartBrainResult({
    business_type: "service",
    intent: "service_quote",
    risk_level: "low",
    next_best_action: "ask_one_field",
    confidence: 0.77,
  });
  assert.equal(shouldUseBrainGuidance(result), false);
  assert.equal(getSmartBrainGuidanceDecision(result).reason, "low_confidence");
});

test("high-risk Brain result is not used as guidance", () => {
  const result = sanitizeSmartBrainResult({
    business_type: "school",
    intent: "admission",
    risk_level: "high",
    next_best_action: "answer",
    confidence: 0.95,
  });
  assert.equal(shouldUseBrainGuidance(result), false);
  assert.equal(getSmartBrainGuidanceDecision(result).reason, "high_risk");
});

test("handoff and skip-reply actions are not used as guidance", () => {
  const handoff = sanitizeSmartBrainResult({
    confidence: 0.9,
    risk_level: "low",
    next_best_action: "handoff",
    should_handoff: false,
  });
  const skip = sanitizeSmartBrainResult({
    confidence: 0.9,
    risk_level: "low",
    next_best_action: "answer",
    should_skip_reply: true,
  });
  assert.equal(getSmartBrainGuidanceDecision(handoff).reason, "unsafe_next_action");
  assert.equal(getSmartBrainGuidanceDecision(skip).reason, "skip_reply_requested");
});

test("unsafe medical guidance is not used", () => {
  const result = sanitizeSmartBrainResult({
    business_type: "clinic",
    intent: "appointment",
    risk_level: "medium",
    next_best_action: "ask_one_field",
    confidence: 0.9,
    medical_safety_context: { warning: "mentions diagnosis and dosage" },
  });
  assert.equal(shouldUseBrainGuidance(result), false);
  assert.equal(getSmartBrainGuidanceDecision(result).reason, "unsafe_medical_guidance");
});

test("parse-failed or default Brain result is not used", () => {
  const defaultResult = createDefaultSmartBrainResult({ businessType: "service" });
  const parseFailedPlan = {
    result: sanitizeSmartBrainResult({ business_type: "service", confidence: 0.99 }),
    generated: false,
    skippedReason: "parse_failed",
    parseFailed: true,
    model: "gemini-2.5-flash-lite",
    durationMs: 1,
    errorReason: "invalid_json",
  };
  assert.equal(shouldUseBrainGuidance(defaultResult), false);
  assert.equal(getSmartBrainGuidanceDecision(parseFailedPlan).reason, "parse_failed");
});

test("unverified exact claims are not used as guidance", () => {
  const result = sanitizeSmartBrainResult({
    business_type: "agency",
    intent: "service_quote",
    risk_level: "low",
    next_best_action: "answer",
    confidence: 0.91,
    facts_to_use: ["guaranteed ROAS and ranking"],
  });
  assert.equal(shouldUseBrainGuidance(result), false);
  assert.equal(getSmartBrainGuidanceDecision(result).reason, "unverified_claim_risk");
});

function generatedPlan(result: any) {
  return {
    result: sanitizeSmartBrainResult(result),
    generated: true,
    skippedReason: "",
    parseFailed: false,
    model: "gemini-2.5-flash-lite",
    durationMs: 1,
    errorReason: "",
  };
}

test("hot warm cold lead quality is saved only when Brain is safe", () => {
  for (const quality of ["hot", "warm", "cold"]) {
    const { patch, decision } = buildSmartBrainCustomerIntelligencePatch(generatedPlan({
      business_type: "service",
      intent: "service_quote",
      stage: "interested",
      risk_level: "low",
      lead_quality: quality,
      next_best_action: "ask_one_field",
      confidence: 0.9,
    }), 123);
    assert.equal(decision.save, true);
    assert.equal((patch as any).smartLeadQuality, quality);
    assert.equal((patch as any).smartBrainUpdatedAt, 123);
  }
});

test("low confidence Brain does not update intelligence", () => {
  const { patch, decision } = buildSmartBrainCustomerIntelligencePatch(generatedPlan({
    business_type: "service",
    intent: "service_quote",
    risk_level: "low",
    lead_quality: "hot",
    next_best_action: "ask_one_field",
    confidence: 0.4,
  }));
  assert.equal(decision.save, false);
  assert.equal(decision.reason, "low_confidence");
  assert.deepEqual(patch, {});
});

test("high-risk medical saves only safe risk stage and handoff context", () => {
  const { patch, decision } = buildSmartBrainCustomerIntelligencePatch(generatedPlan({
    business_type: "clinic",
    intent: "appointment",
    stage: "handoff_needed",
    risk_level: "high",
    lead_quality: "hot",
    next_best_action: "handoff",
    handoff_reason: "Needs safe staff review",
    facts_to_use: ["patient shared sensitive issue"],
    confidence: 0.9,
    should_handoff: true,
  }), 200);
  assert.equal(decision.save, true);
  assert.equal(decision.limited, true);
  assert.deepEqual(Object.keys(patch).sort(), ["smartBrainUpdatedAt", "smartCustomerStage", "smartHandoffReason", "smartRiskLevel"].sort());
  assert.equal((patch as any).smartRiskLevel, "high");
  assert.equal(JSON.stringify(patch).includes("patient shared"), false);
});

test("unsafe medical diagnosis does not save intelligence", () => {
  const { patch, decision } = buildSmartBrainCustomerIntelligencePatch(generatedPlan({
    business_type: "clinic",
    intent: "appointment",
    stage: "interested",
    risk_level: "medium",
    next_best_action: "ask_one_field",
    confidence: 0.92,
    medical_safety_context: { detail: "diagnosis and dosage needed" },
  }));
  assert.equal(decision.save, false);
  assert.equal(decision.reason, "unsafe_medical_guidance");
  assert.deepEqual(patch, {});
});

test("admin note max length and safe wording", () => {
  const note = buildSmartBrainPrivateAdminNote(sanitizeSmartBrainResult({
    business_type: "agency",
    intent: "service_quote",
    stage: "interested",
    risk_level: "low",
    lead_quality: "warm",
    next_best_action: "answer",
    facts_to_use: ["Customer wants guaranteed ROAS and ranking. Phone 03001234567."],
    facts_to_avoid: ["guaranteed ROAS ranking diagnosis dosage " + "x".repeat(500)],
    confidence: 0.9,
  }));
  assert.equal(note.length <= 300, true);
  assert.doesNotMatch(note, /03001234567/);
  assert.doesNotMatch(note, /diagnosis|dosage|guaranteed|ROAS|ranking/i);
});

test("admin note examples cover ecommerce service agency clinic and school", () => {
  const cases = [
    ["ecommerce", /Warm lead\. Asked about price/i],
    ["service", /Hot lead\. Needs service quote/i],
    ["agency", /Interested in marketing service/i],
    ["clinic", /Appointment inquiry\. Keep response safe/i],
    ["school", /Admission inquiry\. Next: confirm class\/grade/i],
  ] as const;
  for (const [businessType, pattern] of cases) {
    const note = buildSmartBrainPrivateAdminNote(sanitizeSmartBrainResult({
      business_type: businessType,
      intent: businessType === "school" ? "admission" : businessType === "clinic" ? "appointment" : businessType === "ecommerce" ? "price" : "service_quote",
      stage: "interested",
      risk_level: "low",
      lead_quality: businessType === "service" ? "hot" : "warm",
      next_best_action: "ask_one_field",
      missing_required_fields: ["Location"],
      confidence: 0.9,
    }));
    assert.match(note, pattern);
    assert.equal(note.length <= 300, true);
  }
});

test("follow-up reason is saved as context only and does not schedule or send follow-up", () => {
  const { patch } = buildSmartBrainCustomerIntelligencePatch(generatedPlan({
    business_type: "school",
    intent: "admission",
    stage: "interested",
    risk_level: "low",
    lead_quality: "warm",
    next_best_action: "ask_one_field",
    missing_required_fields: ["Class/grade"],
    confidence: 0.9,
  }));
  assert.match((patch as any).smartFollowUpReason, /Parent asked admission details/);
  assert.equal("plannedCustomerUpdates" in patch, false);
  assert.equal("followupDeliveries" in patch, false);
  assert.equal("lastCustomerUpdateStatus" in patch, false);
});

test("no billing fields or raw Brain JSON are stored in intelligence patch", () => {
  const plan = generatedPlan({
    business_type: "service",
    intent: "service_quote",
    stage: "ready",
    risk_level: "low",
    lead_quality: "hot",
    next_best_action: "ask_one_field",
    follow_up_reason: "Needs project size",
    confidence: 0.9,
    cache_context_key: "smart_brain:phase_d:service",
  });
  const { patch } = buildSmartBrainCustomerIntelligencePatch(plan);
  const text = JSON.stringify(patch);
  assert.equal(text.includes("cache_context_key"), false);
  assert.equal(text.includes("missing_required_fields"), false);
  assert.equal(text.includes("billing"), false);
  assert.equal(text.includes("charge"), false);
});

test("deterministic follow-up reason examples are safe", () => {
  assert.match(buildSmartBrainFollowUpReason(sanitizeSmartBrainResult({
    business_type: "clinic",
    intent: "appointment",
    missing_required_fields: ["Preferred time"],
  })), /Patient asked appointment info/);
  assert.match(buildSmartBrainFollowUpReason(sanitizeSmartBrainResult({
    business_type: "agency",
    intent: "service_quote",
  })), /budget is missing/);
});

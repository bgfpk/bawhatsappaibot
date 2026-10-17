import test from "node:test";
import assert from "node:assert/strict";

import {
  createReplyPipelineTrace,
  maskJid,
  sanitizeErrorMessage,
  type PipelineStage,
} from "./whatsapp-reply-pipeline-tracer.ts";

test("1. Masking hides sensitive phone parts in JID", () => {
  const masked = maskJid("contact-e4ed32210a80@example.invalid");
  assert.match(masked, /^923\.\.\.67@s\.whatsapp\.net$/);
});

test("2. Sanitizer redacts API keys and auth tokens from error messages", () => {
  const err = new Error("Failed with key=AIzaSyD_abc123456789 and Bearer eyJhbGciOiJIUzI1NiJ9.test");
  const sanitized = sanitizeErrorMessage(err);
  assert.doesNotMatch(sanitized, /AIzaSyD_abc123456789/);
  assert.doesNotMatch(sanitized, /eyJhbGciOiJIUzI1NiJ9/);
  assert.match(sanitized, /\[REDACTED\]/);
});

test("3. Successful pipeline trace records all 10 stages in exact chronological order", () => {
  const trace = createReplyPipelineTrace({
    botId: "bot_1",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageId: "msg_101",
    source: "inbound_chat",
  });

  trace.recordStage("ACCEPTED_FOR_PROCESSING");
  trace.recordStage("ACCOUNT_INSTANCE_CHECKED");
  trace.recordStage("HISTORY_CONTEXT_LOADED");
  trace.recordStage("AI_REQUEST_STARTED");
  trace.recordStage("AI_RESPONSE_RECEIVED");
  trace.recordStage("RESPONSE_VALIDATED");
  trace.recordStage("WHATSAPP_SEND_STARTED");
  trace.recordStage("WHATSAPP_SEND_SUCCEEDED");
  trace.recordTerminal("SENT");

  const snapshot = trace.snapshot();
  assert.equal(snapshot.terminalOutcome, "SENT");

  const stageNames = snapshot.stages.map((s) => s.stage);
  const expectedOrder: PipelineStage[] = [
    "INBOUND_DETECTED",
    "ACCEPTED_FOR_PROCESSING",
    "ACCOUNT_INSTANCE_CHECKED",
    "HISTORY_CONTEXT_LOADED",
    "AI_REQUEST_STARTED",
    "AI_RESPONSE_RECEIVED",
    "RESPONSE_VALIDATED",
    "WHATSAPP_SEND_STARTED",
    "WHATSAPP_SEND_SUCCEEDED",
    "CONVERSATION_STATE_RELEASED",
  ];

  assert.deepEqual(stageNames, expectedOrder);
  assert.ok(snapshot.totalDurationMs !== undefined && snapshot.totalDurationMs >= 0);
});

test("4. Failure path captures stopping stage and guarantees state release", () => {
  const trace = createReplyPipelineTrace({
    botId: "bot_1",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageId: "msg_102",
  });

  trace.recordStage("ACCEPTED_FOR_PROCESSING");
  trace.recordStage("ACCOUNT_INSTANCE_CHECKED");
  trace.recordStage("HISTORY_CONTEXT_LOADED");
  trace.recordStage("AI_REQUEST_STARTED");

  // AI Provider timeout error
  trace.recordFailure({
    stage: "AI_REQUEST_STARTED",
    error: new Error("Gemini provider timed out after 35s"),
    terminalOutcome: "AI_FAILED",
  });

  const snapshot = trace.snapshot();
  assert.equal(snapshot.terminalOutcome, "AI_FAILED");
  assert.equal(snapshot.error?.stage, "AI_REQUEST_STARTED");
  assert.match(snapshot.error?.message || "", /Gemini provider timed out/);

  // Guaranteed conversation state release was recorded
  const lastStage = snapshot.stages[snapshot.stages.length - 1];
  assert.equal(lastStage.stage, "CONVERSATION_STATE_RELEASED");
});

test("5. Intentional block produces explicit terminal outcome", () => {
  const trace = createReplyPipelineTrace({
    botId: "bot_1",
    customerJid: "contact-e4ed32210a80@example.invalid",
  });

  trace.recordStage("ACCEPTED_FOR_PROCESSING");
  trace.recordStage("ACCOUNT_INSTANCE_CHECKED");
  trace.recordTerminal("INTENTIONALLY_BLOCKED", "trial_expired");

  const snapshot = trace.snapshot();
  assert.equal(snapshot.terminalOutcome, "INTENTIONALLY_BLOCKED");
  assert.equal(snapshot.terminalReason, "trial_expired");
});

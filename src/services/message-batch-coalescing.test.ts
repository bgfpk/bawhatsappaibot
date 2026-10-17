import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workerSource = fs.readFileSync(new URL("../../bot-worker.ts", import.meta.url), "utf8");
const handlerSource = fs.readFileSync(new URL("./ai-handler.ts", import.meta.url), "utf8");

test("worker creates and coalesces one active batch for quick customer message bursts", () => {
  assert.equal(workerSource.includes("message_batch_created customer="), true);
  assert.equal(workerSource.includes("message_batch_coalesced customer="), true);
  assert.equal(workerSource.includes("message_batch_processing batchId="), true);
  assert.equal(workerSource.includes("message_batch_reply_sent batchId="), true);
  assert.equal(workerSource.includes("message_marked_handled messageId="), true);
  assert.equal(workerSource.includes("message_batch_terminal batchId="), true);
  assert.equal(workerSource.includes("message_batch_scope cursor="), true);
  assert.equal(workerSource.includes("message_batch_baseline_lazy_started customer="), true);
  assert.equal(workerSource.includes("message_batch_baseline_lazy_applied markedHandled="), true);
  assert.equal(workerSource.includes("live_batch_restricted_to_active_message_ids count="), true);
  assert.equal(workerSource.includes("live_batch_old_history_excluded_by_active_ids ignored="), true);
  assert.equal(workerSource.includes("allowedMessageIds: isSafeModeEnabled() ? batch.messageIds : undefined"), true);
  assert.equal(workerSource.includes("reply_timing_batch_selected mode="), true);
  assert.equal(workerSource.includes("getMessageBatchDelayProfile({ kinds: batch.messageKinds })"), true);
});

test("worker replaces newer-message skip with batch merge semantics", () => {
  assert.equal(workerSource.includes("batch_generation_superseded batchId="), true);
  assert.equal(workerSource.includes("newer_message_skip_replaced_with_batch_merge"), true);
  assert.equal(workerSource.includes("active_batch_lock_acquired batchId="), true);
  assert.equal(handlerSource.includes("AI reply skipped because a newer customer message arrived first. No customer message was sent."), false);
});

test("recovery and retry attach to active batch instead of racing a second reply", () => {
  assert.equal(workerSource.includes("reply_recovery_skipped reason=active_batch_exists"), true);
  assert.equal(workerSource.includes("retry_job_attached_to_active_batch"), true);
  assert.equal(workerSource.includes("batch_recovery_skipped reason=batch_processing"), true);
  assert.equal(workerSource.includes("reply_retry_skipped reason=message_already_handled_by_batch"), true);
  assert.equal(workerSource.includes("stale_active_batch_recovered ageMs="), true);
  assert.equal(workerSource.includes('recoverStaleActiveBatchIfNeeded(sender, "process_now")'), true);
  assert.equal(workerSource.includes("recoverStaleActiveBatchIfNeeded(job.jid, \"process_now\")"), true);
});

test("ai-handler builds one combined batch context for DeepInfra final reply", () => {
  assert.equal(handlerSource.includes("buildCustomerBatchContext(batchEntries)"), true);
  assert.equal(handlerSource.includes("Customer sent this message batch:"), true);
  assert.equal(handlerSource.includes("buildBatchReplyGuidance(batchEntries)"), true);
  assert.equal(handlerSource.includes("latest_media_context_prioritized type="), true);
  assert.equal(handlerSource.includes("old_summary_context_suppressed reason=latest_media_priority"), true);
  assert.equal(handlerSource.includes("old_bot_hallucination_context_suppressed reason=latest_message_not_about_bot_mistake"), true);
});

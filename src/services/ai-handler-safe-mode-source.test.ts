import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./ai-handler.ts", import.meta.url), "utf8");
const safeModeSource = readFileSync(new URL("./safe-mode-config-service.ts", import.meta.url), "utf8");
const adminEscalationSource = readFileSync(new URL("./admin-escalation-service.ts", import.meta.url), "utf8");

test("safe mode config stays enabled while verified TTS output is re-enabled", () => {
  assert.match(safeModeSource, /SAFE_MODE_ENABLED = true/);
  assert.match(safeModeSource, /SAFE_MODE_DISABLE_TTS_OUTPUT = false/);
  assert.match(safeModeSource, /SAFE_MODE_MAX_QUALITY_REPAIR_ATTEMPTS = 1/);
  assert.match(safeModeSource, /SAFE_MODE_MEDIA_FAILURE_TEXT_FALLBACK = true/);
});

test("ai handler allows verified TTS output through the voice gate in safe mode", () => {
  assert.match(source, /voice_simulation_enabled !== false\s*&&\s*!isSafeModeDisableTtsOutputEnabled\(\)/s);
  assert.match(source, /output_preference_detected type=voice_reply/);
  assert.match(source, /output_preference_not_custom_field=true/);
  assert.match(source, /voice_output_only_fallback_sent=true/);
  assert.match(source, /buildVoiceOutputUnavailableText/);
  assert.match(source, /buildVoiceOutputOnlyAcknowledgement/);
  assert.match(source, /voice_output_only_clean_reply_applied=true/);
  assert.match(source, /buildVoiceDeliveryFallbackText/);
  assert.match(source, /processVoiceGeneration/);
});

test("voice-output-only requests use a clean acknowledgement instead of stale CRM or service fallback", () => {
  assert.match(source, /if \(voiceNeedSignals\.hasAnyVoiceNeed && isVoiceOutputOnlyRequest\(lastUserMsgText\)\)/);
  assert.match(source, /replyText = buildVoiceOutputOnlyAcknowledgement\(customerLanguage\)/);
});

test("remembered media references attach durable product context before DeepInfra reply generation", () => {
  assert.match(source, /findBestSavedMediaContextForReference/);
  assert.match(source, /messageReferencesRememberedMedia\(lastUserMsgText\)/);
  assert.match(source, /media_memory_context_attached source=durable/);
  assert.match(source, /REMEMBERED MEDIA CONTEXT:/);
});

test("ai handler keeps blocked reply repair but does not use customer-facing escalation builders", () => {
  assert.match(source, /evaluateLatestQuestionSafety/);
  assert.match(source, /customer_reply_blocked reason=internal_or_broken_text/);
  assert.match(source, /attemptSimpleCustomerReplySafetyRepair/);
  assert.match(source, /customer_reply_repaired_dynamic=true/);
  assert.match(source, /"broken_customer_reply_unrepairable"/);
  assert.doesNotMatch(source, /buildDynamicCustomerEscalationReply/);
  assert.match(adminEscalationSource, /admin_escalation_triggered reason=/);
});

test("ai handler gives latest list requests priority over stale appointment or CRM context", () => {
  assert.match(source, /detectLatestListRequest/);
  assert.match(source, /latest_intent_override_applied reason=list_request/);
  assert.match(source, /old_context_suppressed reason=latest_list_request/);
  assert.match(source, /latest_list_history_filter_applied removedDbHistory=/);
  assert.match(source, /LATEST LIST PRIORITY:/);
  assert.match(source, /deferredMissingOrderFields = \[\];/);
});

test("ai handler repairs bad list formatting before send", () => {
  assert.match(source, /containsBadCustomerFacingListFormatting/);
  assert.match(source, /customer_reply_format_repair_started reason=bad_list_format/);
  assert.match(source, /customer_reply_format_repair_applied=/);
});

test("ai handler does one guard repair attempt without sending fixed fallback text", () => {
  assert.match(source, /reply_quality_repair_started issue=/);
  assert.match(source, /customer_ai_reply_guard_repair/);
  assert.doesNotMatch(source, /quality_guard_fallback_sent reason=/);
  assert.doesNotMatch(source, /buildSafeModeQualityFallbackText/);
});

test("ai handler reuses durable media context and sends media fallback text when understanding fails", () => {
  assert.match(source, /media_understanding_cache_hit type=image/);
  assert.match(source, /media_understanding_cache_hit type=audio/);
  assert.match(source, /media_understanding_saved type=image/);
  assert.match(source, /media_understanding_saved type=audio/);
  assert.match(source, /media_understanding_fallback_sent type=image/);
  assert.match(source, /media_understanding_fallback_sent type=audio/);
  assert.match(source, /contextType: "ai_media_fallback"/);
});

test("ai handler honors restricted batch selection and passes media-marketing context into the guard", () => {
  assert.match(source, /collectPendingInboundMessageBatch\(historyTemp, options\?\.batchSelection\)/);
  assert.match(source, /pendingBatchMessageIds/);
  assert.match(source, /latestMediaKind: latestMediaKindForGuard/);
  assert.match(source, /latestMediaContextUseful: latestMediaContextUsefulForGuard/);
});

test("ai handler adds strict media-first mode for useful latest media checks", () => {
  assert.match(source, /const latestUsefulMediaPriorityActive = Boolean\(/);
  assert.match(source, /const latestTextIsGenericMediaCheck = latestUsefulMediaPriorityActive && isGenericLatestMediaCheckText\(lastUserMsgText\)/);
  assert.match(source, /media_priority_history_filter_applied removedDbHistory=/);
  assert.match(source, /media_priority_old_context_suppressed=true/);
  assert.match(source, /smart_brain_skipped reason=latest_media_priority/);
});

test("ai handler injects media-first guidance and suppresses old prompt context when needed", () => {
  assert.match(source, /LATEST MEDIA PRIORITY:/);
  assert.match(source, /Answer this latest media\/caption first\./);
  assert.match(source, /const activeCustomerRecordForPrompt = strictLatestMediaPriorityActive \|\| latestListPriorityActive \? null/);
  assert.match(source, /const crmFirstContextForPrompt = strictLatestMediaPriorityActive \|\| latestListPriorityActive \? "" : crmFirstContext/);
  assert.match(source, /const smartConversationGuidanceForPrompt = strictLatestMediaPriorityActive \|\| latestListPriorityActive \? null : smartConversationGuidance/);
});

test("normal text fast path skips blocking helper AI work before the final reply", () => {
  assert.match(source, /const normalTextReplyFastPath = !lastUserMsgHasImage && !lastUserMsgIsVoice/);
  assert.match(source, /normal_text_fast_path=\$\{normalTextReplyFastPath\}/);
  assert.match(source, /smart_brain_skipped reason=normal_text_fast_path/);
  assert.match(source, /website_knowledge_context skipped=normal_text_fast_path/);
  assert.match(source, /reply_timing_typing_delay_ms=\$\{typingDelayMs\}/);
  assert.match(source, /reply_timing_whatsapp_send_ms=\$\{Math\.max\(0, Date\.now\(\) - sendStartedAt\)\}/);
  assert.doesNotMatch(source, /buildDynamicCustomerEscalationReply/);
});

test("normal text fast path defers non-critical CRM and customer intelligence work into background tasks", () => {
  assert.match(source, /emitReplyTimingLog\(io, `post_reply_background_task_started name=\$\{name\}`\)/);
  assert.match(source, /post_reply_background_task_failed name=\$\{name\} reason=\$\{sanitizeBackgroundTaskReason/);
  assert.match(source, /const deferCrmLeadSync = normalTextReplyFastPath/);
  assert.match(source, /const crmLeadRows = deferCrmLeadSync\s*\? \[\]/);
  assert.match(source, /runPostReplyBackgroundTask\(io, "customer_intelligence_scan"/);
  assert.match(source, /runPostReplyBackgroundTask\(io, "crm_lead_sync"/);
});

test("production reply path does not contain fixed team confirmation fallback phrases", () => {
  const blockedPhrases = [
    /I can see the earlier reply was not clear enough/i,
    /Rather than repeat it/i,
    /I've forwarded this to the team/i,
    /This needs confirmation from the team/i,
  ];

  for (const pattern of blockedPhrases) {
    assert.doesNotMatch(source, pattern);
  }
});

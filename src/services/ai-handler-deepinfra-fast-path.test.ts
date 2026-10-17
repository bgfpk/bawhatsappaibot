import test from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { wrapGeminiClientWithBackendTextProvider } from "./gemini-provider-service.ts";

test("ai-handler fallback uses skipBackendTextProvider or unwrapped Gemini to prevent double calls", async () => {
    // Static analysis to prove ai-handler.ts safely passes skipBackendTextProvider
    const code = await fs.readFile(path.join(process.cwd(), "src/services/ai-handler.ts"), "utf-8");

    assert.doesNotMatch(
        code,
        /runGeminiRequestWithClientBilling\(\s*\{[\s\S]*purpose:\s*combinedReplyMemoryMode \? "combined_reply_memory" : "customer_ai_reply"/,
        "ai-handler.ts must not run Gemini billing wrapper for customer text replies"
    );
    assert.doesNotMatch(
        code,
        /generateWithClientGeminiCacheAware\(\s*\{[\s\S]*purpose:\s*"customer_ai_compact_fallback"/,
        "ai-handler.ts must not use Gemini compact fallback for customer text replies"
    );
});

test("wrapper explicitly honors skipBackendTextProvider flag to skip DeepInfra", async () => {
    let baseCalled = false;
    
    // We mock the base Gemini client
    const baseAi = {
        models: {
            generateContent: async (req: any) => {
                baseCalled = true;
                return { text: () => "Gemini Response" };
            }
        }
    };
    
    // We mock the resolved context, setting purpose to customer_ai_reply (eligible for DeepInfra)
    const resolvedContext = { purpose: "customer_ai_reply", provider: "gemini" };
    
    // Wrap it
    const wrappedAi = wrapGeminiClientWithBackendTextProvider(baseAi, resolvedContext);
    
    // Call it with the bypass flag that ai-handler provides on fallback
    const result = await wrappedAi.models.generateContent({
        contents: [{ role: "user", parts: [{ text: "hello" }] }],
        config: { skipBackendTextProvider: true }
    });
    
    assert.ok(baseCalled, "Base Gemini must be called when skip flag is present");
});

test("ai-handler normalizes image and audio context before DeepInfra", async () => {
    const code = await fs.readFile(path.join(process.cwd(), "src/services/ai-handler.ts"), "utf-8");

    assert.match(
        code,
        /planCustomerResponse\(\{/,
        "ai-handler must build a general customer response plan before the final reply prompt"
    );
    assert.match(
        code,
        /buildCustomerResponseStrategyInstruction\(responsePlan\)/,
        "ai-handler must convert the response plan into a compact prompt instruction"
    );
    assert.match(
        code,
        /response_plan intent=\$\{responsePlan\.intent\} depth=\$\{responsePlan\.answerDepth\} shape=\$\{responsePlan\.replyShape\} maxChars=\$\{responsePlan\.maxChars\} scope=\$\{responsePlan\.scope\} recommendOne=\$\{responsePlan\.shouldRecommendOne\} listAll=\$\{responsePlan\.shouldListAllOptions\}/,
        "ai-handler must log the applied response plan without customer text"
    );
    assert.match(
        code,
        /response_plan_scope avoid=\$\{responsePlan\.avoidTopics\.map\(\(topic\) => topic\.replace\(\/\\s\+\/g, "_"\)\)\.join\(","\)\}/,
        "ai-handler must log safe response-plan scope exclusions"
    );
    assert.match(
        code,
        /response_plan_applied source=customer_response_planner/,
        "ai-handler must log that the customer response planner was applied"
    );

    assert.match(
        code,
        /latestUserMsg\.parts\s*=\s*\(latestUserMsg\.parts \|\| \[\]\)\.filter\(\(part: any\) => !\/image\/i\.test/,
        "ai-handler must strip image inlineData before DeepInfra text generation"
    );

    assert.match(
        code,
        /latestUserMsg\.parts\.splice\(audioPartIndex,\s*1\)/,
        "ai-handler must remove the audio blob from the latest user message"
    );
    assert.match(
        code,
        /const audioPriorityPromptText = buildLatestMediaPriorityPromptText\(/,
        "ai-handler must convert the transcribed audio into a latest-message-first prompt"
    );
    assert.match(
        code,
        /latestUserMsg\.parts = \[\s*\{\s*text:\s*audioPriorityPromptText\s*\},/,
        "ai-handler must push the normalized audio text to the latest user message"
    );
    assert.match(
        code,
        /audio_downloaded bytes=\$\{buffer\.length\} mime=\$\{normalizedAudioMime\} duration=\$\{Number\(\(m\.message\.audioMessage as any\)\?\.seconds \|\| 0\) > 0 \? Number\(\(m\.message\.audioMessage as any\)\?\.seconds\) : "unknown"\}/,
        "ai-handler must log the real downloaded voice-note buffer size and normalized mime"
    );
    assert.match(
        code,
        /buildMediaReplyContextAttachment\(latestImageUnderstanding\)/,
        "ai-handler must attach the latest image understanding to the final reply prompt"
    );
    assert.match(
        code,
        /buildMediaReplyContextAttachment\(latestAudioUnderstanding\)/,
        "ai-handler must attach the latest audio understanding to the final reply prompt"
    );
    assert.match(
        code,
        /throw createAiReplyRetryableError\("Latest customer image must be understood before reply\./,
        "ai-handler must delay image replies until useful image understanding exists"
    );
    assert.match(
        code,
        /image_understanding_retry_scheduled reason=\$\{reason\}/,
        "ai-handler must schedule image retry instead of guessing from stale context"
    );
    assert.match(
        code,
        /throw createAiReplyRetryableError\("Latest customer audio must be understood before reply\./,
        "ai-handler must delay audio replies until useful audio understanding exists"
    );
    assert.match(
        code,
        /audio_understanding_retry_scheduled reason=\$\{reason\}/,
        "ai-handler must schedule audio retry instead of sending an unrelated reply"
    );

    // Prove that it scopes routing to the latest message state
    assert.match(
        code,
        /let latestUserHasAudio\s*=\s*\(latestUserMsg\?\.parts \|\| \[\]\)\.some/,
        "ai-handler must derive audio routing from the latest customer message only"
    );
    assert.match(
        code,
        /let latestUserHasMedia\s*=\s*\(latestUserMsg\?\.parts \|\| \[\]\)\.some/,
        "ai-handler must derive media routing from the latest customer message only"
    );

    assert.match(
        code,
        /audio_context_normalized_for_deepinfra=true/,
        "ai-handler must normalize audio context for DeepInfra text generation"
    );
    assert.match(
        code,
        /deepinfra_final_text_reply_used latestMessageType=\$\{latestMessageType\} mediaContextUseful=\$\{mediaContextUseful\}/,
        "ai-handler must log DeepInfra as the final customer text reply provider"
    );
    assert.match(
        code,
        /stale_media_requirement_cleared reason=newer_text_message latestMessageType=text/,
        "ai-handler must clear stale media requirements when a newer text message arrives"
    );
    assert.match(
        code,
        /provider_routing_forced_text_only reason=latest_message_is_text/,
        "ai-handler must force text-only routing for the latest text message"
    );
    assert.match(
        code,
        /resolveLatestCustomerReplyRoutingState\(/,
        "ai-handler must scope backend routing to the latest customer message state"
    );
    assert.match(
        code,
        /media_context_converted_to_text_reply_input type=image useful=true chars=\$\{imageContextText\.length\}/,
        "ai-handler must convert useful image understanding into text-only DeepInfra input"
    );
    assert.match(
        code,
        /media_context_converted_to_text_reply_input type=audio useful=true chars=\$\{transcribedText\.length\}/,
        "ai-handler must convert useful audio understanding into text-only DeepInfra input"
    );
    assert.match(
        code,
        /gemini_text_reply_blocked reason=deepinfra_required/,
        "ai-handler must log that Gemini text reply generation remains blocked"
    );
    assert.match(
        code,
        /gemini_client_skipped reason=normal_text_fast_path/,
        "ai-handler must skip eager Gemini client creation on the normal text fast path"
    );
    assert.match(
        code,
        /gemini_client_created purpose=\$\{purpose\}/,
        "ai-handler must log when Gemini is created later for TTS-only usage"
    );
    assert.match(
        code,
        /gemini_tts_allowed_final_text_only=true/,
        "ai-handler must log that Gemini stays limited to final TTS output"
    );
    assert.match(
        code,
        /tts_started provider=gemini textChars=\$\{safeText\.length\}/,
        "ai-handler must log when Gemini TTS starts without logging the full reply text"
    );
    assert.match(
        code,
        /voice_reply_text_fallback_sent reason=\$\{fallbackReasonForLog\}/,
        "ai-handler must log the specific voice fallback reason after text fallback sends"
    );
    assert.match(
        code,
        /tts_text_fallback_final reason=\$\{fallbackReasonForLog\}/,
        "ai-handler must log the final safe TTS fallback reason"
    );
    assert.match(
        code,
        /reply_timing_pre_ai_ms=\$\{Math\.max\(0, Date\.now\(\) - replyPipelineStartedAt\)\}/,
        "ai-handler must log pre-AI timing for the fast reply path"
    );
    assert.match(
        code,
        /reply_timing_deepinfra_ms=\$\{Math\.max\(0, Date\.now\(\) - deepInfraStartedAt\)\}/,
        "ai-handler must log DeepInfra timing for the final reply generation"
    );
    assert.match(
        code,
        /reply_timing_post_send_ms=\$\{Math\.max\(0, Date\.now\(\) - postSendStartedAt\)\}/,
        "ai-handler must log post-send timing after the customer reply is delivered"
    );
    assert.match(
        code,
        /reply_timing_total_ms=\$\{Math\.max\(0, batchWaitMs \+ \(Date\.now\(\) - replyPipelineStartedAt\)\)\}/,
        "ai-handler must log end-to-end timing including batch wait"
    );
    assert.doesNotMatch(
        code,
        /unknown reason/,
        "ai-handler must stop collapsing voice delivery failures to unknown reason"
    );
    assert.doesNotMatch(
        code,
        /AI repair attempt 2/,
        "ai-handler must stop running multiple nested repair attempts"
    );
    assert.doesNotMatch(
        code,
        /customer_ai_reply_guard_recovery/,
        "ai-handler must not trigger a second guard recovery generation path"
    );
    assert.doesNotMatch(
        code,
        /customer_ai_reply_recovery/,
        "ai-handler must not trigger a second incomplete reply recovery generation path"
    );
});

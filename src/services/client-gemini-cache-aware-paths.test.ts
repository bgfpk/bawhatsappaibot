import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function source(file: string) {
  return fs.readFileSync(path.join(process.cwd(), "src", "services", file), "utf8");
}

test("CRM summary, order/lead summary, and Smart Follow-up use backend text provider wrapper", () => {
  assert.match(source("ai-customer-summary-service.ts"), /generateBackendText|generateWithClientGeminiCacheAware/);
  assert.match(source("ai-order-lead-summary-service.ts"), /generateBackendText|generateWithClientGeminiCacheAware/);
  assert.match(source("ai-smart-followup-service.ts"), /generateBackendText|generateWithClientGeminiCacheAware/);
});

test("compatible image and manual learning paths are cache-aware or explicitly reported", () => {
  assert.match(source("customer-image-context-service.ts"), /generateWithClientGeminiCacheAware|generateGeminiMediaUnderstanding/);
  assert.match(source("image-contact-extractor-service.ts"), /generateWithClientGeminiCacheAware|generateGeminiMediaUnderstanding/);

  assert.match(source("manual-learning.ts"), /generateWithClientGeminiCacheAware|generateBackendText/);
  assert.match(source("manual-media-context.ts"), /generateWithClientGeminiCacheAware|generateGeminiMediaUnderstanding/);

});

test("combined reply memory path has isolated purpose and hidden-memory guards", () => {
  const aiHandler = source("ai-handler.ts");
  assert.match(aiHandler, /combinedReplyMemoryMode \? "combined_reply_memory" : "customer_ai_reply"/);
  assert.match(aiHandler, /parseCombinedReplyMemoryJson/);
  assert.match(aiHandler, /combinedReplyTextOverride/);
  assert.match(aiHandler, /toolsForRequest = combinedReplyMemoryMode \? undefined : tools/);
  assert.match(aiHandler, /const aiModel = CUSTOMER_AI_MODEL/);
  assert.doesNotMatch(aiHandler, /resolveAiModelForPurpose\("hidden_memory"\)/);
});

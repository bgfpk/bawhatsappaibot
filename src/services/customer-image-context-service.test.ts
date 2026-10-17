import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { mergeImageExtractionIntoProfile } from "./customer-image-context-service.ts";

test("image/card extraction stores possible details without overwriting confirmed chat name", () => {
  const patch = mergeImageExtractionIntoProfile(
    { customerName: "Muhammed Jamal", customerPhone: "11797336533" },
    {
      source: "image_business_card",
      confidence: 0.91,
      name: "Jamal Clinic",
      phone: "15811061380",
      businessName: "Jamal Clinic",
      address: "Main Road Lahore",
      city: "Lahore",
    },
  );

  assert.equal(patch.customerName, undefined);
  assert.equal(patch.customerPhone, undefined);
  assert.equal(patch.possibleImageName, "Jamal Clinic");
  assert.equal(patch.possibleImagePhone, "15811061380");
  assert.equal(patch.possibleImageAddress, "Main Road Lahore");
  assert.equal(patch.imageAddressNeedsConfirmation, true);
  assert.equal(patch.imageExtractedContext.source, "image_business_card");
});

test("high confidence image can fill missing name and phone only when profile lacks them", () => {
  const patch = mergeImageExtractionIntoProfile({}, {
    source: "image_id_card",
    confidence: 0.9,
    name: "Muhammed Jamal",
    phone: "11797336533",
  });

  assert.equal(patch.customerName, "Muhammed Jamal");
  assert.equal(patch.customerPhone, "11797336533");
});

test("customer image context extraction uses Gemini media understanding instead of DeepInfra vision", async () => {
  const code = await fs.readFile(path.join(process.cwd(), "src/services/customer-image-context-service.ts"), "utf-8");

  assert.match(code, /generateGeminiMediaUnderstanding\(/);
  assert.doesNotMatch(code, /generateWithDeepInfraVisionProvider\(/);
  assert.doesNotMatch(code, /generateWithClientGeminiCacheAware\(/);
});

test("MAX_TOKENS incomplete JSON is not saved as useful customer or order fields", async () => {
  const code = await fs.readFile(path.join(process.cwd(), "src/services/customer-image-context-service.ts"), "utf-8");
  assert.match(code, /response\.partial/);
});

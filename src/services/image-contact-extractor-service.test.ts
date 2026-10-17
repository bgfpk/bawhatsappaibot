import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import {
  buildImageContactHistoryNote,
  buildImageContactProfilePatch,
  sanitizeImageContactExtraction,
} from "./image-contact-extractor-service.ts";

test("visiting card extraction keeps business data separate from customer identity", () => {
  const extraction = sanitizeImageContactExtraction({
    businessName: "Design Art Printers Faisalabad",
    businessContacts: ["Rana Rafaqat Ali", "Rana Ali Husnain"],
    phones: ["0301-3130278", "0316-4708856"],
    address: "P-27/A Gujjar Basti, Neem Wali Gali, Eid Gah Road, Faisalabad",
    city: "Faisalabad",
    landmark: "Eid Gah Road",
    website: "designartprinters.com",
    customerNameCandidate: "arfaqali com",
    confidence: 0.82,
  });

  assert.equal(extraction.customerNameCandidate, "");
  assert.equal(extraction.businessName, "Design Art Printers Faisalabad");
  assert.deepEqual(extraction.businessContacts, ["Rana Rafaqat Ali", "Rana Ali Husnain"]);
  assert.deepEqual(extraction.phones, ["0301-3130278", "0316-4708856"]);
  assert.match(buildImageContactHistoryNote(extraction), /card\/image details/i);

  const patch = buildImageContactProfilePatch({ customerName: "عرفاق حسین" }, extraction);
  assert.equal(patch.businessName, "Design Art Printers Faisalabad");
  assert.deepEqual(patch.cardExtractedPhones, ["0301-3130278", "0316-4708856"]);
  assert.equal("customerName" in patch, false);
});

test("image contact extraction prefers Gemini media understanding path", async () => {
  const code = await fs.readFile(path.join(process.cwd(), "src/services/image-contact-extractor-service.ts"), "utf-8");

  assert.match(code, /generateGeminiMediaUnderstanding\(/);
  assert.doesNotMatch(code, /generateWithDeepInfraVisionProvider\(/);
  assert.doesNotMatch(code, /generateWithClientGeminiCacheAware\(/);
});

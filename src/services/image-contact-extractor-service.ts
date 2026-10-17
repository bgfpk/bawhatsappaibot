import { withTimeout } from "./async-timeout.ts";
import { sanitizeCustomerNameCandidate } from "./customer-identity-service.ts";
import type { GeminiProviderContext } from "./gemini-provider-service.ts";
import { generateGeminiMediaUnderstanding, GEMINI_MEDIA_MODEL } from "./gemini-media-understanding-service.ts";

export type ImageContactExtraction = {
  summary: string;
  customerNameCandidate: string;
  businessName: string;
  businessContacts: string[];
  phones: string[];
  address: string;
  city: string;
  landmark: string;
  email: string;
  website: string;
  notes: string;
  confidence: number;
};

function clean(value: any) {
  return String(value || "").trim();
}

function uniqueList(values: any[]) {
  return Array.from(new Set(values.map((value) => clean(value)).filter(Boolean)));
}

function parseLooseJson(text: string) {
  const trimmed = clean(text);
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {}
    }
  }
  return null;
}

export function sanitizeImageContactExtraction(raw: any): ImageContactExtraction {
  return {
    summary: clean(raw?.summary),
    customerNameCandidate: sanitizeCustomerNameCandidate(raw?.customerNameCandidate || raw?.customer_name || raw?.contactName),
    businessName: clean(raw?.businessName || raw?.business_name),
    businessContacts: uniqueList(Array.isArray(raw?.businessContacts) ? raw.businessContacts : [raw?.contactNames, raw?.contactName]),
    phones: uniqueList(Array.isArray(raw?.phones) ? raw.phones : [raw?.phone, raw?.phone1, raw?.phone2]),
    address: clean(raw?.address),
    city: clean(raw?.city),
    landmark: clean(raw?.landmark),
    email: clean(raw?.email),
    website: clean(raw?.website),
    notes: clean(raw?.notes),
    confidence: Math.max(0, Math.min(1, Number(raw?.confidence) || 0)),
  };
}

export function buildImageContactHistoryNote(extraction: ImageContactExtraction) {
  if (!extraction.summary && !extraction.businessName && extraction.businessContacts.length === 0 && extraction.phones.length === 0 && !extraction.address) {
    return "";
  }
  const details = [
    extraction.businessName ? `business ${extraction.businessName}` : "",
    extraction.businessContacts.length > 0 ? `contacts ${extraction.businessContacts.join(", ")}` : "",
    extraction.phones.length > 0 ? `phones ${extraction.phones.join(", ")}` : "",
    extraction.address ? `address ${extraction.address}` : "",
    extraction.city ? `city ${extraction.city}` : "",
    extraction.landmark ? `landmark ${extraction.landmark}` : "",
    extraction.website ? `website ${extraction.website}` : "",
  ].filter(Boolean).join("; ");
  const confidenceLabel = extraction.confidence >= 0.85 ? "Extracted" : "Possible";
  return `${confidenceLabel} card/image details: ${details || extraction.summary || "customer-shared contact/address context"}.`;
}

export function buildImageContactProfilePatch(profile: any, extraction: ImageContactExtraction) {
  const existingNotes = Array.isArray(profile?.imageContextNotes) ? profile.imageContextNotes.map((value: any) => clean(value)).filter(Boolean) : [];
  const historyNote = buildImageContactHistoryNote(extraction);
  const nextNotes = uniqueList([...existingNotes, historyNote]).slice(-5);
  return {
    ...(extraction.businessName ? { businessName: extraction.businessName } : {}),
    ...(extraction.businessContacts.length > 0 ? { businessContacts: extraction.businessContacts } : {}),
    ...(extraction.phones.length > 0 ? { cardExtractedPhones: extraction.phones } : {}),
    ...(extraction.address ? { cardExtractedAddress: extraction.address } : {}),
    ...(extraction.city ? { cardExtractedCity: extraction.city } : {}),
    ...(extraction.landmark ? { landmark: extraction.landmark } : {}),
    ...(extraction.email ? { businessEmail: extraction.email } : {}),
    ...(extraction.website ? { businessWebsite: extraction.website } : {}),
    ...(extraction.notes ? { cardExtractedNotes: extraction.notes } : {}),
    ...(extraction.customerNameCandidate ? { cardCustomerNameCandidate: extraction.customerNameCandidate } : {}),
    ...(historyNote ? { lastImageContextNote: historyNote, imageContextNotes: nextNotes } : {}),
    ...(extraction.confidence > 0 ? { lastImageContextConfidence: extraction.confidence, lastImageContextSource: "image_card" } : {}),
  };
}

export async function extractImageContactFromBuffer(input: {
  buffer: Buffer;
  mimeType?: string;
  caption?: string;
  providerContext?: GeminiProviderContext;
}) {
  if (!input.buffer || input.buffer.length < 100) return null;

  try {
    console.info(`[GeminiMedia] purpose=image_contact_extractor model=${GEMINI_MEDIA_MODEL}`);
    const response = await withTimeout(
      generateGeminiMediaUnderstanding({
        purpose: input.providerContext?.purpose || "image_contact_extractor",
        providerContext: input.providerContext,
        instruction: [
          "Return JSON only with keys: summary, customerNameCandidate, businessName, businessContacts, phones, address, city, landmark, email, website, notes, confidence.",
          "Extract business-card, receipt, address-slip, or contact details from this image only.",
          "Do not invent values. Use empty strings or empty arrays when missing.",
          "Keep names under businessContacts unless the image clearly identifies the customer.",
          input.caption ? `Caption context: ${input.caption}` : "",
        ].filter(Boolean).join("\n"),
        media: {
          kind: "image",
          buffer: input.buffer,
          mimeType: input.mimeType || "image/jpeg",
        },
        responseMimeType: "application/json",
        maxOutputTokens: 240,
      }),
      45000,
      "Image contact extraction timed out"
    );
    if (response.requestStatus !== "success" || !response.text || response.partial) return null;
    return sanitizeImageContactExtraction(parseLooseJson(response.text) || {});
  } catch (error: any) {
    console.error("[ImageContact] Extraction failed:", error?.message || error);
    return null;
  }
}

import { compactAiText } from "./ai-cost-control-service.ts";
import { withTimeout } from "./async-timeout.ts";
import type { GeminiProviderContext } from "./gemini-provider-service.ts";
import { generateGeminiMediaUnderstanding, GEMINI_MEDIA_MODEL } from "./gemini-media-understanding-service.ts";

function clean(value: any, limit = 220) {
  return compactAiText(value, limit);
}

function extractJson(value: any) {
  const text = String(value || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || text.match(/\{[\s\S]*\}/)?.[0] || text;
  try {
    return JSON.parse(candidate);
  } catch {
    return {};
  }
}

function normalizePhone(value: any) {
  return clean(value).replace(/[^\d+]/g, "");
}

function confidence(value: any) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : 0;
}

function validText(value: any) {
  const text = clean(value);
  return text && !/^(unknown|n\/a|not clear|unclear|null|none)$/i.test(text) ? text : "";
}

export function mergeImageExtractionIntoProfile(profile: any = {}, extraction: any = {}) {
  const patch: any = {};
  const existingName = validText(profile.customerName || profile.deliveryName || profile.orderCustomerName);
  const existingPhone = normalizePhone(profile.customerPhone || profile.phone || profile.phoneNumber);

  const name = validText(extraction.name);
  const phone = normalizePhone(extraction.phone);
  const address = validText(extraction.address);
  const city = validText(extraction.city);
  const businessName = validText(extraction.businessName);
  const source = validText(extraction.source) || "image_card";
  const extractionConfidence = confidence(extraction.confidence);

  const imageContext = {
    source,
    confidence: extractionConfidence,
    name,
    phone,
    businessName,
    city,
    address,
    landmark: validText(extraction.landmark),
    notes: validText(extraction.notes),
    requiresClarification: Boolean(extraction.requiresClarification),
    updatedAt: Math.floor(Date.now() / 1000),
  };

  patch.latestImageContext = imageContext;
  patch.imageExtractedContext = imageContext;

  if (!existingName && name && extractionConfidence >= 0.82) {
    patch.customerName = name;
    patch.deliveryName = name;
    patch.imageNameSource = source;
  } else if (name && existingName && name.toLowerCase() !== existingName.toLowerCase()) {
    patch.possibleImageName = name;
  }

  if (!existingPhone && phone && extractionConfidence >= 0.78) {
    patch.customerPhone = phone;
    patch.imagePhoneSource = source;
  } else if (phone && existingPhone && phone !== existingPhone) {
    patch.possibleImagePhone = phone;
  }

  if (address && extractionConfidence >= 0.82) {
    patch.possibleImageAddress = address;
    patch.imageAddressNeedsConfirmation = true;
  }
  if (city && extractionConfidence >= 0.78) patch.possibleImageCity = city;
  if (businessName) patch.possibleBusinessNameFromImage = businessName;

  return patch;
}

export async function extractCustomerImageContext(input: {
  imageBuffer: Buffer;
  mimeType: string;
  caption?: string;
  profile?: any;
  io?: any;
  providerContext?: GeminiProviderContext;
}) {
  if (!input.imageBuffer?.length) return {};
  console.info(`[GeminiMedia] purpose=customer_image_context model=${GEMINI_MEDIA_MODEL}`);

  const response = await withTimeout(
    generateGeminiMediaUnderstanding({
      purpose: input.providerContext?.purpose || "customer_image_context",
      providerContext: input.providerContext,
      instruction: `Return JSON only: source, confidence, name, phone, businessName, city, address, landmark, notes, requiresClarification.
Extract customer or order details from this WhatsApp image only.
No guessing. If multiple names or phones exist, set requiresClarification true.
Caption: ${clean(input.caption, 260) || "(none)"}
Confirmed profile: ${JSON.stringify({
        name: input.profile?.customerName || input.profile?.deliveryName || "",
        phone: input.profile?.customerPhone || input.profile?.phone || "",
      })}
`,
      media: {
        kind: "image",
        buffer: input.imageBuffer,
        mimeType: input.mimeType || "image/jpeg",
      },
      responseMimeType: "application/json",
      maxOutputTokens: 240,
    }),
    45000,
    "Image context extraction timed out",
  );
  if (response.requestStatus !== "success" || !response.text || response.partial) {
    return {};
  }
  return mergeImageExtractionIntoProfile(input.profile || {}, extractJson(response.text));
}

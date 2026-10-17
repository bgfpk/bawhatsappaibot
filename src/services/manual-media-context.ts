import { unwrapMessageContent } from "./whatsapp-message-content.ts";
import { withTimeout } from "./async-timeout.ts";
import { downloadWhatsAppMediaBuffer } from "./whatsapp-media-download.ts";
import type { GeminiProviderContext } from "./gemini-provider-service.ts";
import { generateGeminiMediaUnderstanding, GEMINI_MEDIA_MODEL } from "./gemini-media-understanding-service.ts";

export async function describeManualMediaMessage(msg: any, fallbackText: string, fetchAgent?: any, providerContext?: GeminiProviderContext) {
  const content = unwrapMessageContent(msg?.message);
  const media = content?.audioMessage || content?.imageMessage;
  const type = content?.audioMessage ? "audio" : (content?.imageMessage ? "image" : null);
  if (!media || !type) return fallbackText;
  if (type === "audio") return fallbackText;

  try {
    const buffer = await downloadWhatsAppMediaBuffer(media, type, fetchAgent);
    if (buffer.length < 100) return fallbackText;

    console.info(`[GeminiMedia] purpose=${providerContext?.purpose || `manual_${type}_context`} model=${GEMINI_MEDIA_MODEL}`);
    const response = await withTimeout(
      generateGeminiMediaUnderstanding({
        purpose: providerContext?.purpose || `manual_${type}_context`,
        providerContext,
        instruction: `Summarize this manually sent ${type} for a WhatsApp sales/support bot. Include customer-specific commitments, product details, prices, tone, and reusable lessons if clearly present. Keep it concise.`,
        media: {
          kind: "image",
          buffer,
          mimeType: media.mimetype || "image/jpeg",
        },
        responseMimeType: "text/plain",
        maxOutputTokens: 220,
      }),
      45000,
      `Manual ${type} description timed out`
    );
    if (response.requestStatus !== "success" || !response.text) return fallbackText;
    const description = response.text.trim();
    return [fallbackText, description ? `[Manual ${type} content]: ${description}` : ""].filter(Boolean).join("\n");
  } catch (e: any) {
    console.error(`[ManualLearning] ${type} description failed:`, e?.message || e);
    return fallbackText;
  }
}

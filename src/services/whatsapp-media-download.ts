// src/services/whatsapp-media-download.ts
import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import { downloadMedia } from "./whatsapp-cloud-api-media-client.ts";

export interface CloudMediaContext {
  mediaId: string;
  phoneNumberId?: string;
  accessToken?: string;
  downloadMediaImpl?: typeof downloadMedia;
}

export async function downloadWhatsAppMediaBuffer(
  media: any,
  type: "audio" | "image" | "video" | "document" | "sticker",
  fetchAgent?: any,
  cloudContext?: CloudMediaContext
): Promise<Buffer> {
  // 1. Cloud API branch (if cloudMedia or mediaId is present)
  if (media?.cloudMedia?.mediaId || media?.mediaId || cloudContext?.mediaId) {
    const mediaId = media?.cloudMedia?.mediaId || media?.mediaId || cloudContext?.mediaId;
    const phoneNumberId = media?.cloudMedia?.phoneNumberId || cloudContext?.phoneNumberId;
    const accessToken = media?.cloudMedia?.accessToken || cloudContext?.accessToken;

    if (!phoneNumberId || !accessToken) {
      throw new Error("Cloud media download requires phoneNumberId and accessToken.");
    }

    const downloadFn = cloudContext?.downloadMediaImpl || downloadMedia;
    const res = await downloadFn({
      mediaId,
      phoneNumberId,
      accessToken,
    });
    return res.buffer;
  }

  // 2. Baileys branch (unchanged)
  if (!fetchAgent) {
    throw new Error("WhatsApp media download blocked because proxy dispatcher is missing.");
  }
  const options = { options: { dispatcher: fetchAgent } };
  const stream = await downloadContentFromMessage(media, type as any, options as any);
  let buffer = Buffer.from([]);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  return buffer;
}

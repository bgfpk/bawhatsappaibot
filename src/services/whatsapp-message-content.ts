export function unwrapMessageContent(message: any) {
  let current = message?.originalMessage || message;
  if (current?.message) current = current.message;
  while (
    current?.ephemeralMessage?.message ||
    current?.viewOnceMessage?.message ||
    current?.viewOnceMessageV2?.message ||
    current?.documentWithCaptionMessage?.message
  ) {
    current =
      current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.documentWithCaptionMessage?.message;
  }
  return current;
}

export function getReadableMessageContent(message: any) {
  const content = unwrapMessageContent(message);
  const text = content?.conversation ||
    content?.extendedTextMessage?.text ||
    content?.buttonsResponseMessage?.selectedDisplayText ||
    content?.buttonsResponseMessage?.selectedButtonId ||
    content?.templateButtonReplyMessage?.selectedDisplayText ||
    content?.templateButtonReplyMessage?.selectedId ||
    content?.listResponseMessage?.title ||
    content?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    content?.imageMessage?.caption ||
    content?.videoMessage?.caption ||
    content?.documentMessage?.caption ||
    "";

  const hasAudio = !!content?.audioMessage;
  const hasSticker = !!content?.stickerMessage;
  const hasMedia = !!(
    content?.imageMessage ||
    content?.videoMessage ||
    content?.documentMessage ||
    hasSticker
  );

  return {
    content,
    text: String(text || ""),
    hasAudio,
    hasSticker,
    hasMedia,
    hasMeaningfulContent: !!String(text || "").trim() || hasAudio || hasMedia,
  };
}

export function isIgnorableWhatsappMessage(msg: any) {
  const { content, hasMeaningfulContent } = getReadableMessageContent(msg?.message);
  if (!msg?.message || !content) return true;
  if (content.protocolMessage || content.senderKeyDistributionMessage) return true;
  if (content.reactionMessage && !hasMeaningfulContent) return true;
  return !hasMeaningfulContent;
}

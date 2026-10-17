function clean(value: any) {
  return String(value || "").trim();
}

function normalize(value: any) {
  return clean(value).toLowerCase().replace(/\s+/g, " ").trim();
}

export function buildStickerMessageContext(input: { profile?: any; history?: any[] }) {
  const history = Array.isArray(input.history) ? input.history : [];
  const lastModelText = [...history]
    .reverse()
    .find((entry: any) => String(entry?.role || "").toLowerCase() === "model" && clean(entry?.text))?.text || "";
  const confirmedOrder = Boolean(
    input.profile?.hasPlacedOrder ||
    /confirm/.test(normalize(input.profile?.orderStatus))
  );
  const awaitingAnswer = /\?$/.test(clean(lastModelText)) || /please share|please confirm|need/i.test(clean(lastModelText));

  if (confirmedOrder && !awaitingAnswer) {
    return {
      historyText: "Customer sent a sticker reaction after order confirmation.",
      summaryText: "Customer sent a sticker reaction after order confirmation.",
      shouldReply: false,
    };
  }

  if (awaitingAnswer) {
    return {
      historyText: "Customer sent a sticker reaction while the conversation still needed a response.",
      summaryText: "Customer sent a sticker reaction while discussing the order.",
      shouldReply: true,
    };
  }

  return {
    historyText: "Customer sent a sticker reaction in the chat.",
    summaryText: "Customer sent a sticker reaction.",
    shouldReply: true,
  };
}

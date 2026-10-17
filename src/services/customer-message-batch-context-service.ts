function clean(value: any, max = 1200) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export type CustomerBatchContextEntry = {
  kind: "text" | "image" | "audio" | "video" | "document" | "sticker";
  messageId?: string;
  latest?: boolean;
  text?: string;
  usefulContext?: string;
  failureReason?: string;
  unclear?: boolean;
};

export function buildCustomerBatchContext(entries: CustomerBatchContextEntry[]) {
  const latestPriorityMedia = entries.find((entry) => (entry.kind === "image" || entry.kind === "audio") && entry.latest);
  const lines = entries
    .map((entry, index) => {
      if (entry.kind === "text") return `${index + 1}. Text: ${clean(entry.text, 600)}`;
      if (entry.usefulContext) return `${index + 1}. ${entry.kind === "audio" ? "Voice" : "Image"}: ${clean(entry.usefulContext, 700)}`;
      if (entry.unclear) return `${index + 1}. ${entry.kind === "audio" ? "Voice" : "Image"}: unclear_${entry.kind}`;
      return `${index + 1}. ${entry.kind === "audio" ? "Voice" : "Image"}: received`;
    })
    .filter(Boolean);
  if (lines.length <= 1 && !latestPriorityMedia) return "";
  const latestMediaLabel = latestPriorityMedia?.kind === "audio" ? "Latest voice note" : "Latest image";
  const latestImageBlock = latestPriorityMedia
    ? [
      `${latestMediaLabel}:`,
      `- messageId: ${clean(latestPriorityMedia.messageId, 80) || "unknown"}`,
      "- priority: highest",
      `- useful=${latestPriorityMedia.usefulContext ? "true" : "false"}`,
      latestPriorityMedia.usefulContext ? `- summary: ${clean(latestPriorityMedia.usefulContext, 500)}` : "",
      latestPriorityMedia.failureReason ? `- failure: ${clean(latestPriorityMedia.failureReason, 120)}` : "",
    ].filter(Boolean).join("\n")
    : "";
  return [latestImageBlock, `Customer sent this message batch:\n${lines.join("\n")}`].filter(Boolean).join("\n\n");
}

export function buildBatchReplyGuidance(entries: CustomerBatchContextEntry[]) {
  const unclearImage = entries.some((entry) => entry.kind === "image" && entry.unclear);
  const unclearAudio = entries.some((entry) => entry.kind === "audio" && entry.unclear);
  if (!unclearImage && !unclearAudio) return "";
  const hints: string[] = [];
  if (unclearImage) hints.push("If the image was unclear, mention that naturally and ask for a clearer resend or description.");
  if (unclearAudio) hints.push("If the voice note was unclear, mention that naturally and ask the customer to resend it or type the details.");
  return hints.join(" ");
}

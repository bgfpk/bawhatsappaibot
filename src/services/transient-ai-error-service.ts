function serializeError(value: any) {
  if (!value) return "";
  if (typeof value === "string") return value;
  const parts = [
    value.message,
    value.status,
    value.code,
    value.error?.message,
    value.error?.status,
    value.error?.code,
  ].filter(Boolean);
  try {
    return `${parts.join(" ")} ${JSON.stringify(value)}`;
  } catch {
    return parts.join(" ");
  }
}

export function isTransientAiProviderError(value: any) {
  const text = serializeError(value).toLowerCase();
  if (!text) return false;
  return (
    text.includes("503") ||
    text.includes("429") ||
    text.includes("unavailable") ||
    text.includes("high demand") ||
    text.includes("spikes in demand") ||
    text.includes("try again later") ||
    text.includes("resource exhausted") ||
    text.includes("too many requests") ||
    text.includes("rate limit") ||
    text.includes("temporarily") ||
    text.includes("overloaded")
  );
}

export function isTransientAiErrorReply(value: any) {
  const text = serializeError(value).toLowerCase();
  return text.includes("ai error") && isTransientAiProviderError(text);
}

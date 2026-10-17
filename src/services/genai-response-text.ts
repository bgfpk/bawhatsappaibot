export function getGenAIResponseText(response: any) {
  const directText = typeof response?.text === "function" ? response.text() : response?.text;
  if (directText) return String(directText);

  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part: any) => part?.text || "")
    .filter(Boolean)
    .join(" ")
    .trim();
}

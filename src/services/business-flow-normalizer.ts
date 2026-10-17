export type BusinessFlow = "product" | "service";
export function normalizeBusinessFlow(value: any): BusinessFlow {
  const text = String(value || "").trim().toLowerCase();
  if (/\b(service|services|lead|leads|clinic|doctor|hospital|appointment|booking|consultation|school|academy|agency|support|repair|salon|visit|meeting)\b/.test(text)) return "service";
  if (/\b(product|products|ecommerce|e-commerce|shop|store|fashion|catalog|retail|order|orders|delivery|cod)\b/.test(text)) return "product";
  return "product";
}

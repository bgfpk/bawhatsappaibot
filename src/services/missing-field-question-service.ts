import { isInstructionLikeFieldName } from "./customer-field-guard-service.ts";

function clean(value: any) {
  return String(value || "").trim();
}

function normalize(value: any) {
  return clean(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

export function pickNextMissingRequiredField(missingFields: any[] = []) {
  return missingFields.map(clean).filter((field) => field && !isInstructionLikeFieldName(field))[0] || "";
}

export function buildMissingRequiredFieldQuestion(input: {
  missingFields?: any[];
  language?: string;
  recordType?: "lead" | "order" | string;
}) {
  const field = pickNextMissingRequiredField(input.missingFields || []);
  if (!field) return "";
  const key = normalize(field);
  const english = String(input.language || "").toLowerCase().includes("english");
  const isLead = String(input.recordType || "").toLowerCase() === "lead";

  if (key.includes("city")) {
    return english
      ? "Please share your city so I can guide you properly."
      : "Apna city share kar dein taa ke main aap ko properly guide kar sakun.";
  }
  if (key.includes("quantity") || key === "qty" || key.includes("pieces") || key.includes("items")) {
    return english ? "How many pieces do you need?" : "Aap ko kitne pieces chahiye?";
  }
  if (key.includes("phone") || key.includes("mobile") || key.includes("number")) {
    return english ? "Please share the best phone number for this request." : "Is request ke liye best phone number share kar dein.";
  }
  if (key.includes("address") || key.includes("location")) {
    return english
      ? (isLead ? "Please share the location for this request." : "Please share the complete delivery address.")
      : (isLead ? "Is request ke liye location share kar dein." : "Complete delivery address share kar dein.");
  }
  if (key.includes("date") || key.includes("time") || key.includes("slot")) {
    return english ? "Which date and time would you prefer?" : "Aap kis date aur time ko prefer karenge?";
  }
  if (key.includes("gender") || key.includes("sex")) {
    return english ? "Please share the patient's gender." : "Please share the patient's gender.";
  }
  if (key.includes("service")) {
    return english ? "Which service do you need?" : "Aap ko kaunsi service chahiye?";
  }
  if (key.includes("product") || key.includes("item")) {
    return english ? "Which product do you want?" : "Aap ko kaunsa product chahiye?";
  }
  if (key.includes("name")) {
    return english ? "Please share the name for this request." : "Is request ke liye naam share kar dein.";
  }

  return english
    ? `Please share ${field} so I can complete the ${isLead ? "lead" : "details"}.`
    : `${field} share kar dein taa ke details complete ho saken.`;
}

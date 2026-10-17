function clean(value: any, max = 600) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function hasPattern(value: string, pattern: RegExp) {
  return pattern.test(value);
}

function isGeneralImageQuestion(value: string) {
  return hasPattern(value, /\b(what is this|what is in this|what does this mean|identify this|explain this image)\b/i) ||
    hasPattern(value, /\b(ye kya hai|is ka matlab kya hai|iska kya matlab hai|yeh kya hai)\b/i);
}

function hasStructuredDataIntent(value: string) {
  return hasPattern(value, /\b(id card|cnic|business card|visiting card|address slip|receipt|invoice|payment|transaction|bank slip|proof of payment|shipping label|delivery details|order screenshot|form|document|contact details|phone number|address|city|landmark)\b/i);
}

function detectedTypeLooksGeneral(value: string) {
  return hasPattern(value, /\b(logo|poster|product_poster|product_photo|catalog|catalogue|general_screenshot|random_photo|restaurant_logo)\b/i);
}

function contextLooksStructured(value: string) {
  return hasPattern(value, /\b(address|phone|contact|receipt|invoice|payment|transaction|shipping|delivery|order|customer details|business card|id card)\b/i);
}

export function decideImageOrderExtractor(input: {
  latestCustomerText?: string;
  caption?: string;
  detectedType?: string;
  contextText?: string;
  containsCustomerOrderData?: boolean | null;
}) {
  const combined = clean([input.latestCustomerText, input.caption].filter(Boolean).join(" "));
  const detectedType = clean(input.detectedType, 120).toLowerCase();
  const contextText = clean(input.contextText, 800).toLowerCase();

  if (input.containsCustomerOrderData === false) {
    return { allow: false, reason: "not_order_context" as const };
  }
  if (hasStructuredDataIntent(combined) || contextLooksStructured(contextText)) {
    return { allow: true, reason: "payment_or_address_or_contact_likely" as const };
  }
  if (isGeneralImageQuestion(combined)) {
    return { allow: false, reason: "general_image_question" as const };
  }
  if (detectedTypeLooksGeneral(detectedType)) {
    return { allow: false, reason: "not_order_context" as const };
  }
  return { allow: false, reason: "not_order_context" as const };
}

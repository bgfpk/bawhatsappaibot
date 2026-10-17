import { cleanString } from "./integration-foundation-store.ts";

function toSeconds(value: any) {
  const numeric = Number(value || 0);
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric > 100000000000 ? numeric / 1000 : numeric);
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function textFromContext(lead: any = {}, context: { messages?: any[]; timeline?: any[] } = {}) {
  const messages = [...(context.timeline || []), ...(context.messages || [])]
    .slice(-10)
    .map((item) => cleanString(item.text || item.message || item.body, 500))
    .filter(Boolean)
    .join(" ");
  const original = [lead.name, lead.summary, lead.notes, lead.productInterest, lead.source, lead.sourceCampaign, messages].filter(Boolean).join(" ");
  return { original, lower: original.toLowerCase() };
}

function has(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function todayAt(now: number, hour: number) {
  const value = now - (now % 86400) + hour * 3600;
  return value > now ? value : now + 3600;
}

export function suggestLifecycleStage(lead: any = {}, context: { messages?: any[]; timeline?: any[]; now?: number } = {}) {
  const { lower } = textFromContext(lead, context);
  const status = cleanString(lead.status, 80);
  const dealStage = cleanString(lead.dealStage, 80);
  const hasInterest = Boolean(cleanString(lead.productInterest, 240));
  const priceIntent = has(lower, [/price|pricing|quote|quotation|rate|cost|amount|kitna|qeemat/]);
  const paymentIntent = has(lower, [/payment|paid|advance|deposit|transfer|jazzcash|easypaisa|bank/]);
  const deliveryIntent = has(lower, [/deliver|delivery|dispatch|ship|received|install|installation/]);
  const orderIntent = has(lower, [/confirm|confirmed|order|book|buy|checkout|final|done/]);
  const negativeIntent = has(lower, [/not interested|cancel|too expensive|no thanks|stop|dont want|don't want/]);

  if (negativeIntent && status !== "Lost" && dealStage !== "Lost") {
    return { id: "lifecycle_mark_lost", title: "Move lifecycle to Lost", status: "Lost", dealStage: "Lost", reason: "Conversation context suggests the customer may be inactive or uninterested." };
  }
  if (status === "New" && lower.trim()) {
    return { id: "lifecycle_mark_contacted", title: "Move lifecycle to Contacted", status: "Contacted", dealStage: "Lead", reason: "This lead has customer context and should be treated as contacted." };
  }
  if ((status === "Contacted" || status === "Interested" || dealStage === "Lead") && (priceIntent || hasInterest)) {
    return { id: "lifecycle_quotation_needed", title: "Move lifecycle to Quotation Needed", status: "Quotation Needed", dealStage: "Quotation", reason: priceIntent ? "Customer context mentions price or quotation." : "Product/service interest is captured." };
  }
  if (status === "Quotation Needed") {
    return { id: "lifecycle_quotation_sent", title: "Move lifecycle to Quotation Sent", status: "Quotation Sent", dealStage: "Quotation", reason: "Quotation is needed; mark sent after your team shares it." };
  }
  if (status === "Quotation Sent" || dealStage === "Quotation") {
    return { id: "lifecycle_quotation_follow_up", title: "Schedule quotation follow-up", reason: "Quotation leads should have a follow-up to avoid going cold.", followUp: true };
  }
  if ((status === "Negotiation" || dealStage === "Negotiation") && paymentIntent) {
    return { id: "lifecycle_payment_pending", title: "Move lifecycle to Payment Pending", status: "Payment Pending", dealStage: "Payment", reason: "Conversation mentions payment or deposit after negotiation." };
  }
  if ((status === "Payment Pending" || dealStage === "Payment") && (paymentIntent || orderIntent)) {
    return { id: "lifecycle_order_confirmed", title: "Move lifecycle to Order Confirmed", status: "Order Confirmed", dealStage: "Order Confirmed", reason: "Payment/order context suggests the deal may be confirmed." };
  }
  if ((status === "Order Confirmed" || dealStage === "Order Confirmed") && deliveryIntent) {
    return { id: "lifecycle_dispatch", title: "Move lifecycle to Dispatch", status: "Order Confirmed", dealStage: "Dispatch", reason: "Delivery or installation context suggests dispatch work is next." };
  }
  if (dealStage === "Dispatch" && has(lower, [/delivered|received|complete|completed/])) {
    return { id: "lifecycle_completed", title: "Move lifecycle to Completed", status: "Completed", dealStage: "Completed", reason: "Delivery/completion context suggests this deal may be complete." };
  }
  return null;
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanString(match[1], 120);
  }
  return "";
}

export function detectLifecycleFields(lead: any = {}, context: { messages?: any[]; timeline?: any[] } = {}) {
  const { original, lower } = textFromContext(lead, context);
  const rows: any[] = [];
  const name = firstMatch(original, [/\bmy name is\s+([A-Z][a-zA-Z ]{1,40})/i, /\bi am\s+([A-Z][a-zA-Z ]{1,40})/i]);
  const city = firstMatch(original, [/\b(?:city|location|from|in|area)\s*(?:is|:)?\s*([A-Z][a-zA-Z ]{2,40})/i, /\b(Sahiwal|Lahore|Karachi|Islamabad|Rawalpindi|Multan|Faisalabad|Peshawar|Quetta)\b/i]);
  const quantity = firstMatch(lower, [/\b(?:qty|quantity|need|want|order)\s*(?:is|:)?\s*(\d{1,4})\b/i, /\b(\d{1,4})\s*(?:pcs|pieces|units|items)\b/i]);
  const budget = firstMatch(lower, [/\b(?:budget|range)\s*(?:is|:)?\s*(?:rs\.?|pkr)?\s*([0-9,]{3,9})\b/i, /\b(?:rs\.?|pkr)\s*([0-9,]{3,9})\b/i]);
  const interest = firstMatch(original, [/\b(?:interested in|need|want|looking for)\s+([a-zA-Z0-9][a-zA-Z0-9 /-]{2,80})/i]);
  const followTime = firstMatch(lower, [/\b(tomorrow|next month|later|evening|morning|tonight)\b/i]);

  if (name && (!lead.name || ["customer", "lead", "unnamed lead"].includes(String(lead.name).toLowerCase()))) rows.push({ field: "name", value: name, label: `Detected name: ${name}` });
  if (city && !cleanString(lead.city || lead.location, 120)) rows.push({ field: "location", value: city, label: `Detected city/location: ${city}` });
  if (interest && !cleanString(lead.productInterest, 240)) rows.push({ field: "productInterest", value: interest, label: `Detected interest: ${interest}` });
  if (quantity && !cleanString(lead.quantity, 80)) rows.push({ field: "quantity", value: quantity, label: `Detected quantity: ${quantity}` });
  if (budget && !cleanString(lead.budget, 80)) rows.push({ field: "budget", value: budget.replace(/,/g, ""), label: `Detected budget: ${budget}` });
  if (followTime) rows.push({ field: "preferredFollowUpTime", value: followTime, label: `Detected follow-up timing: ${followTime}` });
  if (has(lower, [/confirm|order|book|buy|purchase|final/])) rows.push({ field: "dealIntent", value: "order_intent", label: "Detected deal/order intent" });
  return rows.slice(0, 6);
}

export function recommendLifecycleFollowUp(lead: any = {}, context: { followUps?: any[]; messages?: any[]; timeline?: any[]; now?: number } = {}) {
  const now = Number(context.now || Math.floor(Date.now() / 1000));
  const pending = (context.followUps || []).some((item) => item.leadId === lead.id && item.status === "pending") || Boolean(toSeconds(lead.nextFollowUpAt));
  if (pending) return null;
  const { lower } = textFromContext(lead, context);
  const status = cleanString(lead.status, 80);
  const dealStage = cleanString(lead.dealStage, 80);
  const tomorrow = now - (now % 86400) + 86400 + 10 * 3600;
  const nextMonth = now + 30 * 86400;
  const mentionsTomorrow = has(lower, [/tomorrow|kal/]);
  const mentionsLater = has(lower, [/later|next month|baad|call me|callback|call back/]);
  const quote = status === "Quotation Sent" || dealStage === "Quotation" || has(lower, [/price|quote|quotation|rate|cost/]);
  const payment = status === "Payment Pending" || dealStage === "Payment";
  const delivery = dealStage === "Dispatch" || has(lower, [/delivery|deliver|dispatch|install/]);
  const dueAt = lower.includes("next month") ? nextMonth : mentionsTomorrow ? tomorrow : mentionsLater ? now + 2 * 86400 : todayAt(now, 10);
  if (!quote && !payment && !delivery && !mentionsLater && !mentionsTomorrow && !cleanString(lead.status, 80)) return null;
  const type = quote ? "quotation" : payment ? "payment" : delivery ? "delivery" : "message";
  const reason = quote ? "Customer asked about price/quotation or quotation was sent." : payment ? "Payment is pending and should be checked." : delivery ? "Delivery or installation needs a status check." : "Active lead has no scheduled follow-up.";
  return {
    id: quote ? "followup_quote_recommendation" : payment ? "followup_payment_recommendation" : delivery ? "followup_delivery_recommendation" : "followup_active_recommendation",
    type,
    dueAt,
    reason,
    notes: `Lifecycle suggestion: ${reason}`,
  };
}

export function buildLifecycleDraft(actionId: string) {
  if (actionId.includes("quotation")) return "Hi, just checking if you had a chance to review the quotation. Would you like any changes or help with the next step?";
  if (actionId.includes("payment")) return "Hi, this is a gentle reminder to confirm the payment step so we can continue processing your order.";
  if (actionId.includes("delivery") || actionId.includes("dispatch")) return "Hi, checking the delivery or installation status. Please confirm if everything is on track.";
  if (actionId.includes("call")) return "Hi, we can call you to discuss this. Please confirm a suitable time.";
  if (actionId.includes("missing") || actionId.includes("field")) return "Please share the missing details so we can guide you correctly.";
  return "Hi, following up to see if you still need help or want to continue.";
}

export function needsHumanReply(lead: any = {}, context: { messages?: any[]; timeline?: any[] } = {}) {
  const timeline = [...(context.timeline || []), ...(context.messages || [])].filter((item) => item.text || item.message || item.body);
  const last = timeline[timeline.length - 1] || null;
  const { lower } = textFromContext(lead, context);
  const latestInbound = last && (last.direction === "inbound" || last.role === "user" || last.fromMe === false);
  const explicitHuman = has(lower, [
    /\b(human|agent|representative|manager|owner|admin|real person|person)\b/i,
    /\b(call me|call back|callback|phone call|ring me|number pe call)\b/i,
    /\b(insaan|banda|agent se|manager se)\b/i,
  ]);
  const escalation = has(lower, [
    /\b(angry|complaint|complain|refund|return|dispute|fraud|scam|fake|legal|court|police|lawyer)\b/i,
    /\b(very bad|bad service|not happy|unhappy|upset|escalate)\b/i,
  ]);
  const statusNeedsHuman = /human|call required|admin review|manual review/i.test(cleanString(lead.status || lead.dealStage, 120));
  return Boolean(latestInbound && (explicitHuman || escalation || statusNeedsHuman));
}

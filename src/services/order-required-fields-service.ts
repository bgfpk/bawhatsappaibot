import { cleanOrderFieldValue, sanitizeOrderCustomFields } from "./order-field-value-service.ts";
import { validateDeliveryAddress } from "./address-validation-service.ts";
import { isInstructionLikeFieldName, sanitizeConfiguredCustomerFields } from "./customer-field-guard-service.ts";

type CustomerLanguage = string;

export const ORDER_ADDRESS_VALIDATION_PROTOCOL = `
Address Validation Protocol:
- First classify the address as home/residential, short/village, shop/office/business, courier pickup, or incomplete.
- Home/residential address requires House, Street, Area, City, and Famous Landmark.
- Short/village address requires confirmation that online parcels are successfully received there, plus a famous landmark/helpful nearby location and city.
- Shop/office/business address requires Shop/Office/Business Name or Number, Market/Road, City, and the kind/type of shop/office/business. Store that type as a delivery note.
- Do not ask home fields for shop/office/business addresses, and do not ask shop/office/business type for home addresses.
- If address was already validated and accepted, do not re-ask unless the customer changes address.
- If a complete address/landmark cannot be collected after reasonable prompting, ask whether the customer can pick it up from the nearest courier office.
`.trim();

const OPTIONAL_HINTS = [
  "optional",
  "do not ask",
  "don't ask",
  "filled after",
  "filled from",
  "manual",
  "later",
];

const ASK_HINTS = [
  "ask customer",
  "ask the customer",
  "must ask",
  "customer must",
  "confirm from customer",
];

const SYSTEM_MANAGED_FIELDS = new Set([
  "status",
  "order status",
  "courier status",
  "tracking status",
  "tracking id",
  "tracking number",
  "shipping charge",
  "order id",
  "order reference",
  "order ref",
]);

function clean(value: any) {
  return String(value ?? "").trim();
}

function normalizeFieldName(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasValue(value: any) {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return cleanOrderFieldValue(value).length > 0;
}

function inferCityFromAddress(address: any) {
  const text = cleanOrderFieldValue(address);
  if (!text) return "";
  const parts = text.split(",").map((part) => cleanOrderFieldValue(part)).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1];
  const match = text.match(/\b(karachi|lahore|islamabad|rawalpindi|faisalabad|multan|peshawar|quetta|sialkot|gujranwala|okara|toronto|london)\b/i);
  return match?.[1] || "";
}

function readCustomField(customFields: any, fieldName: string) {
  const exact = customFields?.[fieldName];
  if (hasValue(exact)) return exact;
  const wanted = fieldName.toLowerCase();
  const key = Object.keys(customFields || {}).find((item) => item.toLowerCase() === wanted);
  return key ? customFields[key] : "";
}

function valueForField(orderData: any, fieldName: string) {
  const name = normalizeFieldName(fieldName);
  const custom = orderData?.customFields || {};
  if (name.includes("name")) return orderData.customerName || orderData.customer_name || readCustomField(custom, fieldName);
  if (name.includes("phone") || name.includes("contact") || name.includes("whatsapp") || name.includes("number")) {
    return orderData.customerPhone || orderData.phone || readCustomField(custom, fieldName);
  }
  if (name === "order" || name.includes("order detail") || name.includes("product") || name.includes("item") || name.includes("variation") || name.includes("quantity")) {
    return orderData.orderDetail || orderData.productName || orderData.product_name || readCustomField(custom, fieldName);
  }
  if (name.includes("status")) {
    return orderData.transactionStatus || orderData.orderStatus || readCustomField(custom, fieldName);
  }
  if (name.includes("courier")) return orderData.courierCompany || orderData.courier_company || readCustomField(custom, fieldName);
  if (name.includes("city")) return orderData.cityName || readCustomField(custom, fieldName);
  if (name.includes("address")) return orderData.deliveryAddress || orderData.orderAddress || readCustomField(custom, fieldName);
  if (name.includes("cod") || name.includes("amount") || name.includes("total")) return orderData.codAmount || orderData.totalPrice || readCustomField(custom, fieldName);
  if (name.includes("piece") || name.includes("invoice")) return orderData.items || orderData.invoiceDivision || orderData.quantity || readCustomField(custom, fieldName);
  if (name.includes("order type")) return orderData.orderType || readCustomField(custom, fieldName);
  return readCustomField(custom, fieldName) || orderData[fieldName] || orderData[name.replace(/\s+/g, "")];
}

function shouldCustomerConfirm(field: any) {
  const name = clean(field?.name);
  if (!name) return false;
  if (isInstructionLikeFieldName(name)) return false;
  const instructions = clean(field?.instructions).toLowerCase();
  const lowerName = normalizeFieldName(name);
  if (SYSTEM_MANAGED_FIELDS.has(lowerName) || lowerName.endsWith(" status")) {
    return false;
  }
  if ((lowerName.includes("courier") || lowerName.includes("tracking") || lowerName.includes("shipping") || lowerName.includes("pickup")) &&
    !ASK_HINTS.some((hint) => instructions.includes(hint))) {
    return false;
  }
  if ((lowerName.includes("note") || lowerName.includes("followup") || lowerName.includes("instruction")) &&
    !ASK_HINTS.some((hint) => instructions.includes(hint))) {
    return false;
  }
  return !OPTIONAL_HINTS.some((hint) => instructions.includes(hint));
}

function fieldByName(configuredFields: any[] = [], fieldName: string) {
  const wanted = normalizeFieldName(fieldName);
  return configuredFields.find((field) => normalizeFieldName(field?.name) === wanted);
}

function hasConfiguredCustomerFields(configuredFields: any[] = []) {
  return configuredFields.some((field) => shouldCustomerConfirm(field));
}

function configuredPrompt(field: any) {
  const instructions = clean(field?.instructions);
  if (!instructions) return "";
  const lower = instructions.toLowerCase();
  if (!ASK_HINTS.some((hint) => lower.includes(hint))) return "";
  return instructions
    .replace(/^ask\s+(the\s+)?customer\s*[:：-]?\s*/i, "")
    .replace(/^confirm\s*[:：-]?\s*/i, "")
    .trim();
}

function canonicalFieldKey(fieldName: string) {
  const lower = normalizeFieldName(fieldName);
  if (!lower) return "";
  if (lower.includes("customer name") || lower === "name" || lower.includes("full name")) return "name";
  if (lower.includes("phone") || lower.includes("contact") || lower.includes("whatsapp") || lower.includes("number")) return "phone";
  if (lower.includes("address")) return "address";
  if (lower.includes("city") || lower.includes("location") || lower.includes("country")) return "location";
  if (lower === "order" || lower.includes("product") || lower.includes("service") || lower.includes("item")) return "product";
  if (lower.includes("variation") || lower.includes("variant") || lower.includes("color") || lower.includes("size") || lower.includes("plan") || lower.includes("package") || lower.includes("option")) return "variant";
  if (lower.includes("quantity")) return "quantity";
  if (lower.includes("payment")) return "payment_method";
  if (lower.includes("amount") || lower.includes("total") || lower.includes("price")) return "price";
  return lower;
}

function humanizeFieldLabel(fieldName: string) {
  const canonical = canonicalFieldKey(fieldName);
  if (canonical === "name") return "name";
  if (canonical === "phone") return "phone number";
  if (canonical === "address") return "delivery address";
  if (canonical === "location") return "city or location";
  if (canonical === "product") return "product or service";
  if (canonical === "variant") return "selected option";
  if (canonical === "quantity") return "quantity";
  if (canonical === "payment_method") return "payment method";
  if (canonical === "price") return "total price";
  return clean(fieldName).replace(/\s+/g, " ").toLowerCase();
}

export function getMissingOrderFields(orderData: any, configuredFields: any[] = []) {
  const missing = [];
  const seenCanonical = new Set<string>();
  const safeConfiguredFields = sanitizeConfiguredCustomerFields(configuredFields);
  const safeOrderData = {
    ...orderData,
    customFields: sanitizeOrderCustomFields(orderData?.customFields, safeConfiguredFields),
  };
  const inferredCity = safeOrderData.cityName || safeOrderData.city || inferCityFromAddress(safeOrderData.deliveryAddress || safeOrderData.orderAddress || safeOrderData.address);
  const baseFields = hasConfiguredCustomerFields(safeConfiguredFields)
    ? [
        ["Customer Name", safeOrderData.customerName],
        ["Phone", safeOrderData.customerPhone],
        ["Address", safeOrderData.deliveryAddress || safeOrderData.orderAddress],
        ["City", inferredCity],
        ["Product", safeOrderData.productName],
      ]
    : [
        ["Customer Name", safeOrderData.customerName],
        ["Phone", safeOrderData.customerPhone],
        ["Address", safeOrderData.deliveryAddress || safeOrderData.orderAddress],
        ["City", inferredCity],
        ["Product", safeOrderData.productName],
        ["Quantity", safeOrderData.quantity],
        ["Total Price", safeOrderData.totalPrice || safeOrderData.codAmount],
      ];

  for (const [name, value] of baseFields) {
    if (!hasValue(value)) {
      const canonical = canonicalFieldKey(String(name));
      if (!seenCanonical.has(canonical)) {
        seenCanonical.add(canonical);
        missing.push(String(name));
      }
    }
  }

  const addressAlreadyAccepted = safeOrderData.addressValidationValid === true ||
    safeOrderData.addressValidationAccepted === true ||
    safeOrderData.customFields?.addressValidationValid === true ||
    safeOrderData.customFields?.addressValidationAccepted === true;
  const addressValidation = addressAlreadyAccepted
    ? { valid: true, missing: [] as string[] }
    : validateDeliveryAddress({
      address: safeOrderData.deliveryAddress || safeOrderData.orderAddress || safeOrderData.address,
      city: inferredCity,
      notes: [safeOrderData.transactionNotes, safeOrderData.notes].filter(Boolean).join(" "),
      customFields: safeOrderData.customFields || {},
    });
  if (!addressValidation.valid) {
    for (const item of addressValidation.missing) {
      const label = item === "Parcel receiving confirmation" || item === "Shop/office/business type" || item === "Shop/office name or number" || item === "Market/Road"
        ? item
        : `Address ${item}`;
      const canonical = canonicalFieldKey(label);
      if (!seenCanonical.has(canonical)) {
        seenCanonical.add(canonical);
        missing.push(label);
      }
    }
  }

  for (const field of safeConfiguredFields) {
    if (!shouldCustomerConfirm(field)) continue;
    const name = clean(field.name);
    if (!hasValue(valueForField(safeOrderData, name))) {
      const canonical = canonicalFieldKey(name);
      if (!seenCanonical.has(canonical)) {
        seenCanonical.add(canonical);
        missing.push(name);
      }
    }
  }

  return missing;
}

export function buildMissingOrderFieldsMessage(
  missingFields: string[],
  _language: CustomerLanguage,
  _configuredFields: any[] = [],
  _knownOrderData: any = {}
) {
  return missingFields.length ? "" : "";
}

import { cleanOrderFieldValue } from "./order-field-value-service.ts";

export type AddressKind = "normal_residential" | "short_or_village" | "shop_or_office" | "courier_pickup" | "incomplete";

export type AddressValidationResult = {
  kind: AddressKind;
  valid: boolean;
  missing: string[];
  prompt: string;
  note: string;
};

function clean(value: any) {
  return cleanOrderFieldValue(value).replace(/\s+/g, " ").trim();
}

function lower(value: any) {
  return clean(value).toLowerCase();
}

function result(kind: AddressKind, valid: boolean, missing: string[], note = ""): AddressValidationResult {
  return { kind, valid, missing, prompt: "", note };
}

function hasHouse(value: string) {
  return /\b(house|home|flat|apartment|apt|unit|building|plot|h\.?\s*no|door|suite)\b/i.test(value) ||
    /\b\d+[a-z]?(?:[-/]\s*\d+[a-z]?)?\b/i.test(value);
}

function hasStreet(value: string) {
  return /\b(street|st\.?|road|rd\.?|lane|avenue|ave\.?|drive|dr\.?|block|sector|gali|mohalla|bazaar)\b/i.test(value);
}

function hasArea(value: string) {
  return /\b(area|town|township|colony|society|phase|sector|block|suburb|district|neighborhood|neighbourhood|market|industrial|estate)\b/i.test(value);
}

function hasLandmark(value: string) {
  return /\b(near|nearby|landmark|opposite|beside|behind|front|known|famous|main|market|mall|school|college|hospital|bank|petrol|station|mosque|masjid|church|temple|factory|mill|plaza|chowk|square|bus stop|metro|society|township)\b/i.test(value);
}

function hasCity(address: string, city: string) {
  if (clean(city)) return true;
  const parts = clean(address).split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2 && parts[parts.length - 1].split(/\s+/).length <= 4) return true;
  const words = clean(address).split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] || "";
  return words.length >= 5 && /^[\p{L}][\p{L}.'-]{2,}$/u.test(last) && !/\b(road|rd|street|st|lane|block|sector|market|plaza)\b/i.test(last);
}

function isCourierPickup(value: string) {
  return /\b(courier|postex|pickup|pick up|self collect|office pickup)\b/i.test(value) &&
    /\b(pick|pickup|collect)\b/i.test(value);
}

function isShopOffice(value: string) {
  return /\b(shop|office|business|factory|mill|store|warehouse|clinic|mart|company|restaurant|salon|studio|dukan|dukkan)\b/i.test(value);
}

function hasShopOfficeNumberOrName(value: string) {
  return /\b(shop|office|business|factory|mill|store|warehouse|clinic|mart|company|restaurant|salon|studio)\b/i.test(value) ||
    /\b(?:shop|office|unit|suite|room|floor)\s*[#:\-]?\s*\w+/i.test(value) ||
    /\b\d+[a-z]?(?:[-/]\s*[a-z0-9]+)?\b/i.test(value);
}

function hasMarketOrRoad(value: string) {
  return /\b(market|road|rd\.?|street|st\.?|bazaar|plaza|mall|avenue|ave\.?|lane|industrial|estate|block|sector)\b/i.test(value);
}

function hasShopOfficeType(input: any) {
  const explicit = clean(input.shopOfficeType || input.deliveryNote || input.customFields?.["Shop/Office Type"] || input.customFields?.["Business Type"] || input.customFields?.["Delivery Note"]);
  if (explicit) return true;
  const text = lower(`${input.address || ""} ${input.notes || ""}`);
  return /\b(kind|type|business type|shop type|office type)\b/i.test(text) ||
    /\b(mobile|grocery|pharmacy|clinic|salon|restaurant|warehouse|factory|office|retail|wholesale|school|college|bank)\b/i.test(text);
}

function isShortVillage(value: string) {
  if (hasStreet(value) || hasArea(value)) return false;
  const words = clean(value).split(/\s+/).filter(Boolean);
  return words.length <= 4 || /\b(village|gaon|deh|chak|basti|pind|hamlet|rural)\b/i.test(value);
}

function hasParcelReceivingConfirmation(input: any) {
  const text = lower(`${input.address || ""} ${input.notes || ""} ${JSON.stringify(input.customFields || {})}`);
  return /\b(parcels?|courier|online|delivery)\b.*\b(receive|received|receives|deliver|delivered|arrive|arrives|success|successfully|milta|miltay|aata|atay)\b/i.test(text) ||
    /\b(receive|received|receives|deliver|delivered|arrive|arrives|success|successfully|milta|miltay|aata|atay)\b.*\b(parcels?|courier|online|delivery)\b/i.test(text);
}

export function validateDeliveryAddress(input: {
  address?: any;
  city?: any;
  notes?: any;
  customFields?: any;
  shopOfficeType?: any;
  deliveryNote?: any;
}): AddressValidationResult {
  const address = clean(input.address);
  const city = clean(input.city);
  const text = lower(address);
  if (!address) return result("incomplete", false, ["Address"]);

  if (isCourierPickup(text)) {
    return result("courier_pickup", true, [], "Customer agreed to courier office pickup.");
  }

  if (isShopOffice(text)) {
    const missing = [
      !hasShopOfficeNumberOrName(text) ? "Shop/office name or number" : "",
      !hasMarketOrRoad(text) ? "Market/Road" : "",
      !hasCity(address, city) ? "City" : "",
      !hasShopOfficeType(input) ? "Shop/office/business type" : "",
    ].filter(Boolean);
    return result("shop_or_office", missing.length === 0, missing, missing.length ? "" : "Shop/office/business address validated.");
  }

  if (isShortVillage(text)) {
    const missing = [
      !hasParcelReceivingConfirmation(input) ? "Parcel receiving confirmation" : "",
      !hasLandmark(text) ? "Famous Landmark" : "",
      !hasCity(address, city) ? "City" : "",
    ].filter(Boolean);
    return result("short_or_village", missing.length === 0, missing, missing.length ? "" : "Short/village address validated.");
  }

  const missing = [
    !hasHouse(text) ? "House" : "",
    !hasStreet(text) ? "Street" : "",
    !hasArea(text) ? "Area" : "",
    !hasCity(address, city) ? "City" : "",
    !hasLandmark(text) ? "Famous Landmark" : "",
  ].filter(Boolean);
  return result(missing.length ? "incomplete" : "normal_residential", missing.length === 0, missing, missing.length ? "" : "Home/residential address validated.");
}

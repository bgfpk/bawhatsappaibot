import { cleanOrderFieldValue, sanitizeOrderCustomFields } from "./order-field-value-service.ts";
import { buildOrderDetail } from "./postex-booking-payload-service.ts";
import { sanitizeCustomerNameCandidate } from "./customer-identity-service.ts";

type CustomerLanguage = string;

function clean(value: any, fallback = "", configuredField?: any) {
  const text = cleanOrderFieldValue(value, configuredField);
  return text || fallback;
}

function amount(value: any) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? String(numeric) : "";
}

function totalText(orderData: any) {
  const explicit = clean(orderData?.priceText || orderData?.price_text);
  if (explicit) return explicit;
  const numeric = amount(orderData?.totalPrice || orderData?.codAmount || orderData?.total_price);
  const currency = clean(orderData?.currency);
  if (numeric && currency) return `${currency} ${numeric}`;
  return numeric;
}

function customRows(orderData: any) {
  const fields = sanitizeOrderCustomFields(orderData?.customFields);
  const hidden = new Set([
    "order",
    "name",
    "status",
    "order status",
    "tracking id",
    "tracking number",
    "courier status",
    "shipping charge",
    "customer name",
    "phone",
    "address",
    "payment method",
  ]);
  return Object.entries(fields)
    .filter(([key, value]) => clean(key) && clean(value) && !hidden.has(clean(key).toLowerCase()))
    .map(([key, value]) => formatSummaryRow("-", clean(key), clean(value)));
}

function formatSummaryRow(icon: string, label: string, value: any) {
  const text = clean(value);
  return text ? `${icon} *${label}:* ${text}` : "";
}

export function buildConfirmedOrderSummaryRows(orderData: any, savedRef: any) {
  const orderDetail = clean(orderData?.orderDetail) || buildOrderDetail(orderData);
  const product = clean(orderData?.productName || orderData?.product_name) || orderDetail;
  const variant = clean(orderData?.variation || orderData?.variant);
  const quantity = clean(orderData?.quantity || orderData?.items);
  const total = totalText(orderData);
  const location = clean(orderData?.cityName || orderData?.location);
  const address = clean(orderData?.deliveryAddress || orderData?.orderAddress || orderData?.address);
  const paymentMethod = clean(orderData?.paymentMethod || orderData?.customFields?.["Payment Method"]);
  const customerName = sanitizeCustomerNameCandidate(orderData?.customerName || orderData?.customer_name);

  return [
    formatSummaryRow("-", "Order ID", clean(savedRef?.order_id || orderData?.orderReferenceNumber)),
    formatSummaryRow("-", "Name", customerName),
    formatSummaryRow("-", "Phone", orderData?.customerPhone || orderData?.phone),
    formatSummaryRow("-", "Product", product),
    variant ? formatSummaryRow("-", "Option", variant) : "",
    quantity ? formatSummaryRow("-", "Quantity", quantity) : "",
    total ? formatSummaryRow("-", "Total", total) : "",
    location ? formatSummaryRow("-", "Location", location) : "",
    address ? formatSummaryRow("-", "Address", address) : "",
    paymentMethod ? formatSummaryRow("-", "Payment", paymentMethod) : "",
    ...customRows(orderData),
  ].filter(Boolean);
}

export function buildCustomerOrderSummaryMessage(orderData: any, savedRef: any, language: CustomerLanguage) {
  const rows = buildConfirmedOrderSummaryRows(orderData, savedRef);
  if (language === "urdu") {
    return [
      "Order confirmed.",
      "",
      ...rows,
      "",
      "We will process it shortly.",
    ].join("\n");
  }

  if (language === "roman_urdu") {
    return [
      "Order confirmed.",
      "",
      ...rows,
      "",
      "Hum isay shortly process kar denge.",
    ].join("\n");
  }

  return [
    "Order confirmed.",
    "",
    ...rows,
    "",
    "We'll process it shortly.",
  ].join("\n");
}

export function buildAdminOrderSummaryMessage(orderData: any, savedRef: any) {
  return [
    savedRef?.isNew === false ? "Confirmed order updated" : "New confirmed order/lead",
    ...buildConfirmedOrderSummaryRows(orderData, savedRef),
  ].join("\n");
}

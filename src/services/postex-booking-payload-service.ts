import * as shippingService from "./shipping-service.ts";
import { cleanOrderFieldValue, sanitizeOrderCustomFields } from "./order-field-value-service.ts";

const firstPresent = (...values: any[]) => values.find((value) => value !== undefined && value !== null && value !== "");
const money = (value: any) => shippingService.toNumber(value);

function clean(value: any) {
  return cleanOrderFieldValue(value);
}

function customValue(data: any, ...names: string[]) {
  const fields = sanitizeOrderCustomFields(data?.customFields);
  for (const name of names) {
    const exact = fields[name];
    if (exact !== undefined && exact !== null && exact !== "") return exact;
    const key = Object.keys(fields).find((item) => item.toLowerCase() === name.toLowerCase());
    if (key && fields[key] !== undefined && fields[key] !== null && fields[key] !== "") return fields[key];
  }
  return "";
}

export function buildOrderDetail(data: any) {
  const parts = [
    clean(firstPresent(data.productName, data.product_name, data.orderDetail)),
    clean(firstPresent(data.variation, data.variant, data.stockVariationName, customValue(data, "Variation", "Variant", "Color", "Size"))),
    clean(firstPresent(data.quantity, data.qty)) ? `Qty: ${clean(firstPresent(data.quantity, data.qty))}` : "",
  ].filter(Boolean);

  return parts.join(" | ") || "Order";
}

export function buildTransactionNotes(data: any) {
  const notes = [
    firstPresent(data.transactionNotes, data.notes, data.customerNotes),
    customValue(data, "Notes", "Order Notes", "Instructions", "Followup", "Follow-up"),
  ].map(clean).filter(Boolean);

  return Array.from(new Set(notes)).join(" | ");
}

export function buildPostexBookingPayload(order: any) {
  const data = order.order_data || {};
  const orderRefNumber = clean(firstPresent(data.orderRefNumber, data.orderReferenceNumber, data.orderReference, order.order_id, order.$id, order.id));
  const customerName = clean(firstPresent(data.customerName, data.name));
  const customerPhone = shippingService.normalizePostexPhone(firstPresent(data.customerPhone, data.phone));
  const deliveryAddress = clean(firstPresent(data.deliveryAddress, data.orderAddress, data.address, customValue(data, "Address", "Delivery Address")));
  const cityName = clean(firstPresent(data.cityName, data.city, data.deliveryCity, customValue(data, "City")));
  const invoicePayment = money(firstPresent(data.invoicePayment, data.totalPrice, data.codAmount, data.total));
  const items = Math.max(1, Math.round(money(firstPresent(data.items, data.quantity, data.qty)) || 1));
  const invoiceDivision = Math.max(1, Math.round(money(firstPresent(data.invoiceDivision, data.pieces, data.parcels)) || 1));
  const orderType = clean(firstPresent(data.orderType, "Normal"));

  const missing = [];
  if (!orderRefNumber) missing.push("Order Reference");
  if (!customerName) missing.push("Name");
  if (!customerPhone) missing.push("Phone");
  if (!deliveryAddress) missing.push("Address");
  if (!cityName) missing.push("City");
  if (!invoicePayment) missing.push("COD Amount");
  if (missing.length > 0) {
    throw new Error(`Complete these PostEx fields before booking: ${missing.join(", ")}`);
  }

  return {
    orderRefNumber,
    invoicePayment,
    orderDetail: buildOrderDetail(data),
    customerName,
    customerPhone,
    deliveryAddress,
    transactionNotes: buildTransactionNotes(data),
    cityName,
    invoiceDivision,
    items,
    ...(data.pickupAddressCode ? { pickupAddressCode: clean(data.pickupAddressCode) } : {}),
    ...(data.storeAddressCode ? { storeAddressCode: clean(data.storeAddressCode) } : {}),
    orderType,
  };
}

import test from "node:test";
import assert from "node:assert/strict";

import { buildCustomerStateSummary, extractCustomerOrderState, hasStructuredOrderConfirmationSignal } from "./customer-state-extractor-service.ts";
import { getMissingOrderFields } from "./order-required-fields-service.ts";
import { toVisibleChatHistoryMessage } from "./chat-history-sanitizer.ts";

test("internal sequence labels are excluded from visible chat history", () => {
  const visible = toVisibleChatHistoryMessage({
    role: "model",
    text: "[Voice sequence template sent]",
  });
  assert.equal(visible, null);
});

test("manual owner message markers stay visible for summary context", () => {
  const visible = toVisibleChatHistoryMessage({
    role: "model",
    text: "[Manual voice note sent]",
  });
  assert.equal(visible?.text, "[Manual voice note sent]");
});

test("summary reflects the latest structured order state", () => {
  const state = extractCustomerOrderState({
    profile: {
      customerPhone: "+1 555 111 2222",
      orderStatus: "Confirmed order",
    },
    latestOrder: {
      orderReferenceNumber: "ORD-1",
      customerName: "Sarah",
      productName: "AirWrap",
      variation: "Blue",
      cityName: "Toronto",
      deliveryAddress: "400 Market Street, Toronto",
      paymentMethod: "Card",
      priceText: "CAD 199",
    },
    history: [
      { role: "user", text: "My name is Sarah." },
    ],
  });

  const summary = buildCustomerStateSummary(state);
  assert.equal(summary.includes("Customer name: Sarah"), true);
  assert.equal(summary.includes("Phone number: +1 555 111 2222"), true);
  assert.equal(summary.includes("Address or delivery details: 400 Market Street, Toronto"), true);
  assert.equal(summary.includes("Product or service: AirWrap"), true);
  assert.equal(summary.includes("Selected option: Blue"), true);
  assert.equal(summary.includes("Price: CAD 199"), true);
  assert.equal(summary.includes("Payment method: Card"), true);
  assert.equal(summary.includes("Order status: confirmed"), true);
});

test("required order fields plus confirmation signal are recognized without hardcoded local assumptions", () => {
  const state = extractCustomerOrderState({
    profile: {
      customerPhone: "+44 7700 900123",
      customerName: "Emma",
    },
    history: [
      { role: "model", text: "Product: Starter Plan" },
      { role: "user", text: "Address: House 22 King Street, Central Area London, near main station" },
      { role: "user", text: "Payment method: bank transfer" },
      { role: "user", text: "Yes, confirm it." },
    ],
    configuredFields: [{ name: "Payment Method", instructions: "Ask customer payment method." }],
  });

  assert.equal(hasStructuredOrderConfirmationSignal(state), true);
  assert.deepEqual(getMissingOrderFields({
    customerName: state.customerName,
    customerPhone: state.customerPhone,
    deliveryAddress: state.address,
    cityName: "London",
    productName: state.product,
    quantity: 1,
    totalPrice: 199,
    customFields: {
      "Payment Method": state.paymentMethod,
    },
  }, [{ name: "Payment Method", instructions: "Ask customer payment method." }]), []);
});

test("name and phone are extracted from recent chat and contact-style text", () => {
  const state = extractCustomerOrderState({
    profile: {},
    history: [
      { role: "user", text: "My name is Sarah Connor" },
      { role: "user", text: "Name: Sarah Connor\nPhone: +1 202 555 0188" },
      { role: "user", text: "Address: 400 Market Street, Toronto" },
    ],
  });

  assert.equal(state.customerName, "Sarah Connor");
  assert.equal(state.customerPhone, "+1 202 555 0188");
});

test("Karo after final confirmation is treated as order confirmation", () => {
  const state = extractCustomerOrderState({
    profile: {
      customerName: "Sajjad",
      customerPhone: "+92 300 0000000",
      addressValidationValid: true,
    },
    history: [
      { role: "user", text: "Office 20-A Main Boulevard Road Township Lahore Military Accounts Society Lahore" },
      { role: "user", text: "COD" },
      { role: "model", text: "Order save kar doon? Please confirm." },
      { role: "user", text: "Karo" },
    ],
  });

  assert.equal(state.confirmationDetected, true);
});

test("plain name after bot asks for name is extracted as customer name", () => {
  const state = extractCustomerOrderState({
    profile: {},
    history: [
      { role: "model", text: "Order ke liye apna naam share kar dein." },
      { role: "user", text: "Hafiz Mohsin" },
    ],
  });

  assert.equal(state.customerName, "Hafiz Mohsin");
});

test("ok after name prompt is not extracted as customer name", () => {
  const state = extractCustomerOrderState({
    profile: {},
    history: [
      { role: "model", text: "Order ke liye apna naam share kar dein." },
      { role: "user", text: "Ok" },
    ],
  });

  assert.equal(state.customerName, "");
});

test("customer color change in recent text overrides older option", () => {
  const state = extractCustomerOrderState({
    profile: { latestVariant: "grey" },
    history: [
      { role: "user", text: "Change color to black" },
    ],
  });

  assert.equal(state.variant, "black");
});

test("customer-provided name stays customer name when card/business data is also present", () => {
  const state = extractCustomerOrderState({
    profile: {
      customerName: "عرفاق حسین",
      businessName: "Design Art Printers Faisalabad",
      businessContacts: ["Rana Rafaqat Ali", "Rana Ali Husnain"],
      cardExtractedPhones: ["0301-3130278", "0316-4708856"],
      cardExtractedAddress: "P-27/A Gujjar Basti, Neem Wali Gali, Eid Gah Road, Faisalabad",
      landmark: "Eid Gah Road",
    },
    history: [
      { role: "user", text: "Name: arfaqali com" },
      { role: "user", text: "Phone: 03027305184" },
    ],
  });

  assert.equal(state.customerName, "عرفاق حسین");
  assert.equal(state.businessName, "Design Art Printers Faisalabad");
  assert.deepEqual(state.businessContacts, ["Rana Rafaqat Ali", "Rana Ali Husnain"]);
  assert.deepEqual(state.cardExtractedPhones, ["0301-3130278", "0316-4708856"]);
  assert.equal(state.cardExtractedAddress.includes("Gujjar Basti"), true);
});

test("language detection stays language-neutral and follows the latest customer language", () => {
  const state = extractCustomerOrderState({
    profile: {
      customerLanguagePreference: "english",
    },
    history: [
      { role: "user", text: "Hello there" },
      { role: "user", text: "Necesito el precio final" },
    ],
  });

  assert.equal(state.latestLanguage, "english");
  assert.equal(state.country, "");
});

test("latest saved order state fills summary even when recent chat is sparse", () => {
  const state = extractCustomerOrderState({
    profile: {},
    history: [{ role: "user", text: "ok thank you" }],
    latestOrder: {
      orderReferenceNumber: "ORD123",
      customerName: "Muhammad Shiraz",
      customerPhone: "+92 345 3992775",
      productName: "Standard Size Bike Cover With Lock Option",
      variation: "Navy Blue",
      cityName: "Karachi",
      deliveryAddress: "Plot 3C Zulfiqar commercial street 10 A DHA phase 8, Karachi",
      priceText: "Rs 1340",
      paymentMethod: "Advance partial payment",
    },
  });

  const summary = buildCustomerStateSummary(state);
  assert.equal(summary.includes("Customer name: Muhammad Shiraz"), true);
  assert.equal(summary.includes("Product or service: Standard Size Bike Cover With Lock Option"), true);
  assert.equal(summary.includes("Selected option: Navy Blue"), true);
  assert.equal(summary.includes("Payment method: Advance partial payment"), true);
  assert.equal(summary.includes("Order status: confirmed"), true);
});

test("AI asks only for missing custom fields when some are already known", () => {
  const state = extractCustomerOrderState({
    profile: {
      customerName: "Sarah Connor",
      customerPhone: "+1 202 555 0188",
      customFields: {
        "Business Details": "Retail boutique",
      },
    },
    history: [
      { role: "user", text: "Product: Growth Plan" },
      { role: "user", text: "Address: 400 Market Street, Toronto" },
    ],
    configuredFields: [
      { name: "Business Details", instructions: "Ask customer business details." },
      { name: "Preferred Date", instructions: "Ask customer preferred date." },
    ],
  });

  assert.deepEqual(state.customFields, {
    "Business Details": "Retail boutique",
  });
  assert.deepEqual(state.missingCustomFields, ["Preferred Date"]);
});

test("AI does not ask again if custom field values already exist in profile order or history", () => {
  const state = extractCustomerOrderState({
    profile: {
      customFields: {
        "Service Needed": "Logo redesign",
      },
    },
    latestOrder: {
      customFields: {
        "Preferred Date": "Friday",
      },
    },
    history: [
      { role: "model", text: "Budget: USD 1200" },
    ],
    configuredFields: [
      { name: "Service Needed", instructions: "Ask customer service needed." },
      { name: "Preferred Date", instructions: "Ask customer preferred date." },
      { name: "Budget", instructions: "Ask customer budget." },
    ],
  });

  assert.equal(state.missingCustomFields.length, 0);
  assert.equal(state.customFields["Service Needed"], "Logo redesign");
  assert.equal(state.customFields["Preferred Date"], "Friday");
  assert.equal(state.customFields["Budget"], "USD 1200");
});

test("customer summary includes collected custom fields and missing custom fields", () => {
  const state = extractCustomerOrderState({
    profile: {
      customFields: {
        "Business Details": "Retail boutique",
      },
    },
    history: [],
    configuredFields: [
      { name: "Business Details", instructions: "Ask customer business details." },
      { name: "Preferred Date", instructions: "Ask customer preferred date." },
    ],
  });

  const summary = buildCustomerStateSummary(state);
  assert.equal(summary.includes("Custom field - Business Details: Retail boutique"), true);
  assert.equal(summary.includes("Missing custom fields: Preferred Date"), true);
});

test("custom fields work with arbitrary field names and no Pakistan assumptions are introduced", () => {
  const state = extractCustomerOrderState({
    profile: {},
    history: [
      { role: "user", text: "Deployment Window: next Tuesday" },
      { role: "user", text: "Workspace Count: 14" },
      { role: "user", text: "My phone is +44 7700 900123" },
    ],
    configuredFields: [
      { name: "Deployment Window", instructions: "Ask customer deployment window." },
      { name: "Workspace Count", instructions: "Ask customer workspace count." },
    ],
  });

  assert.equal(state.customFields["Deployment Window"], "next Tuesday");
  assert.equal(state.customFields["Workspace Count"], "14");
  assert.equal(state.customerPhone, "+44 7700 900123");
});

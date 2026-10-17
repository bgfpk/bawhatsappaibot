import test from "node:test";
import assert from "node:assert/strict";

import { buildCompleteCustomerSummary } from "./customer-summary-state-service.ts";
import { extractCustomerOrderState } from "./customer-state-extractor-service.ts";

test("customer summary tells a compact full story with current snapshot, timeline, and future plan", () => {
  const profile = {
    lastImageContextNote: "Possible card/image details: business Design Art Printers Faisalabad; contacts Rana Rafaqat Ali; address Eid Gah Road Faisalabad.",
    lastStickerSummary: "Customer sent a sticker reaction after order confirmation.",
    lastWelcomeSequenceStatus: "sent",
    plannedCustomerUpdates: [
      {
        id: "planned_1",
        status: "pending",
        summary: "Follow up about delivery window",
        scheduledAt: 1_720_000_000,
      },
    ],
  };
  const latestOrder = {
    orderReferenceNumber: "ORD123",
    customerName: "Muhammad Shiraz",
    customerPhone: "+92 345 3992775",
    productName: "Standard Size Bike Cover With Lock Option",
    variation: "Navy Blue",
    deliveryAddress: "Plot 3C Zulfiqar commercial street 10 A DHA phase 8, Karachi",
    cityName: "Karachi",
    priceText: "Rs 1340",
    paymentMethod: "Advance partial payment",
  };
  const history = [
    { role: "user", text: "Price?" },
    { role: "model", text: "Bike cover price is Rs 1340." },
    { role: "user", text: "Plot 3C Zulfiqar commercial street 10 A DHA phase 8, Karachi" },
    { role: "model", text: "Please share your name to complete the order." },
    { role: "user", text: "Customer sent a sticker reaction after order confirmation." },
    { role: "model", text: "[Manual media caption]: please note delivery mon/sat timing 10:00Am between 5:00pm" },
    { role: "user", text: "oky thank you" },
    { role: "model", text: "Order confirmed." },
  ];
  const state = extractCustomerOrderState({ profile, history, latestOrder });

  const summary = buildCompleteCustomerSummary({ profile, history, latestOrder, state });

  assert.equal(summary.includes("Conversation Summary:"), true);
  assert.equal(summary.includes("Message-by-message timeline:"), true);
  assert.equal(summary.includes("Lead/Business details:"), true);
  assert.equal(summary.includes("Price?"), true);
  assert.equal(summary.includes("Plot 3C Zulfiqar commercial"), true);
  assert.equal(summary.includes("Please share your name to complete the order."), true);
  assert.equal(summary.length <= 3500, true);
  assert.equal(summary.includes("Customer sent a sticker reaction after order confirmation."), true);
  assert.equal(summary.includes("Standard Size Bike Cover With Lock Option"), true);
  assert.equal(summary.includes("Welcome sequence sent."), false);
  assert.equal(summary.includes("Follow up about delivery window"), true);
  assert.equal(summary.length <= 3500, true);
  assert.match(summary, /Customer asked\/shared:/);
  assert.match(summary, /Bot\/AI replied:/);
});

test("fallback summary stays clean when only partial details are known", () => {
  const summary = buildCompleteCustomerSummary({
    profile: {},
    history: [{ role: "user", text: "Hello" }],
    latestOrder: {},
    state: {
      customerPhone: "15811061380",
      orderStatus: "collecting details",
      product: "",
      variant: "",
      priceText: "",
      location: "",
      address: "",
      latestLanguage: "",
      missingCustomFields: [],
      priceObjectionDetected: false,
      confirmationDetected: false,
    },
  });

  assert.match(summary, /Conversation Summary:/);
  assert.doesNotMatch(summary, /Phone: 03001234567/);
  assert.match(summary, /Current stage: collecting details/);
  assert.match(summary, /Wait for customer to share the next needed detail\./);
  assert.doesNotMatch(summary, /AI replied with sales\/support guidance/i);
  assert.doesNotMatch(summary, /AI shared price or option details/i);
  assert.doesNotMatch(summary, /Customer asked for media\/check details/i);
});

test("fallback summary includes saved voice note meaning", () => {
  const summary = buildCompleteCustomerSummary({
    profile: {},
    history: [{ role: "user", text: "Voice note: customer asked pricing for warehouse racks and Lahore delivery." }],
    latestOrder: {},
    state: {
      customerPhone: "",
      orderStatus: "inquiry",
      product: "warehouse racks",
      variant: "",
      priceText: "",
      location: "Lahore",
      address: "",
      latestLanguage: "",
      missingCustomFields: [],
      priceObjectionDetected: false,
      confirmationDetected: false,
    },
  });

  assert.match(summary, /Message-by-message timeline:/);
  assert.match(summary, /Voice note: customer asked pricing for warehouse racks and Lahore delivery/i);
});

test("starter order-limit and setup chat produces a useful fallback summary", () => {
  const history = [
    { role: "user", text: "What is order limit?" },
    { role: "model", text: "Starter plan allows up to 300 orders per month. $9/month or $65/year. Asked if this limit works." },
    { role: "user", text: "yes" },
    { role: "model", text: "Confirmed Starter order limit works and asked if they want to start 7-day trial." },
    { role: "user", text: "Yes" },
    { role: "model", text: "Shared trial/signup guidance." },
    { role: "user", text: "How to setup?" },
    { role: "model", text: "Explained account creation, WhatsApp QR connection, business details, and shared tutorial video." },
  ];
  const summary = buildCompleteCustomerSummary({
    profile: {},
    history,
    latestOrder: {},
    state: {
      customerName: "Ahad Firdosi",
      customerPhone: "153238380473",
      orderStatus: "human review",
      product: "",
      variant: "",
      priceText: "",
      location: "",
      address: "N/A",
      latestLanguage: "English",
      missingCustomFields: [],
      priceObjectionDetected: false,
      confirmationDetected: false,
    },
  });

  assert.match(summary, /Current customer need: BlackArrow Starter plan, order limit, and setup/i);
  assert.match(summary, /Current stage: interested in trial\/setup guidance/i);
  assert.match(summary, /What is order limit\?/i);
  assert.match(summary, /300 orders per month\. \$9\/month or \$65\/year/i);
  assert.match(summary, /How to setup\?/i);
  assert.match(summary, /Help customer start setup or answer setup questions/i);
  assert.doesNotMatch(summary, /Delivery: N\/A/i);
  assert.doesNotMatch(summary, /Ask customer what they need/i);
  assert.match(summary, /Conversation Summary:/);
  assert.match(summary, /Message-by-message timeline:/);
  assert.match(summary, /Current customer need: BlackArrow Starter plan, order limit, and setup/i);
});

test("school custom-plan chat produces detailed fallback summary", () => {
  const history = [
    { role: "user", text: "I need custom plan" },
    { role: "model", text: "Shared plan prices and asked what specific usage/features are needed." },
    { role: "user", text: "I want to send messages to parents of the students in our school. For attendance, for leaves and homework etc." },
    { role: "model", text: "Confirmed BlackArrow can help with school updates and asked if customer wants free trial." },
    { role: "user", text: "How I can set it up?" },
    { role: "model", text: "Shared signup link and setup video." },
    { role: "user", text: "ok" },
  ];
  const summary = buildCompleteCustomerSummary({
    profile: {},
    history,
    latestOrder: {},
    state: extractCustomerOrderState({ profile: {}, history, latestOrder: {} }),
  });

  assert.match(summary, /Conversation Summary:/);
  assert.match(summary, /Message-by-message timeline:/);
  assert.match(summary, /Business\/use case: School communication/i);
  assert.match(summary, /Parent messaging for attendance, leave updates, homework/i);
  assert.match(summary, /Plan interest: Custom plan/i);
  assert.match(summary, /number of parents\/students/i);
  assert.match(summary, /should not repeat setup links/i);
  assert.doesNotMatch(summary, /Restaurant/i);
});

test("service draft placeholders do not leak into the fallback summary", () => {
  const summary = buildCompleteCustomerSummary({
    profile: {},
    history: [{ role: "user", text: "Need details about your plan" }],
    latestOrder: {
      recordType: "lead",
      recordStatus: "incomplete",
      productName: "Service request",
      serviceName: "",
      missingFields: ["Service"],
    },
    state: {
      customerPhone: "15811061380",
      orderStatus: "collecting details",
      product: "Service request",
      variant: "",
      priceText: "",
      location: "",
      address: "",
      latestLanguage: "English",
      missingCustomFields: ["Service"],
      priceObjectionDetected: false,
      confirmationDetected: false,
    },
  });

  assert.doesNotMatch(summary, /Service request/i);
  assert.doesNotMatch(summary, /Missing: Service/i);
  assert.doesNotMatch(summary, /draft is being updated/i);
});

test("summary includes configured custom lead fields without replacing structured state", () => {
  const history = [
    { role: "user", text: "Dr Muhammad Ahmad Shoukat ke sath 23 June ko 2 sy 3 bajy k darmyan appointment. Location Lahore." },
  ];
  const latestOrder = {
    recordType: "lead",
    businessFlow: "service",
    serviceName: "Doctor visit",
    customerPhone: "195545134641",
    customFields: {
      "Appointment Date": "23 June",
      "Appointment Time": "2 sy 3 bajy",
      "Preferred Doctor": "Dr Muhammad Ahmad Shoukat",
    },
  };
  const state = extractCustomerOrderState({
    profile: { chatSummary: "Old summary says appointment time missing." },
    history,
    latestOrder,
    configuredFields: [
      { name: "Appointment Date" },
      { name: "Appointment Time" },
      { name: "Preferred Doctor" },
      { name: "Location" },
    ],
  });
  const summary = buildCompleteCustomerSummary({ profile: {}, history, latestOrder, state });

  assert.match(summary, /Appointment Date: 23 June/i);
  assert.match(summary, /Appointment Time: 2 sy 3 bajy/i);
  assert.match(summary, /Preferred Doctor: Dr Muhammad Ahmad Shoukat/i);
  assert.doesNotMatch(summary, /appointment time missing/i);
});

test("confirmed order does not show fulfillment fields as customer pending", () => {
  const latestOrder = {
    orderReferenceNumber: "ORD-55",
    recordStatus: "complete",
    transactionStatus: "Confirmed order",
    customerName: "Ayesha",
    customerPhone: "15811061380",
    productName: "Bike Cover",
    deliveryAddress: "DHA Karachi",
    cityName: "Karachi",
    totalPrice: 1500,
    missingFields: ["Tracking ID", "Status", "Courier Status", "Shipping Charge"],
  };
  const state = extractCustomerOrderState({ profile: { hasPlacedOrder: true }, history: [], latestOrder });
  const summary = buildCompleteCustomerSummary({ profile: {}, history: [], latestOrder, state });

  assert.match(summary, /Status: confirmed/i);
  assert.doesNotMatch(summary, /Next Best Action:[\s\S]*Tracking ID/i);
  assert.doesNotMatch(summary, /Missing:.*Courier Status/i);
  assert.doesNotMatch(summary, /Shipping Charge/i);
});

test("timeline keeps latest real customer question after confirmation", () => {
  const latestOrder = {
    orderReferenceNumber: "ORD-77",
    customerName: "Ali",
    customerPhone: "15811061380",
    productName: "Bike Cover",
    deliveryAddress: "DHA Karachi",
    cityName: "Karachi",
    totalPrice: 1500,
  };
  const history = [
    { role: "model", text: "Order confirmed." },
    { role: "user", text: "Can I change delivery timing to evening?" },
  ];
  const state = extractCustomerOrderState({ profile: { hasPlacedOrder: true }, history, latestOrder });
  const summary = buildCompleteCustomerSummary({ profile: {}, history, latestOrder, state });

  assert.match(summary, /Customer asked\/shared: "Can I change delivery timing to evening\?"/i);
  assert.match(summary, /Product: Bike Cover/i);
  assert.doesNotMatch(summary, /Ask customer what they need/i);
});

test("summary missing info does not override CRM values or instruction-like fields", () => {
  const latestOrder = {
    recordType: "lead",
    businessFlow: "service",
    recordStatus: "incomplete",
    serviceName: "Consultation",
    customerPhone: "15811061380",
    customFields: {
      Gender: "Male",
      "FINAL COMPLETION RULE": "Yes done please",
    },
    missingFields: ["Gender", "FINAL COMPLETION RULE"],
  };
  const state = extractCustomerOrderState({ profile: { chatSummary: "Important missing info: FINAL COMPLETION RULE" }, history: [], latestOrder });
  const summary = buildCompleteCustomerSummary({ profile: {}, history: [], latestOrder, state });

  assert.doesNotMatch(summary, /FINAL COMPLETION RULE/i);
  assert.doesNotMatch(summary, /Important missing info: Gender/i);
});

test("after summary sent the bot does not restart field collection", () => {
  const latestOrder = {
    recordType: "lead",
    businessFlow: "service",
    recordStatus: "incomplete",
    serviceName: "Consultation",
    customerPhone: "15811061380",
    missingFields: ["Preferred Date/Time"],
  };
  const profile = {
    leadOrderSummarySent: true,
    doNotRestartQuestions: true,
    leadOrderFlowState: "awaiting_customer_confirmation",
  };
  const state = extractCustomerOrderState({ profile, history: [{ role: "model", text: "Your appointment details are:" }], latestOrder });
  const summary = buildCompleteCustomerSummary({ profile, history: [{ role: "model", text: "Your appointment details are:" }], latestOrder, state });

  assert.doesNotMatch(summary, /Ask only for Preferred Date\/Time/i);
});

test("after payment requested the bot does not ask booking fields again", () => {
  const latestOrder = {
    recordType: "lead",
    businessFlow: "service",
    recordStatus: "incomplete",
    serviceName: "Consultation",
    customerPhone: "15811061380",
    missingFields: ["Preferred Date/Time", "Location"],
    paymentMethod: "Bank transfer",
  };
  const profile = {
    leadOrderSummarySent: true,
    doNotRestartQuestions: true,
  };
  const history = [{ role: "model", text: "Please share payment screenshot after bank transfer." }];
  const state = extractCustomerOrderState({ profile, history, latestOrder });
  const summary = buildCompleteCustomerSummary({ profile, history, latestOrder, state });

  assert.doesNotMatch(summary, /Ask only for Preferred Date\/Time/i);
  assert.doesNotMatch(summary, /Ask only for Location/i);
});

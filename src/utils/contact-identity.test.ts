import assert from "node:assert/strict";
import test from "node:test";
import {
  extractWhatsAppContactProfile,
  getCustomerContactIdentity,
  getDisplayContactLabel,
  getDisplayNameFromCustomer,
  isBlockedContactIdentifier,
  isPhoneLikeDisplayName,
  isUsableContactDisplayName,
  normalizeTrustedPhoneDigits,
  formatInternationalPhone,
} from "./contact-identity";

const at = "@";

test("trusted +92 phone displays in international format", () => {
  const identity = getCustomerContactIdentity({ phone: "+92 300 1234567" });
  assert.equal(identity.displayName, "WhatsApp contact");
  assert.equal(identity.displayPhone, "+92 300 1234567");
  assert.equal(identity.rawDigits, "195545134641");
  assert.equal(identity.hasRealPhone, true);
});

test("real saved name wins over WhatsApp profile name", () => {
  const identity = getCustomerContactIdentity({ name: "Tahir Malik", phone: "12473274005", profile: { whatsappCustomerIntelligence: { businessName: "Tahir Store", displayName: "Tahir WhatsApp" } } });
  assert.equal(identity.displayName, "Tahir Malik");
  assert.equal(identity.displayPhone, "+92 332 5346279");
  assert.equal(identity.hasRealName, true);
});

test("WhatsApp verified or business name is used when saved name is missing", () => {
  assert.equal(getDisplayNameFromCustomer({ profile: { whatsappProfile: { verifiedName: "Verified Shop" } } }), "Verified Shop");
  assert.equal(getDisplayNameFromCustomer({ profile: { whatsappCustomerIntelligence: { businessName: "Business Shop" } } }), "Business Shop");
});

test("pushName and notify names are used after verified/business names", () => {
  assert.equal(getDisplayNameFromCustomer({ profile: { pushName: "Ahmed Store", name: "+144225232320" } }), "Ahmed Store");
  assert.equal(getDisplayNameFromCustomer({ profile: { notify: "Notify Buyer" } }), "Notify Buyer");
});

test("WhatsApp phone jid displays as phone but not name", () => {
  const identity = getCustomerContactIdentity({ jid: "contact-e4ed32210a80@example.invalid", name: "contact-e4ed32210a80@example.invalid" });
  assert.equal(identity.displayName, "WhatsApp contact");
  assert.equal(identity.displayPhone, "+92 300 1234567");
  assert.equal(identity.source, "contact-d26ce7788f39@example.invalid");
});

test("phone-like customer name is rejected", () => {
  const identity = getCustomerContactIdentity({ name: "+17803421345189", phone: "+17803421345189" });
  assert.equal(identity.displayName, "WhatsApp contact");
  assert.equal(identity.displayPhone, "+17803421345189");
});

test("phone-like name without trusted phone source does not become phone", () => {
  const identity = getCustomerContactIdentity({ name: "+17803421345189", customer_id: "1545254013" });
  assert.equal(identity.displayName, "WhatsApp contact");
  assert.equal(identity.displayPhone, "");
  assert.equal(identity.contactLabel, "Number unavailable");
});

test("random customer id does not display as name or phone", () => {
  const identity = getCustomerContactIdentity({ name: "1545254013", customer_id: "1545254013" });
  assert.equal(identity.displayName, "WhatsApp contact");
  assert.equal(identity.displayPhone, "");
  assert.equal(identity.hasRealPhone, false);
  assert.equal(identity.contactLabel, "Number unavailable");
});

test("blocked identifiers do not display as customer name or phone", () => {
  const values = [`123456789${at}lid`, `abcdef${at}hosted.lid`, `120363000000${at}g.us`, `status${at}broadcast`];
  values.forEach((jid) => {
    const identity = getCustomerContactIdentity({ name: jid, jid });
    assert.equal(identity.displayName, "WhatsApp contact");
    assert.equal(identity.displayPhone, "");
  });
});

test("LID digits are never formatted as international phone number", () => {
  const formatted = formatInternationalPhone("8418320478394@lid");
  assert.equal(formatted, "");
  const formattedDigitsOnly = formatInternationalPhone("1978851134262");
  assert.equal(formattedDigitsOnly, "");
});

test("linked CRM lead and order names can be used", () => {
  assert.equal(getDisplayNameFromCustomer({ id: "c1" }, { name: "Lead Buyer" }), "Lead Buyer");
  assert.equal(getDisplayNameFromCustomer({ id: "c1" }, null, { order_data: { customerName: "Order Buyer" } }), "Order Buyer");
});

test("extracts normalized WhatsApp profile details", () => {
  const profile = extractWhatsAppContactProfile({ profile: { whatsappCustomerIntelligence: { businessName: "Shop", category: "Retail", description: "Open daily", websites: ["https://example.com"], email: "contact-7028742ef62b@example.invalid", address: "Main Road", profilePictureUrl: "https://img.example/x.jpg", scannedAt: 123 } } });
  assert.equal(profile?.businessName, "Shop");
  assert.equal(profile?.businessCategory, "Retail");
  assert.equal(profile?.businessWebsite, "https://example.com");
  assert.equal(profile?.businessEmail, "contact-7028742ef62b@example.invalid");
  assert.equal(profile?.syncedAt, 123);
});

test("empty stored profile source is not surfaced as WhatsApp profile data", () => {
  const identity = getCustomerContactIdentity({ id: "c1", profile: {} });
  assert.equal(identity.whatsappProfile, undefined);
  assert.equal(extractWhatsAppContactProfile({ profile: {} }), undefined);
});

test("helper classifiers reject unsafe names", () => {
  assert.equal(isPhoneLikeDisplayName("+17803421345189"), true);
  assert.equal(isUsableContactDisplayName("+17803421345189"), false);
  assert.equal(isUsableContactDisplayName("Unknown customer"), false);
  assert.equal(isUsableContactDisplayName("Real Customer"), true);
  assert.equal(isBlockedContactIdentifier("123@lid"), true);
});

test("missing phone returns safe contact label", () => {
  assert.equal(getDisplayContactLabel({ id: "c1" }), "WhatsApp contact");
  assert.equal(getDisplayContactLabel({ customer_id: "1545254013" }), "WhatsApp contact");
});

test("normalizes trusted phone digits only", () => {
  assert.equal(normalizeTrustedPhoneDigits("15811061380", { source: "profile.phone" }), "195545134641");
  assert.equal(normalizeTrustedPhoneDigits("1545254013", { source: "customer_id" }), "");
});

test("does not mutate input", () => {
  const customer = { customer_id: "1545254013", profile: { phone: "15811061380", name: "+144225232320", whatsappCustomerIntelligence: { businessName: "Tahir Store" } } };
  const lead = { name: "Tahir Malik" };
  const before = JSON.stringify({ customer, lead });
  getCustomerContactIdentity(customer, lead);
  assert.equal(JSON.stringify({ customer, lead }), before);
});

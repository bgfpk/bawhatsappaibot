import test from "node:test";
import assert from "node:assert/strict";

import {
  createDepartment,
  listDepartments,
  updateDepartment,
  deleteDepartment,
  loadLeadRoutingSettings,
  saveLeadRoutingSettings,
  resolveCustomerPhoneState,
  extractAndValidatePhoneFromText,
  recordCustomerProvidedPhone,
  triggerAutomaticCustomerLeadRouting,
  checkAndContinueCustomerLeadRouting,
  forwardLeadToDepartment,
  listRecentRoutingAudits,
  getPendingLeadRoutingState,
  clearPendingLeadRoutingState,
  __setLeadRoutingTestDeps,
  __resetLeadRoutingTestDeps,
} from "./department-lead-routing-service.ts";

const tenantAlpha = "acc_alpha_enterprise";
const tenantBeta = "acc_beta_retail";

test.beforeEach(() => {
  __resetLeadRoutingTestDeps();
});

// ===========================================================================
// REQUIREMENT 1, 2, 7 & 9: Full Inbound Customer Lead Pipeline Integration
// ===========================================================================

test("Full Customer Pipeline: Non-English LID customer -> Lead qualified -> Phone requested naturally -> Continuation on reply -> Forwarded once via WhatsApp", async () => {
  const customerLid = "77665544332211@lid";
  const botId = "bot_custom_couture";

  // 1. Configure Departments on authoritative storage for tenantAlpha
  await saveLeadRoutingSettings(tenantAlpha, {
    departments: [],
    autoForwardOnConfirmation: true,
  });

  const bridalDept = await createDepartment(tenantAlpha, {
    name: "Bridal Couture & Custom Orders",
    description: "Handles bridal wear, bespoke custom dresses, luxury embroidery, bridal appointments and tailored quotes.",
    whatsappNumber: "+137446225728",
    isFallback: false,
  });

  const readyToWearDept = await createDepartment(tenantAlpha, {
    name: "Ready-to-Wear Casuals",
    description: "Handles off-the-rack casual kurtas, pret collection, standard sizing and exchanges.",
    whatsappNumber: "+150333823501",
    isFallback: false,
  });

  const generalDept = await createDepartment(tenantAlpha, {
    name: "Customer Support & Inquiries",
    description: "General support, store timings, order tracking, and fallback inquiries.",
    whatsappNumber: "+120494907783",
    isFallback: true,
  });

  assert.ok(bridalDept.id);
  assert.ok(readyToWearDept.id);
  assert.ok(generalDept.id);

  // 2. Track real WhatsApp socket messages sent
  const sentCustomerReplies: string[] = [];
  const sentDepartmentForwards: Array<{ destination: string; message: string }> = [];

  const mockSock = {
    sendMessage: async (jid: string, content: { text: string }) => {
      if (jid === customerLid) {
        sentCustomerReplies.push(content.text);
      } else {
        sentDepartmentForwards.push({ destination: jid, message: content.text });
      }
      return { key: { id: `msg_wa_${Date.now()}_${Math.random()}` } };
    },
  };

  // Mock AI Department Classification (DeepInfra/Gemini structured classification)
  __setLeadRoutingTestDeps({
    generateBackendText: (async (params: any) => {
      // Semantic classification matches "bridal lehenga" to bridalDept
      return {
        requestStatus: "success",
        text: JSON.stringify({
          matchedDepartmentId: bridalDept.id,
          matchedDepartmentName: bridalDept.name,
          confidence: 0.96,
          reasoning: "Customer is asking for custom bridal lehenga stitching with bespoke hand embroidery.",
        }),
      } as any;
    }) as any,
  });

  // -------------------------------------------------------------------------
  // STEP 1: Non-English customer has conversation, lead becomes confirmed/qualified
  // Sender identity is LID (untrusted, no phone in JID)
  // -------------------------------------------------------------------------
  const nonEnglishCustomerTurn = {
    customerJid: customerLid,
    customerLanguage: "roman_urdu" as const,
    leadId: "lead_bridal_001",
    leadData: {
      id: "lead_bridal_001",
      customerName: "Zainab Khan",
      item: "Bridal Red Velvet Lehenga with Zardozi Work",
      budget: "PKR 250,000",
      eventDate: "15 December 2026",
      requirements: "Full bespoke stitching with hand zardozi and dupatta setting.",
    },
    chatHistory: [
      { role: "user", text: "Assalam o alaikum, mujhe apni shadi ke liye bridal lehenga design karwana hai." },
      { role: "assistant", text: "Wa alaikum assalam! Bohat mubarak ho. Hum custom bridal lehengas design karte hain." },
      { role: "user", text: "Mera budget 2.5 lakh hai aur event 15 December ko hai. Please order confirm kar lein." },
    ],
  };

  // Automated trigger called upon lead confirmation in real pipeline (ai-handler.ts save_lead)
  const triggerResult = await triggerAutomaticCustomerLeadRouting({
    accountId: tenantAlpha,
    botId,
    sock: mockSock,
    leadId: nonEnglishCustomerTurn.leadId,
    customerJid: nonEnglishCustomerTurn.customerJid,
    leadData: nonEnglishCustomerTurn.leadData,
    chatHistory: nonEnglishCustomerTurn.chatHistory,
    customerLanguage: nonEnglishCustomerTurn.customerLanguage,
    countryContext: { defaultCountryCode: "PK" },
  });

  // PROOF: Phone is missing (LID). System must naturally prompt customer for contact number.
  assert.equal(triggerResult.handled, true);
  assert.equal(triggerResult.status, "phone_requested");
  assert.equal(sentCustomerReplies.length, 1);
  assert.ok(
    sentCustomerReplies[0].includes("contact number nahi mil raha") ||
    sentCustomerReplies[0].includes("phone number share kar dein"),
    `Must send natural phone prompt in customer's Roman Urdu language. Sent: ${sentCustomerReplies[0]}`
  );
  // PROOF: Department is NOT forwarded yet because phone is pending
  assert.equal(sentDepartmentForwards.length, 0);

  // PROOF: Continuation state is persisted in memory/DB across turns
  const pendingState = getPendingLeadRoutingState(customerLid);
  assert.ok(pendingState, "Pending routing state must be saved across turns");
  assert.equal(pendingState?.leadId, "lead_bridal_001");
  assert.equal(pendingState?.leadData?.customerName, "Zainab Khan");

  // -------------------------------------------------------------------------
  // STEP 2: NUMBER REQUEST CONTINUATION ACROSS MESSAGES
  // Customer replies later with their phone number without repeating their requirements
  // -------------------------------------------------------------------------
  const customerReplyText = "Mera contact number 0300 9876543 hai, WhatsApp pe baat kar lein.";

  const continuationResult = await checkAndContinueCustomerLeadRouting({
    accountId: tenantAlpha,
    botId,
    sock: mockSock,
    customerJid: customerLid,
    text: customerReplyText,
    countryContext: { defaultCountryCode: "PK" },
  });

  // PROOF: System recognized continuation of pending lead-routing task
  assert.equal(continuationResult.isContinuation, true);
  assert.equal(continuationResult.handled, true);
  assert.equal(continuationResult.phoneExtracted, "+120585453443");
  assert.equal(continuationResult.routingStatus, "forwarded");

  // PROOF: Customer phone stored without overwriting raw LID JID transport
  const resolvedPhone = resolveCustomerPhoneState({ customerJid: customerLid });
  assert.equal(resolvedPhone.hasTrustedPhone, true);
  assert.equal(resolvedPhone.contactPhoneNormalized, "+120585453443");
  assert.equal(resolvedPhone.contactPhoneSource, "customer_provided");
  assert.equal(resolvedPhone.customerJid, customerLid);

  // PROOF: Lead forwarded to correct semantic department exactly once
  assert.equal(sentDepartmentForwards.length, 1);
  assert.ok(sentDepartmentForwards[0].destination.includes("157311815005"));
  assert.ok(sentDepartmentForwards[0].message.toLowerCase().includes("new qualified lead"));
  assert.ok(sentDepartmentForwards[0].message.includes("Bridal Couture & Custom Orders"));
  assert.ok(sentDepartmentForwards[0].message.includes("Zainab Khan"));
  assert.ok(sentDepartmentForwards[0].message.includes("+120585453443"));
  assert.ok(sentDepartmentForwards[0].message.includes("PKR 250,000"));

  // PROOF: Customer receives grounded handoff acknowledgement in their language
  assert.equal(sentCustomerReplies.length, 2);
  assert.ok(
    sentCustomerReplies[1].includes("Bridal Couture & Custom Orders") ||
    sentCustomerReplies[1].includes("team ko forward kar di hai"),
    `Must send grounded confirmation to customer. Sent: ${sentCustomerReplies[1]}`
  );

  // PROOF: Pending state is cleared once forwarded
  assert.equal(getPendingLeadRoutingState(customerLid), undefined);

  // -------------------------------------------------------------------------
  // STEP 3: IDEMPOTENCY PROOF (No duplicate forwarding)
  // -------------------------------------------------------------------------
  const duplicateForward = await forwardLeadToDepartment({
    accountId: tenantAlpha,
    botId,
    sock: mockSock,
    leadId: "lead_bridal_001",
    departmentId: bridalDept.id,
    customerJid: customerLid,
    customerPhone: "+120585453443",
    leadName: "Zainab Khan",
    summaryText: "Duplicate attempt summary",
  });

  assert.equal(duplicateForward.status, "duplicate");
  assert.equal(duplicateForward.delivered, false);
  // Department forward count must remain strictly 1
  assert.equal(sentDepartmentForwards.length, 1);

  // PROOF: Audits persisted and viewable
  const audits = listRecentRoutingAudits(tenantAlpha);
  assert.ok(audits.length >= 1);
  assert.equal(audits[0].leadId, "lead_bridal_001");
  assert.equal(audits[0].status, "forwarded");
  assert.equal(audits[0].customerPhone, "+120585453443");
});

// ===========================================================================
// REQUIREMENT 6: Safe Global Phone Handling (No Blind Pakistan Assumptions)
// ===========================================================================

test("Global Phone Handling: International numbers normalized correctly, unknown local numbers prompt for country code, and LID rejected", () => {
  // 1. United States (+1)
  const usRes = extractAndValidatePhoneFromText("Please call our US office at +1 (415) 555-2671");
  assert.equal(usRes.found, true);
  assert.equal(usRes.isValid, true);
  assert.equal(usRes.normalized, "+12168804416");

  // 2. United Kingdom (+44)
  const ukRes = extractAndValidatePhoneFromText("Contact number is +44 7911 123456");
  assert.equal(ukRes.found, true);
  assert.equal(ukRes.isValid, true);
  assert.equal(ukRes.normalized, "+120118029347");

  // 3. United Arab Emirates (+971)
  const uaeRes = extractAndValidatePhoneFromText("Reach me in Dubai on +971 50 123 4567");
  assert.equal(uaeRes.found, true);
  assert.equal(uaeRes.isValid, true);
  assert.equal(uaeRes.normalized, "+152360205746");

  // 4. Local UK number with UK authoritative context
  const ukLocal = extractAndValidatePhoneFromText("My mobile is 07911 123456", { defaultCountryCode: "GB" });
  assert.equal(ukLocal.found, true);
  assert.equal(ukLocal.isValid, true);
  assert.equal(ukLocal.normalized, "+120118029347");

  // 5. Local Australian number with AU authoritative context
  const auLocal = extractAndValidatePhoneFromText("Call me on 0412 345 678", { defaultCountryCode: "AU" });
  assert.equal(auLocal.found, true);
  assert.equal(auLocal.isValid, true);
  assert.equal(auLocal.normalized, "+11265305403");

  // 6. Local number with NO authoritative country context:
  // MUST NOT blindly guess Pakistan! Must safely prompt for international format.
  const unknownCountryLocal = extractAndValidatePhoneFromText("My number is 0300 1234567");
  assert.equal(unknownCountryLocal.found, true);
  assert.equal(unknownCountryLocal.isValid, false);
  assert.ok(unknownCountryLocal.error?.includes("international country code"));
  assert.equal(unknownCountryLocal.raw, "0300 1234567");

  // 7. Rejection of WhatsApp internal LID identifiers as telephone numbers
  const lid1 = extractAndValidatePhoneFromText("My id is 123456789012345@lid");
  assert.equal(lid1.isValid, false);

  // 8. Rejection of fake repeated digits
  const fakeDigits = extractAndValidatePhoneFromText("phone is +1 11111111111");
  assert.equal(fakeDigits.isValid, false);

  // 9. Customer explicit refusal
  const refused = extractAndValidatePhoneFromText("I will not share my number with you");
  assert.equal(refused.found, false);
  assert.equal(refused.error, "customer_refused");
});

// ===========================================================================
// REQUIREMENT 8: Department Settings Persistence & Tenant Isolation
// ===========================================================================

test("Department Settings Persistence: CRUD operations survive and enforce tenant isolation", async () => {
  // Clear tenants
  await saveLeadRoutingSettings(tenantAlpha, { departments: [] });
  await saveLeadRoutingSettings(tenantBeta, { departments: [] });

  // 1. Tenant Alpha creates department
  const alphaDept = await createDepartment(tenantAlpha, {
    name: "Alpha Sales",
    description: "Enterprise sales for Tenant Alpha.",
    whatsappNumber: "+12168804416",
  });
  assert.ok(alphaDept.id);

  // 2. Tenant Beta creates department
  const betaDept = await createDepartment(tenantBeta, {
    name: "Beta Support",
    description: "Customer service for Tenant Beta.",
    whatsappNumber: "+120118029347",
  });
  assert.ok(betaDept.id);

  // 3. Verify Tenant Isolation (Tenant Alpha does NOT see Tenant Beta's departments)
  const alphaList = await listDepartments(tenantAlpha);
  assert.equal(alphaList.length, 1);
  assert.equal(alphaList[0].name, "Alpha Sales");

  const betaList = await listDepartments(tenantBeta);
  assert.equal(betaList.length, 1);
  assert.equal(betaList[0].name, "Beta Support");

  // 4. Update department in Tenant Alpha
  const updatedAlpha = await updateDepartment(tenantAlpha, alphaDept.id, {
    description: "Updated B2B Enterprise sales description.",
    enabled: false,
  });
  assert.equal(updatedAlpha.description, "Updated B2B Enterprise sales description.");
  assert.equal(updatedAlpha.enabled, false);

  // 5. Cross-tenant update blocked
  await assert.rejects(
    async () => {
      await updateDepartment(tenantBeta, alphaDept.id, { name: "Hacked" });
    },
    /not found/i
  );

  // 6. Delete department in Tenant Alpha
  const deleted = await deleteDepartment(tenantAlpha, alphaDept.id);
  assert.equal(deleted, true);

  const alphaAfterDelete = await listDepartments(tenantAlpha);
  assert.equal(alphaAfterDelete.length, 0);

  // Tenant Beta remains untouched
  const betaAfterAlphaDelete = await listDepartments(tenantBeta);
  assert.equal(betaAfterAlphaDelete.length, 1);
});

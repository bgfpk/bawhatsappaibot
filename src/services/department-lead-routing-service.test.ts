import test from "node:test";
import assert from "node:assert/strict";

import {
  createDepartment,
  getDepartment,
  listDepartments,
  updateDepartment,
  deleteDepartment,
  getFallbackDepartment,
  validateDepartmentPhone,
  loadLeadRoutingSettings,
  saveLeadRoutingSettings,
  resolveCustomerPhoneState,
  buildNaturalCustomerPhoneRequest,
  extractAndValidatePhoneFromText,
  recordCustomerProvidedPhone,
  markPhoneRequested,
  classifyLeadDepartment,
  buildGroundedLeadSummary,
  buildCustomerHandoffAcknowledgement,
  forwardLeadToDepartment,
  reassignLeadDepartment,
  listAuditRecords,
  __setLeadRoutingTestDeps,
  __resetLeadRoutingTestDeps,
} from "./department-lead-routing-service.ts";

const tenantA = "acc_tenant_alpha";
const tenantB = "acc_tenant_beta";

test.beforeEach(() => {
  __resetLeadRoutingTestDeps();
});

// ===========================================================================
// SECTION 1: Department Management, Phone Validation & Tenant Isolation
// ===========================================================================

test("Department Phone Validation: Rejects LID, malformed numbers, and repeated digits", () => {
  // 1. LID rejection
  const lidRes1 = validateDepartmentPhone("123456789@lid");
  assert.equal(lidRes1.valid, false);
  assert.ok(lidRes1.error?.includes("LID cannot be used"));

  const lidRes2 = validateDepartmentPhone("contact-b770e82941be@example.invalid");
  assert.equal(lidRes2.valid, false);

  // 2. Too short / too long
  const shortRes = validateDepartmentPhone("12345");
  assert.equal(shortRes.valid, false);
  assert.ok(shortRes.error?.includes("between 8 and 15 digits"));

  const longRes = validateDepartmentPhone("12345678901234567890");
  assert.equal(longRes.valid, false);

  // 3. Repeated fake digits
  const fakeRes = validateDepartmentPhone("1843924184");
  assert.equal(fakeRes.valid, false);
  assert.ok(fakeRes.error?.includes("repeated digits"));

  // 4. Valid Pakistani format
  const pkRes1 = validateDepartmentPhone("15811061380");
  assert.equal(pkRes1.valid, true);
  assert.equal(pkRes1.normalized, "+144225232320");

  // 5. Valid International format
  const usRes = validateDepartmentPhone("+12168804416");
  assert.equal(usRes.valid, true);
  assert.equal(usRes.normalized, "+12168804416");
});

test("Department CRUD & Strict Tenant Isolation", async () => {
  // Clear any existing settings
  await saveLeadRoutingSettings(tenantA, { departments: [] });
  await saveLeadRoutingSettings(tenantB, { departments: [] });

  // 1. Tenant A creates Sales and Support
  const deptA1 = await createDepartment(tenantA, {
    name: "Enterprise Sales",
    description: "Handles B2B contracts, bulk orders, and commercial pricing.",
    whatsappNumber: "+126724984593",
    isFallback: false,
  });
  assert.ok(deptA1.id);
  assert.equal(deptA1.accountId, tenantA);
  assert.equal(deptA1.whatsappNumberNormalized, "+126724984593");

  const deptA2 = await createDepartment(tenantA, {
    name: "General Inquiries",
    description: "Handles customer support, order tracking, and general help.",
    whatsappNumber: "+151929803453",
    isFallback: true,
  });
  assert.equal(deptA2.isFallback, true);

  // 2. Tenant B creates department with same name
  const deptB1 = await createDepartment(tenantB, {
    name: "Enterprise Sales",
    description: "Tenant B Sales team.",
    whatsappNumber: "+106020900763",
  });
  assert.equal(deptB1.accountId, tenantB);

  // 3. Isolation checks: Tenant A does NOT see Tenant B departments
  const listA = await listDepartments(tenantA);
  assert.equal(listA.length, 2);
  assert.ok(listA.every((d) => d.accountId === tenantA));
  assert.ok(!listA.some((d) => d.whatsappNumberNormalized === "+106020900763"));

  const listB = await listDepartments(tenantB);
  assert.equal(listB.length, 1);
  assert.equal(listB[0].accountId, tenantB);

  // 4. Update Department
  const updatedA1 = await updateDepartment(tenantA, deptA1.id, {
    description: "Updated description for B2B contracts and quotes.",
  });
  assert.equal(updatedA1.description, "Updated description for B2B contracts and quotes.");

  // 5. Tenant B cannot update Tenant A's department
  await assert.rejects(
    async () => {
      await updateDepartment(tenantB, deptA1.id, { name: "Hacked" });
    },
    /not found/
  );

  // 6. Fallback resolution
  const fallbackA = await getFallbackDepartment(tenantA);
  assert.ok(fallbackA);
  assert.equal(fallbackA?.id, deptA2.id);

  // 7. Delete Department
  const deleted = await deleteDepartment(tenantA, deptA1.id);
  assert.equal(deleted, true);
  const remainingA = await listDepartments(tenantA);
  assert.equal(remainingA.length, 1);
  assert.equal(remainingA[0].id, deptA2.id);
});

// ===========================================================================
// SECTION 2: Customer Phone Recovery, LID Detection & Natural Extraction
// ===========================================================================

test("Customer Phone Resolver: Distinguishes trusted phone from LID and prevents duplicate requests", () => {
  // Case 1: Trusted phone available -> hasTrustedPhone = true
  const trustedState = resolveCustomerPhoneState({
    customerJid: "contact-e4ed32210a80@example.invalid",
  });
  assert.equal(trustedState.hasTrustedPhone, true);
  assert.equal(trustedState.contactPhoneNormalized, "+144225232320");
  assert.equal(trustedState.contactPhoneSource, "whatsapp_verified");

  // Case 2: Untrusted LID identity -> hasTrustedPhone = false
  const lidJid = "123456789012345@lid";
  const lidState = resolveCustomerPhoneState({
    customerJid: lidJid,
  });
  assert.equal(lidState.hasTrustedPhone, false);
  assert.equal(lidState.contactPhoneNormalized, undefined);
  assert.equal(lidState.contactPhoneSource, "none");

  // Case 3: Mark phone requested -> phoneRequestedAt persisted
  markPhoneRequested(lidJid);
  const requestedState = resolveCustomerPhoneState({ customerJid: lidJid });
  assert.ok(requestedState.phoneRequestedAt);

  // Case 4: Once customer provides valid phone -> stored separately without mutating raw LID
  recordCustomerProvidedPhone(lidJid, "My contact number is +92 321 9876543 please");
  const providedState = resolveCustomerPhoneState({ customerJid: lidJid });
  assert.equal(providedState.hasTrustedPhone, true);
  assert.equal(providedState.contactPhoneNormalized, "+125938240941");
  assert.equal(providedState.contactPhoneSource, "customer_provided");
  assert.equal(providedState.contactPhoneVerifiedOrCustomerProvided, true);
  // Raw WhatsApp JID remains untouched LID
  assert.equal(providedState.customerJid, lidJid);
});

test("Customer Phone Request: Generates natural language in customer's language", () => {
  const enReq = buildNaturalCustomerPhoneRequest("en");
  assert.ok(enReq.includes("I can't access your contact number from this chat"));
  assert.ok(enReq.includes("best WhatsApp or contact number"));

  const urReq = buildNaturalCustomerPhoneRequest("ur");
  assert.ok(urReq.includes("contact number nahi mil raha"));
  assert.ok(urReq.includes("apna WhatsApp ya phone number share kar dein"));

  const romanReq = buildNaturalCustomerPhoneRequest("roman_urdu");
  assert.ok(romanReq.includes("contact number nahi mil raha"));

  const arReq = buildNaturalCustomerPhoneRequest("ar");
  assert.ok(arReq.includes("لا يمكنني الوصول إلى رقم الاتصال"));

  const hiReq = buildNaturalCustomerPhoneRequest("hi");
  assert.ok(hiReq.includes("मुझे इस चैट से आपका संपर्क नंबर नहीं मिल रहा है"));
});

test("Phone Extraction & Validation: Handles natural sentences, spaces, hyphens, and refusals", () => {
  // 1. Natural sentence with international prefix
  const ex1 = extractAndValidatePhoneFromText("Sure, you can reach me at +92 300 1234567 thanks!");
  assert.equal(ex1.found, true);
  assert.equal(ex1.isValid, true);
  assert.equal(ex1.normalized, "+144225232320");

  // 2. Hyphenated Pakistani standard with authoritative country context
  const ex2 = extractAndValidatePhoneFromText("Number is 0321-7654321", { defaultCountryCode: "PK" });
  assert.equal(ex2.found, true);
  assert.equal(ex2.isValid, true);
  assert.equal(ex2.normalized, "+149350255877");

  // 2b. Local number with unknown country context asks for international format safely
  const exUnknown = extractAndValidatePhoneFromText("Number is 0321-7654321");
  assert.equal(exUnknown.found, true);
  assert.equal(exUnknown.isValid, false);
  assert.ok(exUnknown.error?.includes("international country code"));

  // 3. International US number surrounded by text
  const ex3 = extractAndValidatePhoneFromText("Call my office at +1 (415) 555-2671 anytime");
  assert.equal(ex3.found, true);
  assert.equal(ex3.isValid, true);
  assert.equal(ex3.normalized, "+12168804416");

  // 4. Repeated fake digits
  const ex4 = extractAndValidatePhoneFromText("my number is 00000000000");
  assert.equal(ex4.isValid, false);

  // 5. Explicit customer refusal
  const ex5 = extractAndValidatePhoneFromText("No, I won't share my personal number");
  assert.equal(ex5.found, false);
  assert.equal(ex5.error, "customer_refused");

  const ex6 = extractAndValidatePhoneFromText("number nahi dena");
  assert.equal(ex6.found, false);
  assert.equal(ex6.error, "customer_refused");

  // Refusal recorded in state
  const refusedState = recordCustomerProvidedPhone("refusal_cust@lid", "nahi bata sakta", true);
  assert.equal(refusedState.customerRefusedPhone, true);
  assert.equal(refusedState.hasTrustedPhone, false);
});

// ===========================================================================
// SECTION 3: Semantic AI Department Classification Across Languages
// ===========================================================================

test("Multilingual Intent: Classifies equivalent intent in English, Urdu, and Arabic to same department", async () => {
  await saveLeadRoutingSettings(tenantA, {
    departments: [
      {
        id: "dept_sales_101",
        accountId: tenantA,
        name: "Enterprise Sales",
        description: "Handles B2B volume pricing, wholesale purchasing, enterprise quotes, and bulk orders.",
        whatsappNumber: "+126724984593",
        whatsappNumberNormalized: "+126724984593",
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "dept_support_102",
        accountId: tenantA,
        name: "Technical Support",
        description: "Handles software bugs, API errors, integration problems, and technical troubleshooting.",
        whatsappNumber: "+151929803453",
        whatsappNumberNormalized: "+151929803453",
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  });

  // Mock AI classification to respond semantically for English, Urdu, and Arabic
  let lastPrompt = "";
  __setLeadRoutingTestDeps({
    generateBackendText: async (params: any) => {
      lastPrompt = params.messages[1].content;
      // Both English wholesale, Urdu bulk order, and Arabic wholesale pricing map to dept_sales_101
      return {
        requestStatus: "success",
        text: JSON.stringify({
          departmentId: "dept_sales_101",
          confidence: 0.95,
          reasoning: "Customer wants enterprise bulk pricing and wholesale catalog",
          summary: "Customer requested pricing for 500 units B2B shipment",
        }),
      } as any;
    },
  });

  // 1. English conversation
  const resEn = await classifyLeadDepartment({
    accountId: tenantA,
    customerConversation: "Hi, we are looking to buy 500 units for our retail chain. Can we get wholesale enterprise pricing?",
    customerIntent: "bulk wholesale purchase",
  });
  assert.equal(resEn.departmentId, "dept_sales_101");
  assert.equal(resEn.departmentName, "Enterprise Sales");
  assert.equal(resEn.status, "ready");

  // 2. Urdu conversation
  const resUr = await classifyLeadDepartment({
    accountId: tenantA,
    customerConversation: "Hamein 500 units chahiye apni dukan k liye. Wholesale rate aur B2B discount milega?",
    customerIntent: "wholesale rate",
  });
  assert.equal(resUr.departmentId, "dept_sales_101");
  assert.equal(resUr.departmentName, "Enterprise Sales");
  assert.equal(resUr.status, "ready");

  // 3. Arabic conversation
  const resAr = await classifyLeadDepartment({
    accountId: tenantA,
    customerConversation: "مرحباً، نريد شراء 500 قطعة لمتاجرنا. هل يمكن الحصول على أسعار الجملة للشركات؟",
    customerIntent: "أسعار الجملة",
  });
  assert.equal(resAr.departmentId, "dept_sales_101");
  assert.equal(resAr.departmentName, "Enterprise Sales");
  assert.equal(resAr.status, "ready");
});

test("Low Confidence & Fallback Handling: Routes to Fallback or Unassigned safely", async () => {
  await saveLeadRoutingSettings(tenantA, {
    departments: [
      {
        id: "dept_spec_1",
        accountId: tenantA,
        name: "Specialized Equipment",
        description: "Handles heavy industrial machinery only.",
        whatsappNumber: "+126724984593",
        whatsappNumberNormalized: "+126724984593",
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "dept_fallback_2",
        accountId: tenantA,
        name: "General Front Desk",
        description: "Default reception for unassigned inquiries.",
        whatsappNumber: "+146509172358",
        whatsappNumberNormalized: "+146509172358",
        enabled: true,
        isFallback: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    fallbackDepartmentId: "dept_fallback_2",
  });

  // Mock low confidence (< 0.7)
  __setLeadRoutingTestDeps({
    generateBackendText: async () => ({
      requestStatus: "success",
      text: JSON.stringify({
        departmentId: "dept_spec_1",
        confidence: 0.45,
        reasoning: "Ambiguous query with low confidence",
        summary: "Customer asked a vague question about services",
      }),
    } as any),
  });

  const lowConfRes = await classifyLeadDepartment({
    accountId: tenantA,
    customerConversation: "I have a random question about your location.",
  });
  assert.equal(lowConfRes.status, "low_confidence_fallback");
  assert.equal(lowConfRes.departmentId, "dept_fallback_2");
  assert.equal(lowConfRes.departmentName, "General Front Desk");
  assert.equal(lowConfRes.isFallback, true);

  // If fallback department is removed, unassigned status returned
  await saveLeadRoutingSettings(tenantA, {
    departments: [
      {
        id: "dept_spec_1",
        accountId: tenantA,
        name: "Specialized Equipment",
        description: "Handles heavy industrial machinery only.",
        whatsappNumber: "+126724984593",
        whatsappNumberNormalized: "+126724984593",
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  });

  const unassignedRes = await classifyLeadDepartment({
    accountId: tenantA,
    customerConversation: "Just checking in.",
  });
  assert.equal(unassignedRes.status, "ready"); // Only 1 dept configured -> routes to that single dept
});

// ===========================================================================
// SECTION 4: Idempotent Forwarding, Grounded Summary & Audit Records
// ===========================================================================

test("Lead Forwarding: Grounded summary generation, idempotency, and audit trail", async () => {
  await saveLeadRoutingSettings(tenantA, {
    departments: [
      {
        id: "dept_vip_sales",
        accountId: tenantA,
        name: "VIP Sales",
        description: "Luxury clients and custom enterprise orders.",
        whatsappNumber: "+124645955732",
        whatsappNumberNormalized: "+124645955732",
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  });

  let outboundCallCount = 0;
  let sentPayload: any = null;

  __setLeadRoutingTestDeps({
    generateBackendText: async () => ({
      requestStatus: "success",
      text: JSON.stringify({
        departmentId: "dept_vip_sales",
        confidence: 0.95,
        reasoning: "Customer requested high-end corporate packages",
        summary: "Lead requested 100 customized VIP gift boxes for corporate anniversary",
      }),
    } as any),
    sendUniversalOutboundText: async (params: any) => {
      outboundCallCount++;
      sentPayload = params;
      return { status: "sent", messageId: `msg_fwd_${outboundCallCount}` };
    },
  });

  // Turn 1: Forward lead
  const fwd1 = await forwardLeadToDepartment({
    accountId: tenantA,
    botId: "bot_123",
    leadId: "lead_999",
    customerJid: "contact-6cd75ce03039@example.invalid",
    customerPhone: "+199420886635",
    leadName: "Director Tariq",
    customerConversation: "We need 100 VIP customized boxes for our corporate summit next week.",
    forcedDepartmentId: "dept_vip_sales",
    initiatedBy: "ai_auto",
  });

  assert.equal(fwd1.success, true);
  assert.equal(fwd1.status, "forwarded");
  assert.equal(outboundCallCount, 1);
  assert.ok(sentPayload.messageText.includes("Director Tariq"));
  assert.ok(sentPayload.messageText.includes("+199420886635"));
  assert.ok(sentPayload.messageText.includes("VIP Sales"));
  assert.ok(fwd1.customerReplyText.includes("VIP Sales"));

  // Verify Audit record was saved
  const audits = listAuditRecords(tenantA);
  const auditRec = audits.find((a) => a.leadId === "lead_999");
  assert.ok(auditRec);
  assert.equal(auditRec?.status, "forwarded");
  assert.equal(auditRec?.departmentName, "VIP Sales");

  // Turn 2: Duplicate forwarding call for SAME lead & SAME department
  // IDEMPOTENCY: Must NOT send duplicate WhatsApp message
  const fwd2 = await forwardLeadToDepartment({
    accountId: tenantA,
    botId: "bot_123",
    leadId: "lead_999",
    customerJid: "contact-6cd75ce03039@example.invalid",
    customerPhone: "+199420886635",
    leadName: "Director Tariq",
    customerConversation: "We need 100 VIP customized boxes for our corporate summit next week.",
    forcedDepartmentId: "dept_vip_sales",
    initiatedBy: "ai_auto",
  });

  assert.equal(fwd2.success, true);
  assert.equal(fwd2.isDuplicate, true);
  // Send count remains 1! No duplicate WhatsApp notification sent
  assert.equal(outboundCallCount, 1);
});

test("Manual Reassignment: Admin overrides AI department and logs history", async () => {
  await saveLeadRoutingSettings(tenantA, {
    departments: [
      {
        id: "dept_general",
        accountId: tenantA,
        name: "General Inquiries",
        description: "General questions.",
        whatsappNumber: "+126724984593",
        whatsappNumberNormalized: "+126724984593",
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "dept_urgent_quotes",
        accountId: tenantA,
        name: "Urgent Quotes",
        description: "Priority enterprise quotes.",
        whatsappNumber: "+111212375451",
        whatsappNumberNormalized: "+111212375451",
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  });

  __setLeadRoutingTestDeps({
    sendUniversalOutboundText: async () => ({ status: "sent", messageId: "msg_reassign_123" }),
  });

  // Reassign to Urgent Quotes
  const reassignRes = await reassignLeadDepartment(
    tenantA,
    "bot_123",
    "lead_456",
    "dept_urgent_quotes",
    "owner",
    "High priority commercial lead requires fast quote"
  );

  assert.equal(reassignRes.success, true);
  assert.ok(reassignRes.auditRecord);
  assert.equal(reassignRes.auditRecord.departmentName, "Urgent Quotes");
  assert.equal(reassignRes.auditRecord.initiatedBy, "manual_admin");
  assert.ok(reassignRes.auditRecord.history?.some((h) => h.action === "reassigned" && h.operator === "owner"));
});

// ===========================================================================
// SECTION 5: End-to-End Mocked Customer Journey (Requirement 34)
// ===========================================================================

test("Requirement 34: End-to-End Mocked Customer Lead Journey", async () => {
  // 1. Setup departments for business
  await saveLeadRoutingSettings(tenantA, {
    departments: [
      {
        id: "dept_custom_tailoring",
        accountId: tenantA,
        name: "Bespoke Tailoring",
        description: "Handles custom stitching, suit fitting appointments, and fabric selections.",
        whatsappNumber: "+108540457300",
        whatsappNumberNormalized: "+108540457300",
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  });

  // Customer arrives over WhatsApp with privacy LID identity (no telephone exposed)
  const customerLid = "554433221100@lid";

  // Step A: Check phone state -> LID exposes no trusted telephone number
  const phoneCheck1 = resolveCustomerPhoneState({ customerJid: customerLid });
  assert.equal(phoneCheck1.hasTrustedPhone, false);

  // Step B: AI qualifies lead and requests contact phone in Urdu/Roman Urdu
  const naturalRequest = buildNaturalCustomerPhoneRequest("roman_urdu");
  markPhoneRequested(customerLid);
  assert.ok(naturalRequest.includes("contact number nahi mil raha"));

  // Step C: Customer replies naturally with their telephone number in sentence
  const customerReply = "Ji mera WhatsApp number 0302-8877665 hai, call ya message kar lein.";
  const extracted = extractAndValidatePhoneFromText(customerReply, { defaultCountryCode: "PK" });
  assert.equal(extracted.isValid, true);
  assert.equal(extracted.normalized, "+112502291101");

  // Step D: Record validated number without overwriting raw LID transport
  const updatedCustomer = recordCustomerProvidedPhone(customerLid, extracted.normalized!);
  assert.equal(updatedCustomer.hasTrustedPhone, true);
  assert.equal(updatedCustomer.contactPhoneNormalized, "+112502291101");
  assert.equal(updatedCustomer.contactPhoneSource, "customer_provided");
  assert.equal(updatedCustomer.customerJid, customerLid);

  // Step E: Route and forward lead to Bespoke Tailoring department
  let departmentReceivedSummary = "";
  __setLeadRoutingTestDeps({
    sendUniversalOutboundText: async (params: any) => {
      departmentReceivedSummary = params.messageText;
      return { status: "sent", messageId: "msg_e2e_fwd_001" };
    },
  });

  const forwardResult = await forwardLeadToDepartment({
    accountId: tenantA,
    botId: "bot_e2e",
    leadId: "lead_bespoke_101",
    customerJid: customerLid,
    customerPhone: updatedCustomer.contactPhoneNormalized,
    leadName: "Farhan Malik",
    customerConversation: "I want a 3-piece tuxedo custom stitched for my wedding on December 15th.",
    forcedDepartmentId: "dept_custom_tailoring",
    customerLanguage: "roman_urdu",
  });

  // Step F: Assert forwarding success, grounded content, audit, and customer confirmation
  assert.equal(forwardResult.success, true);
  assert.equal(forwardResult.status, "forwarded");

  // Grounded summary delivered to department contains all key elements
  assert.ok(departmentReceivedSummary.includes("Farhan Malik"));
  assert.ok(departmentReceivedSummary.includes("+112502291101"));
  assert.ok(departmentReceivedSummary.includes("Bespoke Tailoring"));
  assert.ok(departmentReceivedSummary.includes("tuxedo"));

  // Customer acknowledgement is in customer's language
  assert.ok(forwardResult.customerReplyText.includes("Bespoke Tailoring"));
  assert.ok(forwardResult.customerReplyText.includes("forward"));

  // Audit record stored
  const audits = listAuditRecords(tenantA);
  const audit = audits.find((a) => a.leadId === "lead_bespoke_101");
  assert.ok(audit);
  assert.equal(audit?.destinationPhone, "+108540457300");
  assert.equal(audit?.status, "forwarded");
});

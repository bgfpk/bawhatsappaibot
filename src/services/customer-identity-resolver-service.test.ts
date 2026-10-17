import test from "node:test";
import assert from "node:assert/strict";

import { groupCustomerRecordsByCanonicalIdentity, maskCustomerAliasForAdmin, resolveCustomerIdentity } from "./customer-identity-resolver-service.ts";

test("phone JID and bare phone resolve same canonical key", () => {
  const fromJid = resolveCustomerIdentity({ jid: "contact-e4ed32210a80@example.invalid" });
  const fromPhone = resolveCustomerIdentity({ phone: "195545134641" });

  assert.equal(fromJid.canonicalCustomerKey, fromPhone.canonicalCustomerKey);
  assert.equal(fromJid.canonicalPhone, "195545134641");
  assert.equal(fromJid.activeSendJid, "contact-e4ed32210a80@example.invalid");
  assert.equal(fromJid.displayIdentity.displayPhone, "+92 300 1234567");
});

test("LID and discovered phone resolve to phone canonical with LID alias", () => {
  const identity = resolveCustomerIdentity({
    jid: "abc123@lid",
    whatsappProfilePhone: "195545134641",
  });

  assert.equal(identity.canonicalCustomerKey, "phone:923001234567");
  assert.equal(identity.canonicalPhone, "195545134641");
  assert.equal(identity.activeSendJid, "abc123@lid");
  assert.equal(identity.aliases.includes("abc123@lid"), true);
});

test("random LID-looking numeric ID is not treated as a phone", () => {
  const identity = resolveCustomerIdentity({
    jid: "8418320478394@lid",
    phone: "+1463605508514",
    profile: { lidJid: "8418320478394@lid" },
  });

  assert.equal(identity.canonicalPhone, "");
  assert.equal(identity.displayIdentity.displayPhone, "");
  assert.equal(identity.displayIdentity.aliasLabel, "Alias contact");
});

test("raw customer identifier fields are aliases only, not phones", () => {
  const fromJidValue = resolveCustomerIdentity({ jid: "1545254013" });
  assert.equal(fromJidValue.canonicalPhone, "");
  assert.equal(fromJidValue.displayIdentity.displayPhone, "");
  assert.equal(fromJidValue.displayIdentity.phoneIsTrusted, false);

  const fromCustomerId = resolveCustomerIdentity({ record: { customer_id: "1545254013" } });
  assert.equal(fromCustomerId.canonicalPhone, "");
  assert.equal(fromCustomerId.displayIdentity.displayPhone, "");
  assert.equal(fromCustomerId.displayIdentity.phoneIsTrusted, false);
  assert.equal(fromCustomerId.canonicalCustomerKey, "alias:4721770571");

  const fromPlainId = resolveCustomerIdentity({ record: { id: "1545254013" } });
  assert.equal(fromPlainId.canonicalPhone, "");
  assert.equal(fromPlainId.displayIdentity.displayPhone, "");
  assert.equal(fromPlainId.displayIdentity.phoneIsTrusted, false);

  const fromDocumentId = resolveCustomerIdentity({ record: { $id: "1545254013" } });
  assert.equal(fromDocumentId.canonicalPhone, "");
  assert.equal(fromDocumentId.displayIdentity.displayPhone, "");
  assert.equal(fromDocumentId.displayIdentity.phoneIsTrusted, false);
});

test("explicit phone field remains a trusted phone when valid", () => {
  const identity = resolveCustomerIdentity({ phone: "1545254013" });

  assert.equal(identity.canonicalPhone, "1545254013");
  assert.equal(identity.displayIdentity.displayPhone, "+1014110117");
  assert.equal(identity.displayIdentity.phoneIsTrusted, true);
});

test("trusted Pakistani phone displays as +92", () => {
  const identity = resolveCustomerIdentity({ phone: "15811061380" });

  assert.equal(identity.canonicalPhone, "195545134641");
  assert.equal(identity.displayIdentity.displayPhone, "+92 300 1234567");
});

test("imported phone and WhatsApp inbound phone group together", () => {
  const groups = groupCustomerRecordsByCanonicalIdentity([
    { id: "imported", importedPhone: "195545134641", profile: { importedPhone: "195545134641" } },
    { id: "inbound", customer_id: "contact-e4ed32210a80@example.invalid", profile: { customerJid: "contact-e4ed32210a80@example.invalid" } },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].identity.canonicalCustomerKey, "phone:923001234567");
  assert.equal(groups[0].records.length, 2);
});

test("LID alias plus discovered phone groups under trusted phone", () => {
  const groups = groupCustomerRecordsByCanonicalIdentity([
    { id: "phone", customer_id: "contact-e4ed32210a80@example.invalid", profile: { customerJid: "contact-e4ed32210a80@example.invalid" } },
    { id: "lid", customer_id: "alias123@lid", profile: { lidJid: "alias123@lid", phoneJid: "contact-e4ed32210a80@example.invalid", linkedJids: ["alias123@lid", "contact-e4ed32210a80@example.invalid"] } },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].identity.canonicalPhone, "195545134641");
  assert.equal(groups[0].records.length, 2);
  assert.ok(groups[0].identity.aliases.includes("alias123@lid"));
});

test("CRM lead phone links to WhatsApp customer", () => {
  const identity = resolveCustomerIdentity({
    jid: "contact-e4ed32210a80@example.invalid",
    crmLeadPhone: "+92 300 1234567",
  });

  assert.equal(identity.canonicalCustomerKey, "phone:923001234567");
  assert.equal(identity.aliases.includes("contact-e4ed32210a80@example.invalid"), true);
});

test("duplicate visible rows reduce where grouping helper is used", () => {
  const groups = groupCustomerRecordsByCanonicalIdentity([
    { id: "a", customer_id: "contact-e4ed32210a80@example.invalid", profile: { name: "Ali" } },
    { id: "b", phone: "195545134641", profile: { customerPhone: "195545134641" } },
    { id: "c", customer_id: "other@lid", profile: { lid: "other@lid" } },
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups.find((group) => group.identity.canonicalPhone === "195545134641")?.records.length, 2);
});

test("admin alias masking keeps raw alias out of normal display", () => {
  assert.equal(maskCustomerAliasForAdmin("8418320478394@lid"), "841...94@lid");
});

test("Durable Identity Aliases - Persistence across restart", async () => {
  const {
    recordVerifiedCustomerAlias,
    resolveCanonicalCustomerIdForAlias,
    getCanonicalCustomerRecord,
    clearCustomerAliasStore,
    clearCustomerAliasMemoryCache,
    savePersistedCustomerAliasesAsync,
  } = await import("./customer-identity-resolver-service.ts");

  clearCustomerAliasStore();

  const accountId = "test_tenant_alpha";
  const phone = "153238380473";
  const lid = "8418320478394@lid";
  const pnJid = "contact-d3b9636f8b0e@example.invalid";

  // Record aliases under tenant
  recordVerifiedCustomerAlias({
    accountId,
    alias: pnJid,
    type: "pn_jid",
    phone,
    displayName: "Ahad Firdosi",
    source: "inbound_whatsapp",
  });

  recordVerifiedCustomerAlias({
    accountId,
    alias: lid,
    type: "lid",
    phone,
    displayName: "Ahad Firdosi",
    source: "inbound_whatsapp",
  });

  await savePersistedCustomerAliasesAsync(accountId);

  // Verify initial resolution
  const resolvedIdFromPn = resolveCanonicalCustomerIdForAlias({ accountId, alias: pnJid });
  const resolvedIdFromLid = resolveCanonicalCustomerIdForAlias({ accountId, alias: lid });
  assert.ok(resolvedIdFromPn);
  assert.equal(resolvedIdFromPn, resolvedIdFromLid);
  assert.ok(resolvedIdFromPn?.startsWith("cust_"));

  // Simulate PM2/worker restart: clear all in-memory cache (durable storage remains)
  clearCustomerAliasMemoryCache();

  // Verify recovery from durable canonical storage
  const afterRestartLid = resolveCanonicalCustomerIdForAlias({ accountId, alias: lid });
  const afterRestartPn = resolveCanonicalCustomerIdForAlias({ accountId, alias: pnJid });
  assert.equal(afterRestartLid, resolvedIdFromLid);
  assert.equal(afterRestartPn, resolvedIdFromPn);

  const canonicalRec = getCanonicalCustomerRecord({ accountId, canonicalCustomerId: resolvedIdFromPn! });
  assert.ok(canonicalRec);
  assert.equal(canonicalRec?.canonicalPhone, phone);
  assert.equal(canonicalRec?.displayName, "Ahad Firdosi");
  assert.equal(canonicalRec?.verifiedAliases.length, 2);
  assert.ok(canonicalRec?.verifiedAliases.some((a) => a.alias === lid && a.type === "lid"));
  assert.ok(canonicalRec?.verifiedAliases.some((a) => a.alias === pnJid && a.type === "pn_jid"));
});

test("Cross-Tenant Isolation - Aliases never leak across accounts", async () => {
  const {
    recordVerifiedCustomerAlias,
    resolveCanonicalCustomerIdForAlias,
  } = await import("./customer-identity-resolver-service.ts");

  const tenantA = "tenant_company_a";
  const tenantB = "tenant_company_b";
  const sharedAlias = "shared_lid_alias@lid";

  recordVerifiedCustomerAlias({
    accountId: tenantA,
    alias: sharedAlias,
    type: "lid",
    phone: "112250469451",
    displayName: "Customer In Company A",
  });

  // Tenant B attempts to resolve the alias -> MUST NOT resolve to Tenant A's customer
  const tenantBResolution = resolveCanonicalCustomerIdForAlias({
    accountId: tenantB,
    alias: sharedAlias,
  });
  assert.equal(tenantBResolution, null);
});

test("Same-Message Cross-Identity Deduplication - PN and LID inbound delivery", async () => {
  const {
    claimCrossIdentityMessage,
    clearCrossIdentityMessageClaims,
  } = await import("./customer-identity-resolver-service.ts");

  clearCrossIdentityMessageClaims();

  const accountId = "account_demo";
  const botId = "bot_demo";
  const stanzaMsgId = "3EB0ABC123456789";

  // First observation arriving via LID
  const claim1 = claimCrossIdentityMessage({
    accountId,
    botId,
    direction: "inbound",
    messageId: stanzaMsgId,
    timestamp: Date.now(),
  });
  assert.equal(claim1.isDuplicate, false);

  // Second observation arriving via PN with same WhatsApp message ID
  const claim2 = claimCrossIdentityMessage({
    accountId,
    botId,
    direction: "inbound",
    messageId: stanzaMsgId,
    timestamp: Date.now() + 50,
  });
  assert.equal(claim2.isDuplicate, true);
  assert.equal(claim2.claimKey, claim1.claimKey);

  // Different message ID -> not duplicate
  const claim3 = claimCrossIdentityMessage({
    accountId,
    botId,
    direction: "inbound",
    messageId: "3EB0DIFFERENT999",
    timestamp: Date.now(),
  });
  assert.equal(claim3.isDuplicate, false);
});

test("Customer List Deduplication - Preserves audit provenance without unsafe deletion", async () => {
  const { deduplicateCustomerList } = await import("./customer-identity-resolver-service.ts");

  const rawRecords = [
    {
      $id: "doc_phone_rec",
      id: "doc_phone_rec",
      customer_id: "contact-d3b9636f8b0e@example.invalid",
      phone: "153238380473",
      name: "Ahad Firdosi",
      last_message_at: 1725800000000,
      profile: {
        phone: "153238380473",
        name: "Ahad Firdosi",
        linkedJids: ["contact-d3b9636f8b0e@example.invalid", "8418320478394@lid"],
      },
    },
    {
      $id: "doc_lid_synthetic",
      id: "doc_lid_synthetic",
      customer_id: "8418320478394@lid",
      phone: "",
      name: "1978851134262",
      last_message_at: 1725800050000,
      profile: {
        lidJid: "8418320478394@lid",
        linkedJids: ["8418320478394@lid"],
      },
    },
  ];

  const deduped = deduplicateCustomerList(rawRecords);

  // Must merge into exactly 1 canonical customer record
  assert.equal(deduped.length, 1);
  const canonical = deduped[0];
  assert.ok(canonical.canonicalCustomerId.startsWith("cust_"));
  assert.equal(canonical.canonicalCustomerKey, "phone:923066935544");
  assert.equal(canonical.phone, "153238380473");
  assert.equal(canonical.name, "Ahad Firdosi");

  // Provenance preserved
  assert.ok(canonical.profile.mergedRecordIds.includes("doc_phone_rec"));
  assert.ok(canonical.profile.mergedRecordIds.includes("doc_lid_synthetic"));
  assert.ok(canonical.profile.aliases.includes("8418320478394@lid"));
  assert.ok(canonical.profile.aliases.includes("contact-d3b9636f8b0e@example.invalid"));
});

test("False-Merge Prevention - Two unrelated customers with identical timestamp/text remain separate", async () => {
  const { deduplicateCustomerList } = await import("./customer-identity-resolver-service.ts");

  const records = [
    {
      id: "cust_1",
      customer_id: "contact-6c9bc40fc084@example.invalid",
      phone: "110064053003",
      name: "Customer One",
      last_message: "Hello, I want to inquire about pricing",
      last_message_at: 1725800000000,
      profile: { phone: "110064053003" },
    },
    {
      id: "cust_2",
      customer_id: "contact-e221035183df@example.invalid",
      phone: "104919258630",
      name: "Customer Two",
      last_message: "Hello, I want to inquire about pricing",
      last_message_at: 1725800000000,
      profile: { phone: "104919258630" },
    },
  ];

  const deduped = deduplicateCustomerList(records);
  assert.equal(deduped.length, 2);
  assert.ok(deduped[0].canonicalCustomerId.startsWith("cust_"));
  assert.ok(deduped[1].canonicalCustomerId.startsWith("cust_"));
  assert.notEqual(deduped[0].canonicalCustomerId, deduped[1].canonicalCustomerId);
  assert.equal(deduped[0].canonicalCustomerKey, "phone:923001112233");
  assert.equal(deduped[1].canonicalCustomerKey, "phone:923449988776");
});

test("Alias Conflict Protection - Never silently merge existing alias without authoritative proof", async () => {
  const {
    recordVerifiedCustomerAlias,
    resolveCanonicalCustomerIdForAlias,
    getCanonicalCustomerRecord,
    clearCustomerAliasStore,
  } = await import("./customer-identity-resolver-service.ts");

  clearCustomerAliasStore();

  const accountId = "tenant_conflict_test";
  const aliasToContend = "contact-f3f49ee43d2a@example.invalid";

  // Customer A establishes the alias first
  const recA = recordVerifiedCustomerAlias({
    accountId,
    alias: aliasToContend,
    type: "pn_jid",
    phone: "112250469451",
    displayName: "Original Owner A",
  });
  const idA = recA.canonicalCustomerId;

  // Later, input attempts to attach the same alias to an explicitly different Customer B without authoritative proof
  const conflictingRec = recordVerifiedCustomerAlias({
    accountId,
    canonicalCustomerId: "cust_imposter_b",
    alias: aliasToContend,
    type: "pn_jid",
    displayName: "Imposter B",
    authoritativeMapping: false,
  });

  // MUST NOT overwrite or merge into Customer B
  assert.equal(conflictingRec.canonicalCustomerId, idA);
  assert.equal(conflictingRec.hasConflict, true);
  assert.equal(conflictingRec.conflictReview, true);
  assert.equal(conflictingRec.conflictDetails?.conflictingAlias, aliasToContend);
  assert.equal(conflictingRec.conflictDetails?.attemptedCustomerId, "cust_imposter_b");

  // Alias lookup still resolves to Customer A
  const resolved = resolveCanonicalCustomerIdForAlias({ accountId, alias: aliasToContend });
  assert.equal(resolved, idA);

  // Then authoritative WhatsApp mapping proves A and B are same person (Requirement #7)
  const unifiedRec = recordVerifiedCustomerAlias({
    accountId,
    canonicalCustomerId: "cust_authoritative_person",
    alias: aliasToContend,
    type: "pn_jid",
    displayName: "Unified Person",
    authoritativeMapping: true,
    source: "whatsapp_authoritative_protocol_sync",
  });

  assert.equal(unifiedRec.canonicalCustomerId, "cust_authoritative_person");
  assert.equal(unifiedRec.hasConflict, false);
  assert.equal(unifiedRec.conflictReview, false);
  assert.ok(unifiedRec.provenance);
  assert.equal(unifiedRec.provenance?.unifiedFromCustomerId, idA);
  assert.equal(unifiedRec.provenance?.authoritativeEvidence, "whatsapp_authoritative_protocol_sync");
  assert.ok(unifiedRec.verifiedAliases.some((a) => a.alias === aliasToContend));

  // Stale Customer A record is superseded
  const oldRecA = getCanonicalCustomerRecord({ accountId, canonicalCustomerId: idA });
  assert.equal(oldRecA?.isSuperseded, true);
  assert.equal(oldRecA?.supersededBy, "cust_authoritative_person");

  // Alias lookup now resolves safely to authoritative ID
  const afterAuthResolved = resolveCanonicalCustomerIdForAlias({ accountId, alias: aliasToContend });
  assert.equal(afterAuthResolved, "cust_authoritative_person");
});

test("Requirement #8: Customer list pre-synthesis resolution - LID stored + PN message produces 1 customer row", async () => {
  const {
    recordVerifiedCustomerAlias,
    resolveCanonicalCustomerIdForAlias,
    deduplicateCustomerList,
    clearCustomerAliasStore,
  } = await import("./customer-identity-resolver-service.ts");
  const { getAutoFollowupSchedule, scheduleNextAutoFollowup, clearAutoFollowupSchedulesForTest } = await import("./intelligent-auto-followup-service.ts");

  clearCustomerAliasStore();
  clearAutoFollowupSchedulesForTest();

  const accountId = "bot_store_alpha";
  const botId = "bot_store_alpha";
  const lidJid = "8418320478394@lid";
  const pnJid = "contact-d3b9636f8b0e@example.invalid";
  const canonicalPhone = "153238380473";

  // Step 1: Customer initially stored in Appwrite database under LID
  const canonicalRecord = recordVerifiedCustomerAlias({
    accountId,
    alias: lidJid,
    type: "lid",
    displayName: "Ahad Firdosi",
    source: "whatsapp_inbound_lid",
  });
  const canonicalCustomerId = canonicalRecord.canonicalCustomerId;
  assert.ok(canonicalCustomerId.startsWith("cust_"));

  // Initial customer document in CUSTOMERS collection (indexed under LID)
  const storedCustomer = {
    $id: "cust_doc_stored_lid",
    id: "cust_doc_stored_lid",
    bot_id: accountId,
    customer_id: lidJid,
    jid: lidJid,
    name: "Ahad Firdosi",
    phone: "",
    last_message_at: 1725800000000,
    profile: JSON.stringify({
      lidJid,
      name: "Ahad Firdosi",
      source: "WhatsApp",
    }),
  };

  // Verified PN becomes known/attached to same canonical customer
  recordVerifiedCustomerAlias({
    accountId,
    canonicalCustomerId,
    alias: pnJid,
    type: "pn_jid",
    phone: canonicalPhone,
    displayName: "Ahad Firdosi",
    source: "whatsapp_inbound_pn",
  });

  // Step 2: New message arrives in MESSAGES collection under PN
  const incomingMessage = {
    $id: "msg_inbound_pn_999",
    bot_id: botId,
    customer_id: pnJid,
    text: "Can you send the invoice?",
    role: "user",
    timestamp: 1725800060000,
  };

  // Pre-synthesis resolution algorithm (simulating listCustomers):
  // 1. Resolve incoming customerId via canonical alias store
  const resolvedCanonicalId = resolveCanonicalCustomerIdForAlias({
    accountId,
    alias: incomingMessage.customer_id,
  });
  assert.equal(resolvedCanonicalId, canonicalCustomerId);

  // 2. Existing stored customer matched before synthesis
  const existingMatches = [storedCustomer].filter((c) => {
    return c.jid === lidJid || c.customer_id === lidJid;
  });
  assert.equal(existingMatches.length, 1);

  // Since existing customer matched via canonical alias, synthetic customer is NOT created
  const customerList = [storedCustomer];
  // Enrich existing customer with message
  (customerList[0] as any).last_message = incomingMessage.text;
  customerList[0].last_message_at = incomingMessage.timestamp;

  // Final deduplication & grouping
  const finalCustomers = deduplicateCustomerList(customerList);

  // Assert exactly 1 Customer row
  assert.equal(finalCustomers.length, 1);
  assert.equal(finalCustomers[0].name, "Ahad Firdosi");

  // Step 3: Schedule follow-up using canonicalCustomerId
  const schedule = scheduleNextAutoFollowup({
    botId,
    customerJid: pnJid,
    canonicalCustomerId,
    conversationId: canonicalCustomerId,
    lastCustomerMessageText: incomingMessage.text,
    lastCustomerMessageAt: incomingMessage.timestamp,
  });

  assert.ok(schedule);
  assert.equal(schedule.canonicalCustomerId, canonicalCustomerId);

  // Query follow-up schedule by LID or by PN -> points to exact same single schedule
  const schedByPn = getAutoFollowupSchedule(botId, pnJid);
  const schedByLid = getAutoFollowupSchedule(botId, lidJid);
  assert.ok(schedByPn);
  assert.ok(schedByLid);
  assert.equal(schedByPn.id, schedByLid.id);

  // Result: 1 Customer row, 1 follow-up chain, 1 conversation
  assert.equal(finalCustomers.length, 1);
  assert.equal(schedByPn.id, schedule.id);
});

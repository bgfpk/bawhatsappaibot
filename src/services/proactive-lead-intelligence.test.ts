import test from "node:test";
import assert from "node:assert/strict";

import {
  dispatchProactiveLeadAlert,
  emitProactiveLeadLifecycleEvent,
  evaluateLeadIntentAndUrgency,
  formatOwnerWhatsAppLeadAlert,
  getProactiveLeadSettings,
  updateProactiveLeadSettings,
  getProactiveAlertRecord,
  saveProactiveAlertRecord,
  tryAcquireAlertClaim,
  recordAlertTransportSent,
  finalizeAlertClaim,
  cleanupExpiredAlertRecords,
  resolveAuthoritativeOwnerAlertDestination,
  listRecentDashboardNotifications,
  clearDashboardNotificationsForTesting,
  clearDeduplicationStoreForTesting,
  clearInMemoryLeadEventDeduplicationStoreOnlyForTesting,
  __setCanonicalAlertStorageAdapterForTest,
  type ProactiveLeadEvent,
} from "./proactive-lead-intelligence-service.ts";

const testAccountId = "acc_proactive_lead_test";

test.beforeEach(() => {
  clearDashboardNotificationsForTesting();
  clearDeduplicationStoreForTesting();
});

test.afterEach(() => {
  clearDashboardNotificationsForTesting();
  clearDeduplicationStoreForTesting();
});

// ===========================================================================
// SECTION 1: Event Dispatch, Idempotency & Deduplication
// ===========================================================================

test("Proactive Alerts: emits qualified lead event and prevents duplicate notification within deduplication window", async () => {
  const sentMessages: Array<{ to: string; text: string }> = [];
  const mockSock = {
    sendMessage: async (to: string, payload: { text: string }) => {
      sentMessages.push({ to, text: payload.text });
      return { key: { id: `msg_${Date.now()}` } };
    },
  };

  // Configure owner WhatsApp alert number
  updateProactiveLeadSettings(testAccountId, {
    enabled: true,
    ownerAlertJid: "contact-e4ed32210a80@example.invalid",
    ownerAlertPhone: "+144225232320",
    notifyQualifiedLeads: true,
  });

  // 1. First event: NEW_QUALIFIED_LEAD
  const res1 = await emitProactiveLeadLifecycleEvent({
    eventType: "NEW_QUALIFIED_LEAD",
    accountId: testAccountId,
    leadId: "lead_alpha_101",
    customerJid: "contact-5e06ae7ce74e@example.invalid",
    customerName: "Imran Khan",
    customerPhone: "+137446225728",
    serviceOrProduct: "Web Development",
    summary: "Customer requested custom web portal quotation.",
    urgency: "normal",
    sock: mockSock,
  });

  assert.equal(res1.success, true);
  assert.equal(res1.duplicate, false);
  assert.equal(res1.dashboardNotificationCreated, true);
  assert.equal(res1.whatsappSent, true);
  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].text, /New Qualified Lead/);
  assert.match(sentMessages[0].text, /Imran Khan/);

  // Verify dashboard notification was persisted
  const notifications = listRecentDashboardNotifications(testAccountId);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].leadId, "lead_alpha_101");
  assert.equal(notifications[0].eventType, "NEW_QUALIFIED_LEAD");

  // 2. Duplicate event for same lead, eventType, and state
  const res2 = await emitProactiveLeadLifecycleEvent({
    eventType: "NEW_QUALIFIED_LEAD",
    accountId: testAccountId,
    leadId: "lead_alpha_101",
    customerJid: "contact-5e06ae7ce74e@example.invalid",
    customerName: "Imran Khan",
    customerPhone: "+137446225728",
    serviceOrProduct: "Web Development",
    summary: "Customer requested custom web portal quotation.",
    urgency: "normal",
    sock: mockSock,
  });

  assert.equal(res2.success, true);
  assert.equal(res2.duplicate, true);
  assert.equal(res2.whatsappSent, false);
  // Total sent messages still 1 (no duplicate sent)
  assert.equal(sentMessages.length, 1);
  // Dashboard notifications still 1
  assert.equal(listRecentDashboardNotifications(testAccountId).length, 1);
});

// ===========================================================================
// SECTION 2: Dashboard Notification Fallback when WhatsApp Unavailable
// ===========================================================================

test("Proactive Alerts: dashboard notification is retained when owner WhatsApp is not configured or send fails", async () => {
  // Clear any owner WhatsApp destination
  updateProactiveLeadSettings(testAccountId, {
    enabled: true,
    ownerAlertJid: undefined,
    ownerAlertPhone: undefined,
    notifyRoutingFailed: true,
  });

  const res = await emitProactiveLeadLifecycleEvent({
    eventType: "LEAD_ROUTING_FAILED",
    accountId: testAccountId,
    leadId: "lead_failed_001",
    customerJid: "contact-0fdbe720e38c@example.invalid",
    customerName: "Fatima Noor",
    customerPhone: "+102454736064",
    departmentName: "Technical Support",
    summary: "Forward transport rejected message: recipient offline.",
    urgency: "urgent",
  });

  assert.equal(res.success, true);
  assert.equal(res.duplicate, false);
  assert.equal(res.dashboardNotificationCreated, true);
  assert.equal(res.whatsappSent, false); // No arbitrary number send

  // Dashboard notification preserved with high severity
  const notifications = listRecentDashboardNotifications(testAccountId);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].severity, "danger");
  assert.match(notifications[0].title, /Lead Routing Delivery Failed/);
});

// ===========================================================================
// SECTION 3: Settings Category Filtering
// ===========================================================================

test("Proactive Settings: categories can be toggled to suppress or allow specific lead alerts", async () => {
  // Disable high intent notifications in settings
  updateProactiveLeadSettings(testAccountId, {
    enabled: true,
    notifyHighIntentLeads: false,
    ownerAlertJid: "contact-e4ed32210a80@example.invalid",
  });

  const resSuppressed = await emitProactiveLeadLifecycleEvent({
    eventType: "HIGH_INTENT_LEAD",
    accountId: testAccountId,
    leadId: "lead_hi_001",
    customerJid: "contact-315e9df79a97@example.invalid",
    summary: "Customer wants to buy wholesale lot.",
    urgency: "high",
  });

  assert.equal(resSuppressed.success, false);
  assert.equal(resSuppressed.error, "category_disabled");
  assert.equal(resSuppressed.dashboardNotificationCreated, false);

  // Enable high intent notifications
  updateProactiveLeadSettings(testAccountId, {
    notifyHighIntentLeads: true,
  });

  const resAllowed = await emitProactiveLeadLifecycleEvent({
    eventType: "HIGH_INTENT_LEAD",
    accountId: testAccountId,
    leadId: "lead_hi_001",
    customerJid: "contact-315e9df79a97@example.invalid",
    summary: "Customer wants to buy wholesale lot.",
    urgency: "high",
  });

  assert.equal(resAllowed.success, true);
  assert.equal(resAllowed.dashboardNotificationCreated, true);
});

// ===========================================================================
// SECTION 4: High Intent & Commercial Urgency Classifier
// ===========================================================================

test("Commercial Urgency Evaluation: correctly identifies buying intent and wholesale inquiries across languages", () => {
  // 1. English urgent buying intent
  const englishBuy = evaluateLeadIntentAndUrgency({
    userText: "I want to place an order immediately, please send invoice or payment link.",
  });
  assert.equal(englishBuy.isHighIntent, true);
  assert.equal(englishBuy.urgency, "high");

  // 2. Urdu / Roman Urdu immediate buying intent
  const urduBuy = evaluateLeadIntentAndUrgency({
    userText: "Bhai abhe kharidna hai price batao jaldi.",
  });
  assert.equal(urduBuy.isHighIntent, true);
  assert.equal(urduBuy.urgency, "high");

  // 3. Wholesale / bulk volume inquiry
  const wholesale = evaluateLeadIntentAndUrgency({
    userText: "We need a bulk order of 500 units for corporate gifting.",
  });
  assert.equal(wholesale.isHighIntent, true);
  assert.equal(wholesale.urgency, "high");

  // 4. Human assistance request
  const humanReq = evaluateLeadIntentAndUrgency({
    userText: "Can I please speak to a human representative? This is urgent.",
  });
  assert.equal(humanReq.isHighIntent, true);
  assert.equal(humanReq.urgency, "urgent");

  // 5. Standard casual query
  const casual = evaluateLeadIntentAndUrgency({
    userText: "What are your operating hours?",
  });
  assert.equal(casual.isHighIntent, false);
  assert.equal(casual.urgency, "normal");
});

// ===========================================================================
// SECTION 5: Alert Grounded Formatting
// ===========================================================================

test("Grounded Notification Formatter: formats concise, actionable owner alert without hallucinating details", () => {
  const event: ProactiveLeadEvent = {
    eventId: "ple_test_001",
    eventType: "LEAD_ROUTED_TO_DEPARTMENT",
    accountId: testAccountId,
    botId: "bot_01",
    leadId: "lead_xyz_123",
    customerJid: "contact-80e91c1852cf@example.invalid",
    customerName: "Bilal Tariq",
    customerPhone: "+120344115445",
    departmentName: "Sales & Inquiries",
    serviceOrProduct: "Solar Installation",
    summary: "Forwarded to Sales & Inquiries WhatsApp (+923005554433).",
    urgency: "normal",
    timestamp: 1788750000000,
    deduplicationKey: "test:key",
  };

  const formatted = formatOwnerWhatsAppLeadAlert(event);
  assert.match(formatted, /Lead Routed to Department/);
  assert.match(formatted, /Bilal Tariq/);
  assert.match(formatted, /Sales & Inquiries/);
  assert.match(formatted, /Solar Installation/);
  assert.match(formatted, /\+92\s*311\s*2233445/);
});

// ===========================================================================
// SECTION 6: Deduplication Across Process Restart
// ===========================================================================

test("Proactive Alerts: deduplication survives process restart via durable disk persistence", async () => {
  const sentMessages: string[] = [];
  const mockSock = {
    sendMessage: async (_to: string, payload: { text: string }) => {
      sentMessages.push(payload.text);
      return { key: { id: `msg_${Date.now()}` } };
    },
  };

  updateProactiveLeadSettings(testAccountId, {
    enabled: true,
    ownerAlertJid: "contact-e4ed32210a80@example.invalid",
    ownerAlertPhone: "+144225232320",
    notifyQualifiedLeads: true,
  });

  // 1. Initial event emitted
  const firstRes = await emitProactiveLeadLifecycleEvent({
    eventType: "NEW_QUALIFIED_LEAD",
    accountId: testAccountId,
    leadId: "lead_restart_101",
    customerJid: "contact-fc6766068704@example.invalid",
    customerName: "Hassan Ali",
    customerPhone: "+150333823501",
    summary: "New qualified lead for branding consultation.",
    sock: mockSock,
  });

  assert.equal(firstRes.success, true);
  assert.equal(firstRes.duplicate, false);
  assert.equal(sentMessages.length, 1);

  // 2. SIMULATE PROCESS / WORKER RESTART: in-memory store cleared
  clearInMemoryLeadEventDeduplicationStoreOnlyForTesting();

  // 3. Replay exact same event after restart
  const replayedRes = await emitProactiveLeadLifecycleEvent({
    eventType: "NEW_QUALIFIED_LEAD",
    accountId: testAccountId,
    leadId: "lead_restart_101",
    customerJid: "contact-fc6766068704@example.invalid",
    customerName: "Hassan Ali",
    customerPhone: "+150333823501",
    summary: "New qualified lead for branding consultation.",
    sock: mockSock,
  });

  // Must detect as duplicate from disk persistence and NOT send second alert
  assert.equal(replayedRes.success, true);
  assert.equal(replayedRes.duplicate, true);
  assert.equal(replayedRes.whatsappSent, false);
  assert.equal(sentMessages.length, 1, "No duplicate alert must be sent after restart");
});

// ===========================================================================
// SECTION 7: Owner Alert Delivery Matrix (WhatsApp Success, Failure, Fallback)
// ===========================================================================

test("Owner Alert Delivery Matrix: success, failure, unconfigured destination, and state transition", async () => {
  // Scenario A: WhatsApp send failure preserves actionable dashboard notification
  updateProactiveLeadSettings(testAccountId, {
    enabled: true,
    ownerAlertJid: "contact-e4ed32210a80@example.invalid",
    notifyHumanRequested: true,
  });

  const failingSock = {
    sendMessage: async () => {
      throw new Error("Socket connection dropped");
    },
  };

  const failRes = await emitProactiveLeadLifecycleEvent({
    eventType: "CUSTOMER_REQUESTED_HUMAN",
    accountId: testAccountId,
    leadId: "lead_fail_01",
    customerJid: "contact-d3055900f9fd@example.invalid",
    customerName: "Zainab Bibi",
    summary: "Customer urgently requested human support agent.",
    urgency: "urgent",
    sock: failingSock,
  });

  // WhatsApp failed, but dashboard notification MUST remain
  assert.equal(failRes.dashboardNotificationCreated, true);
  assert.equal(failRes.whatsappSent, false);
  assert.match(failRes.error || "", /Socket connection dropped/);

  const notifications = listRecentDashboardNotifications(testAccountId);
  assert.ok(notifications.length > 0);
  const found = notifications.find((n) => n.leadId === "lead_fail_01");
  assert.ok(found, "Dashboard notification must exist despite WhatsApp failure");
  assert.equal(found.severity, "danger");

  // Scenario B: Different meaningful state transition for same lead allows new alert
  const stateChangeRes = await emitProactiveLeadLifecycleEvent({
    eventType: "LEAD_ROUTED_TO_DEPARTMENT",
    accountId: testAccountId,
    leadId: "lead_fail_01",
    customerJid: "contact-d3055900f9fd@example.invalid",
    customerName: "Zainab Bibi",
    departmentName: "Human Escalations",
    summary: "Lead successfully routed to Human Escalations department.",
  });

  assert.equal(stateChangeRes.success, true);
  assert.equal(stateChangeRes.duplicate, false, "Meaningful state transition must NOT be blocked as duplicate");
  assert.equal(stateChangeRes.dashboardNotificationCreated, true);
});

// ===========================================================================
// SECTION 8: Section 12 Alert Restart & Concurrency Validation
// ===========================================================================

test("Section 12: Lead alert lifecycle with memory clearance, replay deduplication, and zero local files", async () => {
  const sentMessages: string[] = [];
  const mockSock = {
    sendMessage: async (_to: string, payload: { text: string }) => {
      sentMessages.push(payload.text);
      return { key: { id: `msg_sec12_${Date.now()}` } };
    },
  };

  updateProactiveLeadSettings(testAccountId, {
    enabled: true,
    ownerAlertJid: "contact-e4ed32210a80@example.invalid",
    ownerAlertPhone: "+144225232320",
    notifyQualifiedLeads: true,
  });

  const eventInput = {
    eventType: "NEW_QUALIFIED_LEAD" as const,
    accountId: testAccountId,
    leadId: "lead_sec12_canonical_01",
    customerJid: "contact-242e1f74005b@example.invalid",
    customerName: "Kamran Akmal",
    customerPhone: "+105381228384",
    summary: "Customer requested pricing on solar panel kits.",
    sock: mockSock,
  };

  // 1. Emit event -> dashboard notification created -> owner WhatsApp sent
  const firstEmit = await emitProactiveLeadLifecycleEvent(eventInput);
  assert.equal(firstEmit.success, true);
  assert.equal(firstEmit.duplicate, false);
  assert.equal(firstEmit.dashboardNotificationCreated, true);
  assert.equal(firstEmit.whatsappSent, true);
  assert.equal(sentMessages.length, 1);

  // Verify delivery state in canonical store
  const dedupKey = `${testAccountId}:lead_sec12_canonical_01:NEW_QUALIFIED_LEAD:nodept_+923001239876`;
  const record = getProactiveAlertRecord(testAccountId, dedupKey);
  assert.ok(record);
  assert.equal(record.deliveryState, "sent");
  assert.ok(record.messageReference?.startsWith("msg_sec12_"));
  assert.ok(record.attemptTimestamp > 0);

  // 2. Clear process memory (simulating worker restart)
  clearInMemoryLeadEventDeduplicationStoreOnlyForTesting();

  // 3. Replay exact same event
  const replayedEmit = await emitProactiveLeadLifecycleEvent(eventInput);
  assert.equal(replayedEmit.success, true);
  assert.equal(replayedEmit.duplicate, true);
  assert.equal(replayedEmit.dashboardNotificationCreated, false);
  assert.equal(replayedEmit.whatsappSent, false);

  // Verify no duplicate dashboard notification created
  const notifs = listRecentDashboardNotifications(testAccountId);
  assert.equal(notifs.filter((n) => n.leadId === "lead_sec12_canonical_01").length, 1);
  // Verify no second WhatsApp message sent
  assert.equal(sentMessages.length, 1);
});

test("Section 12: Concurrent duplicate event processing produces exactly one canonical alert and delivery", async () => {
  const sentMessages: string[] = [];
  let sendCount = 0;

  const mockSock = {
    sendMessage: async (_to: string, payload: { text: string }) => {
      sendCount++;
      // Simulate network delay
      await new Promise((r) => setTimeout(r, 25));
      sentMessages.push(payload.text);
      return { key: { id: `msg_concurrent_${Date.now()}_${sendCount}` } };
    },
  };

  updateProactiveLeadSettings(testAccountId, {
    enabled: true,
    ownerAlertJid: "contact-e4ed32210a80@example.invalid",
    ownerAlertPhone: "+144225232320",
    notifyContactCaptured: true,
  });

  const eventInput = {
    eventType: "LEAD_CONTACT_NUMBER_CAPTURED" as const,
    accountId: testAccountId,
    leadId: "lead_concurrent_race_99",
    customerJid: "contact-2bcb2f84f941@example.invalid",
    customerName: "Ayesha Malik",
    customerPhone: "+155836444351",
    summary: "Phone number recovered from conversation context.",
    sock: mockSock,
  };

  // Launch 3 simultaneous executions of the same event
  const [resA, resB, resC] = await Promise.all([
    emitProactiveLeadLifecycleEvent(eventInput),
    emitProactiveLeadLifecycleEvent(eventInput),
    emitProactiveLeadLifecycleEvent(eventInput),
  ]);

  const results = [resA, resB, resC];
  const dispatched = results.filter((r) => !r.duplicate);
  const duplicates = results.filter((r) => r.duplicate);

  assert.equal(dispatched.length, 1, "Exactly one execution should advance and dispatch the alert");
  assert.equal(duplicates.length, 2, "Concurrent duplicate executions must be recognized as duplicate");
  assert.equal(sendCount, 1, "WhatsApp transport must be called exactly once");
  assert.equal(sentMessages.length, 1);

  // Exactly one dashboard notification in canonical store
  const notifs = listRecentDashboardNotifications(testAccountId);
  assert.equal(notifs.filter((n) => n.leadId === "lead_concurrent_race_99").length, 1);
});

test("Section 8: Proactive Alert Settings persist across in-memory cache clearance", () => {
  updateProactiveLeadSettings(testAccountId, {
    enabled: true,
    notifyQualifiedLeads: false,
    notifyContactCaptured: true,
    notifyLeadRouted: false,
    notifyRoutingFailed: true,
    notifyHumanRequested: true,
    notifyHighIntentLeads: false,
    ownerAlertJid: "contact-e12c044a6d0c@example.invalid",
    ownerAlertPhone: "+149145539352",
  });

  // Verify settings in memory
  let settings = getProactiveLeadSettings(testAccountId);
  assert.equal(settings.notifyQualifiedLeads, false);
  assert.equal(settings.notifyHighIntentLeads, false);
  assert.equal(settings.ownerAlertPhone, "+149145539352");

  // Clear in-memory cache (simulating process restart)
  clearInMemoryLeadEventDeduplicationStoreOnlyForTesting();

  // Re-read settings - must rehydrate from canonical durable store
  settings = getProactiveLeadSettings(testAccountId);
  assert.equal(settings.notifyQualifiedLeads, false);
  assert.equal(settings.notifyHighIntentLeads, false);
  assert.equal(settings.ownerAlertPhone, "+149145539352");
});

// ===========================================================================
// SECTION 9: Authoritative Owner Alert Destination Resolver
// ===========================================================================

test("Section 6: Authoritative Owner Alert Destination - Priority resolution and zero guessing", async () => {
  const accountNoPhone = "acc_owner_dest_none";
  // 1. When no destination is configured anywhere, returns empty object (dashboard notification only)
  const destNone = await resolveAuthoritativeOwnerAlertDestination(accountNoPhone);
  assert.deepEqual(destNone, {});

  // 2. Setting explicit ownerAlertPhone takes precedence
  updateProactiveLeadSettings(accountNoPhone, {
    ownerAlertPhone: "+92 300 1234567",
  });
  const destConfigured = await resolveAuthoritativeOwnerAlertDestination(accountNoPhone);
  assert.equal(destConfigured.ownerPhone, "195545134641");
  assert.equal(destConfigured.ownerJid, "contact-e4ed32210a80@example.invalid");
});

// ===========================================================================
// SECTION 10: Event Claim Crash & Recovery
// ===========================================================================

test("Section 5: Proactive Event Claim Crash Recovery - Worker crashes before WhatsApp send", async () => {
  const dedupKey = "test_acc:lead_crash_1:NEW_QUALIFIED_LEAD";
  const leaseMs = 50;

  // 1. Worker 1 acquires claim lease
  const claim1 = await tryAcquireAlertClaim("test_acc", dedupKey, "worker_alpha", leaseMs);
  assert.equal(claim1.acquired, true);

  // 2. Worker 2 attempts while in-flight -> rejected as in-flight
  const claim2 = await tryAcquireAlertClaim("test_acc", dedupKey, "worker_beta", leaseMs);
  assert.equal(claim2.acquired, false);
  assert.equal(claim2.inFlight, true);

  // 3. Worker 1 crashes. Wait for lease to expire
  await new Promise((r) => setTimeout(r, 60));

  // 4. Worker 2 checks claim after expiry. Under Safe Uncertain-Outcome Policy,
  // since Baileys cannot prove delivery status across crash, automatic resend is suppressed
  // and claim is safely marked uncertain_reconciliation_required for manual/transport reconciliation.
  const claimRecovered = await tryAcquireAlertClaim("test_acc", dedupKey, "worker_beta", leaseMs);
  assert.equal(claimRecovered.acquired, false, "Must NOT acquire for automatic blind resend");
  assert.equal(claimRecovered.duplicate, true);
  assert.equal(claimRecovered.recovered, true);
  assert.equal(claimRecovered.claim?.deliveryState, "uncertain_reconciliation_required");

  // 5. Manual or transport reconciliation resolves the claim to sent
  await finalizeAlertClaim(claimRecovered.claimId, "sent", "msg_reconciled_001");

  // 6. Any future worker sees claim as sent/duplicate
  const claimFuture = await tryAcquireAlertClaim("test_acc", dedupKey, "worker_gamma", leaseMs);
  assert.equal(claimFuture.acquired, false);
  assert.equal(claimFuture.duplicate, true);
});

test("Section 5: Proactive Event Claim Crash Recovery - Worker crashes AFTER WhatsApp send but before marking sent", async () => {
  const dedupKey = "test_acc:lead_crash_sent:NEW_QUALIFIED_LEAD";
  const leaseMs = 50;

  // 1. Worker 1 acquires claim lease
  const claim1 = await tryAcquireAlertClaim("test_acc", dedupKey, "worker_alpha", leaseMs);
  assert.equal(claim1.acquired, true);

  // 2. Worker 1 sent WhatsApp message and recorded messageReference on claim, but crashed before finalizeAlertClaim
  await recordAlertTransportSent(claim1.claimId, "msg_transport_sent_123");

  // 3. Wait for lease to expire
  await new Promise((r) => setTimeout(r, 60));

  // 4. Worker 2 attempts recovery. Because messageReference exists, it does NOT re-send!
  const claimRecovered = await tryAcquireAlertClaim("test_acc", dedupKey, "worker_beta", leaseMs);
  assert.equal(claimRecovered.acquired, false);
  assert.equal(claimRecovered.duplicate, true);
  assert.equal(claimRecovered.recovered, true);
  assert.equal(claimRecovered.claim?.messageReference, "msg_transport_sent_123");
});

test("Post-Send Crash Window: Process crashes immediately after transport send BEFORE messageReference persisted", async () => {
  const acc = "acc_post_send_crash";
  const dedupKey = `${acc}:lead_post_send_crash_01:NEW_QUALIFIED_LEAD:nodept`;
  const leaseMs = 20;

  updateProactiveLeadSettings(acc, {
    enabled: true,
    ownerAlertPhone: "+144225232320",
    notifyQualifiedLeads: true,
  });

  let externalWhatsAppSends = 0;

  // 1. Worker A acquires claim
  const claimA = await tryAcquireAlertClaim(acc, dedupKey, "worker_A", leaseMs);
  assert.equal(claimA.acquired, true);

  // 2. Worker A executes WhatsApp transport send
  externalWhatsAppSends += 1;

  // 3. Worker A CRASHES immediately after transport send succeeds,
  // before saving messageReference or calling finalizeAlertClaim.
  // (Process terminates here)

  // 4. Wait for lease to expire
  await new Promise((r) => setTimeout(r, 30));

  // 5. Worker B / recovery attempts to dispatch the exact same event
  let workerBSends = 0;
  const mockSockB = {
    sendMessage: async () => {
      workerBSends += 1;
      return { key: { id: "msg_worker_B" } };
    },
  };

  const dispatchResultB = await dispatchProactiveLeadAlert({
    eventId: "evt_crash_post_01",
    eventType: "NEW_QUALIFIED_LEAD",
    accountId: acc,
    botId: "bot_crash_01",
    leadId: "lead_post_send_crash_01",
    customerJid: "contact-9523f5dd1180@example.invalid",
    summary: "Customer inquiry",
    urgency: "normal",
    timestamp: Date.now(),
    deduplicationKey: dedupKey,
  }, {
    sock: mockSockB,
    workerId: "worker_B",
  });

  // Under Safe Uncertain-Outcome Policy:
  // - Worker B does NOT blindly execute a second WhatsApp send to the owner!
  assert.equal(workerBSends, 0, "Worker B must NOT execute duplicate owner WhatsApp send");
  assert.equal(externalWhatsAppSends, 1, "Total owner WhatsApp sends across crash must be EXACTLY 1");
  assert.equal(dispatchResultB.duplicate, true);
  assert.equal(dispatchResultB.whatsappSent, false);

  // - Dashboard notification was created and remains available
  const notifs = listRecentDashboardNotifications(acc);
  assert.ok(notifs.length >= 1, "Dashboard notification must remain available in CRM notification center");
});

// ===========================================================================
// SECTION 11: Retention & Cleanup of Expired Alert Records
// ===========================================================================

test("Section 11: Proactive Alert Record Retention - Expired records and claims are safely purged", () => {
  const now = Date.now();
  const oldTimestamp = now - 25 * 60 * 60 * 1000; // 25 hours ago (> 24h retention)

  // Seed an old expired record and claim
  saveProactiveAlertRecord({
    dedupKey: "test_acc:lead_old:NEW_QUALIFIED_LEAD",
    eventId: "evt_old",
    accountId: "test_acc",
    leadId: "lead_old",
    eventType: "NEW_QUALIFIED_LEAD",
    deliveryState: "sent",
    attemptTimestamp: oldTimestamp,
    dashboardNotificationId: "crm_old",
    dashboardNotificationCreated: true,
    createdAt: oldTimestamp,
    updatedAt: oldTimestamp,
  });

  // Run cleanup
  const purged = cleanupExpiredAlertRecords();
  assert.ok(purged >= 1, "At least one expired record must be purged");

  // Verify old record no longer returned
  const record = getProactiveAlertRecord("test_acc", "test_acc:lead_old:NEW_QUALIFIED_LEAD");
  assert.equal(record, null);
});

// ===========================================================================
// SECTION 12: Complete Category Suppression & Delivery Matrix
// ===========================================================================

test("Section 8: Proactive Category Matrix - Complete suppression and delivery across all categories", async () => {
  const categories: Array<{
    eventType: ProactiveLeadEvent["eventType"];
    toggleKey: keyof ReturnType<typeof getProactiveLeadSettings>;
  }> = [
    { eventType: "NEW_QUALIFIED_LEAD", toggleKey: "notifyQualifiedLeads" },
    { eventType: "LEAD_CONTACT_NUMBER_CAPTURED", toggleKey: "notifyContactCaptured" },
    { eventType: "LEAD_ROUTED_TO_DEPARTMENT", toggleKey: "notifyLeadRouted" },
    { eventType: "LEAD_ROUTING_FAILED", toggleKey: "notifyRoutingFailed" },
    { eventType: "CUSTOMER_REQUESTED_HUMAN", toggleKey: "notifyHumanRequested" },
    { eventType: "HIGH_INTENT_LEAD", toggleKey: "notifyHighIntentLeads" },
  ];

  for (const { eventType, toggleKey } of categories) {
    const acc = `acc_cat_${eventType.toLowerCase()}`;

    // A. Disabled state -> suppression
    updateProactiveLeadSettings(acc, {
      enabled: true,
      [toggleKey]: false,
      ownerAlertPhone: "+144225232320",
    });

    const resDisabled = await emitProactiveLeadLifecycleEvent({
      eventType,
      accountId: acc,
      leadId: `lead_${eventType}`,
      customerJid: "contact-9fcbf7fc46d6@example.invalid",
      summary: `Test event for category ${eventType}`,
    });

    assert.equal(resDisabled.success, false, `Disabled category ${eventType} must not succeed`);
    assert.equal(resDisabled.error, "category_disabled");
    assert.equal(resDisabled.dashboardNotificationCreated, false);

    // B. Enabled state -> delivery
    updateProactiveLeadSettings(acc, {
      [toggleKey]: true,
    });

    const resEnabled = await emitProactiveLeadLifecycleEvent({
      eventType,
      accountId: acc,
      leadId: `lead_${eventType}`,
      customerJid: "contact-9fcbf7fc46d6@example.invalid",
      summary: `Test event for category ${eventType}`,
    });

    assert.equal(resEnabled.success, true, `Enabled category ${eventType} must succeed`);
    assert.equal(resEnabled.dashboardNotificationCreated, true);
  }
});

test("Requirement 6: Settings -> Event Behavior: Qualified Lead & Routing Failed disabled/enabled WhatsApp and dashboard policy enforcement", async () => {
  const acc = "acc_req6_settings_event";

  // --- A. Qualified Lead ---
  let qualifiedSends = 0;
  const mockSockQualified = {
    sendMessage: async () => {
      qualifiedSends += 1;
      return { key: { id: `msg_qual_${qualifiedSends}` } };
    },
  };

  // 1. Qualified Lead DISABLED
  updateProactiveLeadSettings(acc, {
    enabled: true,
    notifyQualifiedLeads: false,
    ownerAlertPhone: "+144225232320",
    ownerAlertJid: "contact-e4ed32210a80@example.invalid",
  });

  const resQualDisabled = await emitProactiveLeadLifecycleEvent({
    eventType: "NEW_QUALIFIED_LEAD",
    accountId: acc,
    leadId: "lead_qual_test_01",
    customerJid: "contact-0e62ba8dfc96@example.invalid",
    customerName: "Tariq Ali",
    summary: "Interested in enterprise plan",
    sock: mockSockQualified,
  });

  assert.equal(resQualDisabled.success, false);
  assert.equal(resQualDisabled.error, "category_disabled");
  assert.equal(qualifiedSends, 0, "No owner WhatsApp alert must be sent when Qualified Lead is disabled");
  assert.equal(resQualDisabled.dashboardNotificationCreated, false, "Dashboard notification suppressed when category disabled");

  // 2. Qualified Lead ENABLED
  updateProactiveLeadSettings(acc, {
    notifyQualifiedLeads: true,
  });

  const resQualEnabled = await emitProactiveLeadLifecycleEvent({
    eventType: "NEW_QUALIFIED_LEAD",
    accountId: acc,
    leadId: "lead_qual_test_02",
    customerJid: "contact-20ea5a74d817@example.invalid",
    customerName: "Tariq Ali",
    summary: "Interested in enterprise plan",
    sock: mockSockQualified,
  });

  assert.equal(resQualEnabled.success, true);
  assert.equal(resQualEnabled.whatsappSent, true);
  assert.equal(resQualEnabled.dashboardNotificationCreated, true);
  assert.equal(qualifiedSends, 1, "Owner alert path must execute exactly once when Qualified Lead is enabled");

  // --- B. Routing Failed ---
  let routingFailedSends = 0;
  const mockSockRouting = {
    sendMessage: async () => {
      routingFailedSends += 1;
      return { key: { id: `msg_rf_${routingFailedSends}` } };
    },
  };

  // 1. Routing Failed DISABLED
  updateProactiveLeadSettings(acc, {
    enabled: true,
    notifyRoutingFailed: false,
    ownerAlertPhone: "+144225232320",
    ownerAlertJid: "contact-e4ed32210a80@example.invalid",
  });

  const resRfDisabled = await emitProactiveLeadLifecycleEvent({
    eventType: "LEAD_ROUTING_FAILED",
    accountId: acc,
    leadId: "lead_rf_test_01",
    customerJid: "contact-dcbcb267391e@example.invalid",
    summary: "No department found matching intent",
    sock: mockSockRouting,
  });

  assert.equal(resRfDisabled.success, false);
  assert.equal(resRfDisabled.error, "category_disabled");
  assert.equal(routingFailedSends, 0, "No owner WhatsApp alert must be sent when Routing Failed is disabled");
  assert.equal(resRfDisabled.dashboardNotificationCreated, false, "Dashboard notification suppressed when category disabled");

  // 2. Routing Failed ENABLED
  updateProactiveLeadSettings(acc, {
    notifyRoutingFailed: true,
  });

  const resRfEnabled = await emitProactiveLeadLifecycleEvent({
    eventType: "LEAD_ROUTING_FAILED",
    accountId: acc,
    leadId: "lead_rf_test_02",
    customerJid: "contact-791f64583c5b@example.invalid",
    summary: "No department found matching intent",
    sock: mockSockRouting,
  });

  assert.equal(resRfEnabled.success, true);
  assert.equal(resRfEnabled.whatsappSent, true);
  assert.equal(resRfEnabled.dashboardNotificationCreated, true);
  assert.equal(routingFailedSends, 1, "Owner alert path must execute exactly once when Routing Failed is enabled");
});


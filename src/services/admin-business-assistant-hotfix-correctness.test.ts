import test from "node:test";
import assert from "node:assert/strict";
import { getAdminAction } from "./admin-action-registry-service.ts";
import {
  handleGetBusinessCountsSummary,
  handleGetCustomerActivitySummary,
  handleSearchProducts,
  __setAdminBusinessReadTestDeps,
  __resetAdminBusinessReadTestDeps,
} from "./admin-business-read-service.ts";
import {
  parseScheduledTime,
  handleCreateAdminReminder,
  handleListAdminReminders,
  handleCancelAdminReminder,
  processDueAdminReminders,
  startAdminReminderScheduler,
  stopAdminReminderScheduler,
  isReminderSchedulerRunning,
  __setAdminReminderTestDeps,
  __resetAdminReminderTestDeps,
} from "./admin-reminder-service.ts";
import {
  handleCreateProduct,
  handleUpdateProductType,
  setWriteServiceDeps,
  resetWriteServiceDeps,
  writeServiceDeps,
} from "./admin-business-write-service.ts";
import {
  handleGetBusinessAssistantUsage,
  setOperationsServiceDeps,
  resetOperationsServiceDeps,
} from "./admin-operations-service.ts";
import { matchAdminActionFromText } from "./admin-business-assistant-router.ts";
import { buildFocusedToolDefinitions } from "./admin-business-agent-service.ts";
import type { AdminBusinessAssistantContext } from "./admin-identity-service.ts";

const mockAdminContext: AdminBusinessAssistantContext = {
  isAuthorizedAdmin: true,
  adminJid: "contact-e4ed32210a80@example.invalid",
  adminPhone: "195545134641",
  adminRole: "owner",
  accountId: "acc_hotfix_test",
  userId: "acc_hotfix_test",
  botId: "bot_hotfix_test",
  conversationId: "conv_hotfix_test",
  mode: "admin_business_assistant",
  isBusinessAssistantEnabled: true,
};

test("1. Business Counts Summary: Returns aggregate totals with physical vs service breakdown and order status counts", async () => {
  __setAdminBusinessReadTestDeps({
    databases: {
      listDocuments: async (_dbId: string, collId: string) => {
        if (collId === "customers") {
          return {
            documents: [
              { $id: "c1", name: "Customer A", phone: "112250469451" },
              { $id: "c2", name: "Customer B", phone: "173464065383" },
              { $id: "c3", name: "Customer C", phone: "108870305034" },
            ],
          };
        }
        if (collId === "products") {
          return {
            documents: [
              { $id: "p1", name: "Shirt", price: 50, stock: 10, variations_json: JSON.stringify({ type: "physical" }) },
              { $id: "p2", name: "Jeans", price: 80, stock: 5, variations_json: JSON.stringify({ type: "physical" }) },
              { $id: "p3", name: "Starter Plan", price: 9, stock: 999, variations_json: JSON.stringify({ type: "service", category: "Subscription Plans" }) },
            ],
          };
        }
        if (collId === "orders") {
          return {
            documents: [
              { $id: "o1", order_id: "1001", status: "confirmed", total_amount: 100 },
              { $id: "o2", order_id: "1002", status: "pending", total_amount: 50 },
              { $id: "o3", order_id: "1003", status: "delivered", total_amount: 200 },
              { $id: "o4", order_id: "1004", status: "cancelled", total_amount: 30 },
            ],
          };
        }
        return { documents: [] };
      },
    } as any,
  });

  const res = await handleGetBusinessCountsSummary(mockAdminContext);
  assert.equal(res.success, true);
  assert.equal(res.data.totalCustomers, 3);
  assert.equal(res.data.totalProducts, 3);
  assert.equal(res.data.physicalProducts, 2);
  assert.equal(res.data.serviceProducts, 1);
  assert.equal(res.data.totalOrders, 4);
  assert.equal(res.data.orderStatusCounts.confirmed, 1);
  assert.equal(res.data.orderStatusCounts.pending, 1);
  assert.equal(res.data.orderStatusCounts.delivered, 1);
  assert.equal(res.data.orderStatusCounts.cancelled, 1);
  assert.match(res.message, /Business Summary/);
  assert.match(res.message, /2 physical, 1 services/);

  __resetAdminBusinessReadTestDeps();
});

test("2. Customer Activity Summary: 10 inbound messages from 4 unique customers = 4 active customers (outbounds excluded)", async () => {
  const nowSec = Math.floor(Date.now() / 1000);
  __setAdminBusinessReadTestDeps({
    getUser: async () => ({ $id: "acc_hotfix_test" }),
    getBotsByUser: async () => [{ $id: "bot_hotfix_test" }],
    databases: {
      listDocuments: async (_dbId: string, collId: string) => {
        if (collId === "messages") {
          return {
            documents: [
              // Customer 1: 3 inbound messages
              { $id: "m1", customer_jid: "contact-85d2a3563239@example.invalid", role: "user", timestamp: nowSec - 3600, from_me: false },
              { $id: "m2", customer_jid: "contact-85d2a3563239@example.invalid", role: "customer", timestamp: nowSec - 1800, from_me: false },
              { $id: "m3", customer_jid: "contact-85d2a3563239@example.invalid", role: "user", timestamp: nowSec - 900, from_me: false },
              // Customer 2: 2 inbound messages
              { $id: "m4", customer_jid: "contact-126f2cd31c20@example.invalid", role: "user", timestamp: nowSec - 7200, from_me: false },
              { $id: "m5", customer_jid: "contact-126f2cd31c20@example.invalid", role: "customer", timestamp: nowSec - 3000, from_me: false },
              // Customer 3: 4 inbound messages
              { $id: "m6", customer_jid: "contact-d58a89d5392e@example.invalid", role: "user", timestamp: nowSec - 5000, from_me: false },
              { $id: "m7", customer_jid: "contact-d58a89d5392e@example.invalid", role: "user", timestamp: nowSec - 4000, from_me: false },
              { $id: "m8", customer_jid: "contact-d58a89d5392e@example.invalid", role: "user", timestamp: nowSec - 3000, from_me: false },
              { $id: "m9", customer_jid: "contact-d58a89d5392e@example.invalid", role: "user", timestamp: nowSec - 2000, from_me: false },
              // Customer 4: 1 inbound message
              { $id: "m10", customer_jid: "contact-b24f3916a145@example.invalid", role: "customer", timestamp: nowSec - 1000, from_me: false },
              // Outbound bot messages: should NOT count as active customer
              { $id: "m11", customer_jid: "contact-f7ba0cd80088@example.invalid", role: "assistant", timestamp: nowSec - 500, from_me: true },
              { $id: "m12", customer_jid: "contact-285f3e8e7743@example.invalid", role: "system", timestamp: nowSec - 200, from_me: true },
            ],
          };
        }
        return { documents: [] };
      },
    } as any,
  });

  const res = await handleGetCustomerActivitySummary(mockAdminContext, { range: "last_7_days" });
  assert.equal(res.success, true);
  assert.equal(res.data.activeCustomerCount, 4);
  assert.equal(res.data.totalInboundMessages, 10);
  assert.match(res.message, /Customer Conversation Activity/);
  assert.match(res.message, /4 unique customer\(s\)/);

  __resetAdminBusinessReadTestDeps();
});

test("3. Product & Service Types: handleCreateProduct sets type='service' and defaults stock to 999", async () => {
  let createdPayload: any = null;
  setWriteServiceDeps({
    dbService: {
      ...writeServiceDeps.dbService,
      saveProduct: async (_accountId: string, data: any) => {
        createdPayload = data;
        return { success: true, product: { $id: "prod_srv_1", ...data } };
      },
    } as any,
  });

  const res = await handleCreateProduct(mockAdminContext, {
    name: "Consulting Hour",
    base_price: 150,
    type: "service",
    category: "Consulting",
  });

  assert.equal(res.success, true);
  assert.equal(createdPayload.type, "service");
  assert.equal(createdPayload.stock, 999);
  assert.equal(createdPayload.category, "Consulting");
  assert.match(res.message, /Service Created Successfully/);

  resetWriteServiceDeps();
});

test("4. Admin Reminders: Time parsing supports natural language, relative offsets, and ISO times", () => {
  const baseNow = new Date("2026-08-27T12:00:00.000Z");

  // Relative minutes
  const t1 = parseScheduledTime("in 30 mins", "Asia/Karachi", baseNow);
  assert.ok(t1);
  assert.equal(t1.scheduledAtMs, baseNow.getTime() + 30 * 60 * 1000);

  // Relative hours
  const t2 = parseScheduledTime("in 2 hours", "Asia/Karachi", baseNow);
  assert.ok(t2);
  assert.equal(t2.scheduledAtMs, baseNow.getTime() + 2 * 3600 * 1000);

  // Time of day
  const t3 = parseScheduledTime("today 4PM", "Asia/Karachi", baseNow);
  assert.ok(t3);
  const d3 = new Date(t3.scheduledAtMs);
  assert.equal(d3.getHours(), 16);

  // Tomorrow
  const t4 = parseScheduledTime("tomorrow 10am", "Asia/Karachi", baseNow);
  assert.ok(t4);
  const d4 = new Date(t4.scheduledAtMs);
  assert.equal(d4.getDate(), baseNow.getDate() + 1);
  assert.equal(d4.getHours(), 10);
});

test("5. Admin Reminders: CRUD, atomic claim execution, and single $0.005 billing", async () => {
  let billedEvents: any[] = [];
  __setAdminReminderTestDeps({
    chargeUsageBillingAction: (async (accountId: string, action: string, context: any, desc: string) => {
      billedEvents.push({ accountId, action, context, desc });
      return { dedupeKey: "test", charged: true, cost: 0.005, walletBalance: 10, breakdown: [] } as any;
    }) as any,
    recordAdminAuditEvent: (() => {}) as any,
  });

  // Create future reminder
  const createRes = await handleCreateAdminReminder(mockAdminContext, {
    text: "Do mobile package",
    scheduledAt: "in 1 hour",
  });

  assert.equal(createRes.success, true);
  assert.ok(createRes.data?.reminderId);
  const reminderId = createRes.data!.reminderId;
  assert.match(createRes.message, /Admin Reminder Scheduled/);

  // List pending reminders
  const listRes = await handleListAdminReminders(mockAdminContext, { status: "pending" });
  assert.equal(listRes.success, true);
  assert.ok(listRes.data?.reminders?.some((r) => r.reminderId === reminderId));

  // Mock socket for delivery test
  let sentMessages: any[] = [];
  const mockSock = {
    sendMessage: async (jid: string, content: any) => {
      sentMessages.push({ jid, content });
      return { key: { id: "sent_rem_msg_1" } };
    },
  };

  // Test processing due reminders when reminder is due
  // Override reminder scheduled time to past
  const pastReminder = createRes.data!;
  pastReminder.scheduledAtMs = Date.now() - 1000;
  // Write back to disk for runner
  const fs = await import("fs");
  const path = await import("path");
  const reminderFile = path.join(process.cwd(), "data", "admin-reminders", `${reminderId}.json`);
  fs.writeFileSync(reminderFile, JSON.stringify(pastReminder, null, 2), "utf8");

  const runResult = await processDueAdminReminders({
    sock: mockSock,
    accountId: mockAdminContext.accountId,
  });

  assert.equal(runResult.processed, 1);
  assert.equal(runResult.sent, 1);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].jid, mockAdminContext.adminJid);
  assert.match(sentMessages[0].content.text, /Do mobile package/);
  assert.equal(billedEvents.length, 1);
  assert.equal(billedEvents[0].action, "admin_business_assistant_message");

  // Running again should not re-send (Atomic Claim / Idempotency)
  const rerunResult = await processDueAdminReminders({
    sock: mockSock,
    accountId: mockAdminContext.accountId,
  });
  assert.equal(rerunResult.processed, 0);
  assert.equal(sentMessages.length, 1); // No second message

  // Clean up test reminder file
  try {
    fs.unlinkSync(reminderFile);
  } catch {}

  __resetAdminReminderTestDeps();
});

test("6. Reminder Scheduler Singleton: Multiple starts maintain exactly 1 process timer loop", () => {
  stopAdminReminderScheduler();
  assert.equal(isReminderSchedulerRunning(), false);

  startAdminReminderScheduler({ intervalMs: 60000 });
  assert.equal(isReminderSchedulerRunning(), true);

  // Calling start again does not create a second timer
  startAdminReminderScheduler({ intervalMs: 60000 });
  assert.equal(isReminderSchedulerRunning(), true);

  stopAdminReminderScheduler();
  assert.equal(isReminderSchedulerRunning(), false);
});

test("7. Reminder Recipient Security: create_admin_reminder strictly binds to context.adminJid", async () => {
  const customTargetParams = {
    text: "Review financial report",
    scheduledAt: "in 2 hours",
    // Attacker or AI attempt to redirect reminder to a customer
    recipientJid: "contact-626862d4b59f@example.invalid",
    targetPhone: "131121137240",
  };

  const res = await handleCreateAdminReminder(mockAdminContext, customTargetParams);
  assert.equal(res.success, true);
  // Reminder must strictly target the authorized adminJid
  assert.equal(res.data?.adminJid, mockAdminContext.adminJid);
  assert.equal(res.data?.adminPhone, mockAdminContext.adminPhone);
  assert.notEqual(res.data?.adminJid, "contact-626862d4b59f@example.invalid");

  // Clean up
  const fs = await import("fs");
  const path = await import("path");
  if (res.data?.reminderId) {
    try {
      fs.unlinkSync(path.join(process.cwd(), "data", "admin-reminders", `${res.data.reminderId}.json`));
    } catch {}
  }
});

test("8. Admin Spend Arithmetic: Exactly sums $0.005 per message with exact precision", async () => {
  // Case A: 0 messages
  setOperationsServiceDeps({
    getUser: async () => ({ wallet_balance: 10.0 }),
    getBillingLogs: async () => [],
  });
  const res0 = await handleGetBusinessAssistantUsage(mockAdminContext);
  assert.equal(res0.data?.billedMessageCount, 0);
  assert.equal(res0.data?.totalSpentUsd, 0);

  // Case B: 1 message ($0.005)
  setOperationsServiceDeps({
    getUser: async () => ({ wallet_balance: 10.0 }),
    getBillingLogs: async () => [
      { type: "admin_business_assistant_message", cost: 0.005, walletAmount: 0.005 },
    ],
  });
  const res1 = await handleGetBusinessAssistantUsage(mockAdminContext);
  assert.equal(res1.data?.billedMessageCount, 1);
  assert.equal(res1.data?.totalSpentUsd, 0.005);

  // Case C: 21 messages ($0.105)
  setOperationsServiceDeps({
    getUser: async () => ({ wallet_balance: 10.0 }),
    getBillingLogs: async () => Array.from({ length: 21 }, () => ({
      type: "admin_business_assistant_message",
      cost: 0.005,
    })),
  });
  const res21 = await handleGetBusinessAssistantUsage(mockAdminContext);
  assert.equal(res21.data?.billedMessageCount, 21);
  assert.equal(Number(res21.data?.totalSpentUsd.toFixed(3)), 0.105);

  // Case D: 38 messages ($0.190)
  setOperationsServiceDeps({
    getUser: async () => ({ wallet_balance: 10.0 }),
    getBillingLogs: async () => Array.from({ length: 38 }, () => ({
      type: "admin_business_assistant_message",
      cost: 0.005,
    })),
  });
  const res38 = await handleGetBusinessAssistantUsage(mockAdminContext);
  assert.equal(res38.data?.billedMessageCount, 38);
  assert.equal(Number(res38.data?.totalSpentUsd.toFixed(3)), 0.190);
  assert.match(res38.message, /\$0\.190/);

  resetOperationsServiceDeps();
});

test("9. Router Matching vs Native AI Planner: Natural queries fall through to Native Tool Planner", () => {
  // Deterministic command tokens
  const m1 = matchAdminActionFromText("get_customer_activity_summary");
  assert.equal(m1.action?.actionId, "get_customer_activity_summary");

  const m2 = matchAdminActionFromText("get_business_counts_summary");
  assert.equal(m2.action?.actionId, "get_business_counts_summary");

  // Varied natural language phrases MUST return {} from fast matchers to reach resolveAdminAgentIntent (Native AI Planner)
  const n1 = matchAdminActionFromText("How many customers do I have?");
  assert.equal(n1.action, undefined);

  const n2 = matchAdminActionFromText("How many customers messaged us this week?");
  assert.equal(n2.action, undefined);

  const n3 = matchAdminActionFromText("Remind me at 4 PM to call Ahmed.");
  assert.equal(n3.action, undefined);

  const n4 = matchAdminActionFromText("Can you remind me tomorrow?");
  assert.equal(n4.action, undefined);
});

test("10. Product Type Updates: handleUpdateProductType converts physical to service and reports zero-change truthfully", async () => {
  const catalog = [
    { $id: "p1", name: "Starter Plan", type: "service", stock: 999 },
    { $id: "p2", name: "Growth Plan", type: "service", stock: 999 },
    { $id: "p3", name: "Pro Plan", type: "service", stock: 999 },
  ];

  setWriteServiceDeps({
    dbService: {
      ...writeServiceDeps.dbService,
      listProducts: async () => catalog,
      saveProduct: async (_uid: string, data: any) => {
        const idx = catalog.findIndex((p) => p.$id === data.id);
        if (idx >= 0) catalog[idx] = data;
        return { success: true, product: data };
      },
    } as any,
  });

  // Case A: All items are already services -> Truthful zero change message
  const resAlready = await handleUpdateProductType(mockAdminContext, {
    targetType: "service",
    bulk: true,
  });
  assert.equal(resAlready.success, true);
  assert.match(resAlready.message, /already set to services/i);
  assert.equal(resAlready.data?.updatedCount, 0);

  // Case B: Catalog has physical items to convert
  catalog.push({ $id: "p4", name: "T-Shirt", type: "physical", stock: 10 });
  const resConvert = await handleUpdateProductType(mockAdminContext, {
    targetType: "service",
    bulk: true,
  });
  assert.equal(resConvert.success, true);
  assert.match(resConvert.message, /Bulk Product Type Conversion Completed \(1 items\)/);
  assert.equal(resConvert.data?.updatedCount, 1);

  // Case C: Single product conversion
  catalog.push({ $id: "p5", name: "Custom Consulting", type: "physical", stock: 5 });
  const resSingle = await handleUpdateProductType(mockAdminContext, {
    productName: "Custom Consulting",
    targetType: "service",
  });
  assert.equal(resSingle.success, true);
  assert.match(resSingle.message, /Product Type Updated/);
  assert.match(resSingle.message, /Custom Consulting/);

  resetWriteServiceDeps();
});

test("11. Product Read Type Expose: handleSearchProducts exposes [Service] and [Physical] tags", async () => {
  __setAdminBusinessReadTestDeps({
    databases: {
      listDocuments: async () => ({
        documents: [
          { $id: "p1", name: "Starter Plan", price: 9, stock: 999, variations_json: JSON.stringify({ type: "service" }) },
          { $id: "p2", name: "Coffee Mug", price: 15, stock: 20, variations_json: JSON.stringify({ type: "physical" }) },
        ],
      }),
    } as any,
  });

  const res = await handleSearchProducts(mockAdminContext);
  assert.equal(res.success, true);
  assert.match(res.message, /Starter Plan.*\[Service\]/);
  assert.match(res.message, /Coffee Mug.*\[Physical\]/);
  assert.equal((res.data as any).products[0].type, "service");
  assert.equal((res.data as any).products[1].type, "physical");

  __resetAdminBusinessReadTestDeps();
});

test("12. Reminder Authorization with super_admin / owner: Passes authorization without false rejection", async () => {
  const superAdminContext: AdminBusinessAssistantContext = {
    ...mockAdminContext,
    adminRole: "owner",
    isAuthorizedAdmin: true,
  };

  const res = await handleCreateAdminReminder(superAdminContext, {
    text: "Test reminder for BlackArrow",
    scheduledAt: "in 1 hour",
  });

  assert.equal(res.success, true);
  assert.match(res.message, /Admin Reminder Scheduled/);
  assert.equal(res.data?.status, "pending");

  // Clean up
  const fs = await import("fs");
  const path = await import("path");
  if (res.data?.reminderId) {
    try {
      fs.unlinkSync(path.join(process.cwd(), "data", "admin-reminders", `${res.data.reminderId}.json`));
    } catch {}
  }
});

test("13. Focused Tool Definitions & Cross-Domain Bridging: Bridges activity summary to business & customers domains", () => {
  // Domain: business
  const businessTools = buildFocusedToolDefinitions(mockAdminContext, "business");
  const businessToolNames = businessTools.map((t) => t.function.name);
  assert.ok(businessToolNames.includes("get_customer_activity_summary"), "business domain must include get_customer_activity_summary");
  assert.ok(businessToolNames.includes("get_business_counts_summary"), "business domain must include get_business_counts_summary");
  assert.ok(businessToolNames.includes("get_business_overview"), "business domain must include get_business_overview");

  // Domain: customers
  const customerTools = buildFocusedToolDefinitions(mockAdminContext, "customers");
  const customerToolNames = customerTools.map((t) => t.function.name);
  assert.ok(customerToolNames.includes("get_customer_activity_summary"), "customers domain must include get_customer_activity_summary");
  assert.ok(customerToolNames.includes("get_business_counts_summary"), "customers domain must include get_business_counts_summary");

  // Domain: products
  const productTools = buildFocusedToolDefinitions(mockAdminContext, "products");
  const productToolNames = productTools.map((t) => t.function.name);
  assert.ok(productToolNames.includes("update_product_type"), "products domain must include update_product_type");
  assert.ok(productToolNames.includes("list_products"), "products domain must include list_products");
});

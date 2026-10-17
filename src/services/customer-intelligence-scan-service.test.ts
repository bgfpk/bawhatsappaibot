import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetCustomerIntelligenceScanTestDeps,
  __setCustomerIntelligenceScanTestDeps,
  buildCustomerIntelligencePromptSection,
  getCustomerIntelligenceFreshSkipReason,
  maybeRunCustomerIntelligenceScan,
  normalizeWhatsAppCustomerIntelligence,
} from "./customer-intelligence-scan-service.ts";

test.afterEach(() => {
  __resetCustomerIntelligenceScanTestDeps();
});

function baseInput(overrides: any = {}) {
  return {
    sock: {
      onWhatsApp: async () => [{ exists: true }],
      getBusinessProfile: async () => ({
        wid: "contact-bb1fa5c89e92@example.invalid",
        name: "Acme Bakery",
        category: "Bakery",
        description: "Custom cakes and desserts",
        email: "contact-474560f28df4@example.invalid",
        website: ["https://example.com"],
        address: "Shop 1, Market Road",
      }),
      fetchStatus: async () => ({ status: "Open today" }),
      profilePictureUrl: async () => "https://example.com/profile.jpg",
      getCatalog: async () => ({
        products: Array.from({ length: 12 }, (_, index) => ({
          name: `Cake ${index + 1}`,
          price: 10 + index,
          currency: "USD",
          description: "Fresh cake",
        })),
      }),
    },
    accountId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "contact-ee7c1e411a7c@example.invalid",
    customerJid: "contact-bb1fa5c89e92@example.invalid",
    pushName: "Acme",
    botConfig: { customerIntelligenceScanEnabled: 1, autoReply: true },
    existingProfile: {},
    ...overrides,
  };
}

test("feature off does not scan or charge", async () => {
  let fetched = false;
  __setCustomerIntelligenceScanTestDeps({
    previewUsageBillingAction: async () => {
      throw new Error("should_not_preview");
    },
  } as any);

  const result = await maybeRunCustomerIntelligenceScan(baseInput({
    botConfig: { customerIntelligenceScanEnabled: 0 },
    sock: { getBusinessProfile: async () => { fetched = true; } },
  }));

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "feature_off");
  assert.equal(fetched, false);
});

test("business profile useful data saves then charges one successful scan", async () => {
  const events: any[] = [];
  const calls: string[] = [];
  let savedPatch: any = null;
  __setCustomerIntelligenceScanTestDeps({
    previewUsageBillingAction: async () => ({ allowed: true, cost: 0.001 }),
    updateCustomerProfile: async (_bot: string, _jid: string, patch: any) => {
      calls.push("save");
      savedPatch = patch;
    },
    chargeUsageBillingAction: async () => {
      calls.push("charge");
      return { charged: true, cost: 0.001 };
    },
    emitLiveConsoleEvent: (event: any) => events.push(event) as any,
    now: () => 1770000000,
  } as any);

  const result = await maybeRunCustomerIntelligenceScan(baseInput());

  assert.equal(result.status, "saved");
  assert.equal(result.charged, true);
  assert.equal((result as any).chargeStatus, "charged");
  assert.deepEqual(calls, ["save", "charge"]);
  assert.equal(savedPatch.whatsappCustomerIntelligence.businessName, "Acme Bakery");
  assert.equal(savedPatch.whatsappCustomerIntelligence.catalogSampleProducts.length, 10);
  assert.equal(events.some((event) => event.type === "customer_profile_scan_charged"), true);
});

test("fresh saved intelligence skips without charge", async () => {
  let charged = false;
  __setCustomerIntelligenceScanTestDeps({
    previewUsageBillingAction: async () => ({ allowed: true, cost: 0.001 }),
    chargeUsageBillingAction: async () => {
      charged = true;
      return { charged: true };
    },
    emitLiveConsoleEvent: (() => {}) as any,
    now: () => 1000,
  } as any);

  const result = await maybeRunCustomerIntelligenceScan(baseInput({
    existingProfile: {
      whatsappCustomerIntelligence: {
        expiresAt: 5000,
        businessAccount: true,
        businessName: "Fresh Co",
      },
    },
  }));

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "fresh");
  assert.equal(charged, false);
});

test("fresh no-useful intelligence skips without fetching or charging", async () => {
  let fetched = false;
  let charged = false;
  let previewed = false;
  const events: any[] = [];
  __setCustomerIntelligenceScanTestDeps({
    previewUsageBillingAction: async () => {
      previewed = true;
      return { allowed: true, cost: 0.001 };
    },
    chargeUsageBillingAction: async () => {
      charged = true;
      return { charged: true };
    },
    emitLiveConsoleEvent: (event: any) => events.push(event) as any,
    now: () => 1000,
  } as any);

  const result = await maybeRunCustomerIntelligenceScan(baseInput({
    existingProfile: {
      whatsappCustomerIntelligence: {
        expiresAt: 5000,
        businessAccount: false,
        lastError: "no_useful_visible_business_data",
      },
    },
    sock: {
      getBusinessProfile: async () => {
        fetched = true;
        return {};
      },
    },
  }));

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "fresh_no_useful_data");
  assert.equal(fetched, false);
  assert.equal(previewed, false);
  assert.equal(charged, false);
  assert.equal(events[0].message, "Recent no-useful profile scan is still fresh.");
});

test("no-useful scan writes negative cache and never charges", async () => {
  let charged = false;
  let savedPatch: any = null;
  const events: any[] = [];
  __setCustomerIntelligenceScanTestDeps({
    previewUsageBillingAction: async () => ({ allowed: true, cost: 0.001 }),
    updateCustomerProfile: async (_bot: string, _jid: string, patch: any) => {
      savedPatch = patch;
    },
    chargeUsageBillingAction: async () => {
      charged = true;
      return { charged: true };
    },
    emitLiveConsoleEvent: (event: any) => events.push(event) as any,
    now: () => 2000,
  } as any);

  const result = await maybeRunCustomerIntelligenceScan(baseInput({
    sock: {
      onWhatsApp: async () => [{ exists: true }],
      getBusinessProfile: async () => null,
      fetchStatus: async () => null,
      profilePictureUrl: async () => null,
      getCatalog: async () => null,
    },
  }));

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "no_useful_data");
  assert.equal(savedPatch.whatsappCustomerIntelligence.lastError, "no_useful_visible_business_data");
  assert.equal(charged, false);
  assert.equal(events.some((event) => event.message.includes("No wallet charge")), true);
});

test("duplicate customer intelligence charge is shown as no new debit", async () => {
  const events: any[] = [];
  __setCustomerIntelligenceScanTestDeps({
    previewUsageBillingAction: async () => ({ allowed: true, cost: 0.001 }),
    updateCustomerProfile: async () => {},
    chargeUsageBillingAction: async () => ({ charged: false, duplicate: true, cost: 0, dedupeKey: "dedupe_1234567890" }),
    emitLiveConsoleEvent: (event: any) => events.push(event) as any,
    now: () => 1770000000,
  } as any);

  const result = await maybeRunCustomerIntelligenceScan(baseInput());
  const duplicateEvent = events.find((event) => event.metadata?.status === "duplicate");

  assert.equal(result.status, "saved");
  assert.equal((result as any).chargeStatus, "duplicate");
  assert.equal(duplicateEvent.title, "Customer scan charge already recorded");
  assert.equal(duplicateEvent.message, "Wallet charge already recorded; no new debit.");
});

test("insufficient wallet skips before fetching profile", async () => {
  let fetched = false;
  __setCustomerIntelligenceScanTestDeps({
    previewUsageBillingAction: async () => ({ allowed: false, cost: 0.001, reason: "insufficient_wallet" }),
    emitLiveConsoleEvent: (() => {}) as any,
  } as any);

  const result = await maybeRunCustomerIntelligenceScan(baseInput({
    sock: {
      getBusinessProfile: async () => {
        fetched = true;
        return {};
      },
    },
  }));

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "insufficient_wallet");
  assert.equal(fetched, false);
});

test("save failure does not charge", async () => {
  let charged = false;
  __setCustomerIntelligenceScanTestDeps({
    previewUsageBillingAction: async () => ({ allowed: true, cost: 0.001 }),
    updateCustomerProfile: async () => {
      throw new Error("save failed");
    },
    chargeUsageBillingAction: async () => {
      charged = true;
      return { charged: true };
    },
    emitLiveConsoleEvent: (() => {}) as any,
  } as any);

  const result = await maybeRunCustomerIntelligenceScan(baseInput());

  assert.equal(result.status, "failed");
  assert.equal(result.reason, "save_failed");
  assert.equal(charged, false);
});

test("fresh skip helper distinguishes useful and negative cache", () => {
  assert.equal(getCustomerIntelligenceFreshSkipReason({ expiresAt: 200, businessName: "A" }, 100), "fresh");
  assert.equal(getCustomerIntelligenceFreshSkipReason({ expiresAt: 200, lastError: "no_useful_data" }, 100), "fresh_no_useful_data");
  assert.equal(getCustomerIntelligenceFreshSkipReason({ expiresAt: 50, lastError: "no_useful_data" }, 100), "");
});

test("normalization marks personal/no business data as not useful", () => {
  const scan = normalizeWhatsAppCustomerIntelligence({
    jid: "contact-bb1fa5c89e92@example.invalid",
    pushName: "Just A Person",
    onWhatsApp: [{ exists: true }],
    scannedAt: 100,
  });

  assert.equal(scan.businessAccount, false);
  assert.equal(scan.displayName, "Just A Person");
  assert.equal(scan.catalogSampleProducts.length, 0);
});

test("AI context includes compact observed profile and address confirmation guard", () => {
  const prompt = buildCustomerIntelligencePromptSection({
    whatsappCustomerIntelligence: {
      source: "whatsapp_visible_profile",
      businessAccount: true,
      businessName: "Acme Bakery",
      category: "Bakery",
      address: "Shop 1",
      catalogProductCount: 2,
      catalogSampleProducts: [{ name: "Chocolate Cake", price: 12, currency: "USD" }],
    },
  });

  assert.match(prompt, /Observed WhatsApp business profile/);
  assert.match(prompt, /Acme Bakery/);
  assert.match(prompt, /Do not treat profile address as delivery address unless the customer confirms it/);
});

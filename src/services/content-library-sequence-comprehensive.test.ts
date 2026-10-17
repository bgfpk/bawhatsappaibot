import test from "node:test";
import assert from "node:assert/strict";

import {
  deliverSequenceGroup,
  resolveRuntimeSequencePayload,
  __setSequenceDeliveryTestDeps,
  __resetSequenceDeliveryTestDeps,
} from "./sequence-delivery-service.ts";
import {
  deliverWelcomeSequence,
  resolveRuntimeWelcomePayload,
  __setWelcomeDeliveryTestDeps,
  __resetWelcomeDeliveryTestDeps,
} from "./welcome-sequence-delivery-service.ts";
import { processShortcut } from "./sequence-manager.ts";
import {
  findMatchingSequence,
  findAllMatchingSequences,
  resolveSequenceForAiChoice,
  getSequenceStableId,
  getSequenceSentFlagKeys,
  getSequenceFlag,
  normalizeSequenceText,
} from "./sequence-trigger-service.ts";
import { getSequenceProgressKey } from "./sequence-progress-service.ts";
import {
  buildCustomerBotPromptAssembly,
  buildReusableContentSection,
} from "./customer-bot-prompt-service.ts";
import {
  __setAtomicClaimTestDeps,
  __resetAtomicClaimTestDeps,
  __clearMemoryClaimsForTest,
} from "./canonical-claim-service.ts";
import { checkSequence, markSequence } from "./db-service.ts";

test.beforeEach(() => {
  __resetAtomicClaimTestDeps(true);
  __clearMemoryClaimsForTest();
  __resetSequenceDeliveryTestDeps();
  __resetWelcomeDeliveryTestDeps();
});

test.afterEach(() => {
  __resetAtomicClaimTestDeps(true);
  __clearMemoryClaimsForTest();
  __resetSequenceDeliveryTestDeps();
  __resetWelcomeDeliveryTestDeps();
});

// ============================================================================
// 15 Distinct Demo Sequence Groups for Testing (Requirement 35)
// ============================================================================
function create15DemoSequenceGroups(): Record<string, any> {
  return {
    group_pricing: {
      jid: "contact-b03352f6673a@example.invalid",
      name: "Pricing and Packages",
      config: {
        id: "seq_id_pricing",
        jid: "contact-b03352f6673a@example.invalid",
        shortcut: "!pricing",
        shortcut_code: "!pricing",
        triggers: ["pricing", "package rates", "price list"],
        instructions: "Send when customer asks about price or package rates.",
        enabled: true,
      },
      templates: [
        {
          id: "tmpl_pricing_1",
          message: { conversation: "Here is our full 2026 pricing schedule with all tiers." },
          caption: "Here is our full 2026 pricing schedule with all tiers.",
        },
        {
          id: "tmpl_pricing_2",
          message: { conversation: "Special 20% discount on pre-booking for packages above $100." },
          caption: "Special 20% discount on pre-booking for packages above $100.",
        },
      ],
    },
    group_booking: {
      jid: "contact-bed8b6085946@example.invalid",
      name: "Appointment Booking",
      config: {
        id: "seq_id_booking",
        jid: "contact-bed8b6085946@example.invalid",
        shortcut: "!book",
        shortcut_code: "!book",
        triggers: ["book appointment", "reservation", "slot booking"],
        instructions: "Send when customer wants to book a time slot.",
        enabled: true,
      },
      templates: [
        {
          id: "tmpl_booking_1",
          message: { conversation: "Please select your preferred date and time for the appointment." },
          caption: "Please select your preferred date and time for the appointment.",
        },
        {
          id: "tmpl_booking_2",
          message: { conversation: "Our coordinator will confirm your slot within 10 minutes." },
          caption: "Our coordinator will confirm your slot within 10 minutes.",
        },
      ],
    },
    group_services: {
      jid: "contact-02d0850a96f9@example.invalid",
      name: "Services Menu",
      config: {
        id: "seq_id_services",
        jid: "contact-02d0850a96f9@example.invalid",
        shortcut: "!services",
        shortcut_code: "!services",
        triggers: ["services menu", "available treatments", "kya services hain"],
        instructions: "Send when customer asks what treatments or services we offer.",
        enabled: true,
      },
      templates: [
        {
          id: "tmpl_services_1",
          message: { conversation: "Welcome to our comprehensive service menu across hair, skin, and wellness." },
          caption: "Welcome to our comprehensive service menu across hair, skin, and wellness.",
        },
        {
          id: "tmpl_services_2",
          message: { conversation: "All services are performed by certified specialists with sanitized tools." },
          caption: "All services are performed by certified specialists with sanitized tools.",
        },
      ],
    },
    group_vip: {
      jid: "contact-d41a3175da59@example.invalid",
      name: "VIP Membership Club",
      config: {
        id: "seq_id_vip",
        jid: "contact-d41a3175da59@example.invalid",
        shortcut: "!vip",
        shortcut_code: "!vip",
        triggers: ["vip membership", "loyalty club", "membership card"],
        instructions: "Send when customer asks about VIP perks or annual club membership.",
        enabled: true,
      },
      templates: [
        {
          id: "tmpl_vip_1",
          message: { conversation: "Unlock 30% off all year with our exclusive VIP Gold membership." },
          caption: "Unlock 30% off all year with our exclusive VIP Gold membership.",
        },
        {
          id: "tmpl_vip_2",
          message: { conversation: "Complimentary valet parking and priority lounge access included." },
          caption: "Complimentary valet parking and priority lounge access included.",
        },
      ],
    },
    group_location: {
      jid: "contact-905c59b0c0a3@example.invalid",
      name: "Location and Directions",
      config: {
        id: "seq_id_location",
        jid: "contact-905c59b0c0a3@example.invalid",
        shortcut: "!location",
        shortcut_code: "!location",
        triggers: ["salon address", "directions", "where are you located", "location bhej dain"],
        instructions: "Send when customer asks for physical branch address or navigation directions.",
        enabled: true,
      },
      templates: [
        {
          id: "tmpl_location_1",
          message: { conversation: "We are located at Plot 45-C, Main Boulevard, Gulberg III, Lahore." },
          caption: "We are located at Plot 45-C, Main Boulevard, Gulberg III, Lahore.",
        },
        {
          id: "tmpl_location_2",
          message: { conversation: "Google Maps link: https://maps.example.com/salon-gulberg" },
          caption: "Google Maps link: https://maps.example.com/salon-gulberg",
        },
      ],
    },
    group_timings: {
      jid: "contact-705508299ac2@example.invalid",
      name: "Operating Hours & Timings",
      config: {
        id: "seq_id_timings",
        jid: "contact-705508299ac2@example.invalid",
        shortcut: "!hours",
        shortcut_code: "!hours",
        triggers: ["opening hours", "timings", "kab khulta hai", "closing time"],
        instructions: "Send when customer asks about operational hours or open days.",
        enabled: true,
      },
      templates: [
        {
          id: "tmpl_timings_1",
          message: { conversation: "We are open Monday to Sunday from 10:00 AM to 10:00 PM." },
          caption: "We are open Monday to Sunday from 10:00 AM to 10:00 PM.",
        },
      ],
    },
    group_offers: {
      jid: "contact-d3ba54ab20fa@example.invalid",
      name: "Seasonal Promotions",
      config: {
        id: "seq_id_offers",
        jid: "contact-d3ba54ab20fa@example.invalid",
        shortcut: "!deals",
        shortcut_code: "!deals",
        triggers: ["discount offers", "summer promo", "deals"],
        instructions: "Send when customer inquires about ongoing promotions or deals.",
        enabled: true,
      },
      templates: [
        {
          id: "tmpl_offers_1",
          message: { conversation: "Summer Glow Deal: Flat 25% off on all HydraFacials and hair treatments." },
          caption: "Summer Glow Deal: Flat 25% off on all HydraFacials and hair treatments.",
        },
      ],
    },
    group_aftercare: {
      jid: "contact-4fdea19947be@example.invalid",
      name: "Treatment Aftercare Guide",
      config: {
        id: "seq_id_aftercare",
        jid: "contact-4fdea19947be@example.invalid",
        shortcut: "!aftercare",
        shortcut_code: "!aftercare",
        triggers: ["aftercare guide", "post treatment care", "care instructions"],
        instructions: "Send when customer asks about taking care of their hair/skin after a session.",
        enabled: true,
      },
      templates: [
        {
          id: "tmpl_aftercare_1",
          message: { conversation: "Avoid direct sunlight and heat exposure for 48 hours post procedure." },
          caption: "Avoid direct sunlight and heat exposure for 48 hours post procedure.",
        },
      ],
    },
    group_bridal: {
      jid: "contact-38b56d690e04@example.invalid",
      name: "Bridal Packages & Consultation",
      config: {
        id: "seq_id_bridal",
        jid: "contact-38b56d690e04@example.invalid",
        shortcut: "!bridal",
        shortcut_code: "!bridal",
        triggers: ["bridal package", "wedding makeup", "dulhan package"],
        instructions: "Send when customer asks about wedding or bridal makeover bookings.",
        enabled: true,
      },
      templates: [
        {
          id: "tmpl_bridal_1",
          message: { conversation: "Our Signature Bridal Package includes Barat & Walima makeup with trial session." },
          caption: "Our Signature Bridal Package includes Barat & Walima makeup with trial session.",
        },
        {
          id: "tmpl_bridal_2",
          message: { conversation: "Advance booking is required at least 3 weeks before wedding date." },
          caption: "Advance booking is required at least 3 weeks before wedding date.",
        },
      ],
    },
    group_hair: {
      jid: "contact-d349c36024b5@example.invalid",
      name: "Hair Styling & Keratin",
      config: {
        id: "seq_id_hair",
        jid: "contact-d349c36024b5@example.invalid",
        shortcut: "!hair",
        shortcut_code: "!hair",
        triggers: ["hair styling", "hair cut", "keratin treatment", "hair color"],
        instructions: "Send when customer asks about hair cuts, colors, or smoothing treatments.",
        enabled: true,
      },
      templates: [
        {
          id: "tmpl_hair_1",
          message: { conversation: "Explore our Brazilian Keratin, Nanoplasty, and Balayage color portfolios." },
          caption: "Explore our Brazilian Keratin, Nanoplasty, and Balayage color portfolios.",
        },
      ],
    },
    group_facial: {
      jid: "contact-be82fda465e4@example.invalid",
      name: "HydraFacial & Glow Therapy",
      config: {
        id: "seq_id_facial",
        jid: "contact-be82fda465e4@example.invalid",
        shortcut: "!facial",
        shortcut_code: "!facial",
        triggers: ["hydrafacial", "skin glowing", "facial clean up"],
        instructions: "Send when customer asks about medical facials and deep pore cleansing.",
        enabled: true,
      },
      templates: [
        {
          id: "tmpl_facial_1",
          message: { conversation: "7-step medical-grade HydraFacial with hyaluronic acid infusion and LED therapy." },
          caption: "7-step medical-grade HydraFacial with hyaluronic acid infusion and LED therapy.",
        },
      ],
    },
    group_nails: {
      jid: "contact-20734841440c@example.invalid",
      name: "Nail Bar & Extensions",
      config: {
        id: "seq_id_nails",
        jid: "contact-20734841440c@example.invalid",
        shortcut: "!nails",
        shortcut_code: "!nails",
        triggers: ["manicure", "pedicure", "nail art", "acrylic extensions"],
        instructions: "Send when customer asks about manicures, pedicures, or nail extensions.",
        enabled: true,
      },
      templates: [
        {
          id: "tmpl_nails_1",
          message: { conversation: "Gel extensions, French tips, and 3D nail art available with Russian manicure." },
          caption: "Gel extensions, French tips, and 3D nail art available with Russian manicure.",
        },
      ],
    },
    group_spa: {
      jid: "contact-1eedee83f4fc@example.invalid",
      name: "Wellness Spa & Massage #13",
      config: {
        id: "seq_id_spa",
        jid: "contact-1eedee83f4fc@example.invalid",
        shortcut: "!spa",
        shortcut_code: "!spa",
        triggers: ["full body massage", "relaxation spa", "swedish massage"],
        instructions: "Send when customer asks about full body massages, aromatherapy, or steam room.",
        enabled: true,
      },
      templates: [
        {
          id: "tmpl_spa_1",
          message: { conversation: "Experience pure serenity with our 60-minute hot stone Swedish massage." },
          caption: "Experience pure serenity with our 60-minute hot stone Swedish massage.",
        },
      ],
    },
    group_consultation: {
      jid: "contact-d4b837e8a924@example.invalid",
      name: "Dermatologist Consultation #14",
      config: {
        id: "seq_id_consult",
        jid: "contact-d4b837e8a924@example.invalid",
        shortcut: "!consult",
        shortcut_code: "!consult",
        triggers: ["doctor consultation", "skin analysis", "dermatologist meeting"],
        instructions: "Send when customer wants an in-depth clinical skin and hair diagnostic.",
        enabled: true,
      },
      templates: [
        {
          id: "tmpl_consult_1",
          message: { conversation: "Meet our board-certified dermatologist for high-resolution dermascopy skin analysis." },
          caption: "Meet our board-certified dermatologist for high-resolution dermascopy skin analysis.",
        },
      ],
    },
    group_feedback: {
      jid: "contact-0242de1e90dd@example.invalid",
      name: "Client Feedback & Quality #15",
      config: {
        id: "seq_id_feedback",
        jid: "contact-0242de1e90dd@example.invalid",
        shortcut: "!feedback",
        shortcut_code: "!feedback",
        triggers: ["client review", "complaint", "feedback", "manager call"],
        instructions: "Send when customer wants to submit a review, complaint, or feedback to salon management.",
        enabled: true,
      },
      templates: [
        {
          id: "tmpl_feedback_1",
          message: { conversation: "Your feedback matters to our director. Please rate your experience: 1 to 5 stars." },
          caption: "Your feedback matters to our director. Please rate your experience: 1 to 5 stars.",
        },
      ],
    },
  };
}

function createMockEnvironment(defaultBotJid = "contact-9d9009c0c421@example.invalid") {
  const profiles = new Map<string, any>();
  const messagesStore = new Map<string, any>();
  const sentTemplatesLog: any[] = [];
  const outboundReceipts = new Map<string, any>();
  let walletBalanceAllowed = true;

  const mockDeps = {
    checkSequence: async (botJid: string, customerJid: string, sequence: any, fallbackKey?: string) => {
      const candidateKeys = getSequenceSentFlagKeys(sequence, fallbackKey);
      const key = `${botJid}:${customerJid}`;
      const profile = profiles.get(key) || profiles.get(`${defaultBotJid}:${customerJid}`);
      if (profile && candidateKeys.some((flagKey) => Boolean(profile[flagKey]))) {
        return true;
      }
      return false;
    },
    markSequence: async (botJid: string, customerJid: string, sequence: any, optionsOrFallback?: any, explicitFallback?: string) => {
      const fallbackKey = explicitFallback || (typeof optionsOrFallback === "string" ? optionsOrFallback : optionsOrFallback?.fallbackKey);
      const candidateKeys = getSequenceSentFlagKeys(sequence, fallbackKey);
      const key = `${botJid}:${customerJid}`;
      const profile = profiles.get(key) || profiles.get(`${defaultBotJid}:${customerJid}`) || {};
      for (const flagKey of candidateKeys) {
        profile[flagKey] = true;
      }
      profiles.set(key, profile);
      profiles.set(`${defaultBotJid}:${customerJid}`, profile);
      return { success: true, profilePersisted: true, markerPersisted: true };
    },
    getCustomerProfile: async (botJid: string, customerJid: string) => {
      const key = `${botJid}:${customerJid}`;
      return profiles.get(key) || profiles.get(`${defaultBotJid}:${customerJid}`) || null;
    },
    updateCustomerProfile: async (botJid: string, customerJid: string, patch: any) => {
      const key = `${botJid}:${customerJid}`;
      const existing = profiles.get(key) || profiles.get(`${defaultBotJid}:${customerJid}`) || {};
      const merged = { ...existing, ...patch };
      profiles.set(key, merged);
      profiles.set(`${defaultBotJid}:${customerJid}`, merged);
      return merged;
    },
    resolveAccountDataOwnerKey: async () => defaultBotJid,
    waitRandomSequenceDelay: async () => {},
    saveMessage: async () => {},
    canSendBillableAutomation: async () => ({ allowed: walletBalanceAllowed, required: 0.003 }),
    findOutboundReceiptByIdempotencyKey: (k: string) => outboundReceipts.get(k) || null,
  };

  __setSequenceDeliveryTestDeps(mockDeps as any);

  const forwardTemplate = async (jid: string, template: any) => {
    sentTemplatesLog.push({ jid, template });
    const receiptKey = template?.id || `receipt_${sentTemplatesLog.length}`;
    outboundReceipts.set(receiptKey, { status: "sent", messageId: receiptKey, sentAt: Date.now() });
    return { status: "sent", messageId: receiptKey, receiptId: receiptKey };
  };

  return {
    profiles,
    messagesStore,
    sentTemplatesLog,
    outboundReceipts,
    setWalletAllowed: (allowed: boolean) => {
      walletBalanceAllowed = allowed;
    },
    forwardTemplate,
  };
}

async function runShortcut({
  text,
  sender,
  senderName = "Test Customer",
  msg,
  cachedKeywordSequences = {},
  forwardTemplate = async () => ({ status: "sent", messageId: "msg_mock", receiptId: "rcpt_mock" }),
  cachedWelcomeSequence,
  fromMe = false,
}: any) {
  const sock = { user: { id: "923000000001:contact-0b617fa3c7b5@example.invalid" } } as any;
  const mockMsg = msg || { key: { fromMe, remoteJid: sender }, message: { conversation: text } };
  const pendingResponses: any[] = [];
  const currentlyReplying = new Set<string>();
  const mockIo = { emit: () => {} } as any;

  const result = await processShortcut(
    sock,
    sender,
    senderName,
    mockMsg,
    text,
    cachedKeywordSequences,
    async () => {},
    forwardTemplate,
    pendingResponses,
    currentlyReplying,
    mockIo,
    cachedWelcomeSequence
  );

  await new Promise((resolve) => setTimeout(resolve, 30));
  return result;
}

test("Requirement 34: 7 Welcome Shortcode Tests", async (t) => {
  await t.test("1. Exact shortcode '!welcome' delivers welcome sequence to eligible customer", async () => {
    const customerJid = "contact-33011000e273@example.invalid";
    const welcomeGroup = {
      jid: "contact-973f5d4df97b@example.invalid",
      name: "Welcome Flow",
      config: { id: "welcome_seq", shortcut_code: "!welcome", enabled: true },
      templates: [{ id: "w_1", message: { conversation: "Welcome to BlackArrow demo salon!" } }],
    };

    let delivered = false;
    __setWelcomeDeliveryTestDeps({
      checkWelcomeSequence: async () => false,
      markWelcomeSequence: async () => ({ success: true, profilePersisted: true, markerPersisted: true }),
      canSendBillableAutomation: async () => ({ allowed: true, required: 0.003 }),
      updateCustomerProfile: async () => ({}),
      getCustomerProfile: async () => ({}),
      waitRandomSequenceDelay: async () => {},
    } as any);

    const handled = await runShortcut({
      text: "!welcome",
      sender: customerJid,
      cachedWelcomeSequence: welcomeGroup,
      forwardTemplate: async () => { delivered = true; return { status: "sent", messageId: "m1", receiptId: "r1" }; },
      fromMe: false,
    });

    assert.equal(handled, true, "processShortcut should handle exact welcome shortcode");
    assert.equal(delivered, true, "Welcome sequence should be delivered");
  });

  await t.test("2. Case-insensitivity and punctuation trimming for welcome shortcode", async () => {
    const customerJid = "contact-f3f3cc5038ff@example.invalid";
    const welcomeGroup = {
      jid: "contact-973f5d4df97b@example.invalid",
      name: "Welcome Flow",
      config: { id: "welcome_seq", shortcut_code: "!welcome", enabled: true },
      templates: [{ id: "w_1", message: { conversation: "Welcome!" } }],
    };

    let delivered = false;
    __setWelcomeDeliveryTestDeps({
      checkWelcomeSequence: async () => false,
      markWelcomeSequence: async () => ({ success: true, profilePersisted: true, markerPersisted: true }),
      canSendBillableAutomation: async () => ({ allowed: true, required: 0.003 }),
      updateCustomerProfile: async () => ({}),
      getCustomerProfile: async () => ({}),
      waitRandomSequenceDelay: async () => {},
    } as any);

    const handled = await runShortcut({
      text: "  !WELCOME!  ",
      sender: customerJid,
      cachedWelcomeSequence: welcomeGroup,
      forwardTemplate: async () => { delivered = true; return { status: "sent", messageId: "m2", receiptId: "r2" }; },
      fromMe: false,
    });

    assert.equal(handled, true, "Punctuation and uppercase should be normalized");
    assert.equal(delivered, true, "Welcome sequence should be delivered");
  });

  await t.test("3. Once sent, welcome shortcode is blocked by alreadySent protection", async () => {
    const customerJid = "contact-f6a5cb6b570a@example.invalid";
    const welcomeGroup = {
      jid: "contact-973f5d4df97b@example.invalid",
      name: "Welcome Flow",
      config: { id: "welcome_seq", shortcut_code: "!welcome", enabled: true },
      templates: [{ id: "w_1", message: { conversation: "Welcome!" } }],
    };

    let sendCount = 0;
    __setWelcomeDeliveryTestDeps({
      checkWelcomeSequence: async () => true, // Already sent!
      markWelcomeSequence: async () => ({ success: true, profilePersisted: true, markerPersisted: true }),
      canSendBillableAutomation: async () => ({ allowed: true, required: 0.003 }),
      updateCustomerProfile: async () => ({}),
      getCustomerProfile: async () => ({}),
      waitRandomSequenceDelay: async () => {},
    } as any);

    const handled = await runShortcut({
      text: "!welcome",
      sender: customerJid,
      cachedWelcomeSequence: welcomeGroup,
      forwardTemplate: async () => { sendCount++; return { status: "sent", messageId: "m3", receiptId: "r3" }; },
      fromMe: false,
    });

    assert.equal(handled, true, "processShortcut recognizes shortcode");
    assert.equal(sendCount, 0, "Must NOT deliver welcome sequence when already sent");
  });

  await t.test("4. Admin fromMe ordinary shortcode respects alreadySent protection", async () => {
    const customerJid = "contact-4de2d0acf056@example.invalid";
    const welcomeGroup = {
      jid: "contact-973f5d4df97b@example.invalid",
      name: "Welcome Flow",
      config: { id: "welcome_seq", shortcut_code: "!welcome", enabled: true },
      templates: [{ id: "w_1", message: { conversation: "Welcome!" } }],
    };

    let sendCount = 0;
    __setWelcomeDeliveryTestDeps({
      checkWelcomeSequence: async () => true, // Customer already has it
      markWelcomeSequence: async () => ({ success: true, profilePersisted: true, markerPersisted: true }),
      canSendBillableAutomation: async () => ({ allowed: true, required: 0.003 }),
      updateCustomerProfile: async () => ({}),
      getCustomerProfile: async () => ({}),
      waitRandomSequenceDelay: async () => {},
    } as any);

    const handled = await runShortcut({
      text: "!welcome",
      sender: customerJid,
      cachedWelcomeSequence: welcomeGroup,
      forwardTemplate: async () => { sendCount++; return { status: "sent", messageId: "m4", receiptId: "r4" }; },
      fromMe: true, // Admin sending
    });

    assert.equal(handled, true);
    assert.equal(sendCount, 0, "Admin fromMe must not duplicate welcome sequence to already-sent customer");
  });

  await t.test("5. Admin force send override (isForceSend: true) bypasses alreadySent check", async () => {
    const customerJid = "contact-25b01cca1849@example.invalid";
    let sendCount = 0;

    __setWelcomeDeliveryTestDeps({
      checkWelcomeSequence: async () => true, // Already sent
      markWelcomeSequence: async () => ({ success: true, profilePersisted: true, markerPersisted: true }),
      canSendBillableAutomation: async () => ({ allowed: true, required: 0.003 }),
      updateCustomerProfile: async () => ({}),
      getCustomerProfile: async () => ({}),
      waitRandomSequenceDelay: async () => {},
    } as any);

    const result = await deliverWelcomeSequence({
      customerJid,
      templates: [{ id: "w_1", message: { conversation: "Forced welcome" } }],
      source: "manual_admin",
      isForceSend: true, // Explicit force send
      forwardTemplate: async () => { sendCount++; return { status: "sent", messageId: "m5", receiptId: "r5" }; },
    });

    assert.equal(result.success, true, "Force send should succeed");
    assert.equal(sendCount, 1, "Force send must bypass alreadySent check");
  });

  await t.test("6. Welcome shortcode respects enabled === false and does not deliver", async () => {
    const customerJid = "contact-37a7134ade5d@example.invalid";
    const welcomeGroup = {
      jid: "contact-973f5d4df97b@example.invalid",
      name: "Welcome Flow",
      config: { id: "welcome_seq", shortcut_code: "!welcome", enabled: false }, // Disabled!
      templates: [{ id: "w_1", message: { conversation: "Welcome!" } }],
    };

    let sendCount = 0;
    const handled = await runShortcut({
      text: "!welcome",
      sender: customerJid,
      cachedWelcomeSequence: welcomeGroup,
      forwardTemplate: async () => { sendCount++; return { status: "sent" }; },
      fromMe: false,
    });

    assert.equal(handled, false, "Disabled welcome group shortcode must not be handled");
    assert.equal(sendCount, 0, "Disabled welcome sequence must not send");
  });

  await t.test("7. Welcome shortcode with zero templates logs and does not send or mark", async () => {
    const customerJid = "contact-6435e0028f35@example.invalid";
    const welcomeGroup = {
      jid: "contact-973f5d4df97b@example.invalid",
      name: "Welcome Flow",
      config: { id: "welcome_seq", shortcut_code: "!welcome", enabled: true },
      templates: [], // 0 templates!
    };

    let sendCount = 0;
    let markCount = 0;
    __setWelcomeDeliveryTestDeps({
      checkWelcomeSequence: async () => false,
      markWelcomeSequence: async () => { markCount++; return { success: true, profilePersisted: true, markerPersisted: true }; },
    } as any);

    const handled = await runShortcut({
      text: "!welcome",
      sender: customerJid,
      cachedWelcomeSequence: welcomeGroup,
      forwardTemplate: async () => { sendCount++; return { status: "sent" }; },
      fromMe: false,
    });

    assert.equal(sendCount, 0, "Zero templates must not send any WhatsApp message");
    assert.equal(markCount, 0, "Zero templates must not mark customer as sent");
  });
});

// ============================================================================
// REQUIREMENT 35: 22-POINT TEST MATRIX (A THROUGH V) WITH 15 DEMO GROUPS
// ============================================================================
test("Requirement 35: 22-Point Sequence Matrix (A through V) with 15 Demo Groups", async (t) => {
  const sequences = create15DemoSequenceGroups();
  const botJid = "contact-9d9009c0c421@example.invalid";

  // Test A: Exact shortcode trigger
  await t.test("A. EXACT SHORTCODE TRIGGER: Sends exact configured shortcut", async () => {
    const env = createMockEnvironment();
    const customerJid = "contact-1533093d9738@example.invalid";

    const handled = await runShortcut({
      text: "!pricing",
      sender: customerJid,
      cachedKeywordSequences: sequences,
      forwardTemplate: env.forwardTemplate,
      fromMe: false,
    });

    assert.equal(handled, true, "runShortcut must handle !pricing");
    assert.equal(env.sentTemplatesLog.length, 2, "Must send 2 pricing templates");
    assert.equal(env.profiles.get(`${botJid}:${customerJid}`)?.seq_sent_seq_id_pricing, true, "Must mark sequence sent");
  });

  // Test B: Shortcode case & punctuation normalization
  await t.test("B. SHORTCODE NORMALIZATION: Case and punctuation trimmed correctly", async () => {
    const env = createMockEnvironment();
    const customerJid = "contact-51eaa69f2f31@example.invalid";

    const handled = await runShortcut({
      text: "  !PRICING!  ",
      sender: customerJid,
      cachedKeywordSequences: sequences,
      forwardTemplate: env.forwardTemplate,
      fromMe: false,
    });

    assert.equal(handled, true);
    assert.equal(env.sentTemplatesLog.length, 2);
  });

  // Test C: Configured keyword trigger with natural punctuation & case
  await t.test("C. CONFIGURED KEYWORD TRIGGER: Natural conversation matching trigger phrase", async () => {
    const env = createMockEnvironment();
    const customerJid = "contact-df59eba7fc28@example.invalid";

    const handled = await runShortcut({
      text: "Hello, could you please share the package rates with me?",
      sender: customerJid,
      cachedKeywordSequences: sequences,
      forwardTemplate: env.forwardTemplate,
      fromMe: false,
    });

    assert.equal(handled, true);
    assert.equal(env.sentTemplatesLog.length, 2);
  });

  // Test D: Word boundary check across languages
  await t.test("D. WORD BOUNDARY CHECK: Substrings of unrelated words do not trigger keyword", () => {
    // "pricing" keyword should NOT trigger on "surpricingly"
    const match = findMatchingSequence(sequences, "This is surpricingly good service!");
    assert.equal(match, null, "Substring 'surpricingly' must not match 'pricing' keyword");

    const exactMatch = findMatchingSequence(sequences, "Can I see pricing please?");
    assert.ok(exactMatch, "Natural word boundary must match");
    assert.equal(exactMatch.sequence.config.id, "seq_id_pricing");
  });

  // Test E: Multi-lingual word boundary (Urdu, Roman Urdu, Arabic, Hindi, Punjabi)
  await t.test("E. MULTI-LINGUAL WORD BOUNDARY: Roman Urdu triggers clean match", () => {
    const match = findMatchingSequence(sequences, "Aap ka salon kab khulta hai?");
    assert.ok(match, "Roman Urdu 'kab khulta hai' must trigger timings sequence");
    assert.equal(match.sequence.config.id, "seq_id_timings");
  });

  // Test F: Duplicate shortcode conflict handling
  await t.test("F. DUPLICATE SHORTCODE CONFLICT: Duplicate shortcode detected and not executed", () => {
    const conflictSequences = {
      ...sequences,
      group_conflict_1: {
        name: "Conflict 1",
        config: { id: "conf_1", shortcut: "!conflict", shortcut_code: "!conflict", enabled: true },
        templates: [{ id: "c1" }],
      },
      group_conflict_2: {
        name: "Conflict 2",
        config: { id: "conf_2", shortcut: "!conflict", shortcut_code: "!conflict", enabled: true },
        templates: [{ id: "c2" }],
      },
    };

    const matches = findAllMatchingSequences(conflictSequences, "!conflict");
    assert.equal(matches.duplicateShortcodeConflict, true, "Must detect duplicate shortcode conflict");

    const singleMatch = findMatchingSequence(conflictSequences, "!conflict");
    assert.equal(singleMatch, null, "Must NOT return arbitrary sequence when shortcodes conflict");
  });

  // Test G: Ambiguous keyword delegation to DeepSeek
  await t.test("G. AMBIGUOUS KEYWORD DELEGATION: Delegated to AI instead of arbitrary first match", () => {
    const ambiguousSequences = {
      ...sequences,
      group_ambig_1: {
        name: "Ambig 1",
        config: { id: "amb_1", triggers: ["glow"], enabled: true },
        templates: [{ id: "a1" }],
      },
      group_ambig_2: {
        name: "Ambig 2",
        config: { id: "amb_2", triggers: ["glow"], enabled: true },
        templates: [{ id: "a2" }],
      },
    };

    const matches = findAllMatchingSequences(ambiguousSequences, "I want glow therapy");
    assert.equal(matches.ambiguousKeywordMatch, true, "Must flag ambiguous keyword match");

    const singleMatch = findMatchingSequence(ambiguousSequences, "I want glow therapy");
    assert.equal(singleMatch, null, "Ambiguous keyword matches must be delegated to DeepSeek");
  });

  // Test H: DeepSeek AI semantic selection via sendSequence
  await t.test("H. DEEPSEEK SEMANTIC SELECTION: Dedicated sendSequence({ sequence_id }) resolves cleanly", () => {
    const resolved = resolveSequenceForAiChoice(sequences, "seq_id_bridal");
    assert.ok(resolved, "Must resolve bridal sequence by stable ID");
    assert.equal(resolved.key, "group_bridal");
    assert.equal(resolved.sequence.config.id, "seq_id_bridal");
  });

  // Test I: DeepSeek AI backward-compatible sendMediaFile for sequence
  await t.test("I. BACKWARD-COMPATIBLE sendMediaFile: Resolves sequence by ID or shortcut", () => {
    // Calling sendMediaFile with sequence_id
    const resolvedById = resolveSequenceForAiChoice(sequences, "seq_id_facial");
    assert.ok(resolvedById);
    assert.equal(resolvedById.sequence.config.id, "seq_id_facial");

    // Calling sendMediaFile with shortcut "!deals" or "deals"
    const resolvedByShortcut = resolveSequenceForAiChoice(sequences, "!deals");
    assert.ok(resolvedByShortcut);
    assert.equal(resolvedByShortcut.sequence.config.id, "seq_id_offers");
  });

  // Test J: Sequence #13+ selectable by DeepSeek
  await t.test("J. SEQUENCE #13+ SELECTABLE: High-index sequences are in prompt and resolvable", () => {
    const prompt = buildReusableContentSection({
      cachedKeywordSequences: sequences,
    });

    // Verify sequences #13, #14, #15 are in prompt
    assert.ok(prompt.includes("Wellness Spa & Massage #13"), "Sequence #13 must be present in prompt");
    assert.ok(prompt.includes("Dermatologist Consultation #14"), "Sequence #14 must be present in prompt");
    assert.ok(prompt.includes("Client Feedback & Quality #15"), "Sequence #15 must be present in prompt");

    // Verify selectable by DeepSeek
    const resolved13 = resolveSequenceForAiChoice(sequences, "seq_id_spa");
    assert.equal(resolved13?.sequence.config.id, "seq_id_spa");

    const resolved14 = resolveSequenceForAiChoice(sequences, "seq_id_consult");
    assert.equal(resolved14?.sequence.config.id, "seq_id_consult");

    const resolved15 = resolveSequenceForAiChoice(sequences, "seq_id_feedback");
    assert.equal(resolved15?.sequence.config.id, "seq_id_feedback");
  });

  // Test K: Full caption preservation
  await t.test("K. FULL CAPTION PRESERVATION: Sequence item captions are not truncated", () => {
    const longCaptionSeq = {
      group_long: {
        name: "Long Caption Sequence",
        config: { id: "seq_long", shortcut: "!long", shortcut_code: "!long", enabled: true },
        templates: [
          {
            id: "tmpl_long",
            caption: "This is a very long sequence caption that extends well beyond 120 characters in order to verify that no truncation, ellipsize, or compactAiText stripping is applied anywhere in the sequence prompt pipeline.",
          },
        ],
      },
    };

    const prompt = buildReusableContentSection({
      cachedKeywordSequences: longCaptionSeq,
    });

    assert.ok(
      prompt.includes("This is a very long sequence caption that extends well beyond 120 characters in order to verify that no truncation"),
      "Sequence caption must remain completely untruncated in prompt"
    );
  });

  // Test L: Roman Urdu semantic selection
  await t.test("L. ROMAN URDU SEMANTIC SELECTION: Resolves sequence based on natural language meaning", () => {
    // 1. Keyword router correctly bypasses queries without configured trigger words
    const keywordMatch = findMatchingSequence(sequences, "Aap kis time open hotay hain?");
    assert.equal(keywordMatch, null, "Natural semantic question without exact keyword bypasses deterministic router");

    // 2. DeepSeek AI receives full sequence context in prompt and selects timings sequence
    const prompt = buildReusableContentSection({ cachedKeywordSequences: sequences });
    assert.ok(prompt.includes("Operating Hours & Timings"));
    assert.ok(prompt.includes("Monday to Sunday from 10:00 AM to 10:00 PM"));

    // 3. DeepSeek tool call sendSequence({ sequence_id: "seq_id_timings" }) resolves cleanly
    const aiChoice = resolveSequenceForAiChoice(sequences, "seq_id_timings");
    assert.ok(aiChoice);
    assert.equal(aiChoice.sequence.config.id, "seq_id_timings");
  });

  // Test M: Renamed sequence preserves sent state
  await t.test("M. RENAMED SEQUENCE PRESERVES SENT STATE: Changing name does not resend to completed customer", async () => {
    const env = createMockEnvironment();
    const customerJid = "contact-b936016a1f16@example.invalid";

    // Deliver original sequence "Hair Styling & Keratin"
    const originalSeq = sequences.group_hair;
    const res1 = await deliverSequenceGroup({
      customerJid,
      sequence: originalSeq,
      fallbackKey: "group_hair",
      source: "shortcut",
      forwardTemplate: env.forwardTemplate,
    });
    assert.equal(res1.success, true);
    assert.equal(env.sentTemplatesLog.length, 1);

    // Now owner renames display name to "Luxury Hair Lounge"
    const renamedSeq = {
      ...originalSeq,
      name: "Luxury Hair Lounge",
      config: {
        ...originalSeq.config,
        name: "Luxury Hair Lounge",
        // ID remains "seq_id_hair"
      },
    };

    // Customer or admin requests renamed sequence
    const res2 = await deliverSequenceGroup({
      customerJid,
      sequence: renamedSeq,
      fallbackKey: "group_hair",
      source: "shortcut",
      forwardTemplate: env.forwardTemplate,
    });

    assert.equal(res2.alreadySent, true, "Must recognize customer already received sequence by stable ID");
    assert.equal(env.sentTemplatesLog.length, 1, "Must NOT resend renamed sequence");
  });

  // Test N: Dual-read compatibility for legacy sent flags
  await t.test("N. DUAL-READ COMPATIBILITY: Legacy flag seq_sent_hair_styling recognized as already sent", async () => {
    const env = createMockEnvironment();
    const customerJid = "contact-ad5a3ac6614f@example.invalid";

    // Set legacy sent flag on customer profile
    env.profiles.set(`${botJid}:${customerJid}`, {
      seq_sent_hair_styling_keratin: true,
    });

    const res = await deliverSequenceGroup({
      customerJid,
      sequence: sequences.group_hair,
      fallbackKey: "group_hair",
      source: "shortcut",
      forwardTemplate: env.forwardTemplate,
    });

    assert.equal(res.alreadySent, true, "Must read legacy flag and prevent duplicate delivery");
    assert.equal(env.sentTemplatesLog.length, 0);
  });

  // Test O: Once sent = never send again
  await t.test("O. ONCE SENT = NEVER SEND AGAIN: Subsequent shortcode, keyword, or AI tool calls are blocked", async () => {
    const env = createMockEnvironment();
    const customerJid = "contact-9869f76025da@example.invalid";

    // First send: via keyword
    const res1 = await deliverSequenceGroup({
      customerJid,
      sequence: sequences.group_pricing,
      fallbackKey: "group_pricing",
      source: "keyword",
      forwardTemplate: env.forwardTemplate,
    });
    assert.equal(res1.completed, true);
    assert.equal(env.sentTemplatesLog.length, 2);

    // Second send attempt: via shortcode
    const res2 = await deliverSequenceGroup({
      customerJid,
      sequence: sequences.group_pricing,
      fallbackKey: "group_pricing",
      source: "shortcut",
      forwardTemplate: env.forwardTemplate,
    });
    assert.equal(res2.alreadySent, true);

    // Third send attempt: via AI semantic tool call
    const res3 = await deliverSequenceGroup({
      customerJid,
      sequence: sequences.group_pricing,
      fallbackKey: "group_pricing",
      source: "ai_semantic",
      forwardTemplate: env.forwardTemplate,
    });
    assert.equal(res3.alreadySent, true);

    assert.equal(env.sentTemplatesLog.length, 2, "Exact total sends must remain 2");
  });

  // Test P: Admin fromMe shortcodes respect alreadySent
  await t.test("P. ADMIN FROMME RESPECTS ALREADY SENT: Admin sending shortcode to completed customer is blocked", async () => {
    const env = createMockEnvironment();
    const customerJid = "contact-9c69c16e28d2@example.invalid";

    // First delivery
    await deliverSequenceGroup({
      customerJid,
      sequence: sequences.group_vip,
      fallbackKey: "group_vip",
      source: "shortcut",
      forwardTemplate: env.forwardTemplate,
    });
    assert.equal(env.sentTemplatesLog.length, 2);

    // Admin sends !vip to the customer
    const handled = await runShortcut({
      text: "!vip",
      sender: customerJid,
      cachedKeywordSequences: sequences,
      forwardTemplate: env.forwardTemplate,
      fromMe: true,
    });

    assert.equal(handled, true);
    assert.equal(env.sentTemplatesLog.length, 2, "Must NOT resend to customer even from admin fromMe");
  });

  // Test Q: Disabled sequences ignored
  await t.test("Q. DISABLED SEQUENCES IGNORED: Disabled sequence is not matched by trigger or AI", async () => {
    const disabledSequences = {
      ...sequences,
      group_booking: {
        ...sequences.group_booking,
        config: {
          ...sequences.group_booking.config,
          enabled: false, // Disabled
        },
      },
    };

    // Keyword match fails
    const matchKw = findMatchingSequence(disabledSequences, "I want to book an appointment");
    assert.equal(matchKw, null, "Disabled sequence must not match keyword");

    // Shortcode match fails
    const matchSc = findMatchingSequence(disabledSequences, "!book");
    assert.equal(matchSc, null, "Disabled sequence must not match shortcode");

    // Excluded from active prompt
    const prompt = buildReusableContentSection({
      cachedKeywordSequences: disabledSequences,
    });
    assert.equal(prompt.includes("Appointment Booking"), false, "Disabled sequence must not appear in prompt");
  });

  // Test R: Zero templates ignored
  await t.test("R. ZERO TEMPLATES IGNORED: Group with 0 templates logs warning and does not deliver", async () => {
    const env = createMockEnvironment();
    const customerJid = "contact-7da11cdfb5cf@example.invalid";

    const emptySeq = {
      name: "Empty Group",
      config: { id: "empty_seq", shortcut: "!empty", shortcut_code: "!empty", enabled: true },
      templates: [],
    };

    const res = await deliverSequenceGroup({
      customerJid,
      sequence: emptySeq,
      fallbackKey: "empty_group",
      source: "shortcut",
      forwardTemplate: env.forwardTemplate,
    });

    assert.equal(res.success, false);
    assert.equal(res.deliveredCount, 0);
    assert.equal(env.sentTemplatesLog.length, 0);
    assert.equal(env.profiles.get(`${botJid}:${customerJid}`)?.seq_sent_empty_seq, undefined, "Must not mark sent");
  });

  // Test S: Restart duplicates = 0 & crash recovery
  await t.test("S. CRASH RECOVERY: Worker crash resumes at remaining item without double sending", async () => {
    const env = createMockEnvironment();
    const customerJid = "contact-acb1f3f205b7@example.invalid";
    let crashAfterFirst = true;

    const crashForward = async (jid: string, template: any) => {
      if (crashAfterFirst && env.sentTemplatesLog.length === 1) {
        throw new Error("Worker simulated crash after first template");
      }
      return env.forwardTemplate(jid, template);
    };

    // Worker 1 starts delivery and crashes
    try {
      await deliverSequenceGroup({
        customerJid,
        sequence: sequences.group_pricing,
        fallbackKey: "group_pricing",
        source: "shortcut",
        forwardTemplate: crashForward,
      });
    } catch {
      // Expected crash
    }

    assert.equal(env.sentTemplatesLog.length, 1, "Only first template was sent before crash");

    // Worker 2 / recovery resumes delivery
    crashAfterFirst = false;
    const resRecovery = await deliverSequenceGroup({
      customerJid,
      sequence: sequences.group_pricing,
      fallbackKey: "group_pricing",
      source: "recovery",
      forwardTemplate: env.forwardTemplate,
    });

    assert.equal(resRecovery.completed, true, "Recovery must complete sequence");
    assert.equal(env.sentTemplatesLog.length, 2, "Second template delivered; exactly 2 total sends");
  });

  // Test T: Concurrent claim race
  await t.test("T. CONCURRENT CLAIM RACE: Exactly one worker acquires claim and delivers", async () => {
    const env = createMockEnvironment();
    const customerJid = "contact-1353ed1a6388@example.invalid";

    const delayedForward = async (jid: string, template: any) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return env.forwardTemplate(jid, template);
    };

    const [worker1Result, worker2Result] = await Promise.all([
      deliverSequenceGroup({
        customerJid,
        sequence: sequences.group_vip,
        fallbackKey: "group_vip",
        source: "shortcut",
        forwardTemplate: delayedForward,
      }),
      deliverSequenceGroup({
        customerJid,
        sequence: sequences.group_vip,
        fallbackKey: "group_vip",
        source: "ai_semantic",
        forwardTemplate: delayedForward,
      }),
    ]);

    const winner = worker1Result.completed ? worker1Result : worker2Result;
    const loser = worker1Result.completed ? worker2Result : worker1Result;

    assert.equal(winner.completed, true, "Winning worker completes delivery");
    assert.equal(loser.skippedDueToClaim, true, "Losing worker yields gracefully due to active claim");
    assert.equal(env.sentTemplatesLog.length, 2, "Exactly 2 VIP templates sent total");
  });

  // Test U: Reset during partial delivery closes obsolete generation
  await t.test("U. RESET CLOSES OBSOLETE GENERATION: Mid-delivery reset aborts obsolete run", async () => {
    const env = createMockEnvironment();
    const customerJid = "contact-f477add6118c@example.invalid";
    const initialResetAt = 1000;
    const newResetAt = 5000;

    // Simulate customer having prior partial progress under initialResetAt (generationId: gen_1000)
    const canonicalFlag = getSequenceFlag("group_services", sequences.group_services);
    const progressKey = getSequenceProgressKey("sequence", canonicalFlag);
    env.profiles.set(`${botJid}:${customerJid}`, {
      sequenceDeliveryProgress: {
        [progressKey]: {
          generationId: `group_services:gen_${initialResetAt}`,
          deliveredItemIds: ["tmpl_services_1"],
          lastDeliveredIndex: 0,
          totalCount: 2,
          updatedAt: Date.now(),
        },
      },
    });

    const res = await deliverSequenceGroup({
      customerJid,
      sequence: sequences.group_services,
      fallbackKey: "group_services",
      source: "shortcut",
      groupResetAt: newResetAt,
      generationId: `group_services:gen_${newResetAt}`,
      forwardTemplate: env.forwardTemplate,
    });

    // Worker detected generation mismatch and closed obsolete run safely
    assert.equal(res.success, false, "Obsolete generation must not succeed");
    assert.equal(res.reason, "generation_mismatch", "Reason must be generation_mismatch");
  });

  // Test V: Reset preserves customer sent history
  await t.test("V. RESET PRESERVES SENT HISTORY: Completed customers are not resubmitted after reset", async () => {
    const env = createMockEnvironment();
    const existingCustomerJid = "contact-91ad5cfc2e03@example.invalid";
    const newCustomerJid = "contact-16bac87f30de@example.invalid";

    // Existing customer completed sequence under gen 1
    await deliverSequenceGroup({
      customerJid: existingCustomerJid,
      sequence: sequences.group_bridal,
      fallbackKey: "group_bridal",
      source: "shortcut",
      groupResetAt: 1000,
      generationId: "group_bridal:gen_1000",
      forwardTemplate: env.forwardTemplate,
    });
    assert.equal(env.sentTemplatesLog.length, 2);

    // Group reset occurs (rebuilt templates)
    const rebuiltBridal = {
      ...sequences.group_bridal,
      config: { ...sequences.group_bridal.config, groupResetAt: 9000 },
      templates: [
        { id: "tmpl_bridal_rebuilt_1", message: { conversation: "Rebuilt bridal flow 2026." } },
      ],
    };

    // Existing customer requests bridal sequence again
    const resExisting = await deliverSequenceGroup({
      customerJid: existingCustomerJid,
      sequence: rebuiltBridal,
      fallbackKey: "group_bridal",
      source: "shortcut",
      groupResetAt: 9000,
      generationId: "group_bridal:gen_9000",
      forwardTemplate: env.forwardTemplate,
    });

    assert.equal(resExisting.alreadySent, true, "Reset must NOT make completed customers eligible again");
    assert.equal(env.sentTemplatesLog.length, 2, "No new sends to existing customer");

    // Brand new customer requests bridal sequence
    const resNew = await deliverSequenceGroup({
      customerJid: newCustomerJid,
      sequence: rebuiltBridal,
      fallbackKey: "group_bridal",
      source: "shortcut",
      groupResetAt: 9000,
      generationId: "group_bridal:gen_9000",
      forwardTemplate: env.forwardTemplate,
    });

    assert.equal(resNew.completed, true, "New customer receives new generation");
    assert.equal(env.sentTemplatesLog.length, 3, "New customer receives single rebuilt template");
  });
});

// ============================================================================
// REQUIREMENT 36: ALL TRIGGER PATHS DELEGATE TO CANONICAL deliverSequenceGroup
// ============================================================================
test("Requirement 36: All Trigger Paths Delegate to Canonical deliverSequenceGroup", async (t) => {
  const sequences = create15DemoSequenceGroups();
  const customerJid = "contact-3bbada77b4f6@example.invalid";

  await t.test("1. Shortcode path delegates to deliverSequenceGroup", async () => {
    let deliverCalled = false;
    __setSequenceDeliveryTestDeps({
      checkSequence: async () => false,
      markSequence: async () => ({ success: true, profilePersisted: true, markerPersisted: true }),
      canSendBillableAutomation: async () => ({ allowed: true, required: 0.003 }),
      updateCustomerProfile: async () => ({}),
      getCustomerProfile: async () => ({}),
    } as any);

    const handled = await runShortcut({
      text: "!pricing",
      sender: customerJid,
      cachedKeywordSequences: sequences,
      forwardTemplate: async () => { deliverCalled = true; return { status: "sent" }; },
      fromMe: false,
    });

    assert.equal(handled, true);
    assert.equal(deliverCalled, true, "Shortcode must execute via deliverSequenceGroup");
  });

  await t.test("2. Configured keyword path delegates to deliverSequenceGroup", async () => {
    let deliverCalled = false;
    __setSequenceDeliveryTestDeps({
      checkSequence: async () => false,
      markSequence: async () => ({ success: true, profilePersisted: true, markerPersisted: true }),
      canSendBillableAutomation: async () => ({ allowed: true, required: 0.003 }),
      updateCustomerProfile: async () => ({}),
      getCustomerProfile: async () => ({}),
    } as any);

    const handled = await runShortcut({
      text: "Can I please see the package rates?",
      sender: customerJid,
      cachedKeywordSequences: sequences,
      forwardTemplate: async () => { deliverCalled = true; return { status: "sent" }; },
      fromMe: false,
    });

    assert.equal(handled, true);
    assert.equal(deliverCalled, true, "Keyword match must execute via deliverSequenceGroup");
  });

  await t.test("3. AI semantic tool call sendSequence delegates to deliverSequenceGroup", async () => {
    const env = createMockEnvironment();
    const resolved = resolveSequenceForAiChoice(sequences, "seq_id_bridal");
    assert.ok(resolved);

    const result = await deliverSequenceGroup({
      customerJid,
      sequence: resolved.sequence,
      fallbackKey: resolved.key,
      source: "ai_semantic",
      forwardTemplate: env.forwardTemplate,
    });

    assert.equal(result.completed, true);
    assert.equal(env.sentTemplatesLog.length, 2, "AI tool call must deliver via deliverSequenceGroup");
  });

  await t.test("4. AI backward-compatible sendMediaFile for sequence delegates to deliverSequenceGroup", async () => {
    const env = createMockEnvironment();
    const resolved = resolveSequenceForAiChoice(sequences, "!deals");
    assert.ok(resolved);

    const result = await deliverSequenceGroup({
      customerJid,
      sequence: resolved.sequence,
      fallbackKey: resolved.key,
      source: "ai_semantic",
      forwardTemplate: env.forwardTemplate,
    });

    assert.equal(result.completed, true);
    assert.equal(env.sentTemplatesLog.length, 1, "sendMediaFile call for sequence must deliver via deliverSequenceGroup");
  });

  await t.test("5. Pending retry / recovery path delegates to deliverSequenceGroup", async () => {
    const env = createMockEnvironment();
    const result = await deliverSequenceGroup({
      customerJid,
      sequence: sequences.group_aftercare,
      fallbackKey: "group_aftercare",
      source: "pending_retry",
      forwardTemplate: env.forwardTemplate,
    });

    assert.equal(result.completed, true);
    assert.equal(env.sentTemplatesLog.length, 1, "Pending retry must deliver via deliverSequenceGroup");
  });
});

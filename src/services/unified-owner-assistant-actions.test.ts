import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizePhoneForMatching,
  doPhonesMatch,
} from "./personal-contact-identity-service.ts";
import {
  parseMeetingTimeExpression,
} from "./google-calendar-service.ts";
import {
  googleMeetingDeps,
  __setGoogleMeetingTestDeps,
  __resetGoogleMeetingTestDeps,
} from "./google-personal-admin-tools.ts";
import {
  __setContactAdminTestDeps,
  __resetContactAdminTestDeps,
} from "./personal-contact-admin-ba-tools.ts";
import {
  matchDeterministicGuards,
  executeAdminAgentIntent,
  buildAdminCapabilityHelpText,
  saveAdminConversationContext,
  getAdminConversationContext,
  clearAdminConversationContext,
  type AdminConversationMemory,
} from "./admin-business-agent-service.ts";
import {
  __setPersonalOutboundAdminTestDeps,
  __resetPersonalOutboundAdminTestDeps,
} from "./personal-outbound-admin-tools.ts";
import { getAdminAction } from "./admin-action-registry-service.ts";
import { extractPhoneDigits } from "../utils/whatsapp-jid.ts";
import type { PersonalContact } from "./personal-contact-types.ts";
import type { AdminBusinessAssistantContext } from "./admin-identity-service.ts";

const testAccountId = "acc_test_owner_assistant";
const testAdminJid = "contact-e4ed32210a80@example.invalid";

const testAdminContext: AdminBusinessAssistantContext = {
  accountId: testAccountId,
  userId: "user_test_owner",
  botId: "bot_test_personal",
  adminPhone: "195545134641",
  adminJid: testAdminJid,
  adminRole: "owner",
  isBusinessAssistantEnabled: true,
  mode: "admin_business_assistant",
  conversationId: "conv_test_owner_123",
  isAuthorizedAdmin: true,
  isPrimaryOwner: true,
};

// Setup mock contacts for deterministic tests
const mockContactStartsDigital: PersonalContact = {
  contactId: "pc_starts_digital_001",
  schemaVersion: 1,
  revision: 1,
  accountId: testAccountId,
  status: "active",
  displayName: "Starts Digital",
  relationship: "service_provider",
  customRelationshipLabel: "Digital Marketing Agency",
  relationshipProvenance: "owner_provided",
  whatsappIdentities: [
    {
      personalInstanceId: "default",
      jid: "contact-9da9d2e33299@example.invalid",
      jidType: "pn",
      canonicalPhone: "+194019413064",
      pushName: "Starts Digital",
      source: "manual_owner_entry",
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
    },
  ],
  ownerNotes: [],
  durableFacts: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mockContactPartner: PersonalContact = {
  contactId: "pc_partner_002",
  schemaVersion: 1,
  revision: 1,
  accountId: testAccountId,
  status: "active",
  displayName: "Zahid Tech",
  relationship: "supplier",
  relationshipProvenance: "owner_provided",
  whatsappIdentities: [
    {
      personalInstanceId: "default",
      jid: "contact-5d68d1e8321b@example.invalid",
      jidType: "pn",
      canonicalPhone: "+161010534072",
      pushName: "Zahid Tech",
      source: "manual_owner_entry",
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
    },
  ],
  ownerNotes: [],
  durableFacts: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

test("Unit: Phone Normalization & Canonical Matching", () => {
  // Test 1: +92 325 0872796 with spaces matches +923250872796
  assert.equal(doPhonesMatch("+92 325 0872796", "+194019413064"), true);
  assert.equal(doPhonesMatch("92 325 0872796", "+194019413064"), true);
  assert.equal(doPhonesMatch("0325 0872796", "+194019413064"), true);
  assert.equal(doPhonesMatch("1061255212", "+194019413064"), true);

  // Test 2: +92 307 1880544 with spaces matches +923071880544 and WhatsApp JID
  assert.equal(doPhonesMatch("+92 307 1880544", "+161010534072"), true);
  assert.equal(doPhonesMatch("+92 307 1880544", "contact-5d68d1e8321b@example.invalid"), true);
  assert.equal(doPhonesMatch("0307 1880544", "+161010534072"), true);

  // Test 3: Rejects LID matching
  assert.equal(doPhonesMatch("123456789@lid", "+194019413064"), false);
  assert.equal(doPhonesMatch("+194019413064", "123456789@lid"), false);

  // Test 4: Different numbers do not match
  assert.equal(doPhonesMatch("+92 325 0872796", "+92 307 1880544"), false);
});

test("Unit: Relative Time Parsing (Server/User Timezone Aware)", () => {
  const baseTime = new Date("2026-09-06T10:00:00.000Z").getTime();

  // Test: 'in 15 minutes'
  const parsed15m = parseMeetingTimeExpression("in 15 minutes", "Asia/Karachi", baseTime, 30);
  assert.equal(parsed15m.valid, true);
  assert.equal(parsed15m.durationMinutes, 30);
  const expectedStart = new Date(baseTime + 15 * 60 * 1000).toISOString();
  const expectedEnd = new Date(baseTime + 45 * 60 * 1000).toISOString();
  assert.equal(parsed15m.startISO, expectedStart);
  assert.equal(parsed15m.endISO, expectedEnd);

  // Test: 'in 1 hour for 45 minutes'
  const parsed1h = parseMeetingTimeExpression("in 1 hour for 45 minutes", "UTC", baseTime, 30);
  assert.equal(parsed1h.valid, true);
  assert.equal(parsed1h.durationMinutes, 45);
  assert.equal(parsed1h.startISO, new Date(baseTime + 60 * 60 * 1000).toISOString());
  assert.equal(parsed1h.endISO, new Date(baseTime + 105 * 60 * 1000).toISOString());

  // Test: Invalid time expression fails gracefully
  const invalid = parseMeetingTimeExpression("someday later", "UTC", baseTime);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.error?.includes("Could not parse"));
});

test("Scenario A: Owner supplies unsaved valid phone number and asks to contact them", async () => {
  __setContactAdminTestDeps({
    listPersonalContacts: async () => [],
  });

  try {
    const findAction = getAdminAction("find_personal_contact");
    assert.ok(findAction, "find_personal_contact action must be registered");

    const result = await findAction.handler(
      testAdminContext,
      { query: "+92 333 1234567" }
    );

    assert.equal(result.success, true);
    assert.ok(result.message.includes("Direct Phone Number"));
    assert.equal(result.data?.directRecipient?.canonicalPhone, "+136703128551");
    assert.equal(result.data?.directRecipient?.isDirectNumber, true);
  } finally {
    __resetContactAdminTestDeps();
  }
});

test("Scenario B: Owner searches a phone number already stored in Personal Contacts", async () => {
  __setContactAdminTestDeps({
    listPersonalContacts: async () => [mockContactStartsDigital, mockContactPartner],
  });

  try {
    const findAction = getAdminAction("find_personal_contact");
    assert.ok(findAction);

    // Look up +92 325 0872796 (with spaces)
    const res1 = await findAction.handler(
      testAdminContext,
      { query: "+92 325 0872796" }
    );
    assert.equal(res1.success, true);
    assert.ok(res1.message.includes("Starts Digital"));
    assert.equal(res1.data?.contact?.contactId, "pc_starts_digital_001");

    // Look up +92 307 1880544 (with spaces)
    const res2 = await findAction.handler(
      testAdminContext,
      { query: "+92 307 1880544" }
    );
    assert.equal(res2.success, true);
    assert.ok(res2.message.includes("Zahid Tech"));
    assert.equal(res2.data?.contact?.contactId, "pc_partner_002");
  } finally {
    __resetContactAdminTestDeps();
  }
});

test("Scenario C: Assistant finds contact by name; next turn 'schedule a meeting with them' retains contact", () => {
  clearAdminConversationContext(testAccountId, testAdminJid);

  // Simulate active contact in memory after finding contact
  const memory: AdminConversationMemory = {
    accountId: testAccountId,
    adminJid: testAdminJid,
    activeContact: {
      contactId: "pc_starts_digital_001",
      displayName: "Starts Digital",
      canonicalPhone: "+194019413064",
      jid: "contact-9da9d2e33299@example.invalid",
    },
    activePersonName: "Starts Digital",
    activePhone: "+194019413064",
    updatedAt: Date.now(),
  };

  // Turn 2: Owner says "schedule a meeting with them in 15 minutes"
  const intent = matchDeterministicGuards("schedule a meeting with them in 15 minutes", memory);
  assert.ok(intent);
  assert.equal(intent.mode, "tool");
  assert.equal(intent.actionId, "schedule_google_meeting");
  assert.equal(intent.params?.target, "Starts Digital");
  assert.equal(intent.params?.time, "in 15 minutes");
});

test("Scenario D: Owner requests Google Meet in a relative time; reports exact dependency if Calendar unlinked", async () => {
  __setContactAdminTestDeps({
    listPersonalContacts: async () => [mockContactStartsDigital],
  });

  // Set Google Personal as disconnected
  __setGoogleMeetingTestDeps({
    getOwnerProfile: async () => ({
      locale: { timezone: "Asia/Karachi" },
    } as any),
    getGooglePersonalConnection: async () => ({
      status: "DISCONNECTED",
      capabilities: {} as any,
      internalDisabledCapabilities: {} as any,
    } as any),
  });

  try {
    const scheduleAction = getAdminAction("schedule_google_meeting");
    assert.ok(scheduleAction);

    const res = await scheduleAction.handler(
      testAdminContext,
      {
        target: "Starts Digital",
        time: "in 15 minutes",
        durationMinutes: 30,
        purpose: "Project Review",
      }
    );

    assert.equal(res.success, false);
    assert.ok(res.message.includes("Google Calendar Not Connected"));
    assert.ok(res.message.includes("Google Calendar & Meet authorization is not connected yet"));
    assert.equal(res.data?.calendarConnected, false);
    assert.equal(res.data?.recipient?.displayName, "Starts Digital");
  } finally {
    __resetGoogleMeetingTestDeps();
    __resetContactAdminTestDeps();
  }
});

test("Scenario E: 'just message him' / 'message him' routes to personal outbound path using active referent", () => {
  const memory: AdminConversationMemory = {
    accountId: testAccountId,
    adminJid: testAdminJid,
    activeContact: {
      displayName: "Starts Digital",
      canonicalPhone: "+194019413064",
    },
    updatedAt: Date.now(),
  };

  // 1. Without content: asks what to send (does not dump contacts or ask who)
  const askContent = matchDeterministicGuards("just message him", memory);
  assert.ok(askContent);
  assert.equal(askContent.mode, "conversation");
  assert.equal(askContent.reply, "What would you like me to send to Starts Digital?");

  // 2. With content: triggers start_personal_outbound_mission for Starts Digital
  const withContent = matchDeterministicGuards("just message him that the designs are ready", memory);
  assert.ok(withContent);
  assert.equal(withContent.mode, "tool");
  assert.equal(withContent.actionId, "start_personal_outbound_mission");
  assert.equal(withContent.params?.target, "Starts Digital");
  assert.equal(withContent.params?.goal, "the designs are ready");
});

test("Scenario E-2: Contact mission routing separates contact, phone, budget, and objective without digit corruption", async () => {
  // 1. Normal owner conversation must NOT be hijacked by regex phrase matching in deterministic guards:
  const guardRes1 = matchDeterministicGuards("can you contact 'starts digital' and fix deal in 20k per month");
  assert.equal(guardRes1, null, "Normal conversation must not be routed via keyword/regex matching");

  const guardRes2 = matchDeterministicGuards("can you contact 'starts digital' +923250872796 and fix deal in 20k per month");
  assert.equal(guardRes2, null, "Contact mission with phone must not be routed via keyword/regex matching");

  // 2. Semantic Planner tool execution with structured arguments:
  const actionDef = getAdminAction("start_personal_outbound_mission");
  assert.ok(actionDef, "start_personal_outbound_mission tool must be registered");

  // 3. Discrete phone extraction must NOT concatenate 20k digits to +923250872796:
  const extracted = extractPhoneDigits("can you contact 'starts digital' +923250872796 and fix deal in 20k per month");
  assert.equal(extracted, "139211727433", "Phone number must be isolated and not corrupted to 92325087279620");

  // 4. Pure phone number parsing:
  assert.equal(extractPhoneDigits("+194019413064"), "139211727433");
  assert.equal(extractPhoneDigits("+92 325 0872796"), "139211727433");
});

test("Scenario F: Owner asks what PA knows about the owner; routes to Owner360, NOT Business Overview", () => {
  const queries = [
    "what do you know about me as pa",
    "what do you know about me as PA?",
    "what do you know about me",
    "what information do you have saved about me",
  ];

  for (const q of queries) {
    const intent = matchDeterministicGuards(q);
    assert.ok(intent, `Query "${q}" must match deterministic guard`);
    assert.equal(intent.mode, "tool");
    assert.equal(intent.actionId, "get_owner_profile");
  }
});

test("Scenario G: Owner says 'Ok'; acknowledges without assistant re-introduction", () => {
  const acknowledgements = ["Ok", "okay", "thanks", "got it", "noted", "alright"];
  for (const ack of acknowledgements) {
    const intent = matchDeterministicGuards(ack);
    assert.ok(intent, `Acknowledgement "${ack}" must match`);
    assert.equal(intent.mode, "conversation");
    assert.ok(!intent.reply?.includes("Hello, I'm your BlackArrow Admin Business Assistant"));
    assert.ok(intent.reply?.includes("Got it") || intent.reply?.includes("Understood"));
  }
});

test("Scenario H: After capability discussion, 'What else?' continues capabilities without business overview", () => {
  const memory: AdminConversationMemory = {
    accountId: testAccountId,
    adminJid: testAdminJid,
    lastTopic: "help",
    lastActionId: "help",
    updatedAt: Date.now(),
  };

  const intent = matchDeterministicGuards("What else?", memory);
  assert.ok(intent);
  assert.equal(intent.mode, "help");
  assert.ok(intent.reply?.includes("Additional Assistant Capabilities"));
  assert.ok(intent.reply?.includes("Google Meet"));
  assert.ok(!intent.reply?.includes("Business Overview"));
});

test("Scenario I: Owner provides contact details after meeting request; continues meeting without Business Overview false route", () => {
  const memory: AdminConversationMemory = {
    accountId: testAccountId,
    adminJid: testAdminJid,
    pendingMeeting: {
      timeExpression: "in 15 minutes",
      durationMinutes: 30,
      purpose: "Google Meet Meeting",
      requiresClarification: "recipient",
    },
    updatedAt: Date.now(),
  };

  // Owner responds with contact details
  const intent = matchDeterministicGuards("Starts Digital +92 325 0872796", memory);
  assert.ok(intent);
  assert.equal(intent.mode, "tool");
  assert.equal(intent.actionId, "schedule_google_meeting");
  assert.equal(intent.params?.target, "Starts Digital +92 325 0872796");
  assert.equal(intent.params?.time, "in 15 minutes");
});

test("Multi-Step Execution: Full meeting creation & Personal WhatsApp delivery", async () => {
  __setContactAdminTestDeps({
    listPersonalContacts: async () => [mockContactStartsDigital],
  });

  let calendarEventCreated = false;
  let whatsAppMessageSent = false;

  __setGoogleMeetingTestDeps({
    getOwnerProfile: async () => ({
      locale: { timezone: "Asia/Karachi" },
    } as any),
    getGooglePersonalConnection: async () => ({
      status: "CONNECTED",
      capabilities: { calendar: true, gmail: true, drive: true, contacts: true } as any,
      internalDisabledCapabilities: {} as any,
    } as any),
    createCalendarEvent: async (params) => {
      calendarEventCreated = true;
      return {
        eventId: "cal_mock_12345",
        summary: params.summary,
        meetLink: "https://meet.google.com/xyz-abcd-efg",
        start: params.start,
        end: params.end,
        timezone: params.timezone,
        status: "confirmed",
        attendees: [],
        attendeeCount: 1,
      };
    },
    resolvePersonalInstanceForMission: async () => ({
      personalInstanceId: "pi_test_line_01",
    }),
    sendPersonalOutboundMissionMessage: async (params) => {
      whatsAppMessageSent = true;
      assert.ok(params.messageText.includes("https://meet.google.com/xyz-abcd-efg"));
      return {
        success: true,
        messageId: "msg_mock_outbound_123",
        mission: params.mission,
      };
    },
  });

  try {
    const action = getAdminAction("schedule_google_meeting");
    assert.ok(action);

    const res = await action.handler(
      testAdminContext,
      {
        target: "Starts Digital",
        time: "in 15 minutes",
        durationMinutes: 30,
        purpose: "Q3 Strategy Sync",
      }
    );

    assert.equal(res.success, true);
    assert.equal(calendarEventCreated, true);
    assert.equal(whatsAppMessageSent, true);
    assert.ok(res.message.includes("Google Meet Scheduled & Sent"));
    assert.ok(res.message.includes("https://meet.google.com/xyz-abcd-efg"));
    assert.equal(res.data?.whatsAppSent, true);
    assert.equal(res.data?.meetLink, "https://meet.google.com/xyz-abcd-efg");
  } finally {
    __resetGoogleMeetingTestDeps();
    __resetContactAdminTestDeps();
  }
});

test("Partial Failure Tests: Grounded reporting for partial failures", async () => {
  __setContactAdminTestDeps({
    listPersonalContacts: async () => [mockContactStartsDigital],
  });

  // Case 1: Calendar succeeds, but Personal WhatsApp is disconnected
  __setGoogleMeetingTestDeps({
    getOwnerProfile: async () => ({
      locale: { timezone: "Asia/Karachi" },
    } as any),
    getGooglePersonalConnection: async () => ({
      status: "CONNECTED",
      capabilities: { calendar: true, gmail: true, drive: true, contacts: true } as any,
      internalDisabledCapabilities: {} as any,
    } as any),
    createCalendarEvent: async (params) => ({
      eventId: "cal_partial_123",
      summary: params.summary,
      meetLink: "https://meet.google.com/partial-meet-1",
      start: params.start,
      end: params.end,
      timezone: params.timezone,
      status: "confirmed",
      attendees: [],
      attendeeCount: 1,
    }),
    resolvePersonalInstanceForMission: async () => ({
      error: "No eligible Personal WhatsApp line found.",
    }),
  });

  try {
    const action = getAdminAction("schedule_google_meeting");
    assert.ok(action);

    const res = await action.handler(
      testAdminContext,
      {
        target: "Starts Digital",
        time: "in 15 minutes",
        purpose: "Sync",
      }
    );

    assert.equal(res.success, true);
    assert.ok(res.message.includes("Personal WhatsApp Disconnected"));
    assert.ok(res.message.includes("https://meet.google.com/partial-meet-1"));
    assert.equal(res.data?.whatsAppSent, false);

    // Case 2: Calendar succeeds, but WhatsApp send fails
    __setGoogleMeetingTestDeps({
      getOwnerProfile: async () => ({
        locale: { timezone: "Asia/Karachi" },
      } as any),
      getGooglePersonalConnection: async () => ({
        status: "CONNECTED",
        capabilities: { calendar: true, gmail: true, drive: true, contacts: true } as any,
        internalDisabledCapabilities: {} as any,
      } as any),
      createCalendarEvent: async (params) => ({
        eventId: "cal_partial_123",
        summary: params.summary,
        meetLink: "https://meet.google.com/partial-meet-1",
        start: params.start,
        end: params.end,
        timezone: params.timezone,
        status: "confirmed",
        attendees: [],
        attendeeCount: 1,
      }),
      resolvePersonalInstanceForMission: async () => ({
        personalInstanceId: "pi_line_01",
      }),
      sendPersonalOutboundMissionMessage: async (params) => ({
        success: false,
        reason: "Network timeout on socket",
        mission: params.mission,
      }),
    });

    const res2 = await action.handler(
      testAdminContext,
      {
        target: "Starts Digital",
        time: "in 15 minutes",
        purpose: "Sync",
      }
    );

    assert.equal(res2.success, true);
    assert.ok(res2.message.includes("WhatsApp Delivery Failed"));
    assert.equal(res2.data?.whatsAppSent, false);
    assert.equal(res2.data?.whatsAppReason, "Network timeout on socket");

    // Case 3: Invalid recipient lookup failure
    __setContactAdminTestDeps({
      listPersonalContacts: async () => [],
    });
    const res3 = await action.handler(
      testAdminContext,
      {
        target: "Unknown Alien Contact",
        time: "in 15 minutes",
      }
    );
    assert.equal(res3.success, false);
    assert.ok(res3.message.includes("No Personal Contact found matching"));
  } finally {
    __resetGoogleMeetingTestDeps();
    __resetContactAdminTestDeps();
  }
});

test("Scenario J: Owner asks to contact somebody; returns action-oriented prompt, not tutorial", () => {
  const inquiries = [
    "can you contact somebody",
    "can you contact someone",
    "can you contact somebody for me",
    "could you contact someone",
    "can you message someone",
    "can you message somebody for me",
    "can you send a message to somebody",
    "can you reach out to someone",
  ];

  for (const q of inquiries) {
    const intent = matchDeterministicGuards(q);
    assert.ok(intent, `Inquiry "${q}" must match action capability guard`);
    assert.equal(intent.mode, "conversation");
    assert.ok(
      intent.reply?.includes("Yes, I can contact someone for you using your Personal WhatsApp line"),
      `Inquiry "${q}" should receive action-oriented guidance`
    );
    assert.ok(intent.reply?.includes("Who would you like me to message"));
    assert.ok(!intent.reply?.includes("To create a contact, please open"));
  }
});

test("Task Continuation: Multi-turn incomplete Personal action continuation across turns", async () => {
  clearAdminConversationContext(testAccountId, testAdminJid);

  // Turn 1: Owner says "message Starts Digital" (message missing)
  const turn1Intent = matchDeterministicGuards("message Starts Digital");
  assert.ok(turn1Intent);
  assert.equal(turn1Intent.mode, "conversation");
  assert.equal(turn1Intent.reply, "What would you like me to send to Starts Digital?");

  // Execute turn 1 to set pending state in conversation memory
  const exec1 = await executeAdminAgentIntent({
    intent: turn1Intent,
    context: testAdminContext,
    rawText: "message Starts Digital",
  });
  assert.equal(exec1.handled, true);

  const memAfterTurn1 = getAdminConversationContext(testAccountId, testAdminJid);
  assert.ok(memAfterTurn1?.pendingPersonalMessage);
  assert.equal(memAfterTurn1?.pendingPersonalMessage?.target, "Starts Digital");
  assert.equal(memAfterTurn1?.pendingPersonalMessage?.requiresClarification, "message");

  // Turn 2: Owner responds with message: "The mockups are uploaded"
  const turn2Intent = matchDeterministicGuards("The mockups are uploaded", memAfterTurn1);
  assert.ok(turn2Intent, "Should continue pending personal message");
  assert.equal(turn2Intent.mode, "tool");
  assert.equal(turn2Intent.actionId, "start_personal_outbound_mission");
  assert.equal(turn2Intent.params?.target, "Starts Digital");
  assert.equal(turn2Intent.params?.goal, "The mockups are uploaded");
  assert.equal(turn2Intent.params?.isSendOnly, true);
});

test("Natural Paraphrases (Section 22): Resolves various natural requests accurately", () => {
  const memoryWithContact: AdminConversationMemory = {
    accountId: testAccountId,
    adminJid: testAdminJid,
    activeContact: {
      displayName: "Starts Digital",
      canonicalPhone: "+194019413064",
      jid: "contact-9da9d2e33299@example.invalid",
    },
    activePersonName: "Starts Digital",
    activePhone: "+194019413064",
    updatedAt: Date.now(),
  };

  // 1. Explicit message with varied preambles
  const p1 = matchDeterministicGuards("tell Starts Digital that we are ready");
  assert.equal(p1?.actionId, "start_personal_outbound_mission");
  assert.equal(p1?.params?.target, "Starts Digital");
  assert.equal(p1?.params?.goal, "we are ready");

  const p2 = matchDeterministicGuards("message +92 325 0872796: please call me");
  assert.equal(p2?.actionId, "start_personal_outbound_mission");
  assert.equal(p2?.params?.target, "+92 325 0872796");
  assert.equal(p2?.params?.goal, "please call me");

  const p3 = matchDeterministicGuards("tell Starts Digital: we are ready");
  assert.equal(p3?.actionId, "start_personal_outbound_mission");
  assert.equal(p3?.params?.target, "Starts Digital");
  assert.equal(p3?.params?.goal, "we are ready");

  // 2. Pronoun message continuation with colon & preamble
  const p4 = matchDeterministicGuards("send him this: we need to review", memoryWithContact);
  assert.equal(p4?.actionId, "start_personal_outbound_mission");
  assert.equal(p4?.params?.target, "Starts Digital");
  assert.equal(p4?.params?.goal, "we need to review");

  const p5 = matchDeterministicGuards("contact them", memoryWithContact);
  assert.equal(p5?.mode, "conversation");
  assert.equal(p5?.reply, "What would you like me to send to Starts Digital?");

  // 3. Owner360 Paraphrases
  const o1 = matchDeterministicGuards("what have you saved about me");
  assert.equal(o1?.actionId, "get_owner_profile");

  const o2 = matchDeterministicGuards("what have you stored about me");
  assert.equal(o2?.actionId, "get_owner_profile");

  const o3 = matchDeterministicGuards("tell me about my profile");
  assert.equal(o3?.actionId, "get_owner_profile");

  const o4 = matchDeterministicGuards("tell me what you know about me");
  assert.equal(o4?.actionId, "get_owner_profile");

  // 4. Acknowledgements
  const a1 = matchDeterministicGuards("perfect");
  assert.equal(a1?.mode, "conversation");
  assert.ok(a1?.reply?.includes("Got it"));

  const a2 = matchDeterministicGuards("cool thanks");
  assert.equal(a2?.mode, "conversation");
  assert.ok(a2?.reply?.includes("Got it"));

  const a3 = matchDeterministicGuards("ok got it");
  assert.equal(a3?.mode, "conversation");

  // 5. PA Capability inquiry
  const pa1 = matchDeterministicGuards("what can you do as pa");
  assert.equal(pa1?.mode, "conversation");
  assert.ok(pa1?.reply?.includes("Personal Assistant Capabilities"));
});

test("Context Switching: Business -> Personal -> Business preserves active contact referent", async () => {
  clearAdminConversationContext(testAccountId, testAdminJid);

  // 1. Establish contact context
  saveAdminConversationContext({
    accountId: testAccountId,
    adminJid: testAdminJid,
    activeContact: {
      displayName: "Starts Digital",
      canonicalPhone: "+194019413064",
      jid: "contact-9da9d2e33299@example.invalid",
    },
    activePersonName: "Starts Digital",
    activePhone: "+194019413064",
    lastTopic: "personal_assistant",
  });

  // 2. Owner performs a Business action (e.g. check business overview)
  const businessAction = getAdminAction("get_business_overview");
  assert.ok(businessAction);

  // In executeAdminAgentIntent, business action runs and preserves activeContact
  const intent: any = {
    mode: "tool",
    actionId: "get_business_overview",
    action: businessAction,
    params: { range: "today" },
  };

  const execRes = await executeAdminAgentIntent({
    intent,
    context: testAdminContext,
    rawText: "show business overview",
  });
  assert.equal(execRes.handled, true);

  // 3. Verify that memory retained activeContact Starts Digital
  const memAfterBusiness = getAdminConversationContext(testAccountId, testAdminJid);
  assert.equal(memAfterBusiness?.lastTopic, "business");
  assert.equal(memAfterBusiness?.activePersonName, "Starts Digital");
  assert.equal(memAfterBusiness?.activeContact?.displayName, "Starts Digital");

  // 4. Owner says "just message him" -> resolves seamlessly to Starts Digital
  const nextIntent = matchDeterministicGuards("just message him", memAfterBusiness);
  assert.ok(nextIntent);
  assert.equal(nextIntent.mode, "conversation");
  assert.equal(nextIntent.reply, "What would you like me to send to Starts Digital?");
});

test("Section 24: Full Personal Send Test with Mock (Saved Contact & Unsaved Direct Number)", async () => {
  let selectedInstanceId: string | undefined = undefined;
  let sentMessagePayload: any = undefined;
  let personalSendCount = 0;

  // Configure test deps for Personal Outbound Admin Tools
  __setPersonalOutboundAdminTestDeps({
    isPersonalAssistantFeatureEnabled: () => true,
    resolvePersonalInstanceForMission: async (_accId, _reqInst, _ctrlId) => {
      selectedInstanceId = "bot_test_personal_line";
      return { personalInstanceId: "bot_test_personal_line" };
    },
    resolveTargetForMission: async (_accId, _instId, query) => {
      if (query.includes("Starts Digital") || query.includes("139211727433")) {
        return {
          contact: mockContactStartsDigital,
          targetIdentity: {
            jid: "contact-9da9d2e33299@example.invalid",
            canonicalPhone: "+194019413064",
            displayName: "Starts Digital",
          },
        };
      }
      return {
        isNewPhone: true,
        targetIdentity: {
          jid: "contact-95becb52a025@example.invalid",
          canonicalPhone: "+103140496255",
          displayName: "+92 333 9876543",
        },
      };
    },
    getActiveMissionForContact: async () => undefined,
    generateFirstOutboundMissionMessage: async (params) => ({
      messageText: params.mission.goal,
      isSendOnly: true,
    }),
    sendPersonalOutboundMissionMessage: async (params) => {
      personalSendCount++;
      sentMessagePayload = params;
      return {
        success: true,
        messageId: `msg_mock_${Date.now()}`,
        mission: params.mission,
      };
    },
  });

  try {
    const action = getAdminAction("start_personal_outbound_mission");
    assert.ok(action, "start_personal_outbound_mission must be registered");

    // Case 1: Saved Contact
    const resSaved = await action.handler(testAdminContext, {
      target: "Starts Digital",
      goal: "The contract is ready for your signature",
    });

    assert.equal(resSaved.success, true);
    assert.equal(selectedInstanceId, "bot_test_personal_line");
    assert.equal(personalSendCount, 1);
    assert.ok(resSaved.message.includes("Personal Mission Started"));
    assert.ok(resSaved.message.includes("Starts Digital"));
    assert.ok(resSaved.message.includes("The contract is ready for your signature"));
    assert.equal(sentMessagePayload?.mission?.personalInstanceId, "bot_test_personal_line");
    assert.equal(sentMessagePayload?.messageText, "The contract is ready for your signature");

    // Case 2: Unsaved Direct Phone Number
    const resDirect = await action.handler(testAdminContext, {
      target: "+92 333 9876543",
      goal: "Hello, this is regarding the invoice",
    });

    assert.equal(resDirect.success, true);
    assert.equal(personalSendCount, 2);
    assert.ok(resDirect.message.includes("Personal Mission Started"));
    assert.ok(resDirect.message.includes("+92 333 9876543"));
    assert.ok(resDirect.message.includes("Hello, this is regarding the invoice"));
    assert.equal(sentMessagePayload?.mission?.targetIdentity?.canonicalPhone, "+103140496255");
  } finally {
    __resetPersonalOutboundAdminTestDeps();
  }
});


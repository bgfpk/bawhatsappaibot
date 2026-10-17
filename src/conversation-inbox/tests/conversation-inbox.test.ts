import test from "node:test";
import assert from "node:assert/strict";
import { filterConversations, normalizeConversationItem } from "../conversation-model";

test("normalizeConversationItem: parses customer record correctly", () => {
  const item = normalizeConversationItem({
    $id: "cust_123",
    name: "Ayesha Malik",
    phone: "14515224130",
    last_message: "How much for home delivery?",
    unreadCount: 2,
    profile: {
      aiPaused: false,
      manualReviewRequired: false,
    },
  });

  assert.equal(item.id, "cust_123");
  assert.equal(item.customerName, "Ayesha Malik");
  assert.equal(item.displayPhone, "+13319326906");
  assert.equal(item.unreadCount, 2);
  assert.equal(item.isAiPaused, false);
  assert.equal(item.isHumanTakeover, false);
  assert.equal(item.customerStatus, "Active");
});

test("normalizeConversationItem: respects human takeover and AI pause states", () => {
  const pausedItem = normalizeConversationItem({
    $id: "cust_paused",
    name: "Tariq Ali",
    profile: { botReplyControl: "paused_temp" },
  });
  assert.equal(pausedItem.isAiPaused, true);
  assert.equal(pausedItem.customerStatus, "Paused");

  const humanItem = normalizeConversationItem({
    $id: "cust_human",
    name: "Zainab Bibi",
    profile: { manualReviewRequired: true },
  });
  assert.equal(humanItem.isHumanTakeover, true);
  assert.equal(humanItem.customerStatus, "Manual review");
});

test("filterConversations: filters correctly by tab and search query", () => {
  const list = [
    normalizeConversationItem({
      $id: "c1",
      name: "Alpha Customer",
      unreadCount: 3,
      profile: { aiPaused: false },
    }),
    normalizeConversationItem({
      $id: "c2",
      name: "Beta Customer",
      unreadCount: 0,
      profile: { aiPaused: true },
    }),
    normalizeConversationItem({
      $id: "c3",
      name: "Gamma Lead",
      unreadCount: 0,
      profile: { manualReviewRequired: true },
    }),
  ];

  assert.equal(filterConversations(list, "all", "").length, 3);
  assert.equal(filterConversations(list, "unread", "").length, 1);
  assert.equal(filterConversations(list, "ai_active", "").length, 1);
  assert.equal(filterConversations(list, "paused", "").length, 1);
  assert.equal(filterConversations(list, "human", "").length, 1);

  const searched = filterConversations(list, "all", "alpha");
  assert.equal(searched.length, 1);
  assert.equal(searched[0].customerName, "Alpha Customer");
});

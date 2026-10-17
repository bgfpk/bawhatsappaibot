import test from "node:test";
import assert from "node:assert/strict";

import { normalizeMessageItem, getStableMessageId } from "../../conversation-inbox/message-adapter.ts";
import { deduplicateMessages } from "../../conversation-inbox/conversation-dedupe.ts";
import { normalizeKnowledgeSource } from "../../knowledge/knowledge-model.ts";
import { normalizeProductRecord, mergeProductEdits } from "../../products/product-model.ts";
import {
  normalizeMediaItem,
  filterMediaItems,
  filterSequences,
  type MediaLibraryItem,
  type SequenceGroupItem,
} from "../content-library-model.ts";

test("Inbox Message Identity: does not rely on array index for message ID", () => {
  const item1 = normalizeMessageItem({ text: "Hello", sender: "customer", timestamp: 1700000000 }, 0);
  const item2 = normalizeMessageItem({ text: "Hello", sender: "customer", timestamp: 1700000000 }, 1);
  assert.equal(item1.id, item2.id);
  assert.equal(item1.id.includes("idx"), false);
});

test("Inbox Deduplicate: identical text with separate real IDs produces 2 distinct messages", () => {
  const msgs = [
    { id: "wa_msg_101", sender: "customer" as const, senderName: "Alice", text: "Price check", timestamp: 100 },
    { id: "wa_msg_102", sender: "customer" as const, senderName: "Alice", text: "Price check", timestamp: 105 },
  ];
  const result = deduplicateMessages(msgs);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, "wa_msg_101");
  assert.equal(result[1].id, "wa_msg_102");
});

test("Knowledge Model: does not fabricate ks_unknown ID or fake processing state", () => {
  const raw = { url: "https://example.com/products" };
  const source = normalizeKnowledgeSource(raw);
  assert.equal(source.id, undefined);
  assert.equal(source.title, "example.com");
  assert.equal(source.status, "unknown");
});

test("Product Model Safety: mergeProductEdits preserves untouched persisted raw fields", () => {
  const originalRaw = {
    id: "prod_999",
    name: "Luxury Coat",
    sku: "COAT-999",
    type: "physical",
    base_price: 150,
    cost_price: 80,
    stock: 25,
    weight: 1.2,
    variations: [{ name: "Size", options: [{ name: "XL", stock: 10 }] }],
    customMetadata: { vendorId: "v_123" },
  };

  const updatedRaw = mergeProductEdits(originalRaw, {
    description: "New updated description for AI",
  });

  assert.equal(updatedRaw.id, "prod_999");
  assert.equal(updatedRaw.name, "Luxury Coat");
  assert.equal(updatedRaw.base_price, 150);
  assert.equal(updatedRaw.cost_price, 80);
  assert.equal(updatedRaw.stock, 25);
  assert.equal(updatedRaw.weight, 1.2);
  assert.equal(updatedRaw.description, "New updated description for AI");
  assert.equal(updatedRaw.customMetadata.vendorId, "v_123");
});

test("Media Model: normalizeMediaItem parses types and metadata correctly", () => {
  const item = normalizeMediaItem({
    id: "med_123",
    caption: "Product Catalog PDF",
    type: "documentMessage",
    fileName: "catalog.pdf",
    fileSize: 204800,
  });

  assert.equal(item.id, "med_123");
  assert.equal(item.name, "catalog.pdf");
  assert.equal(item.caption, "Product Catalog PDF");
  assert.equal(item.type, "document");
  assert.equal(item.fileName, "catalog.pdf");
});

test("Media Filter: filters items by type and query correctly", () => {
  const items: MediaLibraryItem[] = [
    { id: "1", name: "Jacket Photo", type: "image", status: "ready" },
    { id: "2", name: "Pricing PDF", type: "document", fileName: "prices.pdf", status: "ready" },
    { id: "3", name: "Intro Video", type: "video", status: "ready" },
  ];

  const docs = filterMediaItems(items, "", "document");
  assert.equal(docs.length, 1);
  assert.equal(docs[0].name, "Pricing PDF");

  const searchResult = filterMediaItems(items, "Jacket", "all");
  assert.equal(searchResult.length, 1);
  assert.equal(searchResult[0].id, "1");
});

test("Sequence Filter: searches sequence groups by shortcut and keyword", () => {
  const seqs: SequenceGroupItem[] = [
    { id: "s1", name: "Price List Flow", itemCount: 2, items: [], shortcutCode: "prices", isEnabled: true },
    { id: "s2", name: "Support Intro", itemCount: 3, items: [], keywordTrigger: "help", isEnabled: true },
  ];

  const matchShortcut = filterSequences(seqs, "prices");
  assert.equal(matchShortcut.length, 1);
  assert.equal(matchShortcut[0].id, "s1");

  const matchKeyword = filterSequences(seqs, "help");
  assert.equal(matchKeyword.length, 1);
  assert.equal(matchKeyword[0].id, "s2");
});

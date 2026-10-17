import test from "node:test";
import assert from "node:assert/strict";

import { cleanCustomerBusinessSummary, splitEmbeddedSummaryFragments } from "./customer-summary-cleaner-service.ts";
import { mergeCustomerMemorySummary } from "./customer-memory-merge-service.ts";

test("polluted customer summary is cleaned and deduplicated", () => {
  const cleaned = cleanCustomerBusinessSummary(`
Current: Current: Current:
- Name: Salman
- Product: Plan A
- Bot replies permanently stopped for this customer
- Source: manual send shortcode
- Welcome sequence skipped: chat_has_history
- pending_ai_reply_retry_scheduled
- Missing: city, address
- Missing: city, address
`);
  assert.doesNotMatch(cleaned, /Name: Salman/);
  assert.match(cleaned, /Product: Plan A/);
  assert.match(cleaned, /Missing: city, address/);
  assert.doesNotMatch(cleaned, /Welcome sequence|manual send shortcode|pending_ai_reply|Bot replies/i);
  assert.equal((cleaned.match(/Missing: city, address/g) || []).length, 1);
});

test("inline repeated Current headings are cleaned into one usable section", () => {
  const merged = mergeCustomerMemorySummary(
    "Current: - Current: - Phone: +92 300 1112222\nCurrent: - Current: - Product: Trial plan",
    "Current:\n- Status: collecting details"
  );
  assert.equal((merged.match(/Current Status:/g) || []).length, 1);
  assert.doesNotMatch(merged, /Current: - Current/i);
  assert.doesNotMatch(merged, /Phone: \+92 300 1112222/);
  assert.match(merged, /Product: Trial plan/);
});

test("inline summary chains are split into clean bullets and noisy placeholders are removed", () => {
  const cleaned = cleanCustomerBusinessSummary([
    "Current:",
    "- Name: Ahad Firdosi - Phone: 923066935544 - Status: human review - Delivery: N/A - Name: Ahad Firdosi",
    "Notes:",
    "- Order draft is being updated.",
    "- Missing: Service",
  ].join("\n"));

  assert.match(cleaned, /Current:/);
  assert.doesNotMatch(cleaned, /Name: Ahad Firdosi/);
  assert.doesNotMatch(cleaned, /Phone: 923066935544/);
  assert.match(cleaned, /Status: human review/);
  assert.doesNotMatch(cleaned, /Delivery: N\/A/i);
  assert.doesNotMatch(cleaned, /Order draft is being updated/i);
  assert.doesNotMatch(cleaned, /Missing: Service/i);
  assert.equal((cleaned.match(/Name: Ahad Firdosi/g) || []).length, 0);
});

test("future plan is merged as pending next step instead of raw content", () => {
  const merged = mergeCustomerMemorySummary(
    "Current:\n- Name: Sana",
    "Future plan:\n- Ask only for delivery address"
  );
  assert.match(merged, /Next Best Action:/);
  assert.match(merged, /Ask only for delivery address/);
  assert.doesNotMatch(merged, /Future plan:\n- Future plan/i);
});

test("summary merge repairs existing internal noise instead of appending forever", () => {
  const merged = mergeCustomerMemorySummary(
    "Current:\n- Source: manual send shortcode\n- Customer language preference saved from customer messages\n- Name: Maqbool",
    "Current:\n- Lead status: incomplete\nPending / Next step:\n- Ask for city"
  );
  assert.doesNotMatch(merged, /Name: Maqbool/);
  assert.match(merged, /Lead status: incomplete/);
  assert.match(merged, /Ask for city/);
  assert.doesNotMatch(merged, /Source:|language preference saved/i);
});

test("summary merge removes old generic software fallback timeline lines", () => {
  const merged = mergeCustomerMemorySummary(
    [
      "Current:",
      "- Name: Sana",
      "",
      "Timeline:",
      "- Customer asked for media/check details.",
      "- AI replied with sales/support guidance.",
      "- AI shared price or option details.",
    ].join("\n"),
    [
      "Current:",
      "- Phone: 03001234567",
      "",
      "Pending / Next step:",
      "- Ask only for city.",
    ].join("\n"),
  );

  assert.doesNotMatch(merged, /Name: Sana/);
  assert.doesNotMatch(merged, /Phone: 03001234567/);
  assert.match(merged, /Ask only for city/);
  assert.doesNotMatch(merged, /sales\/support guidance/i);
  assert.doesNotMatch(merged, /price or option details/i);
  assert.doesNotMatch(merged, /media\/check details/i);
});

test("embedded timeline generic chains are split and removed inside one bullet", () => {
  const cleaned = cleanCustomerBusinessSummary([
    "Timeline:",
    "- Customer asked for media/check details. - AI replied with sales/support guidance. - Customer asked about the Starter plan order limit. - AI shared price or option details. - AI replied",
  ].join("\n"));

  assert.match(cleaned, /Customer asked about the Starter plan order limit/i);
  assert.doesNotMatch(cleaned, /media\/check details/i);
  assert.doesNotMatch(cleaned, /sales\/support guidance/i);
  assert.doesNotMatch(cleaned, /price or option details/i);
  assert.doesNotMatch(cleaned, /AI replied\.?$/i);
});

test("pending embedded duplicate and cutoff fragments are deduped before save", () => {
  const cleaned = cleanCustomerBusinessSummary([
    "Pending / Next step:",
    "- Help customer start setup or answer setup questions. - Help customer start setup or answer setup questions. - Help customer start setup or answer se. - Ask only for Se",
  ].join("\n"));

  assert.equal((cleaned.match(/Help customer start setup or answer setup questions/g) || []).length, 1);
  assert.doesNotMatch(cleaned, /answer se\.?(?:\n|$)/i);
  assert.doesNotMatch(cleaned, /Ask only for Se/i);
});

test("generic BlackArrow marketing copy is removed from summaries", () => {
  const cleaned = cleanCustomerBusinessSummary([
    "Current:",
    "- Name: Ahad Firdosi",
    "",
    "Timeline:",
    "- BlackArrow helps businesses with quick replies and automated replies.",
    "- Customer asked how to set up BlackArrow.",
  ].join("\n"));

  assert.match(cleaned, /Customer asked how to set up BlackArrow/i);
  assert.doesNotMatch(cleaned, /helps businesses with quick replies/i);
});

test("sentence-safe truncation keeps words intact in saved summaries", () => {
  const cleaned = cleanCustomerBusinessSummary([
    "Current:",
    "- Name: Ahad Firdosi",
    "",
    "Timeline:",
    "- Customer asked about the Starter plan order limit and setup process. AI explained the trial and QR setup process.",
  ].join("\n"), 105);

  assert.doesNotMatch(cleaned, /proces$/i);
  assert.doesNotMatch(cleaned, /\babou$/i);
});

test("embedded fragment splitter handles bullet chains without keeping bullet markers", () => {
  assert.deepEqual(
    splitEmbeddedSummaryFragments("- Customer asked about setup. - AI explained QR connection."),
    ["Customer asked about setup.", "AI explained QR connection."],
  );
});

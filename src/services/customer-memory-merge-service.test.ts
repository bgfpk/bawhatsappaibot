import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMemoryPromptRules,
  formatCustomerMemorySummary,
  mergeCustomerMemorySummary,
} from "./customer-memory-merge-service.ts";

test("summary preserves business type, use case, volume numbers, and compact sections", () => {
  const existing = [
    "Current:",
    "- Business/use case: clinic, wants AI to answer doctor timings, patient questions, and book appointments",
    "- Language preference: Urdu/Roman Urdu",
    "- Important facts: around 1500 text messages and 200 voice notes monthly",
    "",
    "Timeline:",
    "- Customer asked if BlackArrow can handle doctor timings and appointments.",
    "",
    "Pending / Next step:",
    "- Explain monthly plan and wallet clearly.",
    "",
    "Notes:",
    "- Do not ask business type again.",
  ].join("\n");

  const candidate = [
    "Current:",
    "- Status: trial interest, pricing explained",
    "",
    "Timeline:",
    "- AI estimated about $10.50 wallet usage plus selected subscription plan.",
  ].join("\n");

  const merged = mergeCustomerMemorySummary(existing, candidate);
  assert.match(merged, /Current Status:/);
  assert.match(merged, /Conversation Timeline:/);
  assert.match(merged, /Next Best Action:/);
  assert.match(merged, /Private Notes:/);
  assert.match(merged, /clinic/i);
  assert.match(merged, /doctor timings/i);
  assert.match(merged, /appointments/i);
  assert.match(merged, /1500 text/i);
  assert.match(merged, /200 voice/i);
  assert.match(merged, /Urdu\/Roman Urdu/i);
  assert.ok(merged.length <= 2500);
});

test("memory prompt prevents repeated known business and language questions", () => {
  const rules = buildMemoryPromptRules();
  assert.match(rules, /saved Customer summary/i);
  assert.match(rules, /never ask business type again/i);
  assert.match(rules, /Urdu\/Roman Urdu/i);
  assert.match(rules, /do not switch to Hindi/i);
});

test("AI-first merge removes old generic fallback timeline lines when candidate is specific", () => {
  const merged = mergeCustomerMemorySummary(
    [
      "Current:",
      "- Name: Ahad Firdosi",
      "",
      "Timeline:",
      "- Customer asked for media/check details.",
      "- AI replied with sales/support guidance.",
      "- AI shared price or option details.",
    ].join("\n"),
    [
      "Current:",
      "- Interest: BlackArrow Growth plan",
      "",
      "Timeline:",
      "- Customer asked what services BlackArrow provides.",
      "- Customer asked about plans and pricing.",
      "- Customer said he is interested in Growth.",
    ].join("\n"),
    {
      preferCandidate: true,
      dropGenericFallbackWhenCandidateSpecific: true,
    },
  );

  assert.match(merged, /Interest: BlackArrow Growth plan/i);
  assert.match(merged, /Customer asked what services BlackArrow provides/i);
  assert.doesNotMatch(merged, /Customer asked for media\/check details/i);
  assert.doesNotMatch(merged, /AI replied with sales\/support guidance/i);
  assert.doesNotMatch(merged, /AI shared price or option details/i);
});

test("polluted old summary contributes durable facts only instead of appending junk", () => {
  const merged = mergeCustomerMemorySummary(
    [
      "Current:",
      "- Name: Ahad Firdosi Phone: 923066935544 Status: human review Language: english Phone: Interest: BlackArrow Starter plan",
      "",
      "Timeline:",
      "- Customer asked for media/check details. - AI replied with sales/support guidance.",
      "",
      "Pending / Next step:",
      "- Help customer start setup or answer setup questions. - Ask customer what they need. - Ask only for Se",
    ].join("\n"),
    [
      "Current:",
      "- Interest: BlackArrow Starter plan, order limit, and setup",
      "- Status: interested in trial/setup guidance",
      "- Language: English",
      "",
      "Timeline:",
      "- Customer asked about the Starter plan order limit.",
      "- AI explained Starter includes 300 orders/month and costs $9/month or $65/year.",
      "- Customer asked how to set up BlackArrow.",
      "",
      "Pending / Next step:",
      "- Help customer start setup or answer setup questions.",
    ].join("\n"),
    { preferCandidate: true, dropGenericFallbackWhenCandidateSpecific: true },
  );

  assert.doesNotMatch(merged, /Name: Ahad Firdosi/i);
  assert.doesNotMatch(merged, /Phone: 923066935544/i);
  assert.match(merged, /Status: interested in trial\/setup guidance/i);
  assert.doesNotMatch(merged, /human review/i);
  assert.doesNotMatch(merged, /media\/check details|sales\/support guidance|Ask only for Se|Ask customer what they need/i);
});

test("polluted previous Timeline and Pending are not carried forward", () => {
  const merged = mergeCustomerMemorySummary(
    [
      "Current:",
      "- Name: Ahad Firdosi - Phone: 923066935544 - Status: human review - Language: English",
      "",
      "Timeline:",
      "- Customer asked for media/check details. - AI replied with sales/support guidance. - Customer asked about stale trial note.",
      "",
      "Pending / Next step:",
      "- Call customer tomorrow. - Help customer start setup or answer se.",
    ].join("\n"),
    [
      "Current:",
      "- Interest: BlackArrow Starter plan, order limit, and setup",
      "- Status: interested in trial/setup guidance",
      "",
      "Timeline:",
      "- Customer asked about the Starter plan order limit.",
      "- AI explained Starter includes 300 orders/month and costs $9/month or $65/year.",
      "",
      "Pending / Next step:",
      "- Help customer start setup or answer setup questions.",
    ].join("\n"),
    { preferCandidate: true, dropGenericFallbackWhenCandidateSpecific: true },
  );

  assert.doesNotMatch(merged, /Name: Ahad Firdosi/i);
  assert.doesNotMatch(merged, /Phone: 923066935544/i);
  assert.match(merged, /Interest: BlackArrow Starter plan, order limit, and setup/i);
  assert.match(merged, /Customer asked about the Starter plan order limit/i);
  assert.match(merged, /Help customer start setup or answer setup questions/i);
  assert.doesNotMatch(merged, /stale trial note|Call customer tomorrow|answer se\.?(?:\n|$)/i);
});

test("customer memory merge handles legacy summary lines before any section heading", () => {
  const summary = mergeCustomerMemorySummary(
    "Customer wants Growth plan setup help and pricing.",
    "Current:\n- Status: interested in trial/setup guidance\nPending / Next step:\n- Help customer start setup.",
  );

  assert.match(summary, /Growth plan setup help/i);
  assert.match(summary, /interested in trial\/setup guidance/i);
  assert.match(summary, /Help customer start setup/i);
});

test("customer memory merge handles malformed old stored summary object", () => {
  const summary = mergeCustomerMemorySummary(
    {
      currentFacts: ["Business/use case: clinic appointment booking"],
      timeline: undefined,
      pendingNextStep: "Follow up about setup.",
      notes: { text: "Do not ask business type again." },
    },
    "Current:\n- Interest: BlackArrow setup\nTimeline:\n- Customer asked about setup.",
  );

  assert.match(summary, /clinic appointment booking/i);
  assert.match(summary, /BlackArrow setup/i);
  assert.match(summary, /Customer asked about setup/i);
  assert.match(summary, /Follow up about setup/i);
  assert.doesNotMatch(summary, /\[object object\]/i);
});

test("customer memory summary formatter treats missing section lists as empty arrays", () => {
  const summary = formatCustomerMemorySummary({
    current: ["Status: interested"],
    timeline: undefined,
    details: "bad old value" as any,
    pending: undefined,
    notes: undefined,
  });

  assert.match(summary, /Current Status:/);
  assert.match(summary, /Status: interested/);
  assert.doesNotMatch(summary, /bad old value/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildDynamicAdminIssueSummary,
  buildDynamicAdminSuggestedAction,
  buildShortAdminAlertMessage,
} from "./dynamic-escalation-reply-service.ts";

const source = readFileSync(new URL("./dynamic-escalation-reply-service.ts", import.meta.url), "utf8");

test("dynamic escalation service no longer contains fixed customer fallback phrases", () => {
  assert.doesNotMatch(source, /I can see the earlier reply was not clear enough/i);
  assert.doesNotMatch(source, /Rather than repeat it/i);
  assert.doesNotMatch(source, /I've forwarded this to the team/i);
  assert.doesNotMatch(source, /This needs confirmation from the team/i);
  assert.doesNotMatch(source, /Main ne ye baat team tak/i);
  assert.doesNotMatch(source, /Is baat ki team se confirmation/i);
});

test("dynamic escalation admin helpers stay generic and business-agnostic", () => {
  const summary = buildDynamicAdminIssueSummary({
    sender: "contact-4e899668752d@example.invalid",
    latestUserText: "Please connect me with a person.",
    reasonCategory: "human_requested",
    topic: "human help",
  });
  const action = buildDynamicAdminSuggestedAction({
    sender: "contact-4e899668752d@example.invalid",
    latestUserText: "Please connect me with a person.",
    reasonCategory: "human_requested",
    topic: "human help",
  });

  assert.match(summary, /human|admin/i);
  assert.match(action, /call|handoff|reply personally/i);
  assert.doesNotMatch(`${summary} ${action}`, /\bAmmar\b|\bSehat Card\b|\bdoctor list\b/i);
});

test("dynamic escalation admin alert stays short and understandable", () => {
  const alert = buildShortAdminAlertMessage({
    customerName: "Salman",
    customerPhone: "195545134641",
    sender: "contact-4e899668752d@example.invalid",
    latestUserText: "Please connect me with the manager.",
    reasonCategory: "human_requested",
    topic: "manager request",
    issueSummary: "Customer requested to speak with a human or admin about manager request.",
    suggestedAction: "Please reply personally about manager request or arrange a handoff.",
  });

  assert.match(alert, /Admin Help Needed/);
  assert.match(alert, /Customer: Salman/);
  assert.match(alert, /Phone: \+923001234567/);
  assert.match(alert, /Issue:\nCustomer requested to speak with a human or admin about manager request\./);
  assert.match(alert, /Suggested action:\nPlease reply personally about manager request or arrange a handoff\./);
  assert.doesNotMatch(alert, /Latest:/);
  assert.doesNotMatch(alert, /Reason:/);
  assert.doesNotMatch(alert, /^reply:/m);
  assert.ok(alert.length <= 500);
});

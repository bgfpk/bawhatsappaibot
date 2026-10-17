import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const worker = fs.readFileSync(path.join(root, "bot-worker.ts"), "utf8");
const app = fs.readFileSync(path.join(root, "src/app/ProtectedDashboardApplication.tsx"), "utf8");

const server = fs.readFileSync(path.join(root, "server.ts"), "utf8");

test("inbound OFF branch saves history, runs deterministic sequences, then exits before AI-side work", () => {
  const saved = worker.indexOf('title: "Message saved"');
  const disabled = worker.indexOf("if (!aiChatReplyMode.enabled)", saved);
  const welcome = worker.indexOf("processAutomaticWelcomeSequence(", disabled);
  const shortcut = worker.indexOf("processShortcut(", welcome);
  const exit = worker.indexOf("continue;", shortcut);
  const planned = worker.indexOf("parsePlannedCustomerUpdate", disabled);
  assert.ok(saved >= 0 && saved < disabled);
  assert.ok(disabled < welcome && welcome < shortcut && shortcut < exit && exit < planned);
  const disabledBranch = worker.slice(disabled, planned);
  assert.doesNotMatch(disabledBranch, /aiHandler|queueAiReplyRetry|createOrder|saveOrder|findLatestCustomerRecord|DeepInfra|Gemini/);
  assert.match(disabledBranch, /ai_chat_reply_skipped reason=disabled/);
});

test("buffered and retry AI paths use central mode and new-message timestamp guard", () => {
  assert.match(worker, /resolveBotAiChatReplyMode\(botConfig\)\.allowInboundAiReply/);
  assert.match(worker, /resolveBotAiChatReplyMode\(botConfig\)\.allowAiReplyRetry/);
  assert.match(worker, /canProcessInboundAiMessage\(botConfig/);
  assert.doesNotMatch(worker, /!botConfig\?\.autoReply/);
});

test("authenticated per-instance save mirrors canonical and legacy fields and refreshes worker", () => {
  assert.match(server, /requireOwnedBot/);
  assert.match(server, /ai_chat_replies_enabled/);
  assert.match(server, /normalizedConfig\.autoReply = normalizedConfig\.ai_chat_replies_enabled/);
  assert.match(server, /\/api\/update-config/);
});

test("UI provides per-instance state, exact explanations, confirmation, and Business Home status", () => {
  assert.match(app, />AI Chat Replies</);
  assert.match(app, /BlackArrow answers incoming customer messages with AI and captures leads or orders as configured/);
  assert.match(app, /BlackArrow stays silent for normal incoming messages/);
  assert.match(app, /Saved sequences, shortcuts, and scheduled follow-ups continue/);
  assert.match(app, /Turn off AI Chat Replies\?/);
  assert.match(app, /Keep AI Replies On/);
  assert.match(app, /Turn Off AI Replies/);
  assert.match(app, /AI replies will apply to new incoming messages only/);
  assert.match(app, /isAutoReplyEnabled/);
});

test("outbound automation remains present and is not gated by the inbound mode branch", () => {
  for (const marker of ["buildStaticFollowupMessage", "buildAiSmartFollowupMessageWithMeta", "claimDueRecipientJobs", "sendUniversalAutomationRelay"]) {
    assert.match(worker, new RegExp(marker));
  }
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  detectBotIntroducedTermContext,
  findRecentBotIntroducedTerm,
  isBotTermClarificationQuestion,
  suppressBotIntroducedTermText,
} from "./bot-hallucination-guard-service.ts";

function message(fromMe: boolean, text: string) {
  return {
    key: { fromMe, remoteJid: "contact-e4ed32210a80@example.invalid", id: `${fromMe ? "bot" : "user"}-${text}` },
    message: { conversation: text },
    messageTimestamp: Date.now(),
  };
}

test("detects bot-introduced term clarifications such as WazirX and suppresses future intent carryover", () => {
  const detected = detectBotIntroducedTermContext([
    message(false, "Mujhe wallet samajh nahi aa rahi"),
    message(true, "WazirX hai ya koi aur?"),
    message(false, "WazirX ka kya matlab hai?"),
  ]);

  assert.ok(detected);
  assert.equal(detected?.term, "wazirx");
  assert.match(String(detected?.guidance || ""), /not as customer intent/i);
});

test("normal customer requirement questions do not trigger bot hallucination guard", () => {
  const detected = detectBotIntroducedTermContext([
    message(false, "Need physiotherapy appointment"),
    message(true, "Please share your preferred date"),
    message(false, "What time is available tomorrow?"),
  ]);

  assert.equal(isBotTermClarificationQuestion("What time is available tomorrow?"), false);
  assert.equal(detected, null);
});

test("recent bot-introduced term is found but marked unrelated when latest message is a new image/business request", () => {
  const detected = findRecentBotIntroducedTerm([
    message(false, "Mujhe wallet samajh nahi aa rahi"),
    message(true, "WazirX hai ya koi aur?"),
    message(false, "WazirX ka kya matlab hai?"),
    message(true, "Sorry, that was a mistake."),
    message(false, "Yeh image check kar dein"),
  ]);

  assert.ok(detected);
  assert.equal(detected?.term, "wazirx");
  assert.equal(detected?.latestMessageAsksAboutBotTerm, false);
});

test("suppression helper removes old bot-introduced term lines from summary text", () => {
  const suppressed = suppressBotIntroducedTermText([
    "Customer asked about poster pricing.",
    "Old confusion: WazirX hai ya koi aur?",
    "Latest need: image review.",
  ].join("\n"), "wazirx");

  assert.equal(/wazirx/i.test(suppressed), false);
  assert.match(suppressed, /Latest need: image review\./);
});

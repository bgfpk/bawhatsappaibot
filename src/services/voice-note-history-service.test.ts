import test from "node:test";
import assert from "node:assert/strict";

import {
  buildVoiceNoteHistoryText,
  isUsableVoiceTranscript,
  isVoiceNoteMeaningText,
  isVoiceTranscriptUnavailableText,
} from "./voice-note-history-service.ts";

test("voice note history uses real transcript and rejects placeholders", () => {
  assert.equal(isUsableVoiceTranscript("Voice Message"), false);
  const text = buildVoiceNoteHistoryText({
    transcript: "Customer asked pricing for warehouse racks and delivery in Lahore.",
  });

  assert.match(text, /^Voice note:/);
  assert.match(text, /warehouse racks/);
  assert.equal(isVoiceNoteMeaningText(text), true);
});

test("voice note history uses honest fallback when transcript is unavailable", () => {
  const text = buildVoiceNoteHistoryText({ transcript: "Voice Message" });

  assert.equal(text, "Voice note received, transcript unavailable");
  assert.equal(isVoiceTranscriptUnavailableText(text), true);
});

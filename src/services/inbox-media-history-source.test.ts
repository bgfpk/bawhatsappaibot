import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = readFileSync(resolve(root, "server.ts"), "utf8");

test("inbox messages route resolves durable media context for audio and image history", () => {
  assert.match(source, /getSavedMediaContextByMessage/);
  assert.match(source, /buildMediaContextHistoryText/);
  assert.match(source, /text\.startsWith\("Voice note"\)/);
});

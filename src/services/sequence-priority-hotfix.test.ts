import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function source(file: string) {
  return fs.readFileSync(path.join(process.cwd(), "src", "services", file), "utf8");
}

test("welcome and shortcut sequence checks emit priority diagnostics before AI", () => {
  const text = source("sequence-manager.ts");

  assert.match(text, /sequence_check_started type=welcome/);
  assert.match(text, /sequence_check_started type=shortcut/);
  assert.match(text, /welcome_sequence_matched source=automatic/);
  assert.match(text, /welcome_sequence_sent source=automatic/);
  assert.match(text, /welcome_sequence_skipped_reason source=automatic/);
  assert.match(text, /keyword_sequence_matched/);
  assert.match(text, /welcome_sequence_sent source=keyword/);
});

test("automatic welcome returns true when templates are missing so AI is not started for same first contact", () => {
  const text = source("sequence-manager.ts");

  assert.match(text, /reason: "templates_not_loaded"/);
  assert.match(text, /return true;/);
});

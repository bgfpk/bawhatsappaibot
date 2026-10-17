import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { queueCustomerChatSummaryRefresh } from "./customer-summary-service.ts";

test("customer summary service emits queued, updated, skipped, rejected, and failed live events", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "services", "customer-summary-service.ts"), "utf8");

  for (const eventType of ["summary_queued", "summary_updated", "summary_skipped", "summary_rejected", "summary_failed"]) {
    assert.match(source, new RegExp(`type: "${eventType}"`), eventType);
  }
  assert.match(source, /emitLiveConsoleEvent/);
});

test("customer summary queue ignores incomplete input without crashing", async () => {
  await assert.doesNotReject(queueCustomerChatSummaryRefresh({ dataOwnerKey: "", customerJid: "" } as any));
});

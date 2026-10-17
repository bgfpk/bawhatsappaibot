import test from "node:test";
import assert from "node:assert/strict";

import {
  clearLiveConsoleEventsForTest,
  emitLiveConsoleEvent,
  listLiveConsoleEvents,
  setLiveConsoleEventBroadcaster,
} from "./live-console-event-service.ts";

test.afterEach(() => {
  clearLiveConsoleEventsForTest();
});

test("live event service stores, broadcasts, scopes, and redacts unsafe metadata", () => {
  const broadcasted: any[] = [];
  setLiveConsoleEventBroadcaster((event) => broadcasted.push(event));

  const event = emitLiveConsoleEvent({
    type: "payment_error",
    level: "error",
    scope: "account",
    accountId: "acct_1",
    botId: "bot_1",
    customerJid: "contact-e4ed32210a80@example.invalid",
    title: "Payment failed",
    message: "Checkout failed",
    reason: "checkout",
    metadata: {
      amount: 9,
      apiKey: "secret-key",
      rawPayload: "secret-payload",
      transactionRef: "blackarrow_ok",
    },
  });

  assert.equal(broadcasted.length, 1);
  assert.equal(event.category, "Payment");
  assert.equal(event.customerJid, "contact-87ea082a95cc@example.invalid");
  assert.equal(event.metadata?.amount, 9);
  assert.equal(event.metadata?.transactionRef, "blackarrow_ok");
  assert.equal("apiKey" in (event.metadata || {}), false);
  assert.equal("rawPayload" in (event.metadata || {}), false);

  assert.equal(listLiveConsoleEvents({ accountId: "acct_1" }).length, 1);
  assert.equal(listLiveConsoleEvents({ accountId: "acct_2" }).length, 0);
});

test("live event replay supports since filtering", () => {
  const first = emitLiveConsoleEvent({ type: "summary_updated", title: "Summary updated", message: "done" });
  const second = emitLiveConsoleEvent({ type: "summary_failed", level: "error", title: "Summary failed", message: "bad" });

  assert.deepEqual(listLiveConsoleEvents({ since: second.timestamp }).map((event) => event.id), [first.id, second.id]);
  assert.equal(listLiveConsoleEvents({ since: second.timestamp + 1 }).length, 0);
});

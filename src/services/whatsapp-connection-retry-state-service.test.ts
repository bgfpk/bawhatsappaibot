import test from "node:test";
import assert from "node:assert/strict";

import { buildWhatsAppConnectionRetryState } from "./whatsapp-connection-retry-state-service.ts";

test("proxy or network connection issue uses neutral retrying state with retry count", () => {
  const state = buildWhatsAppConnectionRetryState({
    retryCount: 7,
    reason: "No active proxy available. WhatsApp connection blocked to protect VPS IP.",
    nextRetryMs: 60000,
  });

  assert.equal(state.status, "retrying");
  assert.equal(state.retryCount, 7);
  assert.equal(state.message, "Preparing WhatsApp connection");
  assert.equal(state.detail, "Waiting for QR code or connected status...");
  assert.doesNotMatch(`${state.message} ${state.detail}`, /Connection Setup Failed/i);
});

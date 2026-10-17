import test from "node:test";
import assert from "node:assert/strict";

import {
  buildUserConfigWritePayload,
  isUnsupportedDhlUserConfigError,
  stripDhlFieldsFromUserConfigPayload,
} from "./user-config-save-payload-service.ts";

test("Unknown integration field cannot break unrelated tab saves", () => {
  const payload = buildUserConfigWritePayload({
    adminNumber: "16747095146",
    totallyUnknownField: "ignore me",
  });

  assert.equal(payload.admin_number, "16747095146");
  assert.equal("totallyUnknownField" in payload, false);
});

test("If DHL schema storage is not ready, non-DHL user config fields still have a safe retry payload", () => {
  const payload = buildUserConfigWritePayload({
    adminNumber: "16747095146",
    dhlApiKey: "secret",
    dhlEnabled: true,
  });
  const safePayload = stripDhlFieldsFromUserConfigPayload(payload);

  assert.equal(payload.admin_number, "16747095146");
  assert.equal(payload.dhl_api_key, "secret");
  assert.equal(payload.dhl_enabled, 1);
  assert.equal(safePayload.admin_number, "16747095146");
  assert.equal("dhl_api_key" in safePayload, false);
  assert.equal("dhl_enabled" in safePayload, false);
});

test("DHL unknown attribute errors are detected for clean fallback handling", () => {
  assert.equal(isUnsupportedDhlUserConfigError({
    code: 400,
    message: 'Invalid document structure: Unknown attribute: "dhl_api_key"',
  }), true);
  assert.equal(isUnsupportedDhlUserConfigError({
    code: 400,
    message: 'Invalid document structure: Unknown attribute: "postex_api_key"',
  }), false);
});

test("Business timezone is saved through account config payload", () => {
  const payload = buildUserConfigWritePayload({
    businessTimezone: "Asia/Dubai",
  });

  assert.equal(payload.business_timezone, "Asia/Dubai");
  assert.equal(typeof payload.updated_at, "number");
});

test("Delayed read receipts fields are mapped in account config payload", () => {
  const payload = buildUserConfigWritePayload({
    delayedReadReceiptsEnabled: true,
    readReceiptDelaySeconds: 15,
  });

  assert.equal(payload.delayed_read_receipts_enabled, 1);
  assert.equal(payload.read_receipt_delay_seconds, 15);
  assert.equal(typeof payload.updated_at, "number");
});

test("Delayed read receipts unknown attribute errors are detected", async () => {
  const { isUnsupportedDelayedReadConfigError, stripDelayedReadFieldsFromUserConfigPayload } = await import("./user-config-save-payload-service.ts");
  assert.equal(isUnsupportedDelayedReadConfigError({
    code: 400,
    message: 'Invalid document structure: Unknown attribute: "delayed_read_receipts_enabled"',
  }), true);
  assert.equal(isUnsupportedDelayedReadConfigError({
    code: 400,
    message: 'Invalid document structure: Unknown attribute: "read_receipt_delay_seconds"',
  }), true);
  assert.equal(isUnsupportedDelayedReadConfigError({
    code: 400,
    message: 'Invalid document structure: Unknown attribute: "postex_api_key"',
  }), false);

  const payload = {
    admin_number: "12345",
    delayed_read_receipts_enabled: 1,
    read_receipt_delay_seconds: 15,
  };
  const stripped = stripDelayedReadFieldsFromUserConfigPayload(payload);
  assert.equal(stripped.admin_number, "12345");
  assert.equal("delayed_read_receipts_enabled" in stripped, false);
  assert.equal("read_receipt_delay_seconds" in stripped, false);
});

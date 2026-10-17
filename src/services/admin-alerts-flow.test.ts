import test from "node:test";
import assert from "node:assert/strict";

function sanitizeAdminPhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "").trim();
  if (digits.startsWith("+")) {
    return digits.slice(1);
  }
  return digits;
}

function validateAdminAlertConfig(config: {
  adminPhone?: string;
  isAlertsEnabled?: boolean;
  alertTypes?: {
    lowBalance?: boolean;
    instanceDisconnected?: boolean;
    humanEscalation?: boolean;
    failedOrders?: boolean;
  };
}) {
  const phone = (config.adminPhone || "").trim();
  const digits = sanitizeAdminPhone(phone);
  if (config.isAlertsEnabled && !digits) {
    return { valid: false, error: "Admin WhatsApp phone number is required when alerts are enabled." };
  }
  if (digits && (digits.length < 8 || digits.length > 16)) {
    return { valid: false, error: "Please enter a valid WhatsApp phone number with country code." };
  }
  return {
    valid: true,
    sanitizedPhone: digits,
    isAlertsEnabled: Boolean(config.isAlertsEnabled),
    alertTypes: {
      lowBalance: config.alertTypes?.lowBalance !== false,
      instanceDisconnected: config.alertTypes?.instanceDisconnected !== false,
      humanEscalation: config.alertTypes?.humanEscalation !== false,
      failedOrders: config.alertTypes?.failedOrders !== false,
    },
  };
}

test("sanitizeAdminPhone strips formatting and plus prefixes correctly", () => {
  assert.equal(sanitizeAdminPhone("+92 300 1234567"), "195545134641");
  assert.equal(sanitizeAdminPhone("92-300-1234567"), "195545134641");
  assert.equal(sanitizeAdminPhone("+1 (555) 019-2834"), "14515224130");
});

test("validateAdminAlertConfig requires phone when alerts enabled", () => {
  const result = validateAdminAlertConfig({ adminPhone: "", isAlertsEnabled: true });
  assert.equal(result.valid, false);
  assert.match(result.error || "", /required/);
});

test("validateAdminAlertConfig permits empty phone when alerts disabled", () => {
  const result = validateAdminAlertConfig({ adminPhone: "", isAlertsEnabled: false });
  assert.equal(result.valid, true);
  assert.equal(result.isAlertsEnabled, false);
});

test("validateAdminAlertConfig accepts valid phone with default category flags", () => {
  const result = validateAdminAlertConfig({
    adminPhone: "+92 300 1234567",
    isAlertsEnabled: true,
    alertTypes: { lowBalance: true, instanceDisconnected: true },
  });
  assert.equal(result.valid, true);
  assert.equal(result.sanitizedPhone, "195545134641");
  assert.equal(result.alertTypes?.lowBalance, true);
  assert.equal(result.alertTypes?.instanceDisconnected, true);
  assert.equal(result.alertTypes?.humanEscalation, true);
});

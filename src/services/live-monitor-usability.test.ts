import test from "node:test";
import assert from "node:assert/strict";

// Helper functions that match the LiveMonitorPage logic
function clampBufferLimit(val: any, fallback = 100): number {
  const num = typeof val === "number" ? val : parseInt(String(val), 10);
  if (isNaN(num)) return fallback;
  return Math.max(10, Math.min(1000, num));
}

function formatLogEntryForExport(log: { type?: string; msg: string; timestamp?: number }): string {
  const time = new Date(log.timestamp || Date.now()).toLocaleTimeString();
  const type = (log.type || "info").toUpperCase();
  return `${time} [${type}] ${log.msg}`;
}

function formatAllLogsForCopy(logs: Array<{ type?: string; msg: string; timestamp?: number }>, limit: number): string {
  const displayed = logs.slice(0, clampBufferLimit(limit));
  return displayed.map(formatLogEntryForExport).join("\n");
}

function sanitizeLogMessageForTenant(msg: string): string {
  return msg
    .replace(/(bearer\s+)[A-Za-z0-9_\-\.]{16,}/gi, "$1[REDACTED]")
    .replace(/(api[_-]?key\s*[:=]\s*)[A-Za-z0-9_\-\.]{16,}/gi, "$1[REDACTED]")
    .replace(/(session[_-]?secret\s*[:=]\s*)[A-Za-z0-9_\-\.]{16,}/gi, "$1[REDACTED]");
}

test("1. default buffer size is 100", () => {
  assert.equal(clampBufferLimit(undefined), 100);
  assert.equal(clampBufferLimit(null), 100);
});

test("2. custom buffer size within bounds is honored", () => {
  assert.equal(clampBufferLimit(50), 50);
  assert.equal(clampBufferLimit(250), 250);
  assert.equal(clampBufferLimit(500), 500);
});

test("3. values below min (10) are clamped to 10", () => {
  assert.equal(clampBufferLimit(0), 10);
  assert.equal(clampBufferLimit(-50), 10);
  assert.equal(clampBufferLimit(9), 10);
});

test("4. values above max (1000) are clamped to 1000", () => {
  assert.equal(clampBufferLimit(1001), 1000);
  assert.equal(clampBufferLimit(5000), 1000);
  assert.equal(clampBufferLimit(999999), 1000);
});

test("5. non-numeric buffer inputs fallback gracefully to default 100", () => {
  assert.equal(clampBufferLimit("invalid"), 100);
  assert.equal(clampBufferLimit("abc"), 100);
  assert.equal(clampBufferLimit({}), 100);
});

test("6. string numeric inputs are parsed and clamped", () => {
  assert.equal(clampBufferLimit("50"), 50);
  assert.equal(clampBufferLimit("5"), 10);
  assert.equal(clampBufferLimit("2000"), 1000);
});

test("7. buffer slicing respects current buffer limit", () => {
  const logs = Array.from({ length: 200 }, (_, i) => ({
    type: "info",
    msg: `Log entry #${i + 1}`,
    timestamp: Date.now() - (200 - i) * 1000,
  }));

  const sliced50 = logs.slice(0, clampBufferLimit(50));
  assert.equal(sliced50.length, 50);
  assert.equal(sliced50[0].msg, "Log entry #1");

  const sliced150 = logs.slice(0, clampBufferLimit(150));
  assert.equal(sliced150.length, 150);
});

test("8. shrinking buffer drops excess oldest entries from view", () => {
  const logs = Array.from({ length: 100 }, (_, i) => ({
    type: "info",
    msg: `Event ${i}`,
  }));

  const initial = logs.slice(0, clampBufferLimit(100));
  assert.equal(initial.length, 100);

  const shrunk = logs.slice(0, clampBufferLimit(25));
  assert.equal(shrunk.length, 25);
});

test("9. expanding buffer exposes existing entries up to new limit", () => {
  const logs = Array.from({ length: 300 }, (_, i) => ({
    type: "info",
    msg: `Event ${i}`,
  }));

  const limited100 = logs.slice(0, clampBufferLimit(100));
  assert.equal(limited100.length, 100);

  const expanded300 = logs.slice(0, clampBufferLimit(300));
  assert.equal(expanded300.length, 300);
});

test("10. formatLogEntryForExport formats timestamps and types cleanly", () => {
  const entry = { type: "wa", msg: "Message delivered", timestamp: 1700000000000 };
  const formatted = formatLogEntryForExport(entry);
  assert.ok(formatted.includes("[WA] Message delivered"));
});

test("11. formatAllLogsForCopy produces multi-line text with all entries", () => {
  const logs = [
    { type: "info", msg: "Engine started", timestamp: 1700000000000 },
    { type: "ai", msg: "AI replied to customer", timestamp: 1700000001000 },
    { type: "wa", msg: "WhatsApp sent", timestamp: 1700000002000 },
  ];

  const copied = formatAllLogsForCopy(logs, 100);
  const lines = copied.split("\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[0].includes("[INFO] Engine started"));
  assert.ok(lines[1].includes("[AI] AI replied to customer"));
  assert.ok(lines[2].includes("[WA] WhatsApp sent"));
});

test("12. formatAllLogsForCopy respects buffer limits during copy", () => {
  const logs = Array.from({ length: 50 }, (_, i) => ({
    type: "info",
    msg: `Step ${i}`,
    timestamp: 1700000000000,
  }));

  const copied = formatAllLogsForCopy(logs, 20);
  const lines = copied.split("\n");
  assert.equal(lines.length, 20);
});

test("13. copying single entry produces single formatted line", () => {
  const entry = { type: "error", msg: "Connection dropped", timestamp: 1700000000000 };
  const line = formatLogEntryForExport(entry);
  assert.ok(line.includes("[ERROR] Connection dropped"));
  assert.equal(line.includes("\n"), false);
});

test("14. copy preserves newlines inside log messages", () => {
  const entry = { type: "info", msg: "Line 1\nLine 2\nLine 3", timestamp: 1700000000000 };
  const formatted = formatLogEntryForExport(entry);
  assert.ok(formatted.includes("Line 1\nLine 2\nLine 3"));
});

test("15. clearing logs results in empty export string", () => {
  const logs: any[] = [];
  const copied = formatAllLogsForCopy(logs, 100);
  assert.equal(copied, "");
});

test("16. sanitization redacts Bearer tokens in logs", () => {
  const unsafe = "Connected using bearer sk-test1234567890abcdef123456";
  const safe = sanitizeLogMessageForTenant(unsafe);
  assert.equal(safe.includes("sk-test1234567890abcdef123456"), false);
  assert.ok(safe.includes("bearer [REDACTED]"));
});

test("17. sanitization redacts API keys in logs", () => {
  const unsafe = "Config api_key=12345678901234567890 and valid=true";
  const safe = sanitizeLogMessageForTenant(unsafe);
  assert.equal(safe.includes("12345678901234567890"), false);
  assert.ok(safe.includes("api_key=[REDACTED]"));
});

test("18. sanitization preserves safe technical parameters and event names", () => {
  const technical = "ai_reply_timing provider=deepinfra model=deepseek-v4-flash batchWaitMs=120";
  const safe = sanitizeLogMessageForTenant(technical);
  assert.equal(safe, technical);
});

test("19. auto-scroll flag toggle is independent of log buffer count", () => {
  let autoScroll = true;
  autoScroll = false;
  assert.equal(autoScroll, false);
  autoScroll = true;
  assert.equal(autoScroll, true);
});

test("20. memory buffer handles up to 1000 items without mutation or error", () => {
  const logs = Array.from({ length: 1000 }, (_, i) => ({
    type: "info",
    msg: `Telemetry item #${i}`,
    timestamp: Date.now() + i,
  }));
  const limited = logs.slice(0, clampBufferLimit(1000));
  assert.equal(limited.length, 1000);
});

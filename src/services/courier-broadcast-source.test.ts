import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

test("manager courier broadcast route validates worker JSON before browser receives it", () => {
  const source = fs.readFileSync(path.join(root, "server.ts"), "utf8");
  assert.match(source, /app\.post\("\/api\/bot\/:botId\/broadcast-by-ids"/);
  assert.match(source, /Courier broadcast API did not return JSON/);
  assert.match(source, /res\.status\(502\)\.json/);
});

test("worker courier broadcast route returns structured JSON summary and keeps receipt-backed sending", () => {
  const source = fs.readFileSync(path.join(root, "bot-worker.ts"), "utf8");
  assert.match(source, /app\.post\("\/api\/broadcast-by-ids"/);
  assert.match(source, /buildCourierBroadcastSummary\(results\)/);
  assert.match(source, /sendUniversalOutboundText/);
  assert.match(source, /billingAction: "broadcast_tracking_text"/);
});

test("dashboard topbar no longer uses sticky or fixed positioning", () => {
  const css = fs.readFileSync(path.join(root, "src", "index.css"), "utf8");
  const block = css.match(/\.dashboard-topbar\s*\{[^}]*\}/)?.[0] || "";
  assert.doesNotMatch(block, /position:\s*(sticky|fixed)/);
  assert.doesNotMatch(block, /top:\s*0\.75rem/);
});

test("unmatched API routes return JSON before SPA fallback", () => {
  const source = fs.readFileSync(path.join(root, "server.ts"), "utf8");
  assert.match(source, /app\.use\("\/api"/);
  assert.match(source, /API route not found/);
  assert.match(source, /app\.get\("\*"/);
  assert.ok(source.indexOf('app.use("/api"') < source.indexOf('app.get("*"'));
});

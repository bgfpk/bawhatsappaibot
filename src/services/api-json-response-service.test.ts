import test from "node:test";
import assert from "node:assert/strict";
import { readJsonResponse } from "./api-json-response-service.ts";

test("safe JSON reader does not parse HTML response as JSON", async () => {
  const response = new Response("<html><h1>Not Found</h1></html>", {
    status: 404,
    headers: { "Content-Type": "text/html" },
  });
  await assert.rejects(
    () => readJsonResponse(response, {
      context: "Courier broadcast API",
      nonJsonMessage: "Courier broadcast API did not return JSON. Please refresh/deploy backend or check worker route.",
    }),
    /Courier broadcast API did not return JSON.*Status: 404/i,
  );
});

test("safe JSON reader returns JSON success payloads", async () => {
  const response = new Response(JSON.stringify({ success: true, sent: 1 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  assert.deepEqual(await readJsonResponse(response, { context: "Courier broadcast API" }), { success: true, sent: 1 });
});

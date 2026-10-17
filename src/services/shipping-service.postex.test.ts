import test from "node:test";
import assert from "node:assert/strict";
import { getPostexBulkTrackingItems, getPostexTrackingData, trackPostexOrder } from "./shipping-service.ts";

test("trackPostexOrder maps non-JSON courier response to a clean error", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => new Response("<html><h1>Bad gateway</h1></html>", {
    status: 502,
    headers: { "Content-Type": "text/html" },
  });

  await assert.rejects(
    () => trackPostexOrder("13483533368630", "postex-secret-token"),
    /PostEx tracking returned non-JSON response \(502\)/,
  );
});

test("getPostexTrackingData parses dist tracking response shape", () => {
  const parsed = getPostexTrackingData({
    dist: {
      trackingResponse: {
        trackingNumber: "TRACK-1",
        customerName: "Customer",
        customerPhone: "11189420159",
        transactionStatus: "Booked",
        transactionStatusHistory: [
          { transactionStatusMessage: "Booked", transactionStatusMessageCode: "0001" },
        ],
      },
    },
  });

  assert.equal(parsed.trackingNumber, "TRACK-1");
  assert.equal(parsed.status, "Booked");
  assert.equal(parsed.statusCode, "0001");
});

test("PostEx bulk tracking response extracts trackingResponse list", () => {
  const items = getPostexBulkTrackingItems({
    dist: {
      trackingResponse: [
        { trackingNumber: "TRACK-1", transactionStatus: "Booked" },
        { trackingNumber: "TRACK-2", transactionStatus: "Delivered" },
      ],
    },
  });

  assert.equal(items.length, 2);
  assert.equal(getPostexTrackingData(items[1]).status, "Delivered");
});

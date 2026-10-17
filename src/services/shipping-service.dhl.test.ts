import test from "node:test";
import assert from "node:assert/strict";
import { CourierTrackingError, normalizeDhlTrackingResponse, trackDhlShipment } from "./shipping-service.ts";

function createJsonResponse(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("trackDhlShipment builds express request with DHL-API-Key header", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const result = await trackDhlShipment(
    "1277547175",
    {
      dhl_api_key: "secret-key",
      dhl_service: "express",
      dhl_origin_country_code: "PK",
      dhl_requester_country_code: "US",
      dhl_language: "en",
    },
    async (url, init) => {
      calls.push({ url: String(url), init });
      return createJsonResponse(200, {
        shipments: [{
          id: "1277547175",
          service: "express",
          status: {
            statusCode: "transit",
            description: "Processed at facility",
            timestamp: "2026-06-07T12:00:00Z",
          },
          events: [{
            timestamp: "2026-06-07T12:00:00Z",
            statusCode: "transit",
            description: "Processed at facility",
            location: { addressLocality: "Lahore", countryCode: "PK" },
          }],
        }],
      });
    },
  );

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /trackingNumber=1234567890/);
  assert.match(calls[0].url, /service=express/);
  assert.match(calls[0].url, /originCountryCode=PK/);
  assert.match(calls[0].url, /requesterCountryCode=US/);
  assert.match(calls[0].url, /language=en/);
  assert.equal((calls[0].init?.headers as Record<string, string>)["DHL-API-Key"], "secret-key");
  assert.equal(result.status_category, "in_transit");
  assert.equal(result.latest_location, "Lahore, PK");
});

test("normalizeDhlTrackingResponse maps delivered shipments safely", () => {
  const result = normalizeDhlTrackingResponse({
    shipments: [{
      trackingNumber: "JD014600003828000000",
      service: "express",
      estimatedTimeOfDelivery: "2026-06-08T10:00:00Z",
      status: {
        statusCode: "delivered",
        description: "Delivered",
        timestamp: "2026-06-07T15:30:00Z",
      },
      events: [
        {
          timestamp: "2026-06-07T15:30:00Z",
          statusCode: "delivered",
          description: "Delivered",
          location: { addressLocality: "Karachi", countryCode: "PK" },
        }
      ],
    }],
  }, "JD014600003828000000", { dhl_service: "express" });

  assert.equal(result.is_delivered, true);
  assert.equal(result.status_category, "delivered");
  assert.equal(result.delivered_at, "2026-06-07T15:30:00.000Z");
});

test("normalizeDhlTrackingResponse falls back safely for unknown statuses", () => {
  const result = normalizeDhlTrackingResponse({
    shipments: [{
      id: "abc",
      status: { statusCode: "mystery", description: "Something new" },
      events: [],
    }],
  }, "abc", { dhl_service: "express" });

  assert.equal(result.status_category, "unknown");
  assert.equal(result.current_status, "Something new");
});

test("trackDhlShipment maps not found and credential errors cleanly", async () => {
  await assert.rejects(
    () => trackDhlShipment("missing", { dhl_api_key: "bad-key" }, async () => createJsonResponse(404, { title: "Not Found" })),
    (error: any) => error instanceof CourierTrackingError && error.code === "NOT_FOUND" && /Please check again later/i.test(error.userMessage),
  );

  await assert.rejects(
    () => trackDhlShipment("missing", { dhl_api_key: "bad-key" }, async () => createJsonResponse(401, { title: "Unauthorized" })),
    (error: any) => error instanceof CourierTrackingError && error.code === "CREDENTIAL_ERROR",
  );
});

test("trackDhlShipment maps rate limit errors cleanly", async () => {
  await assert.rejects(
    () => trackDhlShipment("slow", { dhl_api_key: "rate-key" }, async () => createJsonResponse(429, { title: "Too many requests" })),
    (error: any) => error instanceof CourierTrackingError && error.code === "RATE_LIMIT",
  );
});

test("trackDhlShipment requires an API key", async () => {
  await assert.rejects(
    () => trackDhlShipment("123", {}, async () => createJsonResponse(200, {})),
    (error: any) => error instanceof CourierTrackingError && error.code === "CONFIG_ERROR",
  );
});

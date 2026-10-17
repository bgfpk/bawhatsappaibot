import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Analytics: lib/analytics.ts exports trackCtaClick and trackWhatsAppClick with SSR safety guards", () => {
  const analyticsSrc = read("lib/analytics.ts");

  assert.match(analyticsSrc, /export function trackCtaClick/);
  assert.match(analyticsSrc, /export function trackWhatsAppClick/);
  assert.match(analyticsSrc, /typeof window === "undefined"/);
  assert.match(analyticsSrc, /typeof window\.gtag !== "function"/);
});

test("Analytics: trackCtaClick dispatches cta_click event with required schema", () => {
  const analyticsSrc = read("lib/analytics.ts");

  assert.match(analyticsSrc, /window\.gtag\("event",\s*"cta_click",/);
  assert.match(analyticsSrc, /cta_name:\s*params\.cta_name/);
  assert.match(analyticsSrc, /source_page/);
  assert.match(analyticsSrc, /destination:\s*params\.destination/);
  assert.match(analyticsSrc, /cta_location:\s*params\.cta_location/);
});

test("Analytics: trackWhatsAppClick dispatches whatsapp_click event without false conversion claims", () => {
  const analyticsSrc = read("lib/analytics.ts");

  assert.match(analyticsSrc, /window\.gtag\("event",\s*"whatsapp_click",/);
  assert.match(analyticsSrc, /source_page/);
  assert.match(analyticsSrc, /destination_type:\s*params\.destination_type/);
  assert.match(analyticsSrc, /destination_url:\s*params\.destination_url/);
  assert.doesNotMatch(analyticsSrc, /"generate_lead"/, "trackWhatsAppClick must not claim generate_lead");
  assert.doesNotMatch(analyticsSrc, /"sign_up"/, "trackWhatsAppClick must not claim sign_up");
});

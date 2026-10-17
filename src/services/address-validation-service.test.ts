import test from "node:test";
import assert from "node:assert/strict";

import { validateDeliveryAddress } from "./address-validation-service.ts";

test("home address requires house street area city and landmark", () => {
  const result = validateDeliveryAddress({
    address: "House 12 Street 4 Model Town near main masjid",
    city: "Lahore",
  });

  assert.equal(result.valid, true);
  assert.equal(result.kind, "normal_residential");
  assert.deepEqual(result.missing, []);
  assert.equal(result.prompt, "");
});

test("short village address requires parcel receiving confirmation and landmark", () => {
  const result = validateDeliveryAddress({
    address: "Village Chak 12",
    city: "Okara",
  });

  assert.equal(result.valid, false);
  assert.equal(result.kind, "short_or_village");
  assert.ok(result.missing.includes("Parcel receiving confirmation"));
  assert.ok(result.missing.includes("Famous Landmark"));
  assert.equal(result.prompt, "");
});

test("short village address is accepted after parcel confirmation and landmark", () => {
  const result = validateDeliveryAddress({
    address: "Village Chak 12 near main school",
    city: "Okara",
    notes: "Online parcels are received successfully.",
  });

  assert.equal(result.valid, true);
  assert.equal(result.kind, "short_or_village");
});

test("shop or office address requires business type but not home fields", () => {
  const result = validateDeliveryAddress({
    address: "Naimat Banaspati Mill, Okara",
  });

  assert.equal(result.kind, "shop_or_office");
  assert.equal(result.valid, false);
  assert.ok(result.missing.includes("Shop/office/business type"));
  assert.equal(result.missing.includes("House"), false);
});

test("shop or office address is valid with type market road and city", () => {
  const result = validateDeliveryAddress({
    address: "Shop 12 Main Market Road Okara",
    notes: "Business type: mobile accessories shop",
  });

  assert.equal(result.kind, "shop_or_office");
  assert.equal(result.valid, true);
});

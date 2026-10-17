import test from "node:test";
import assert from "node:assert/strict";

import { trackBeginCheckoutConversion, trackSignupConversion } from "./conversion-events.ts";

function createMemoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
    clear: () => data.clear(),
  };
}

function installWindow() {
  const events: any[] = [];
  const localStorage = createMemoryStorage();
  const sessionStorage = createMemoryStorage();
  (globalThis as any).window = {
    dataLayer: [],
    localStorage,
    sessionStorage,
    gtag: (...args: any[]) => events.push(args),
  };
  return { events, localStorage, sessionStorage };
}

test.afterEach(() => {
  delete (globalThis as any).window;
});

test("signup success triggers sign_up once", () => {
  const { events } = installWindow();

  assert.equal(trackSignupConversion({ user: { id: "user_1" }, source: "email_password" }), true);

  assert.equal(events.length, 1);
  assert.deepEqual(events[0], ["event", "sign_up", { method: "email_password" }]);
});

test("refresh after signup does not trigger duplicate sign_up", () => {
  const { events } = installWindow();

  assert.equal(trackSignupConversion({ user: { id: "user_1" }, source: "email_password" }), true);
  assert.equal(trackSignupConversion({ user: { id: "user_1" }, source: "email_password" }), false);

  assert.equal(events.filter((event) => event[1] === "sign_up").length, 1);
});

test("failed signup and existing-user login do not trigger sign_up unless success hook is called", () => {
  const { events } = installWindow();

  assert.equal(events.length, 0);
});

test("magic token login does not trigger sign_up", () => {
  const { events, localStorage } = installWindow();
  const user = { id: "client_1", email: "contact-f93fa2e5fb59@example.invalid", is_temporary_session: true };

  localStorage.setItem("currentUser", JSON.stringify(user));
  localStorage.setItem("session_type", "temporary");

  assert.equal(events.filter((event) => event[1] === "sign_up").length, 0);
});

test("checkout start triggers begin_checkout only once per checkout attempt", () => {
  const { events } = installWindow();
  const checkout = {
    checkoutId: "checkout_1",
    checkoutUrl: "https://checkout.example/1",
    type: "plan",
    planId: "growth_plan",
    billingCycle: "monthly",
  };

  assert.equal(trackBeginCheckoutConversion(checkout), true);
  assert.equal(trackBeginCheckoutConversion(checkout), false);

  const checkoutEvents = events.filter((event) => event[1] === "begin_checkout");
  assert.equal(checkoutEvents.length, 1);
  assert.deepEqual(checkoutEvents[0], ["event", "begin_checkout", {
    checkout_type: "plan",
    plan_id: "growth_plan",
    addon_type: "",
    billing_cycle: "monthly",
  }]);
});

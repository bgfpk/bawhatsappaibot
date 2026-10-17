import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BILLING_PLAN_DETAILS, PUBLIC_AI_USAGE_RATE_ACTIONS, WALLET_TOPUP_AMOUNTS } from "../config/pricing";

const GUIDE_PATH = resolve(process.cwd(), "docs/client-setup-and-usage-guide.md");

test("Client Setup Guide: Strictly forbids inactive or hidden features", () => {
  const guideContent = readFileSync(GUIDE_PATH, "utf8");

  const forbiddenTerms = [
    "Inbox Command Center",
    "Conversation Inbox",
    "CRM Pipeline",
    "Smart CRM",
    "CRM Agent Mode",
    "Embedded Signup",
    "WhatsApp Cloud API",
    "Meta Official API",
    "Official WhatsApp API",
    "WABA",
    "Graph API",
    "Phone Number ID",
  ];

  for (const term of forbiddenTerms) {
    const found = guideContent.toLowerCase().includes(term.toLowerCase());
    assert.ok(
      !found,
      `Client guide must not contain forbidden customer-facing term: "${term}"`
    );
  }
});

test("Client Setup Guide: Covers all active customer-facing sections and pages", () => {
  const guideContent = readFileSync(GUIDE_PATH, "utf8");

  const requiredSections = [
    "Get Started",
    "Dashboard Operations Center",
    "Instance Hub",
    "Linked Devices",
    "QR Code",
    "AI Studio",
    "AI Instructions",
    "Learned Knowledge",
    "Confirmation Fields",
    "Reply & Call Settings",
    "Smart Sales Engine",
    "Knowledge Base",
    "Products & Services",
    "Media & Sequences",
    "Saved Replies",
    "Welcome Automation",
    "Customers",
    "Follow-up Campaigns",
    "Courier Broadcasts",
    "Customer Updates",
    "Orders",
    "Integrations",
    "WooCommerce",
    "PostEx",
    "Leopards",
    "Live Monitor",
    "Reports & Performance Analytics",
    "Wallet, Plans & Add-ons",
    "Team & Access",
    "Admin WhatsApp Alerts",
    "Two-Factor Authentication",
    "Troubleshooting",
  ];

  for (const section of requiredSections) {
    assert.ok(
      guideContent.includes(section),
      `Client guide must cover active section: "${section}"`
    );
  }
});

test("Client Setup Guide: Accurate pricing, plans, trial, and wallet top-ups", () => {
  const guideContent = readFileSync(GUIDE_PATH, "utf8");

  // Plan pricing
  assert.ok(guideContent.includes("$9 / month"), "Must document Starter plan price");
  assert.ok(guideContent.includes("$29 / month"), "Must document Growth plan price");
  assert.ok(guideContent.includes("$89 / month"), "Must document Pro plan price");
  assert.ok(guideContent.includes("$65 / year"), "Must document Starter annual price");
  assert.ok(guideContent.includes("$209 / year"), "Must document Growth annual price");
  assert.ok(guideContent.includes("$641 / year"), "Must document Pro annual price");

  // 50% Beta discount
  assert.ok(guideContent.includes("50% Beta Launch Discount"), "Must document Beta discount");
  assert.ok(guideContent.includes("1 January 2027"), "Must document Beta discount end date");

  // Trial details
  assert.ok(guideContent.includes("7-day free trial"), "Must document 7-day trial");
  assert.ok(guideContent.includes("100 free AI customer replies"), "Must document 100 free AI replies");

  // Wallet top-up amounts
  for (const amount of WALLET_TOPUP_AMOUNTS) {
    assert.ok(
      guideContent.includes(`$${amount}`),
      `Must document wallet top-up amount $${amount}`
    );
  }

  // Key chargeable rates
  assert.ok(guideContent.includes("$0.003"), "Must document discounted AI text reply price");
  assert.ok(guideContent.includes("$0.001"), "Must document follow-up / broadcast / sales engine rates");
  assert.ok(guideContent.includes("$0.007"), "Must document image understanding rate");
  assert.ok(guideContent.includes("$0.010"), "Must document voice understanding rate");
  assert.ok(guideContent.includes("from $0.020"), "Must document voice reply generation rate");
});

test("Client Setup Guide: Documents Admin Business Assistant and Proactive Manager correctly", () => {
  const guideContent = readFileSync(GUIDE_PATH, "utf8");

  assert.ok(guideContent.includes("Admin Business Assistant & Proactive Business Manager"), "Must have Section 22 heading");
  assert.ok(guideContent.includes("$0.005"), "Must document $0.005 admin message price");
  assert.ok(guideContent.includes("Inbound Admin Messages"), "Must document $0.00 inbound free pricing");
  assert.ok(guideContent.includes("Confirmation Safety"), "Must document confirmation safety");
  assert.ok(guideContent.includes("Dashboard-Only Protected Operations"), "Must document dashboard-only boundaries");
  assert.ok(guideContent.includes("Daily Business Digest"), "Must document daily digest capability");
  assert.ok(guideContent.includes("Weekly Growth Digest"), "Must document weekly digest capability");
});

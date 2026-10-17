import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CustomerDetailDrawer } from "./CustomerDetailDrawer.tsx";
import { CustomerLatestNotesCell } from "./CustomerLatestNotesCell.tsx";

const formatDate = () => "Jan 1, 2026, 10:00 AM";

test("customer list cell shows compact preview instead of full summary notes", () => {
  const html = renderToStaticMarkup(
    <CustomerLatestNotesCell
      customer={{
        $id: "cust_1",
        profile: {
          lastMessage: "Customer asked for delivery timing.",
          chatSummary: "Current Status\n" + "Long private summary line. ".repeat(80),
          customerInstructions: "Private note that should not be in the list",
        },
      }}
      userId="user_1"
    />
  );

  assert.match(html, /Customer asked for delivery timing/);
  assert.match(html, /Details/);
  assert.doesNotMatch(html, /Private note that should not be in the list/);
  assert.doesNotMatch(html, /Long private summary line\. Long private summary line\. Long private summary line/);
});

test("customer list cell does not fall back to private chat summary text", () => {
  const html = renderToStaticMarkup(
    <CustomerLatestNotesCell
      customer={{
        $id: "cust_2",
        profile: {
          chatSummary: [
            "Private Notes",
            "- Customer is angry about payment proof.",
            "Current Status",
            "- Waiting for admin review.",
          ].join("\n"),
          customerInstructions: "Never show this internal payment note in the table.",
        },
      }}
      userId="user_1"
    />
  );

  assert.match(html, /No recent interaction preview yet/);
  assert.doesNotMatch(html, /Customer is angry about payment proof/);
  assert.doesNotMatch(html, /Never show this internal payment note/);
});

test("customer detail drawer shows summary headings and private notes editor", () => {
  const html = renderToStaticMarkup(
    <CustomerDetailDrawer
      isOpen={true}
      userId="user_1"
      onClose={() => {}}
      onSaved={() => {}}
      formatDate={formatDate}
      customer={{
        $id: "cust_1",
        customer_id: "contact-e4ed32210a80@example.invalid",
        profile: {
          customerName: "Sara Khan",
          customerPhone: "195545134641",
          languagePreference: "English",
          chatSummary: [
            "Current Status",
            "- Interested in booking.",
            "Conversation Timeline",
            "- Asked about fee.",
            "Lead/Order Details",
            "- Service: consultation",
            "Next Best Action",
            "- Ask preferred time.",
            "Private Notes",
            "- Handle gently.",
          ].join("\n"),
          customerInstructions: "Ask for payment proof before confirming.",
          latestOrder: {
            recordStatus: "incomplete",
            serviceName: "Consultation",
            missingFields: ["Preferred time"],
          },
        },
      }}
    />
  );

  assert.match(html, /Customer 360/);
  assert.match(html, /Sara Khan/);
  assert.match(html, /Identity/);
  assert.match(html, /Internal notes/);
  assert.match(html, /Lead status/);
  assert.match(html, /Ask for payment proof before confirming/);
});

test("customer detail drawer handles sparse optional fields safely", () => {
  const html = renderToStaticMarkup(
    <CustomerDetailDrawer
      isOpen={true}
      userId=""
      onClose={() => {}}
      onSaved={() => {}}
      formatDate={formatDate}
      customer={{ $id: "cust_empty", customer_id: "contact-626862d4b59f@example.invalid", profile: {} }}
    />
  );

  assert.match(html, /No AI summary yet/);
  assert.match(html, /Conversation source not connected yet/);
});

test("customer detail drawer shows Smart Brain intelligence privately", () => {
  const html = renderToStaticMarkup(
    <CustomerDetailDrawer
      isOpen={true}
      userId="user_1"
      onClose={() => {}}
      onSaved={() => {}}
      formatDate={formatDate}
      customer={{
        $id: "cust_brain",
        customer_id: "contact-e4ed32210a80@example.invalid",
        profile: {
          smartCustomerStage: "interested",
          smartIntent: "service_quote",
          smartLeadQuality: "hot",
          smartRiskLevel: "medium",
          smartNextBestAction: "ask_one_field",
          smartFollowUpReason: "Customer needs quotation but project size is missing.",
          smartPrivateAdminNote: "Hot lead. Needs service quote. Next: ask project size.",
        },
      }}
    />
  );

  assert.match(html, /Customer 360/);
  assert.match(html, /Internal notes/);
  assert.match(html, /Hot lead\. Needs service quote/);
});

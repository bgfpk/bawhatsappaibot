import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app/ProtectedDashboardApplication.tsx", import.meta.url), "utf8");
const sidebar = fs.readFileSync(new URL("../components/AppSidebar.tsx", import.meta.url), "utf8");
const studio = fs.readFileSync(new URL("../components/dashboard/pages/AiStudioV2Page.tsx", import.meta.url), "utf8");
const knowledge = fs.readFileSync(new URL("../components/dashboard/KnowledgeSourceList.tsx", import.meta.url), "utf8");

test("sidebar exposes nine client parent destinations and keeps admin separate", () => {
  const clientBlock = sidebar.slice(sidebar.indexOf("const clientItems"), sidebar.indexOf("const adminItems"));
  for (const label of ["Home", "Sales & Orders", "Automations", "Bot Setup", "Reports", "Connections", "Billing", "Settings"]) {
    assert.match(clientBlock, new RegExp(`label: "${label.replace(/[&]/g, "\\&")}"`));
  }
  for (const oldLabel of ["Customer Chats", "Bot Training", "Bot Knowledge", "Confirmation Fields", "Reply & Call Rules", "Smart Sales Settings", "CRM"]) {
    assert.doesNotMatch(clientBlock, new RegExp(`label: "${oldLabel}"`));
  }
  assert.match(sidebar, /if \(!isAdmin\) return null/);
  assert.match(sidebar, /useState\(activeView === "admin"\)/);
});

test("parent pages provide routes to all existing client sections", () => {
  for (const label of [
    "Inbox", "Customers", "Products & Services", "Leads & Orders", "Saved Replies & Flows",
    "Follow-up Campaigns", "Courier Broadcast", "Scheduled Updates", "WhatsApp Number", "Integrations",
  ]) assert.match(app, new RegExp(`label: "${label.replace(/[&]/g, "\\&")}"`));
  assert.match(sidebar, /localPanel: "homeV2"/);
  assert.match(sidebar, /memberViews: \["dashboard", "customers"\]/);
  assert.match(sidebar, /memberViews: \["products", "orders"\]/);
  assert.match(sidebar, /memberViews: \["marketing", "broadcast", "customer_updates"\]/);
});

test("Bot Setup uses five tabs, one heading, and no duplicate presentation grids", () => {
  for (const label of ["Basics", "Knowledge", "Customer Details", "Reply Rules", "Advanced"]) {
    assert.match(app, new RegExp(`"${label}"`));
  }
  assert.equal((studio.match(/<h1/g) || []).length, 1);
  for (const removed of ["Train your bot", "Knowledge Center V2", "Current settings workspace", "Testing playground foundation", "SECTION_CARDS"]) {
    assert.doesNotMatch(studio, new RegExp(removed));
  }
  assert.equal((app.match(/aria-label="Toggle AI Chat Replies"/g) || []).length, 1);
  assert.match(app, /aiTab === 'instructions'/);
  assert.match(app, />AI Chat Replies</);
  assert.match(app, /onClick=\{\(\) => saveIntelligenceTab\(aiTab\)\}/);
});

test("Knowledge defaults to one-status source rows with existing management destinations", () => {
  for (const source of ["Products & Services", "Website Knowledge", "Media Library", "Saved Replies & Flows", "Learned Information", "Customer Knowledge"]) {
    assert.match(app, new RegExp(`name: "${source.replace(/[&]/g, "\\&")}"`));
  }
  assert.match(app, /<KnowledgeSourceList/);
  assert.match(app, /<summary[^>]*>View details<\/summary>/);
  assert.match(knowledge, /row\.status/);
  assert.match(knowledge, /row\.actionLabel/);
});

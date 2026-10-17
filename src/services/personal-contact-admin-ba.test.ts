import test from "node:test";
import assert from "node:assert/strict";
import {
  getAdminAction,
  listAdminActions,
  canExecuteAdminBusinessAction,
} from "./admin-action-registry-service.ts";
import "./personal-contact-admin-ba-tools.ts";
import * as personalContactService from "./personal-contact-service.ts";
import type { AdminBusinessAssistantContext } from "./admin-identity-service.ts";
import type { PersonalContact } from "./personal-contact-types.ts";

function createAdminContext(accountId = "tenant_admin_ba_test"): AdminBusinessAssistantContext {
  return {
    accountId,
    userId: "user_owner_1",
    botId: "bot_biz_1",
    adminPhone: "180024348932",
    adminJid: "contact-9d9009c0c421@example.invalid",
    adminRole: "owner",
    isBusinessAssistantEnabled: true,
    mode: "admin_business_assistant",
    conversationId: `conv_${Date.now()}`,
    isAuthorizedAdmin: true,
    isPrimaryOwner: true,
  };
}

test("Personal Contact Admin BA - All 10 Tools Registered", () => {
  const expectedToolIds = [
    "find_personal_contact",
    "list_personal_contacts",
    "get_personal_contact_memory",
    "set_personal_contact_relationship",
    "save_personal_contact_note",
    "save_personal_contact_fact",
    "correct_personal_contact_fact",
    "remove_personal_contact_fact",
    "set_personal_contact_do_not_contact",
    "archive_personal_contact",
  ];

  for (const toolId of expectedToolIds) {
    const action = getAdminAction(toolId);
    assert.ok(action, `Tool ${toolId} should be registered in ACTION_REGISTRY`);
    assert.equal(action.category, "personal_contacts");
    assert.equal(action.requiredRole, "owner");
  }
});

test("Personal Contact Admin BA - Security & Authorization Guard", () => {
  const action = getAdminAction("save_personal_contact_fact")!;

  // 1. Owner on WhatsApp channel is authorized
  const ownerCheck = canExecuteAdminBusinessAction({
    role: "owner",
    action,
    channel: "whatsapp",
  });
  assert.equal(ownerCheck.allowed, true);

  // 2. Non-owner (e.g. manager) is blocked
  const managerCheck = canExecuteAdminBusinessAction({
    role: "manager",
    action,
    channel: "whatsapp",
  });
  assert.equal(managerCheck.allowed, false);
});

test("Personal Contact Admin BA - Contact Lookup and Ambiguity Clarification", async () => {
  const tenantId = `tenant_ambig_${Date.now()}`;
  const context = createAdminContext(tenantId);

  // Create two contacts named "Zubair" with different phones
  const z1 = await personalContactService.resolveOrCreatePersonalContact(tenantId, {
    remoteJid: "contact-85d2a3563239@example.invalid",
    profile: { pushName: "Zubair Khan" },
    dataOwnerKey: tenantId,
  });
  z1.contact.ownerAssignedName = "Zubair";
  await personalContactService.setContactRelationship(tenantId, z1.contact.contactId, "supplier", "fabric supplier");

  const z2 = await personalContactService.resolveOrCreatePersonalContact(tenantId, {
    remoteJid: "contact-126f2cd31c20@example.invalid",
    profile: { pushName: "Zubair Tech" },
    dataOwnerKey: tenantId,
  });
  z2.contact.ownerAssignedName = "Zubair";
  await personalContactService.setContactRelationship(tenantId, z2.contact.contactId, "colleague");

  const findAction = getAdminAction("find_personal_contact")!;

  // Search "Zubair" - ambiguous because two contacts match
  const ambigResult = await findAction.handler!(context, { query: "Zubair" });
  assert.equal(ambigResult.success, true);
  assert.match(ambigResult.message, /Multiple Contacts Found for "Zubair"/i);
  assert.match(ambigResult.message, /Zubair/);

  // Search specific phone "112250469451" - unambiguous
  const exactResult = await findAction.handler!(context, { query: "112250469451" });
  assert.equal(exactResult.success, true);
  assert.match(exactResult.message, /Personal Contact: Zubair/i);
  assert.match(exactResult.message, /fabric supplier/i);
});

test("Personal Contact Admin BA - Memory Fact and Note Lifecycle", async () => {
  const tenantId = `tenant_mem_${Date.now()}`;
  const context = createAdminContext(tenantId);

  const resolved = await personalContactService.resolveOrCreatePersonalContact(tenantId, {
    remoteJid: "contact-d58a89d5392e@example.invalid",
    profile: { pushName: "Dr. Asim" },
    dataOwnerKey: tenantId,
  });
  const contactId = resolved.contact.contactId;

  // 1. Set relationship
  const relAction = getAdminAction("set_personal_contact_relationship")!;
  const relRes = await relAction.handler!(context, {
    contactId,
    relationship: "service_provider",
    customLabel: "personal physician",
  });
  assert.equal(relRes.success, true);
  assert.match(relRes.message, /personal physician/i);

  // 2. Save fact
  const factAction = getAdminAction("save_personal_contact_fact")!;
  const factRes = await factAction.handler!(context, {
    contactId,
    label: "Clinic Hours",
    value: "5 PM to 9 PM",
    category: "schedule",
  });
  assert.equal(factRes.success, true);
  assert.match(factRes.message, /Clinic Hours/i);

  // 3. Save private note
  const noteAction = getAdminAction("save_personal_contact_note")!;
  const noteRes = await noteAction.handler!(context, {
    contactId,
    text: "Referred by Uncle Tariq",
  });
  assert.equal(noteRes.success, true);
  assert.match(noteRes.message, /Referred by Uncle Tariq/i);

  // 4. View memory
  const memAction = getAdminAction("get_personal_contact_memory")!;
  const memRes = await memAction.handler!(context, { contactId });
  assert.equal(memRes.success, true);
  assert.match(memRes.message, /Clinic Hours.*5 PM to 9 PM/s);
  assert.match(memRes.message, /Referred by Uncle Tariq/s);
  assert.match(memRes.message, /personal physician/);

  // 5. Correct fact (supersession)
  const correctAction = getAdminAction("correct_personal_contact_fact")!;
  const correctRes = await correctAction.handler!(context, {
    contactId,
    label: "Clinic Hours",
    newValue: "6 PM to 10 PM",
  });
  assert.equal(correctRes.success, true);
  assert.match(correctRes.message, /supersedes previous value/i);

  // 6. Set communication status
  const statusAction = getAdminAction("set_personal_contact_do_not_contact")!;
  const statusRes = await statusAction.handler!(context, {
    contactId,
    status: "do_not_contact",
  });
  assert.equal(statusRes.success, true);
  assert.match(statusRes.message, /do_not_contact/i);

  // 7. Remove fact
  const removeFactAction = getAdminAction("remove_personal_contact_fact")!;
  const removeFactRes = await removeFactAction.handler!(context, {
    contactId,
    label: "Clinic Hours",
  });
  assert.equal(removeFactRes.success, true);
  assert.match(removeFactRes.message, /Removed fact/i);

  // 8. Archive contact
  const archiveAction = getAdminAction("archive_personal_contact")!;
  const archiveRes = await archiveAction.handler!(context, { contactId });
  assert.equal(archiveRes.success, true);
  assert.match(archiveRes.message, /Archived Personal Contact/i);
});

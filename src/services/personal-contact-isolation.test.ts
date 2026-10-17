import test from "node:test";
import assert from "node:assert/strict";
import {
  buildContactDocId,
  buildAliasDocId,
  buildTenantIndexDocId,
  savePersonalContactDoc,
  getPersonalContactDoc,
  findContactIdByAlias,
  recordContactAlias,
  recordPersonalContactIndex,
  listPersonalContactIds,
} from "./personal-contact-storage-service.ts";
import {
  canAutoMergePersonalContacts,
} from "./personal-contact-identity-service.ts";
import type { PersonalContact } from "./personal-contact-types.ts";
import * as dbService from "./db-service.ts";

test("Personal Contact Storage - Document ID length <= 36 chars", () => {
  const tenantId = "tenant_production_enterprise_123456789";
  const contactId = "pc_abcdef0123456789";
  const aliasKey = "phone:923001234567";

  const contactDocId = buildContactDocId(tenantId, contactId);
  const aliasDocId = buildAliasDocId(tenantId, aliasKey);
  const indexDocId = buildTenantIndexDocId(tenantId);

  // Appwrite documentId maximum length is 36 chars
  assert.ok(contactDocId.length <= 36, `contactDocId ${contactDocId} is ${contactDocId.length} chars (must be <= 36)`);
  assert.ok(aliasDocId.length <= 36, `aliasDocId ${aliasDocId} is ${aliasDocId.length} chars (must be <= 36)`);
  assert.ok(indexDocId.length <= 36, `indexDocId ${indexDocId} is ${indexDocId.length} chars (must be <= 36)`);

  assert.match(contactDocId, /^pct_[a-f0-9]{8}_[a-f0-9]{16}$/);
  assert.match(aliasDocId, /^pca_[a-f0-9]{8}_[a-f0-9]{16}$/);
  assert.match(indexDocId, /^pci_[a-f0-9]{8}$/);
});

test("Personal Contact Isolation - Cross-Tenant Access Boundary", async () => {
  const tenantA = "tenant_alpha_corp";
  const tenantB = "tenant_beta_inc";

  const contactA: PersonalContact = {
    contactId: "pc_tenant_a_1",
    schemaVersion: 1,
    revision: 1,
    accountId: tenantA,
    status: "active",
    displayName: "Supplier Tech",
    relationship: "supplier",
    relationshipProvenance: "owner_provided",
    whatsappIdentities: [
      {
        personalInstanceId: "inst_a",
        jid: "contact-6c9bc40fc084@example.invalid",
        jidType: "pn",
        canonicalPhone: "110064053003",
      },
    ],
    durableFacts: [],
    ownerNotes: [],
    createdAt: 1000,
    updatedAt: 1000,
  };

  // Save for Tenant A
  await savePersonalContactDoc(contactA);
  await recordContactAlias(tenantA, "phone:923001112233", contactA.contactId);
  await recordPersonalContactIndex(tenantA, contactA.contactId, "add");

  // 1. Tenant A can read its own contact
  const readByA = await getPersonalContactDoc(tenantA, contactA.contactId);
  assert.ok(readByA);
  assert.equal(readByA.displayName, "Supplier Tech");

  // 2. Tenant B CANNOT read Tenant A's contact (returns null)
  const readByB = await getPersonalContactDoc(tenantB, contactA.contactId);
  assert.equal(readByB, null);

  // 3. Tenant B CANNOT resolve alias registered in Tenant A
  const aliasResolvedByB = await findContactIdByAlias(tenantB, "phone:923001112233");
  assert.equal(aliasResolvedByB, null);

  // 4. Tenant B contact list does not leak Tenant A's contacts
  const listB = await listPersonalContactIds(tenantB);
  assert.equal(listB.includes(contactA.contactId), false);

  // 5. Cross-tenant merge is strictly rejected
  const contactB: PersonalContact = {
    ...contactA,
    contactId: "pc_tenant_b_1",
    accountId: tenantB,
  };
  const mergeResult = canAutoMergePersonalContacts(contactA, contactB);
  assert.equal(mergeResult.canMerge, false);
  assert.match(mergeResult.reason, /cross-tenant/i);
});

test("Personal Contact Isolation - COLLECTIONS.CUSTOMERS Domain Separation", () => {
  // COLLECTIONS.CUSTOMERS is used exclusively for business CRM customers, leads, and orders
  assert.equal(dbService.COLLECTIONS.CUSTOMERS, "customers");
  assert.equal(dbService.COLLECTIONS.SYSTEM_CONFIGS, "system_configs");

  // Personal contacts use SYSTEM_CONFIGS chunked documents, NEVER customers collection
  const contactDocId = buildContactDocId("tenant_crm_test", "pc_crm_123");
  assert.match(contactDocId, /^pct_/);
});

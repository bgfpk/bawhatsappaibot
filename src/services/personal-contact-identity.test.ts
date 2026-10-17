import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePersonalInboundIdentity,
  computeContactDisplayName,
  isValidHumanDisplayName,
  getContactTrustedPhone,
  formatSafeContactPhoneDisplay,
  canAutoMergePersonalContacts,
  mergeIdentityAlias,
} from "./personal-contact-identity-service.ts";
import type { PersonalContact, PersonalContactIdentityAlias } from "./personal-contact-types.ts";

test("Personal Contact Identity - Display Name Priority", () => {
  // 1. Owner assigned name takes top priority
  const c1: Partial<PersonalContact> = {
    ownerAssignedName: "Uncle Tariq",
    savedName: "Tariq Mahmood",
    displayName: "Tariq",
    whatsappIdentities: [
      {
        personalInstanceId: "p1",
        jid: "contact-6c9bc40fc084@example.invalid",
        jidType: "pn",
        canonicalPhone: "110064053003",
        pushName: "Tariq Bhai",
      },
    ],
  };
  assert.equal(computeContactDisplayName(c1), "Uncle Tariq");

  // 2. Saved name takes priority over pushName
  const c2: Partial<PersonalContact> = {
    savedName: "Tariq Mahmood",
    whatsappIdentities: [
      {
        personalInstanceId: "p1",
        jid: "contact-6c9bc40fc084@example.invalid",
        jidType: "pn",
        canonicalPhone: "110064053003",
        pushName: "Tariq Bhai",
      },
    ],
  };
  assert.equal(computeContactDisplayName(c2), "Tariq Mahmood");

  // 3. Reliable pushName takes priority over phone
  const c3: Partial<PersonalContact> = {
    whatsappIdentities: [
      {
        personalInstanceId: "p1",
        jid: "contact-6c9bc40fc084@example.invalid",
        jidType: "pn",
        canonicalPhone: "110064053003",
        pushName: "Tariq Bhai",
      },
    ],
  };
  assert.equal(computeContactDisplayName(c3), "Tariq Bhai");

  // 4. Safe phone fallback when no human name available
  const c4: Partial<PersonalContact> = {
    whatsappIdentities: [
      {
        personalInstanceId: "p1",
        jid: "contact-6c9bc40fc084@example.invalid",
        jidType: "pn",
        canonicalPhone: "110064053003",
      },
    ],
  };
  assert.equal(computeContactDisplayName(c4), "+92 300 1112233");

  // 5. Generic fallback when only LID exists and no phone or name
  const c5: Partial<PersonalContact> = {
    whatsappIdentities: [
      {
        personalInstanceId: "p1",
        jid: "194167418417354@lid",
        jidType: "lid",
      },
    ],
  };
  assert.equal(computeContactDisplayName(c5), "Personal Contact");
});

test("Personal Contact Identity - Never displays raw LID digits as a phone number", () => {
  const lidOnlyContact: Partial<PersonalContact> = {
    whatsappIdentities: [
      {
        personalInstanceId: "p1",
        jid: "194167418417354@lid",
        jidType: "lid",
      },
    ],
  };

  assert.equal(getContactTrustedPhone(lidOnlyContact), null);
  assert.equal(formatSafeContactPhoneDisplay(lidOnlyContact), "Number unavailable");
  assert.notEqual(formatSafeContactPhoneDisplay(lidOnlyContact), "104294324532071");
  assert.notEqual(formatSafeContactPhoneDisplay(lidOnlyContact), "+186618937215504");
});

test("Personal Contact Identity - Human Display Name Validation", () => {
  assert.equal(isValidHumanDisplayName("Ahmed Khan"), true);
  assert.equal(isValidHumanDisplayName("Ali"), true);
  assert.equal(isValidHumanDisplayName(""), false);
  assert.equal(isValidHumanDisplayName("194167418417354@lid"), false);
  assert.equal(isValidHumanDisplayName("contact-6c9bc40fc084@example.invalid"), false);
  assert.equal(isValidHumanDisplayName("+150333823501"), false);
  assert.equal(isValidHumanDisplayName("Unknown"), false);
  assert.equal(isValidHumanDisplayName("Personal Contact"), false);
});

test("Personal Contact Identity - Merge Authority Rules", () => {
  const tenantA = "tenant_alpha";
  const tenantB = "tenant_beta";

  const contactA: PersonalContact = {
    contactId: "pc_1",
    schemaVersion: 1,
    revision: 1,
    accountId: tenantA,
    status: "active",
    displayName: "Ali",
    relationship: "friend",
    relationshipProvenance: "owner_provided",
    whatsappIdentities: [
      {
        personalInstanceId: "inst_1",
        jid: "contact-6c9bc40fc084@example.invalid",
        jidType: "pn",
        canonicalPhone: "110064053003",
        pushName: "Ali",
      },
    ],
    durableFacts: [],
    ownerNotes: [],
    createdAt: 1000,
    updatedAt: 1000,
  };

  const contactB_sameName_diffPhone: PersonalContact = {
    contactId: "pc_2",
    schemaVersion: 1,
    revision: 1,
    accountId: tenantA,
    status: "active",
    displayName: "Ali",
    relationship: "colleague",
    relationshipProvenance: "owner_provided",
    whatsappIdentities: [
      {
        personalInstanceId: "inst_1",
        jid: "contact-a997ae750213@example.invalid",
        jidType: "pn",
        canonicalPhone: "111275114403",
        pushName: "Ali",
      },
    ],
    durableFacts: [],
    ownerNotes: [],
    createdAt: 2000,
    updatedAt: 2000,
  };

  // 1. Same name alone must NEVER authorize merge (Ali != Ali)
  const mergeCheckSameName = canAutoMergePersonalContacts(contactA, contactB_sameName_diffPhone);
  assert.equal(mergeCheckSameName.canMerge, false);
  assert.match(mergeCheckSameName.reason, /name alone is strictly forbidden/i);

  // 2. Verified canonical phone match CAN merge
  const contactC_samePhone: PersonalContact = {
    contactId: "pc_3",
    schemaVersion: 1,
    revision: 1,
    accountId: tenantA,
    status: "active",
    displayName: "Ali K.",
    relationship: "friend",
    relationshipProvenance: "owner_provided",
    whatsappIdentities: [
      {
        personalInstanceId: "inst_2",
        jid: "contact-6c9bc40fc084@example.invalid",
        jidType: "pn",
        canonicalPhone: "110064053003",
      },
    ],
    durableFacts: [],
    ownerNotes: [],
    createdAt: 3000,
    updatedAt: 3000,
  };
  const mergeCheckPhone = canAutoMergePersonalContacts(contactA, contactC_samePhone);
  assert.equal(mergeCheckPhone.canMerge, true);

  // 3. Cross-tenant merge is strictly forbidden even if phone matches
  const contactD_diffTenant: PersonalContact = {
    ...contactC_samePhone,
    contactId: "pc_4",
    accountId: tenantB,
  };
  const mergeCheckTenant = canAutoMergePersonalContacts(contactA, contactD_diffTenant);
  assert.equal(mergeCheckTenant.canMerge, false);
  assert.match(mergeCheckTenant.reason, /cross-tenant/i);
});

test("Personal Contact Identity - PN/LID Inbound Normalization", async () => {
  const norm1 = await normalizePersonalInboundIdentity(
    {
      remoteJid: "contact-6c9bc40fc084@example.invalid",
      profile: { pushName: "Bilal" },
    },
    "tenant_test"
  );
  assert.equal(norm1.jidType, "pn");
  assert.equal(norm1.canonicalPhone, "110064053003");
  assert.equal(norm1.displayPhone, "+92 300 1112233");
  assert.equal(norm1.pushName, "Bilal");
  assert.equal(norm1.phoneAliasKey, "phone:923001112233");
  assert.equal(norm1.jidAliasKey, "jid:contact-6c9bc40fc084@example.invalid");

  // LID with senderPn resolution
  const norm2 = await normalizePersonalInboundIdentity(
    {
      remoteJid: "194167418417354@lid",
      senderPn: "157311815005",
      profile: { pushName: "Hamza" },
    },
    "tenant_test"
  );
  assert.equal(norm2.jidType, "lid");
  assert.equal(norm2.canonicalPhone, "157311815005");
  assert.equal(norm2.displayPhone, "+92 300 9998877");
  assert.equal(norm2.phoneAliasKey, "phone:923009998877");
});

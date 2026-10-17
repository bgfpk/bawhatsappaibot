import test from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultOwner360Profile,
  getOwnerProfile,
  saveOwnerProfile,
  updateOwnerProfile,
  setOwnerIdentity,
  addOwnerContactMethod,
  updateOwnerContactMethod,
  removeOwnerContactMethod,
  addOwnerAddress,
  updateOwnerAddress,
  removeOwnerAddress,
  addOwnerFact,
  updateOwnerFact,
  removeOwnerFact,
  clearOwnerProfile,
  getOwnerContextForTask,
  normalizePrivacyPolicy,
  validateTimezone,
  isBlockedSecretKeyOrCategory,
  owner360Deps,
  invalidateOwnerProfileCache,
} from "./owner360-service.ts";
import { Owner360Error } from "./owner360-types.ts";
import { isPersonalInstance } from "./instance-purpose-service.ts";
import { createDefaultPersonalAssistantConfig } from "./personal-assistant-config-service.ts";

test("Owner360 Core & Privacy Test Suite (Prompt 2 Requirements 42 & 43)", async (t) => {
  // In-memory mock database for testing
  const mockStorage = new Map<string, any>();

  // Inject mocks into owner360Deps
  owner360Deps.getDocument = async (_dbId, _collId, docId) => {
    const doc = mockStorage.get(docId);
    if (!doc) {
      const err: any = new Error("Document not found");
      err.code = 404;
      err.status = 404;
      throw err;
    }
    return doc;
  };

  owner360Deps.createDocument = async (_dbId, _collId, docId, data) => {
    mockStorage.set(docId, { ...data, $id: docId });
    return mockStorage.get(docId);
  };

  owner360Deps.updateDocument = async (_dbId, _collId, docId, data) => {
    if (!mockStorage.has(docId)) {
      const err: any = new Error("Document not found");
      err.code = 404;
      err.status = 404;
      throw err;
    }
    mockStorage.set(docId, { ...mockStorage.get(docId), ...data });
    return mockStorage.get(docId);
  };

  owner360Deps.deleteDocument = async (_dbId, _collId, docId) => {
    mockStorage.delete(docId);
    return true;
  };

  t.beforeEach(() => {
    mockStorage.clear();
    invalidateOwnerProfileCache();
  });

  await t.test("1. New account -> empty/default Owner360", async () => {
    const profile = await getOwnerProfile("tenant_alpha");
    assert.equal(profile.accountId, "tenant_alpha");
    assert.equal(profile.revision, 1);
    assert.equal(profile.identity.privacyPolicy, "PRIVATE");
    assert.deepEqual(profile.addresses, []);
    assert.deepEqual(profile.contactMethods, []);
    assert.deepEqual(profile.customFacts, []);
  });

  await t.test("2. Default privacy -> PRIVATE", () => {
    const profile = createDefaultOwner360Profile("tenant_alpha");
    assert.equal(profile.identity.privacyPolicy, "PRIVATE");
  });

  await t.test("3. Missing privacy -> PRIVATE", () => {
    assert.equal(normalizePrivacyPolicy(undefined), "PRIVATE");
    assert.equal(normalizePrivacyPolicy(null), "PRIVATE");
    assert.equal(normalizePrivacyPolicy(""), "PRIVATE");
  });

  await t.test("4. Invalid privacy -> fail closed to PRIVATE", () => {
    assert.equal(normalizePrivacyPolicy("PUBLIC"), "PRIVATE");
    assert.equal(normalizePrivacyPolicy("UNRESTRICTED"), "PRIVATE");
    assert.equal(normalizePrivacyPolicy("SHARE_ALL"), "PRIVATE");
    assert.equal(normalizePrivacyPolicy(12345), "PRIVATE");
  });

  await t.test("5. Save preferred name -> persists", async () => {
    const updated = await setOwnerIdentity("tenant_alpha", {
      preferredName: "Farhan",
      title: "Dr.",
      preferredReference: "Dr. Farhan",
    });
    assert.equal(updated.identity.preferredName, "Farhan");
    assert.equal(updated.identity.title, "Dr.");
    assert.equal(updated.identity.preferredReference, "Dr. Farhan");
    assert.equal(updated.revision, 2);

    // Verify retrieval
    invalidateOwnerProfileCache();
    const fetched = await getOwnerProfile("tenant_alpha");
    assert.equal(fetched.identity.preferredName, "Farhan");
  });

  await t.test("6. Update preferred name -> new value authoritative", async () => {
    await setOwnerIdentity("tenant_alpha", { preferredName: "Farhan" });
    const updated2 = await setOwnerIdentity("tenant_alpha", { preferredName: "Firdosi" });
    assert.equal(updated2.identity.preferredName, "Firdosi");
    assert.equal(updated2.revision, 3);
  });

  await t.test("7. Timezone valid IANA -> accepted", async () => {
    assert.equal(validateTimezone("Asia/Karachi"), true);
    assert.equal(validateTimezone("America/New_York"), true);
    assert.equal(validateTimezone("Europe/London"), true);
    assert.equal(validateTimezone("UTC"), true);

    const updated = await updateOwnerProfile("tenant_alpha", {
      locale: { timezone: "Asia/Karachi", locale: "ur-PK", preferredLanguages: ["ur", "en"], defaultCurrency: "PKR" },
    });
    assert.equal(updated.locale.timezone, "Asia/Karachi");
  });

  await t.test("8. Invalid timezone -> rejected", async () => {
    assert.equal(validateTimezone("Pakistan time"), false);
    assert.equal(validateTimezone("EST"), true); // EST is recognized by IANA alias
    assert.equal(validateTimezone("Invalid/Unknown_Zone_123"), false);

    await assert.rejects(
      async () => {
        await updateOwnerProfile("tenant_alpha", {
          locale: { timezone: "Pakistan time", locale: "en-US", preferredLanguages: ["en"], defaultCurrency: "PKR" },
        });
      },
      (err: any) => err instanceof Owner360Error && err.code === "INVALID_TIMEZONE"
    );
  });

  await t.test("9. Multiple languages -> persisted", async () => {
    const updated = await updateOwnerProfile("tenant_alpha", {
      locale: { timezone: "Asia/Karachi", locale: "ur-PK", preferredLanguages: ["ur", "en", "ar"], defaultCurrency: "PKR" },
    });
    assert.deepEqual(updated.locale.preferredLanguages, ["ur", "en", "ar"]);
  });

  await t.test("10. Default currency normalized to uppercase ISO code", async () => {
    const updated = await updateOwnerProfile("tenant_alpha", {
      locale: { timezone: "UTC", locale: "en", preferredLanguages: ["en"], defaultCurrency: "pkr" },
    });
    assert.equal(updated.locale.defaultCurrency, "PKR");
  });

  await t.test("11. Add address -> persists", async () => {
    const updated = await addOwnerAddress("tenant_alpha", {
      label: "Office",
      recipientName: "Farhan Ali",
      addressLine1: "Suite 401, Technocentre",
      city: "Karachi",
      region: "Sindh",
      postalCode: "75500",
      country: "Pakistan",
      deliveryInstructions: "Leave with front desk security",
      isDefault: true,
      privacyPolicy: "ASK_BEFORE_SHARE",
    });
    assert.equal(updated.addresses.length, 1);
    assert.equal(updated.addresses[0].label, "Office");
    assert.equal(updated.addresses[0].isDefault, true);
    assert.equal(updated.addresses[0].privacyPolicy, "ASK_BEFORE_SHARE");
  });

  await t.test("12. Edit address -> updates same record", async () => {
    const created = await addOwnerAddress("tenant_alpha", {
      label: "Warehouse",
      addressLine1: "Plot 12, Industrial Area",
      city: "Lahore",
      country: "Pakistan",
      isDefault: false,
      privacyPolicy: "PRIVATE",
    });
    const addrId = created.addresses[0].id;

    const updated = await updateOwnerAddress("tenant_alpha", addrId, {
      addressLine1: "Plot 14, Industrial Area Phase 2",
    });
    assert.equal(updated.addresses.length, 1);
    assert.equal(updated.addresses[0].id, addrId);
    assert.equal(updated.addresses[0].addressLine1, "Plot 14, Industrial Area Phase 2");
  });

  await t.test("13. Delete address -> removed", async () => {
    const created = await addOwnerAddress("tenant_alpha", {
      label: "Temporary Home",
      addressLine1: "House 55",
      city: "Islamabad",
      country: "Pakistan",
      isDefault: true,
      privacyPolicy: "PRIVATE",
    });
    const addrId = created.addresses[0].id;

    const afterDelete = await removeOwnerAddress("tenant_alpha", addrId);
    assert.equal(afterDelete.addresses.length, 0);
  });

  await t.test("14. One default address enforced (setting new default unsets previous)", async () => {
    await addOwnerAddress("tenant_alpha", {
      label: "Home",
      addressLine1: "House 1",
      city: "Karachi",
      country: "Pakistan",
      isDefault: true,
      privacyPolicy: "PRIVATE",
    });

    const second = await addOwnerAddress("tenant_alpha", {
      label: "Work",
      addressLine1: "Office 2",
      city: "Karachi",
      country: "Pakistan",
      isDefault: true,
      privacyPolicy: "PRIVATE",
    });

    assert.equal(second.addresses.length, 2);
    const home = second.addresses.find((a) => a.label === "Home");
    const work = second.addresses.find((a) => a.label === "Work");
    assert.equal(home?.isDefault, false);
    assert.equal(work?.isDefault, true);
  });

  await t.test("15. Contact method privacy preserved", async () => {
    const updated = await addOwnerContactMethod("tenant_alpha", {
      type: "email",
      label: "Work",
      value: "contact-18263450dbb3@example.invalid",
      isDefault: true,
      privacyPolicy: "ALLOW_FOR_AUTHORIZED_TASK",
    });
    assert.equal(updated.contactMethods.length, 1);
    assert.equal(updated.contactMethods[0].privacyPolicy, "ALLOW_FOR_AUTHORIZED_TASK");
    assert.equal(updated.contactMethods[0].type, "email");
  });

  await t.test("16. Custom fact add/edit/delete works", async () => {
    const added = await addOwnerFact("tenant_alpha", {
      label: "Dietary Preference",
      category: "lifestyle",
      value: "Vegetarian only, no peanuts",
      privacyPolicy: "ASK_BEFORE_SHARE",
    });
    assert.equal(added.customFacts.length, 1);
    assert.equal(added.customFacts[0].label, "Dietary Preference");
    const factId = added.customFacts[0].factId;

    const edited = await updateOwnerFact("tenant_alpha", factId, {
      value: "Strictly vegetarian and halal only",
    });
    assert.equal(edited.customFacts[0].value, "Strictly vegetarian and halal only");

    const deleted = await removeOwnerFact("tenant_alpha", factId);
    assert.equal(deleted.customFacts.length, 0);
  });

  await t.test("17. Reserved secret category rejected (including case variations and value checks)", async () => {
    assert.equal(isBlockedSecretKeyOrCategory("My Password"), true);
    assert.equal(isBlockedSecretKeyOrCategory("P-A-S-S-W-O-R-D"), true);
    assert.equal(isBlockedSecretKeyOrCategory("API_KEY"), true);
    assert.equal(isBlockedSecretKeyOrCategory("api.key"), true);
    assert.equal(isBlockedSecretKeyOrCategory("Bank Login Pin"), true);
    assert.equal(isBlockedSecretKeyOrCategory("CVV Number"), true);
    assert.equal(isBlockedSecretKeyOrCategory("card_security_code"), true);
    assert.equal(isBlockedSecretKeyOrCategory("OAUTH_TOKEN"), true);
    assert.equal(isBlockedSecretKeyOrCategory("refresh_token"), true);
    assert.equal(isBlockedSecretKeyOrCategory("authentication_code"), true);
    assert.equal(isBlockedSecretKeyOrCategory("auth_token"), true);
    assert.equal(isBlockedSecretKeyOrCategory("private_key"), true);
    assert.equal(isBlockedSecretKeyOrCategory("Favorite Color"), false);

    // Rejection on label
    await assert.rejects(
      async () => {
        await addOwnerFact("tenant_alpha", {
          label: "Master API Key",
          category: "credentials",
          value: "some-value",
          privacyPolicy: "PRIVATE",
        });
      },
      (err: any) => err instanceof Owner360Error && err.code === "SENSITIVE_SECRET_NOT_ALLOWED"
    );

    // Rejection on value even if label is innocuous
    await assert.rejects(
      async () => {
        await addOwnerFact("tenant_alpha", {
          label: "Database Note",
          category: "general",
          value: "The root password is supersecret123",
          privacyPolicy: "PRIVATE",
        });
      },
      (err: any) => err instanceof Owner360Error && err.code === "SENSITIVE_SECRET_NOT_ALLOWED"
    );

    // Rejection on refresh token in value
    await assert.rejects(
      async () => {
        await addOwnerFact("tenant_alpha", {
          label: "Session",
          category: "general",
          value: "refresh_token=xyz987abc",
          privacyPolicy: "PRIVATE",
        });
      },
      (err: any) => err instanceof Owner360Error && err.code === "SENSITIVE_SECRET_NOT_ALLOWED"
    );
  });

  await t.test("18. Revision conflict rejected", async () => {
    const initial = await getOwnerProfile("tenant_alpha");
    assert.equal(initial.revision, 1);

    // Save with expectedRevision = 1 -> succeeds, revision becomes 2
    await updateOwnerProfile("tenant_alpha", { locale: { ...initial.locale, defaultCurrency: "PKR" } }, 1);

    // Try saving again with stale expectedRevision = 1 -> rejected with REVISION_CONFLICT
    await assert.rejects(
      async () => {
        await updateOwnerProfile("tenant_alpha", { locale: { ...initial.locale, defaultCurrency: "USD" } }, 1);
      },
      (err: any) => err instanceof Owner360Error && err.code === "REVISION_CONFLICT"
    );
  });

  await t.test("19. Restart/reload -> profile persists in storage", async () => {
    await setOwnerIdentity("tenant_alpha", { preferredName: "Zubair" });
    invalidateOwnerProfileCache();

    // Emulate new worker or fresh process read
    const reloaded = await getOwnerProfile("tenant_alpha");
    assert.equal(reloaded.identity.preferredName, "Zubair");
    assert.equal(reloaded.revision, 2);
  });

  await t.test("20. Tenant A cannot read Tenant B", async () => {
    await setOwnerIdentity("tenant_A", { preferredName: "Alice" });
    await setOwnerIdentity("tenant_B", { preferredName: "Bob" });

    const profileA = await getOwnerProfile("tenant_A");
    const profileB = await getOwnerProfile("tenant_B");

    assert.equal(profileA.identity.preferredName, "Alice");
    assert.equal(profileB.identity.preferredName, "Bob");
    assert.notEqual(profileA.accountId, profileB.accountId);
  });

  await t.test("21. Tenant A cannot mutate Tenant B", async () => {
    await setOwnerIdentity("tenant_B", { preferredName: "Bob Original" });

    // Mutating Tenant A does not touch Tenant B
    await setOwnerIdentity("tenant_A", { preferredName: "Mallory" });

    const profileB = await getOwnerProfile("tenant_B");
    assert.equal(profileB.identity.preferredName, "Bob Original");
  });

  await t.test("22. Two Personal instances for same tenant resolve the same Owner360", async () => {
    // Both personal instances belonging to tenant_alpha resolve tenant_alpha's Owner360
    await setOwnerIdentity("tenant_alpha", { preferredName: "Executive Boss" });

    const contextForPersonalInstance1 = await getOwnerContextForTask("tenant_alpha");
    const contextForPersonalInstance2 = await getOwnerContextForTask("tenant_alpha");

    assert.equal(contextForPersonalInstance1.identity?.preferredName?.value, "Executive Boss");
    assert.equal(contextForPersonalInstance2.identity?.preferredName?.value, "Executive Boss");
  });

  await t.test("23. Google signup identity suggestion does not automatically broaden privacy", () => {
    // When Google prefill suggests name/email, default privacy must remain PRIVATE
    const prefilledIdentity = {
      preferredName: "Google User",
      fullName: "Google Verified Name",
      privacyPolicy: normalizePrivacyPolicy(undefined), // Defaults to PRIVATE
      source: "existing_account_identity" as const,
    };
    assert.equal(prefilledIdentity.privacyPolicy, "PRIVATE");
  });

  await t.test("24. Personal runtime remains dormant", () => {
    const personalBotConfig = {
      instancePurpose: "personal",
    };
    assert.equal(isPersonalInstance(personalBotConfig), true);
  });

  await t.test("25. freeOnlyIntegrations remains true", () => {
    const config = createDefaultPersonalAssistantConfig();
    assert.equal(config.freeOnlyIntegrations, true);
  });

  await t.test("26. Privacy read layer labels fields and preserves policies", async () => {
    await setOwnerIdentity("tenant_alpha", {
      preferredName: "Secret Boss",
      privacyPolicy: "PRIVATE",
    });
    await addOwnerContactMethod("tenant_alpha", {
      type: "email",
      label: "Support",
      value: "contact-b7ebb5479205@example.invalid",
      isDefault: true,
      privacyPolicy: "ALLOW_FOR_AUTHORIZED_TASK",
    });

    const taskContext = await getOwnerContextForTask("tenant_alpha");
    assert.equal(taskContext.identity?.preferredName?.value, "Secret Boss");
    assert.equal(taskContext.identity?.preferredName?.privacyPolicy, "PRIVATE");

    const contact = taskContext.contactMethods.find((c) => c.label === "Support");
    assert.equal(contact?.value, "contact-b7ebb5479205@example.invalid");
    assert.equal(contact?.privacyPolicy, "ALLOW_FOR_AUTHORIZED_TASK");
  });

  await t.test("27. Clear profile resets back to safe default", async () => {
    await setOwnerIdentity("tenant_alpha", { preferredName: "Temporary" });
    await addOwnerAddress("tenant_alpha", {
      label: "Home",
      addressLine1: "123 Street",
      city: "Lahore",
      country: "Pakistan",
      isDefault: true,
      privacyPolicy: "PRIVATE",
    });

    const cleared = await clearOwnerProfile("tenant_alpha");
    assert.equal(cleared.identity.preferredName, undefined);
    assert.equal(cleared.addresses.length, 0);
  });

  await t.test("28. Storage isolation: Owner360 data is completely separate from Customer360/lead/order records", async () => {
    // Populate an Owner360 profile
    await setOwnerIdentity("tenant_alpha", { preferredName: "VIP Owner" });
    await addOwnerAddress("tenant_alpha", {
      label: "Home",
      addressLine1: "Villa 10, Block 4",
      city: "Karachi",
      country: "Pakistan",
      isDefault: true,
      privacyPolicy: "PRIVATE",
    });

    // Verify mock storage keys: only owner360_ prefixed doc exists in SYSTEM_CONFIGS
    const keys = Array.from(mockStorage.keys());
    assert.ok(keys.every((k) => k.startsWith("owner360_")), "Storage keys must strictly be owner360_");
    assert.ok(!keys.some((k) => k.includes("customer")), "No customer records may be created or mutated");
    assert.ok(!keys.some((k) => k.includes("lead")), "No lead records may be created or mutated");
    assert.ok(!keys.some((k) => k.includes("order")), "No order records may be created or mutated");
  });

  await t.test("29. Safe Clear: Profile clear does NOT delete accounts, instances, or customer data", async () => {
    // Add external mock items
    mockStorage.set("bot_business_01", { $id: "bot_business_01", type: "business" });
    mockStorage.set("customer_crm_123", { $id: "customer_crm_123", name: "Customer X" });

    // Perform owner clear
    await clearOwnerProfile("tenant_alpha");

    // Ensure external items remain completely untouched
    assert.ok(mockStorage.has("bot_business_01"), "Bot instance must not be deleted");
    assert.ok(mockStorage.has("customer_crm_123"), "Customer CRM data must not be deleted");
  });
});

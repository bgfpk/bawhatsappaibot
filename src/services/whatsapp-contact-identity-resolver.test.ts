import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveCanonicalContactIdentity,
  resolveCanonicalContactIdentitySync,
  recordLidPnMapping,
  getPersistedPnForLid,
  getPersistedLidForPn,
  clearLidMappingsMemoryForTesting,
  clearAllPersistedLidMappingsForTesting,
  isLidJid,
  isPhoneJid,
  extractPhoneDigits,
} from "./whatsapp-contact-identity-resolver.ts";

test("Scenario 1: Direct @s.whatsapp.net message resolves to direct_pn", async () => {
  clearAllPersistedLidMappingsForTesting();
  const result = await resolveCanonicalContactIdentity({
    remoteJid: "contact-e4ed32210a80@example.invalid",
  });

  assert.equal(result.isPhoneResolved, true);
  assert.equal(result.phoneNumber, "195545134641");
  assert.equal(result.phoneJid, "contact-e4ed32210a80@example.invalid");
  assert.equal(result.canonicalJid, "contact-e4ed32210a80@example.invalid");
  assert.equal(result.displayJid, "contact-e4ed32210a80@example.invalid");
  assert.equal(result.resolutionSource, "direct_pn");
});

test("Scenario 2: remoteJid is LID and remoteJidAlt is PN resolves to remote_jid_alt with LID link", async () => {
  clearLidMappingsMemoryForTesting();
  const result = await resolveCanonicalContactIdentity({
    remoteJid: "34196580004073@lid",
    remoteJidAlt: "contact-e4ed32210a80@example.invalid",
  });

  assert.equal(result.isPhoneResolved, true);
  assert.equal(result.phoneNumber, "195545134641");
  assert.equal(result.phoneJid, "contact-e4ed32210a80@example.invalid");
  assert.equal(result.lidJid, "34196580004073@lid");
  assert.equal(result.canonicalJid, "contact-e4ed32210a80@example.invalid");
  assert.equal(result.displayJid, "contact-e4ed32210a80@example.invalid");
  assert.equal(result.resolutionSource, "remote_jid_alt");
});

test("Scenario 3: senderPn / participantPn resolves to sender_pn", async () => {
  clearLidMappingsMemoryForTesting();
  const result = await resolveCanonicalContactIdentity({
    remoteJid: "34196580004073@lid",
    senderPn: "135351162196",
  });

  assert.equal(result.isPhoneResolved, true);
  assert.equal(result.phoneNumber, "135351162196");
  assert.equal(result.phoneJid, "contact-fb7cfca76a29@example.invalid");
  assert.equal(result.lidJid, "34196580004073@lid");
  assert.equal(result.resolutionSource, "sender_pn");
});

test("Scenario 4: Persisted trusted LID mapping resolves to persisted_lid_mapping", async () => {
  clearLidMappingsMemoryForTesting();
  const testLid = "5551234567890@lid";
  const testPn = "contact-094a03a4fde4@example.invalid";
  const testOwner = "bot_test_123";

  recordLidPnMapping({
    dataOwnerKey: testOwner,
    lid: testLid,
    pn: testPn,
  });

  const result = await resolveCanonicalContactIdentity({
    remoteJid: testLid,
    dataOwnerKey: testOwner,
  });

  assert.equal(result.isPhoneResolved, true);
  assert.equal(result.phoneNumber, "129320003312");
  assert.equal(result.phoneJid, testPn);
  assert.equal(result.lidJid, testLid);
  assert.equal(result.resolutionSource, "persisted_lid_mapping");
});

test("Scenario 5: signalRepository.lidMapping.getPNForLID resolves to signal_repository", async () => {
  clearLidMappingsMemoryForTesting();
  const testLid = "7778889990001@lid";
  const testPn = "contact-7afa04a511c7@example.invalid";

  const mockSignalRepo = {
    lidMapping: {
      getPNForLID: async (lid: string) => (lid === testLid ? testPn : null),
    },
  };

  const result = await resolveCanonicalContactIdentity({
    remoteJid: testLid,
    signalRepository: mockSignalRepo,
  });

  assert.equal(result.isPhoneResolved, true);
  assert.equal(result.phoneNumber, "102150301011");
  assert.equal(result.phoneJid, testPn);
  assert.equal(result.lidJid, testLid);
  assert.equal(result.resolutionSource, "signal_repository");
});

test("Scenario 6: Unresolved LID returns null phoneNumber and isPhoneResolved=false", async () => {
  clearLidMappingsMemoryForTesting();
  const unmappedLid = "9998887776665@lid";

  const result = await resolveCanonicalContactIdentity({
    remoteJid: unmappedLid,
  });

  assert.equal(result.isPhoneResolved, false);
  assert.equal(result.phoneNumber, null);
  assert.equal(result.phoneJid, null);
  assert.equal(result.lidJid, unmappedLid);
  assert.equal(result.canonicalJid, unmappedLid);
  assert.equal(result.displayJid, unmappedLid);
  assert.equal(result.resolutionSource, "unresolved_lid");
});

test("Scenario 7: Numeric LID digits (e.g. 88196580004073) are NEVER treated as a phone number", async () => {
  clearLidMappingsMemoryForTesting();
  const lid = "88196580004073@lid";
  assert.equal(isLidJid(lid), true);
  assert.equal(isPhoneJid(lid), false);
  assert.equal(extractPhoneDigits(lid), null);

  const result = await resolveCanonicalContactIdentity({
    remoteJid: lid,
  });

  assert.equal(result.phoneNumber, null);
  assert.notEqual(result.phoneNumber, "13462593509456");
  assert.equal(result.isPhoneResolved, false);
  assert.equal(result.resolutionSource, "unresolved_lid");
});

test("Scenario 8: Persisted LID <-> PN mapping survives reload and is bidirectional", async () => {
  clearLidMappingsMemoryForTesting();
  const testLid = "4443332221110@lid";
  const testPn = "contact-4b704fcbe9b2@example.invalid";
  const testOwner = "bot_persistence_test";

  recordLidPnMapping({
    dataOwnerKey: testOwner,
    lid: testLid,
    pn: testPn,
  });

  // Clear memory cache to simulate process restart
  clearLidMappingsMemoryForTesting();

  // Test retrieval loads from disk
  const resolvedPn = getPersistedPnForLid(testLid, testOwner);
  assert.equal(resolvedPn, testPn);

  const resolvedLid = getPersistedLidForPn(testPn, testOwner);
  assert.equal(resolvedLid, testLid);
});

test("Scenario 8B: Fresh resolver reload resolves canonical identity without memory state", async () => {
  clearLidMappingsMemoryForTesting();
  const testLid = "55566677788899@lid";
  const testPn = "contact-94d1bae5dd24@example.invalid";
  const testOwner = "bot_fresh_reload_test";

  recordLidPnMapping({
    dataOwnerKey: testOwner,
    lid: testLid,
    pn: testPn,
    source: "manual_verification",
  });

  // Wipe memory completely
  clearLidMappingsMemoryForTesting();

  const identity = await resolveCanonicalContactIdentity({
    remoteJid: testLid,
    dataOwnerKey: testOwner,
  });

  assert.equal(identity.phoneJid, testPn);
  assert.equal(identity.phoneNumber, "141891012143");
  assert.equal(identity.lidJid, testLid);
  assert.equal(identity.isPhoneResolved, true);
  assert.equal(identity.resolutionSource, "persisted_lid_mapping");
});

test("Scenario 8C: Concurrent multiple workers writing same LID mapping resolve consistently", async () => {
  clearLidMappingsMemoryForTesting();
  const testLid = "77788899900011@lid";
  const testPn = "contact-80e91c1852cf@example.invalid";
  const testOwner = "bot_concurrency_test";

  // Simulate 10 simultaneous workers recording the same mapping
  await Promise.all(
    Array.from({ length: 10 }).map((_, i) =>
      Promise.resolve(
        recordLidPnMapping({
          dataOwnerKey: testOwner,
          lid: testLid,
          pn: testPn,
          source: `worker_${i}`,
        })
      )
    )
  );

  clearLidMappingsMemoryForTesting();

  const resolvedPn = getPersistedPnForLid(testLid, testOwner);
  assert.equal(resolvedPn, testPn);

  const identity = await resolveCanonicalContactIdentity({
    remoteJid: testLid,
    dataOwnerKey: testOwner,
  });
  assert.equal(identity.phoneJid, testPn);
  assert.equal(identity.isPhoneResolved, true);
});

test("Scenario 8D: Fresh current-message PN metadata overrides stale cached mapping", async () => {
  clearLidMappingsMemoryForTesting();
  const testLid = "99887766554433@lid";
  const oldStalePn = "contact-9d9009c0c421@example.invalid";
  const freshCurrentPn = "contact-d2f60d4eff46@example.invalid";
  const testOwner = "tenant_override_test";

  // Pre-seed stale cache
  recordLidPnMapping({
    dataOwnerKey: testOwner,
    lid: testLid,
    pn: oldStalePn,
    source: "stale_history",
  });

  // Incoming message contains fresh remoteJidAlt
  const resolved = await resolveCanonicalContactIdentity({
    remoteJid: testLid,
    remoteJidAlt: freshCurrentPn,
    dataOwnerKey: testOwner,
  });

  // Fresh WhatsApp metadata wins
  assert.equal(resolved.phoneJid, freshCurrentPn);
  assert.equal(resolved.phoneNumber, "170979870077");
  assert.equal(resolved.resolutionSource, "remote_jid_alt");

  // Cache was updated with fresh mapping
  const updatedInCache = getPersistedPnForLid(testLid, testOwner);
  assert.equal(updatedInCache, freshCurrentPn);
});

test("Scenario 8E: Tenant isolation: Tenant A mapping does not leak to or authorize Tenant B", async () => {
  clearLidMappingsMemoryForTesting();
  const testLid = "11223344556677@lid";
  const tenantAPn = "contact-85d2a3563239@example.invalid";
  const tenantA = "tenant_A_secure";
  const tenantB = "tenant_B_secure";

  // Record mapping in Tenant A only
  recordLidPnMapping({
    dataOwnerKey: tenantA,
    lid: testLid,
    pn: tenantAPn,
    source: "tenant_A_inbound",
  });

  // Tenant A resolves it
  const tenantAResolved = await resolveCanonicalContactIdentity({
    remoteJid: testLid,
    dataOwnerKey: tenantA,
  });
  assert.equal(tenantAResolved.phoneJid, tenantAPn);
  assert.equal(tenantAResolved.isPhoneResolved, true);

  // Tenant B does NOT resolve Tenant A's mapping
  const tenantBResolved = await resolveCanonicalContactIdentity({
    remoteJid: testLid,
    dataOwnerKey: tenantB,
  });
  assert.equal(tenantBResolved.phoneJid, null);
  assert.equal(tenantBResolved.isPhoneResolved, false);
  assert.equal(tenantBResolved.resolutionSource, "unresolved_lid");
});

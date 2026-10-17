import test from "node:test";
import assert from "node:assert/strict";

import {
  createAdminPairingChallenge,
  verifyAdminPairingChallenge,
  revokeAdminPairing,
  getAdminPairingStatus,
} from "./admin-pairing-service.ts";
import {
  resolveAdminIdentityContext,
  canManageAdminPairing,
  getCanonicalAdminPhone,
  extractBotPhoneNumber,
  isCanonicalBusinessAssistantEnabled,
  getAdminAuthorizationStatusBadge,
} from "./admin-identity-service.ts";

test("Admin Pairing & Possession Verification Security Suite", async (t) => {
  const tenantA = "account_tenant_alpha_01";
  const tenantB = "account_tenant_beta_02";
  const adminPhoneA = "+150333823501";
  const adminNormalizedA = "110064053003";
  const adminJidA = "contact-6c9bc40fc084@example.invalid";
  const hackerJid = "contact-1b0afd0a3dc1@example.invalid";

  await t.test("B. Configured but unverified number -> NOT authorized", async () => {
    const unverifiedConfig = {
      admin_number: adminNormalizedA,
      admin_number_verified: false,
      isBusinessAssistantEnabled: true,
    };

    const res = resolveAdminIdentityContext({
      fromJid: adminJidA,
      accountId: tenantA,
      userConfig: unverifiedConfig,
    });

    assert.equal(res.isAuthorizedAdmin, false, "Unverified admin phone must not be authorized");
    assert.equal(res.reason, "admin_number_unverified");
    assert.equal(res.mode, "customer");
  });

  await t.test("Challenge generation: produces 6-digit code scoped to tenant and target phone", async () => {
    const challengeRes = await createAdminPairingChallenge(tenantA, adminPhoneA);
    assert.equal(challengeRes.success, true);
    assert.ok(challengeRes.challengeCode, "Code must exist");
    assert.match(challengeRes.challengeCode!, /^\d{6}$/, "Code must be 6 digits");
    assert.equal(challengeRes.targetPhone, adminNormalizedA);
    assert.ok(challengeRes.expiresAt! > Date.now(), "Expires in the future");
  });

  await t.test("C. Different sender attempting pairing challenge -> phone mismatch rejected", async () => {
    const challenge = await createAdminPairingChallenge(tenantA, adminPhoneA);
    const verifyRes = await verifyAdminPairingChallenge(tenantA, hackerJid, challenge.challengeCode!);
    assert.equal(verifyRes.success, false);
    assert.equal(verifyRes.reason, "phone_mismatch");
  });

  await t.test("C2. Empty/dashboard-only sender cannot verify possession -> rejected", async () => {
    const challenge = await createAdminPairingChallenge(tenantA, adminPhoneA);
    const verifyRes = await verifyAdminPairingChallenge(tenantA, "", challenge.challengeCode!);
    assert.equal(verifyRes.success, false);
    assert.equal(verifyRes.reason, "phone_mismatch");
  });

  await t.test("C3. Correct sender + wrong code -> rejected and attempts decremented", async () => {
    const challenge = await createAdminPairingChallenge(tenantA, adminPhoneA);
    const verifyRes = await verifyAdminPairingChallenge(tenantA, adminJidA, "999999");
    assert.equal(verifyRes.success, false);
    assert.equal(verifyRes.reason, "invalid_code");
    assert.equal(verifyRes.attemptsRemaining, 4);
  });

  await t.test("F. Tenant B challenge cannot verify Tenant A", async () => {
    const challengeA = await createAdminPairingChallenge(tenantA, adminPhoneA);
    // Tenant B attempts to verify with challengeA
    const verifyRes = await verifyAdminPairingChallenge(tenantB, adminPhoneA, challengeA.challengeCode!);
    assert.equal(verifyRes.success, false);
    assert.equal(verifyRes.reason, "no_active_challenge");
  });

  await t.test("A. Correct pairing handshake -> verified and authorized", async () => {
    const challenge = await createAdminPairingChallenge(tenantA, adminPhoneA);
    const verifyRes = await verifyAdminPairingChallenge(tenantA, adminJidA, `PAIR ${challenge.challengeCode}`);
    assert.equal(verifyRes.success, true);
    assert.equal(verifyRes.verifiedPhone, adminNormalizedA);

    const verifiedConfig = {
      admin_number: adminNormalizedA,
      admin_number_verified: true,
      admin_verified_phone: adminNormalizedA,
      isBusinessAssistantEnabled: true,
    };

    const res = resolveAdminIdentityContext({
      fromJid: adminJidA,
      accountId: tenantA,
      userConfig: verifiedConfig,
    });

    assert.equal(res.isAuthorizedAdmin, true, "Verified admin phone must be authorized");
    assert.equal(res.mode, "admin_business_assistant");
    assert.equal(res.context?.adminPhone, adminNormalizedA);
  });

  await t.test("E. Used challenge code cannot be replayed", async () => {
    const challenge = await createAdminPairingChallenge(tenantA, adminPhoneA);
    // 1st verify
    const firstVerify = await verifyAdminPairingChallenge(tenantA, adminJidA, challenge.challengeCode!);
    assert.equal(firstVerify.success, true);

    // 2nd verify replay
    const replayVerify = await verifyAdminPairingChallenge(tenantA, adminJidA, challenge.challengeCode!);
    assert.equal(replayVerify.success, false);
  });

  await t.test("D. Expired challenge cannot verify", async () => {
    const challenge = await createAdminPairingChallenge(tenantA, adminPhoneA);
    // Simulate expired challenge
    const expiredConfig = {
      admin_pairing_challenge: {
        challengeCode: challenge.challengeCode!,
        targetPhone: adminNormalizedA,
        targetAccountId: tenantA,
        createdAt: Date.now() - 20 * 60 * 1000,
        expiresAt: Date.now() - 10 * 60 * 1000,
        attemptsRemaining: 5,
        used: false,
      },
    };

    const verifyRes = await verifyAdminPairingChallenge(tenantA, adminJidA, challenge.challengeCode!, expiredConfig);
    assert.equal(verifyRes.success, false);
    assert.equal(verifyRes.reason, "challenge_expired");
  });

  await t.test("G. Number changed after verification -> previous verification invalid", async () => {
    const newPhone = "157708207112";
    // Account was previously verified for adminNormalizedA, but now config has newPhone
    const modifiedConfig = {
      admin_number: newPhone,
      admin_number_verified: true,
      admin_verified_phone: adminNormalizedA, // mismatch with new admin_number!
      isBusinessAssistantEnabled: true,
    };

    const res = resolveAdminIdentityContext({
      fromJid: `${newPhone}@s.whatsapp.net`,
      accountId: tenantA,
      userConfig: modifiedConfig,
    });

    assert.equal(res.isAuthorizedAdmin, false, "Changed number without re-verification must be denied");
    assert.equal(res.reason, "admin_number_unverified");
  });

  await t.test("Revocation suspends access immediately", async () => {
    const revokeRes = await revokeAdminPairing(tenantA);
    assert.equal(revokeRes.success, true);

    const revokedConfig = {
      admin_number: adminNormalizedA,
      admin_number_verified: false,
      admin_verified_phone: "",
      isBusinessAssistantEnabled: true,
    };

    const res = resolveAdminIdentityContext({
      fromJid: adminJidA,
      accountId: tenantA,
      userConfig: revokedConfig,
    });

    assert.equal(res.isAuthorizedAdmin, false);
    assert.equal(res.reason, "admin_number_unverified");
  });

  await t.test("Role Permissions: Only owner and super_admin can manage pairing; admin and below rejected", () => {
    assert.equal(canManageAdminPairing({ role: "owner" }), true);
    assert.equal(canManageAdminPairing({ role: "super_admin" }), true);
    assert.equal(canManageAdminPairing({ user: { is_owner: true } }), true);
    assert.equal(canManageAdminPairing({ user: { is_super_admin: true } }), true);

    // Non-owner roles MUST be denied (including ordinary admin, manager, support, agent, member, viewer)
    assert.equal(canManageAdminPairing({ role: "admin" }), false);
    assert.equal(canManageAdminPairing({ user: { is_admin: true } }), false);
    assert.equal(canManageAdminPairing({ role: "manager" }), false);
    assert.equal(canManageAdminPairing({ role: "agent" }), false);
    assert.equal(canManageAdminPairing({ role: "member" }), false);
    assert.equal(canManageAdminPairing({ role: "viewer" }), false);
    assert.equal(canManageAdminPairing({ role: "support" }), false);
    assert.equal(canManageAdminPairing({}), false);
  });

  await t.test("Regression 11.A: Configured Admin phone vs Connected Instance phone separation", async () => {
    const liveAdminPhone = "153238380473";
    const liveInstancePhone = "155022133010";

    const user = {
      $id: "user_live_owner_01",
      whatsapp_number: liveInstancePhone, // Connected bot/instance number on user object
      admin_number: liveAdminPhone,
    };

    const userConfig = {
      admin_number: liveAdminPhone,
      admin_alerts_config: { adminPhone: liveAdminPhone },
    };

    // 1. Canonical admin phone must resolve to liveAdminPhone, NOT liveInstancePhone
    const resolvedAdminPhone = getCanonicalAdminPhone(user, userConfig);
    assert.equal(resolvedAdminPhone, liveAdminPhone);

    // 2. Pairing status must report configured phone as liveAdminPhone
    const status = getAdminPairingStatus(user, userConfig);
    assert.equal(status.rawConfiguredPhone, liveAdminPhone);

    // 3. Pairing challenge must bind targetPhone to liveAdminPhone
    const challenge = await createAdminPairingChallenge(user.$id, resolvedAdminPhone);
    assert.equal(challenge.targetPhone, liveAdminPhone);

    // 4. Instance phone (bot itself) attempting to submit PAIR code must be rejected
    const instanceAttempt = await verifyAdminPairingChallenge(user.$id, `${liveInstancePhone}@s.whatsapp.net`, challenge.challengeCode!);
    assert.equal(instanceAttempt.success, false);
    assert.equal(instanceAttempt.reason, "phone_mismatch");

    // 5. Unrelated customer attempting to submit PAIR code must be rejected
    const customerAttempt = await verifyAdminPairingChallenge(user.$id, "contact-094a03a4fde4@example.invalid", challenge.challengeCode!);
    assert.equal(customerAttempt.success, false);
    assert.equal(customerAttempt.reason, "phone_mismatch");

    // 6. Real Admin phone sending PAIR code succeeds
    const adminAttempt = await verifyAdminPairingChallenge(user.$id, `${liveAdminPhone}@s.whatsapp.net`, challenge.challengeCode!);
    assert.equal(adminAttempt.success, true);
    assert.equal(adminAttempt.verifiedPhone, liveAdminPhone);
  });

  await t.test("Regression 12, 13, 14: Exact Live Fixture for Pairing Verification", async () => {
    const liveAdmin = "153238380473";
    const liveBot = "125415830980";
    const accountId = "usr_live_tenant_99";

    const challenge = await createAdminPairingChallenge(accountId, liveAdmin);
    assert.equal(challenge.targetPhone, liveAdmin);

    // 1. Bot itself sending code -> rejected
    const botVerify = await verifyAdminPairingChallenge(accountId, `${liveBot}@s.whatsapp.net`, challenge.challengeCode!);
    assert.equal(botVerify.success, false);
    assert.equal(botVerify.reason, "phone_mismatch");

    // 2. Unrelated customer sending code -> rejected
    const custVerify = await verifyAdminPairingChallenge(accountId, "contact-95fc924c5f42@example.invalid", challenge.challengeCode!);
    assert.equal(custVerify.success, false);
    assert.equal(custVerify.reason, "phone_mismatch");

    // 3. Real Admin sending code -> verified
    const adminVerify = await verifyAdminPairingChallenge(accountId, `${liveAdmin}@s.whatsapp.net`, challenge.challengeCode!);
    assert.equal(adminVerify.success, true);
    assert.equal(adminVerify.verifiedPhone, liveAdmin);
  });

  await t.test("extractBotPhoneNumber helper correctly extracts phone from various bot fields", () => {
    // 1. JID extraction
    assert.equal(extractBotPhoneNumber({ jid: "contact-ab1d043d0fef@example.invalid" }), "125415830980");
    // 2. phone field
    assert.equal(extractBotPhoneNumber({ phone: "+92 313 6923129" }), "125415830980");
    // 3. phoneNumber field
    assert.equal(extractBotPhoneNumber({ phoneNumber: "125415830980" }), "125415830980");
    // 4. config_settings JSON
    assert.equal(extractBotPhoneNumber({ config_settings: JSON.stringify({ phone: "125415830980" }) }), "125415830980");
    // 5. null / empty
    assert.equal(extractBotPhoneNumber(null), "");
    assert.equal(extractBotPhoneNumber({}), "");
  });

  await t.test("isCanonicalBusinessAssistantEnabled resolves consistently across config sources", () => {
    assert.equal(isCanonicalBusinessAssistantEnabled({}, { business_assistant_enabled: true }), true);
    assert.equal(isCanonicalBusinessAssistantEnabled({}, { isBusinessAssistantEnabled: true }), true);
    assert.equal(isCanonicalBusinessAssistantEnabled({}, { admin_alerts_config: { isBusinessAssistantEnabled: true } }), true);
    assert.equal(isCanonicalBusinessAssistantEnabled({ business_assistant_enabled: true }, {}), true);
    assert.equal(isCanonicalBusinessAssistantEnabled({}, {}, { isBusinessAssistantEnabled: true }), true);

    // Explicit disable wins
    assert.equal(isCanonicalBusinessAssistantEnabled({}, { business_assistant_enabled: false }), false);
    assert.equal(isCanonicalBusinessAssistantEnabled({ business_assistant_enabled: false }, { business_assistant_enabled: true }), false);
    assert.equal(isCanonicalBusinessAssistantEnabled({}, { isBusinessAssistantEnabled: false }), false);
    assert.equal(isCanonicalBusinessAssistantEnabled({}, {}), false);
  });

  await t.test("getAdminAuthorizationStatusBadge maps the 5 authoritative states", () => {
    // 1. No number
    assert.deepEqual(getAdminAuthorizationStatusBadge({ adminPhone: "" }), {
      state: "no_number",
      label: "No Admin Number Configured",
      badgeClass: "text-[var(--ca-text-muted)]",
      isAuthorized: false,
    });

    // 2. Access Disabled (Unverified)
    assert.deepEqual(getAdminAuthorizationStatusBadge({ adminPhone: "153238380473", isBusinessAssistantEnabled: false, isVerified: false }), {
      state: "disabled_unverified",
      label: "Access Disabled (Normal Customer Mode)",
      badgeClass: "text-amber-500",
      isAuthorized: false,
    });

    // 3. Access Disabled (Verified)
    assert.deepEqual(getAdminAuthorizationStatusBadge({ adminPhone: "153238380473", isBusinessAssistantEnabled: false, isVerified: true }), {
      state: "disabled_verified",
      label: "Verified, Access Disabled (Normal Customer Mode)",
      badgeClass: "text-amber-500",
      isAuthorized: false,
    });

    // 4. Access Enabled (Unverified)
    assert.deepEqual(getAdminAuthorizationStatusBadge({ adminPhone: "153238380473", isBusinessAssistantEnabled: true, isVerified: false }), {
      state: "enabled_unverified",
      label: "Access Enabled — Verification Required (Pairing Needed)",
      badgeClass: "text-amber-500",
      isAuthorized: false,
    });

    // 5. Active & Authorized (Verified + Enabled)
    assert.deepEqual(getAdminAuthorizationStatusBadge({ adminPhone: "153238380473", isBusinessAssistantEnabled: true, isVerified: true }), {
      state: "active_authorized",
      label: "Active & Authorized (Owner/Admin)",
      badgeClass: "text-emerald-500",
      isAuthorized: true,
    });
  });

  await t.test("Live Fixture: WhatsApp Admin resolution when verified + enabled vs disabled", () => {
    const adminPhone = "153238380473";
    const userConfig = {
      admin_number: adminPhone,
      admin_number_verified: true,
      admin_verified_phone: adminPhone,
      business_assistant_enabled: true,
    };

    // 1. Inbound message from verified admin with access enabled -> mode = admin_business_assistant
    const resEnabled = resolveAdminIdentityContext({
      fromJid: `${adminPhone}@s.whatsapp.net`,
      accountId: "user_live_tenant_prod",
      userConfig,
    });
    assert.equal(resEnabled.isAuthorizedAdmin, true);
    assert.equal(resEnabled.mode, "admin_business_assistant");

    // 2. Verified admin but access disabled -> mode = customer, reason = business_assistant_disabled
    const resDisabled = resolveAdminIdentityContext({
      fromJid: `${adminPhone}@s.whatsapp.net`,
      accountId: "user_live_tenant_prod",
      userConfig: { ...userConfig, business_assistant_enabled: false },
    });
    assert.equal(resDisabled.isAuthorizedAdmin, false);
    assert.equal(resDisabled.mode, "customer");
    assert.equal(resDisabled.reason, "business_assistant_disabled");
  });
});

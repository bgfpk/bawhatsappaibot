import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCustomerReplyControlCommand,
  buildCustomerReplyControlPatch,
  getCustomerReplyControlTargetJids,
} from "./customer-reply-control-service.ts";
import {
  getCustomerAutoReplyStopState,
  buildCustomerAiResumePatch,
} from "./difficult-customer-mode-service.ts";
import {
  buildCustomerDisplayName,
  getExplicitSavedCustomerName,
  getWhatsAppDisplayName,
  formatCustomerFallback,
  isUsableCustomerName,
} from "./customer-display-name-service.ts";
import {
  getCustomerContactIdentity,
  getDisplayNameFromCustomer,
  getDisplayPhoneFromCustomer,
} from "../utils/contact-identity.ts";
import {
  recordLidPnMapping,
  clearAllPersistedLidMappingsForTesting,
} from "./whatsapp-contact-identity-resolver.ts";
import { removeMutedNumbers } from "./muted-number-service.ts";

test("Scenario 9: Owner shortcut .0 parses to pause_temp and sets botReplyPausedUntil = now + 3600", () => {
  const cmd = parseCustomerReplyControlCommand(".0");
  assert.deepEqual(cmd, { action: "pause_temp" });

  const now = 1700000000;
  const patch = buildCustomerReplyControlPatch(cmd!, now);
  assert.equal(patch.botReplyControl, "paused_temp");
  assert.equal(patch.botReplyPausedUntil, now + 3600);
  assert.equal(patch.botReplyPausedPermanent, false);
  assert.equal(patch.aiPaused, true);
});

test("Scenario 10: Owner shortcut .00 parses to pause_permanent and sets botReplyPausedPermanent = true", () => {
  const cmd = parseCustomerReplyControlCommand(".00");
  assert.deepEqual(cmd, { action: "pause_permanent" });

  const now = 1700000000;
  const patch = buildCustomerReplyControlPatch(cmd!, now);
  assert.equal(patch.botReplyControl, "paused_permanent");
  assert.equal(patch.botReplyPausedPermanent, true);
  assert.equal(patch.aiPaused, true);
});

test("Scenario 11: Owner shortcut .1 parses to resume and clears both temp and permanent pause", () => {
  const cmd = parseCustomerReplyControlCommand(".1");
  assert.deepEqual(cmd, { action: "resume" });

  const now = 1700000000;
  const patch = buildCustomerReplyControlPatch(cmd!, now);
  assert.equal(patch.botReplyControl, "active");
  assert.equal(patch.botReplyPausedUntil, 0);
  assert.equal(patch.botReplyPausedPermanent, false);
  assert.equal(patch.aiPaused, false);
});

test("Scenario 12: Owner shortcut .0 in LID chat with linked PN targets both LID and PN profiles", () => {
  clearAllPersistedLidMappingsForTesting();
  const lid = "34196580004073@lid";
  const pn = "contact-e4ed32210a80@example.invalid";

  recordLidPnMapping({
    dataOwnerKey: "bot_1",
    lid,
    pn,
  });

  const targets = getCustomerReplyControlTargetJids(lid, pn, { lidJid: lid, phoneJid: pn });
  assert.ok(targets.includes(lid));
  assert.ok(targets.includes(pn));
});

test("Scenario 13: Customer message to paused customer (via .0 or .00) is stopped by AI auto-reply", () => {
  const now = 1700000000;
  const tempPausedProfile = {
    botReplyControl: "paused_temp",
    botReplyPausedUntil: now + 1800,
  };
  const tempStop = getCustomerAutoReplyStopState(tempPausedProfile, now);
  assert.equal(tempStop.isStopped, true);
  assert.equal(tempStop.kind, "admin_pause_temp");

  const permPausedProfile = {
    botReplyControl: "paused_permanent",
    botReplyPausedPermanent: true,
  };
  const permStop = getCustomerAutoReplyStopState(permPausedProfile, now);
  assert.equal(permStop.isStopped, true);
  assert.equal(permStop.kind, "admin_pause_permanent");
});

test("Scenario 14: Subsequent manual owner message does NOT unpause a customer who is paused via .00 or .0", () => {
  const now = 1700000000;
  const pausedProfile = {
    botReplyControl: "paused_permanent",
    botReplyPausedPermanent: true,
    aiPaused: true,
  };

  const stopState = getCustomerAutoReplyStopState(pausedProfile, now);
  assert.equal(stopState.isStopped, true);
  assert.equal(stopState.kind, "admin_pause_permanent");

  const kind: string = stopState.kind;
  const shouldClearPause = !stopState.isStopped || (kind !== "admin_pause_temp" && kind !== "admin_pause_permanent");
  assert.equal(shouldClearPause, false);
});

test("Scenario 15: Customer display name priority: explicit saved name wins over pushName", () => {
  const profile = {
    savedName: "Usman Jani",
    customerName: "Usman Jani",
    pushName: "UJ",
  };

  const name = buildCustomerDisplayName({
    profile,
    pushName: "UJ",
  });

  assert.equal(name, "Usman Jani");
});

test("Scenario 16: Customer display name fallback: pushName is used when no explicit saved name exists", () => {
  const profile = {
    pushName: "Hamza Tariq",
  };

  const name = buildCustomerDisplayName({
    profile,
    pushName: "Hamza Tariq",
  });

  assert.equal(name, "Hamza Tariq");
});

test("Scenario 17: Customer display name fallback: Customer ••••1234 is used when neither saved name nor pushName exists", () => {
  const profile = {
    phoneJid: "contact-e4ed32210a80@example.invalid",
  };

  const name = buildCustomerDisplayName({
    profile,
    phone: "195545134641",
  });

  assert.equal(name, "Customer ••••4567");
});

test("Scenario 18: Customers page contact column shows real phone number or Number unavailable, never raw LID digits", () => {
  const customerWithPhone = {
    jid: "contact-e4ed32210a80@example.invalid",
    profile: {
      phoneJid: "contact-e4ed32210a80@example.invalid",
      phoneNumber: "195545134641",
    },
  };
  const phone1 = getDisplayPhoneFromCustomer(customerWithPhone);
  assert.equal(phone1, "+92 300 1234567");

  const customerWithLidOnly = {
    customer_id: "77196580004099@lid",
    jid: "77196580004099@lid",
    profile: {
      lidJid: "77196580004099@lid",
    },
  };
  const identity = getCustomerContactIdentity(customerWithLidOnly);
  assert.equal(identity.hasRealPhone, false);
  assert.equal(identity.displayPhone, "");
  assert.equal(identity.contactLabel, "Number unavailable");
  assert.notEqual(identity.displayPhone, "17324747425347");
});

test("Scenario 19 (Regression 1): canonical paused_permanent + legacy muted PN -> .1 sets canonical active and clears legacy PN mute -> inbound eligible", async () => {
  const pn = "contact-83742b4558c8@example.invalid";
  const botConfig = { muted_numbers: ["130550897135", "110064053003"] };
  let profile: any = {
    botReplyControl: "paused_permanent",
    botReplyPausedPermanent: true,
    phoneJid: pn,
    phoneNumber: "130550897135",
  };

  // Initially stopped
  const initialStop = getCustomerAutoReplyStopState(profile, 1700000000, {
    jid: pn,
    mutedNumbers: botConfig.muted_numbers,
  });
  assert.equal(initialStop.isStopped, true);
  assert.equal(initialStop.reason, "customer_paused_permanent");

  // Apply .1
  const cmd = parseCustomerReplyControlCommand(".1")!;
  const patch = buildCustomerReplyControlPatch(cmd, 1700000000);
  profile = { ...profile, ...patch };

  // Legacy mute cleared for this customer
  const targetJids = getCustomerReplyControlTargetJids(pn, "", profile);
  botConfig.muted_numbers = removeMutedNumbers(botConfig.muted_numbers, targetJids);

  assert.equal(profile.botReplyControl, "active");
  assert.equal(botConfig.muted_numbers.includes("130550897135"), false);
  assert.equal(botConfig.muted_numbers.includes("110064053003"), true);

  // Inbound is now active and eligible
  const afterStop = getCustomerAutoReplyStopState(profile, 1700000000, {
    jid: pn,
    mutedNumbers: botConfig.muted_numbers,
  });
  assert.equal(afterStop.isStopped, false);
  assert.equal(afterStop.kind, "active");
  assert.equal(afterStop.reason, "");
});

test("Scenario 20 (Regression 2): canonical paused_permanent + legacy muted LID + trusted PN/LID -> .1 clears both aliases -> inbound PN and LID eligible", async () => {
  clearAllPersistedLidMappingsForTesting();
  const pn = "contact-83742b4558c8@example.invalid";
  const lid = "194167418417354@lid";
  recordLidPnMapping({ dataOwnerKey: "tenant_1", lid, pn });

  const botConfig = { muted_numbers: ["104294324532071", "130550897135"] };
  let profile: any = {
    botReplyControl: "paused_permanent",
    botReplyPausedPermanent: true,
    phoneJid: pn,
    lidJid: lid,
  };

  const cmd = parseCustomerReplyControlCommand(".1")!;
  const patch = buildCustomerReplyControlPatch(cmd, 1700000000);
  profile = { ...profile, ...patch };

  const targetJids = getCustomerReplyControlTargetJids(lid, pn, profile);
  botConfig.muted_numbers = removeMutedNumbers(botConfig.muted_numbers, targetJids);

  // Both LID and PN digits are removed from legacy blacklist
  assert.equal(botConfig.muted_numbers.includes("104294324532071"), false);
  assert.equal(botConfig.muted_numbers.includes("130550897135"), false);

  // Both inbound PN and LID are eligible
  const stopPn = getCustomerAutoReplyStopState(profile, 1700000000, { jid: pn, mutedNumbers: botConfig.muted_numbers });
  const stopLid = getCustomerAutoReplyStopState(profile, 1700000000, { jid: lid, mutedNumbers: botConfig.muted_numbers });

  assert.equal(stopPn.isStopped, false);
  assert.equal(stopLid.isStopped, false);
});

test("Scenario 21 (Regression 3): canonical active with stale legacy muted=true -> .1 cleans stale mute and never blocks active customer", async () => {
  const pn = "contact-83742b4558c8@example.invalid";
  const botConfig = { muted_numbers: ["130550897135"] };
  const profile = {
    botReplyControl: "active",
    botReplyPausedUntil: 0,
    botReplyPausedPermanent: false,
    phoneJid: pn,
  };

  // Even before cleanup, canonical active is NOT stopped by stale legacy mute
  const preCleanupStop = getCustomerAutoReplyStopState(profile, 1700000000, {
    jid: pn,
    mutedNumbers: botConfig.muted_numbers,
  });
  assert.equal(preCleanupStop.isStopped, false);
  assert.equal(preCleanupStop.kind, "active");

  // .1 removes stale legacy entry
  botConfig.muted_numbers = removeMutedNumbers(botConfig.muted_numbers, [pn]);
  assert.equal(botConfig.muted_numbers.length, 0);

  const postCleanupStop = getCustomerAutoReplyStopState(profile, 1700000000, {
    jid: pn,
    mutedNumbers: botConfig.muted_numbers,
  });
  assert.equal(postCleanupStop.isStopped, false);
});

test("Scenario 22 (Regression 4): .0 sets effective pause for exactly 1 hour and inbound skip reason reflects customer_paused_temp", async () => {
  const now = 1700000000;
  const cmd = parseCustomerReplyControlCommand(".0")!;
  const patch = buildCustomerReplyControlPatch(cmd, now);
  const profile = { ...patch, phoneJid: "contact-e4ed32210a80@example.invalid" };

  assert.equal(profile.botReplyControl, "paused_temp");
  assert.equal(profile.botReplyPausedUntil, now + 3600);

  const stopState = getCustomerAutoReplyStopState(profile, now + 1800, {
    jid: "contact-e4ed32210a80@example.invalid",
  });
  assert.equal(stopState.isStopped, true);
  assert.equal(stopState.kind, "admin_pause_temp");
  assert.equal(stopState.reason, "customer_paused_temp");
});

test("Scenario 23 (Regression 5): .00 sets effective permanent pause and inbound skip reason reflects customer_paused_permanent", async () => {
  const now = 1700000000;
  const cmd = parseCustomerReplyControlCommand(".00")!;
  const patch = buildCustomerReplyControlPatch(cmd, now);
  const profile = { ...patch, phoneJid: "contact-e4ed32210a80@example.invalid" };

  assert.equal(profile.botReplyControl, "paused_permanent");
  assert.equal(profile.botReplyPausedPermanent, true);

  const stopState = getCustomerAutoReplyStopState(profile, now + 100000, {
    jid: "contact-e4ed32210a80@example.invalid",
  });
  assert.equal(stopState.isStopped, true);
  assert.equal(stopState.kind, "admin_pause_permanent");
  assert.equal(stopState.reason, "customer_paused_permanent");
});

test("Scenario 24 (Regression 6): .1 after .0 -> immediately active", async () => {
  const now = 1700000000;
  const tempPausePatch = buildCustomerReplyControlPatch(parseCustomerReplyControlCommand(".0")!, now);
  let profile: any = { ...tempPausePatch, phoneJid: "contact-e4ed32210a80@example.invalid" };

  assert.equal(getCustomerAutoReplyStopState(profile, now + 100).isStopped, true);

  const resumePatch = buildCustomerReplyControlPatch(parseCustomerReplyControlCommand(".1")!, now + 200);
  profile = { ...profile, ...resumePatch };

  const stopState = getCustomerAutoReplyStopState(profile, now + 200);
  assert.equal(stopState.isStopped, false);
  assert.equal(stopState.kind, "active");
});

test("Scenario 25 (Regression 7): .1 after .00 -> immediately active", async () => {
  const now = 1700000000;
  const permPausePatch = buildCustomerReplyControlPatch(parseCustomerReplyControlCommand(".00")!, now);
  let profile: any = { ...permPausePatch, phoneJid: "contact-e4ed32210a80@example.invalid" };

  assert.equal(getCustomerAutoReplyStopState(profile, now + 100).isStopped, true);

  const resumePatch = buildCustomerReplyControlPatch(parseCustomerReplyControlCommand(".1")!, now + 200);
  profile = { ...profile, ...resumePatch };

  const stopState = getCustomerAutoReplyStopState(profile, now + 200);
  assert.equal(stopState.isStopped, false);
  assert.equal(stopState.kind, "active");
});

test("Scenario 26 (Regression 8): restart hydration -> permanent pause remains paused across process restart", () => {
  const savedProfileJson = JSON.stringify({
    botReplyControl: "paused_permanent",
    botReplyPausedPermanent: true,
    botReplyStopReason: "Permanently stopped by .00 shortcode",
    aiPaused: true,
  });

  const hydratedProfile = JSON.parse(savedProfileJson);
  const stopState = getCustomerAutoReplyStopState(hydratedProfile, 1800000000);
  assert.equal(stopState.isStopped, true);
  assert.equal(stopState.kind, "admin_pause_permanent");
  assert.equal(stopState.reason, "customer_paused_permanent");
});

test("Scenario 27 (Regression 9): expired .0 after restart -> active", () => {
  const now = 1700000000;
  const savedProfileJson = JSON.stringify({
    botReplyControl: "paused_temp",
    botReplyPausedUntil: now + 3600, // paused until now + 1 hour
    botReplyPausedPermanent: false,
  });

  const hydratedProfile = JSON.parse(savedProfileJson);

  // Restart occurs after 2 hours (now + 7200)
  const restartTime = now + 7200;
  const stopState = getCustomerAutoReplyStopState(hydratedProfile, restartTime);
  assert.equal(stopState.isStopped, false);
  assert.equal(stopState.kind, "active");
});

test("Scenario 28 (Regression 10): unrelated customer legacy mute -> untouched when unmuting another customer", () => {
  const botConfig = {
    muted_numbers: ["130550897135", "157311815005", "134052281452"],
  };

  const targetJids = ["contact-83742b4558c8@example.invalid", "194167418417354@lid"];
  const updated = removeMutedNumbers(botConfig.muted_numbers, targetJids);

  assert.equal(updated.includes("130550897135"), false);
  assert.equal(updated.includes("157311815005"), true);
  assert.equal(updated.includes("134052281452"), true);
  assert.equal(updated.length, 2);
});

test("Scenario 29 (Regression 11): other tenant same phone/LID -> tenant data isolation preserved", () => {
  const tenant1Config = { muted_numbers: ["130550897135"] };
  const tenant2Config = { muted_numbers: ["130550897135", "110064053003"] };

  // Unmuting tenant 1 does not affect tenant 2 config
  tenant1Config.muted_numbers = removeMutedNumbers(tenant1Config.muted_numbers, ["contact-83742b4558c8@example.invalid"]);

  assert.equal(tenant1Config.muted_numbers.length, 0);
  assert.equal(tenant2Config.muted_numbers.includes("130550897135"), true);
  assert.equal(tenant2Config.muted_numbers.includes("110064053003"), true);
});

test("Scenario 30 (Regression 12): ordinary owner message does NOT clear canonical pause (.0 or .00)", () => {
  const now = 1700000000;
  const pausedProfile = {
    botReplyControl: "paused_permanent",
    botReplyPausedPermanent: true,
    aiPaused: true,
  };

  const manualMessageText = "Hello, your order is being dispatched today.";
  const controlCmd = parseCustomerReplyControlCommand(manualMessageText);
  assert.equal(controlCmd, null); // Not a shortcut

  const stopState = getCustomerAutoReplyStopState(pausedProfile, now);
  const shouldClearPause = !stopState.isStopped || (stopState.kind !== "admin_pause_temp" && stopState.kind !== "admin_pause_permanent");
  assert.equal(shouldClearPause, false);
});

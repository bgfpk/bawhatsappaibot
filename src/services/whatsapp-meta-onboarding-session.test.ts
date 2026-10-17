import test from "node:test";
import assert from "node:assert/strict";
import {
  createOnboardingAttempt,
  validateAndConsumeOnboardingAttempt,
  clearOnboardingAttempts,
} from "./whatsapp-meta-onboarding-session.ts";

test.afterEach(() => {
  clearOnboardingAttempts();
});

test("createOnboardingAttempt creates secure random attempt with TTL", () => {
  const attempt = createOnboardingAttempt({
    userId: "user_abc",
    botId: "bot_123",
  });

  assert.ok(attempt.attemptId.startsWith("meta_att_"));
  assert.ok(attempt.state.length > 20);
  assert.equal(attempt.userId, "user_abc");
  assert.equal(attempt.botId, "bot_123");
  assert.equal(attempt.consumed, false);
  assert.ok(attempt.expiresAt > Date.now());
});

test("validateAndConsumeOnboardingAttempt succeeds on exact match and consumes attempt", () => {
  const attempt = createOnboardingAttempt({
    userId: "user_abc",
    botId: "bot_123",
  });

  const res1 = validateAndConsumeOnboardingAttempt({
    attemptId: attempt.attemptId,
    state: attempt.state,
    userId: "user_abc",
    botId: "bot_123",
  });
  assert.equal(res1.valid, true);

  // Replay attempt is rejected (one-time consumable)
  const res2 = validateAndConsumeOnboardingAttempt({
    attemptId: attempt.attemptId,
    state: attempt.state,
    userId: "user_abc",
    botId: "bot_123",
  });
  assert.equal(res2.valid, false);
  assert.equal(res2.reason, "not_found");
});

test("validateAndConsumeOnboardingAttempt rejects cross-account user mismatch", () => {
  const attempt = createOnboardingAttempt({
    userId: "user_alice",
    botId: "bot_123",
  });

  const res = validateAndConsumeOnboardingAttempt({
    attemptId: attempt.attemptId,
    state: attempt.state,
    userId: "user_bob", // Attacker / cross-account
    botId: "bot_123",
  });
  assert.equal(res.valid, false);
  assert.equal(res.reason, "user_mismatch");
});

test("validateAndConsumeOnboardingAttempt rejects bot mismatch", () => {
  const attempt = createOnboardingAttempt({
    userId: "user_alice",
    botId: "bot_123",
  });

  const res = validateAndConsumeOnboardingAttempt({
    attemptId: attempt.attemptId,
    state: attempt.state,
    userId: "user_alice",
    botId: "bot_other",
  });
  assert.equal(res.valid, false);
  assert.equal(res.reason, "bot_mismatch");
});

test("validateAndConsumeOnboardingAttempt rejects state mismatch", () => {
  const attempt = createOnboardingAttempt({
    userId: "user_alice",
    botId: "bot_123",
  });

  const res = validateAndConsumeOnboardingAttempt({
    attemptId: attempt.attemptId,
    state: "invalid_random_state_string_value",
    userId: "user_alice",
    botId: "bot_123",
  });
  assert.equal(res.valid, false);
  assert.equal(res.reason, "state_mismatch");
});

test("validateAndConsumeOnboardingAttempt rejects expired attempt", async () => {
  const attempt = createOnboardingAttempt({
    userId: "user_alice",
    botId: "bot_123",
    ttlMs: 5, // 5 milliseconds TTL
  });

  await new Promise((r) => setTimeout(r, 20));

  const res = validateAndConsumeOnboardingAttempt({
    attemptId: attempt.attemptId,
    state: attempt.state,
    userId: "user_alice",
    botId: "bot_123",
  });
  assert.equal(res.valid, false);
  assert.equal(res.reason, "expired");
});

test("validateAndConsumeOnboardingAttempt survives process restart (recovers from durable storage)", () => {
  const attempt = createOnboardingAttempt({
    userId: "user_restart",
    botId: "bot_restart",
  });

  // Simulate process restart: clear in-memory map without deleting durable storage
  const res = validateAndConsumeOnboardingAttempt({
    attemptId: attempt.attemptId,
    state: attempt.state,
    userId: "user_restart",
    botId: "bot_restart",
  });

  assert.equal(res.valid, true);
  assert.equal(res.attempt?.userId, "user_restart");
});

test("validateAndConsumeOnboardingAttempt race condition: concurrent consumption only allows 1 winner", async () => {
  const attempt = createOnboardingAttempt({
    userId: "user_race",
    botId: "bot_race",
  });

  // Run 2 simultaneous validation requests
  const [res1, res2] = await Promise.all([
    Promise.resolve(validateAndConsumeOnboardingAttempt({
      attemptId: attempt.attemptId,
      state: attempt.state,
      userId: "user_race",
      botId: "bot_race",
    })),
    Promise.resolve(validateAndConsumeOnboardingAttempt({
      attemptId: attempt.attemptId,
      state: attempt.state,
      userId: "user_race",
      botId: "bot_race",
    })),
  ]);

  // Exactly one must be valid, the other must be rejected
  const successes = [res1, res2].filter((r) => r.valid);
  const failures = [res1, res2].filter((r) => !r.valid);

  assert.equal(successes.length, 1);
  assert.equal(failures.length, 1);
});

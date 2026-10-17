import test from "node:test";
import assert from "node:assert/strict";
import {
  generateOAuthState,
  signOAuthState,
  verifyOAuthStateCookie,
  registerOAuthState,
  validateAndConsumeOAuthState,
  generateCryptoAuthId,
} from "./oauth-state-security-service.ts";

test("OAuth state security service: CSPRNG state, mandatory cookie binding, and replay prevention", () => {
  const secret = "test-session-secret-key-123456789";

  // 1. State entropy
  const state1 = generateOAuthState();
  const state2 = generateOAuthState();
  assert.notEqual(state1, state2, "Generated states must be unique");
  assert.equal(state1.length >= 40, true, "State has high entropy base64url length");

  // 2. Cookie signing and verification
  const signedCookie1 = signOAuthState(state1, secret);
  const cookieCheck = verifyOAuthStateCookie(signedCookie1, state1, secret);
  assert.equal(cookieCheck, true);

  // Tampered cookie rejected
  const tamperedCookie = signedCookie1.startsWith("X") ? "Y" + signedCookie1.slice(1) : "X" + signedCookie1.slice(1);
  const tamperedCheck = verifyOAuthStateCookie(tamperedCookie, state1, secret);
  assert.equal(tamperedCheck, false);

  // 3. Valid flow: state + matching signed cookie succeeds
  registerOAuthState(state1, { mode: "signup", legalAcceptance: { accepted: true } });

  const validConsume = validateAndConsumeOAuthState({
    queryState: state1,
    cookieState: signedCookie1,
    secret,
  });
  assert.equal(validConsume.valid, true);
  assert.equal(validConsume.metadata?.mode, "signup");

  // 4. Replay attack rejection (consumed state cannot be reused)
  const replayResult = validateAndConsumeOAuthState({
    queryState: state1,
    cookieState: signedCookie1,
    secret,
  });
  assert.equal(replayResult.valid, false);
  assert.equal(replayResult.error, "unknown_or_expired_state");

  // 5. Missing cookie is strictly rejected
  const stateMissingCookie = generateOAuthState();
  registerOAuthState(stateMissingCookie);
  const missingCookieResult = validateAndConsumeOAuthState({
    queryState: stateMissingCookie,
    cookieState: "",
    secret,
  });
  assert.equal(missingCookieResult.valid, false);
  assert.equal(missingCookieResult.error, "missing_cookie");

  // 6. Wrong cookie / wrong signature is rejected
  const stateWrongCookie = generateOAuthState();
  registerOAuthState(stateWrongCookie);
  const wrongCookieResult = validateAndConsumeOAuthState({
    queryState: stateWrongCookie,
    cookieState: "invalid.signature",
    secret,
  });
  assert.equal(wrongCookieResult.valid, false);
  assert.equal(wrongCookieResult.error, "browser_binding_mismatch");

  // 7. Different browser cookie (cookie for state A presented with query for state B) is rejected
  const stateBrowserA = generateOAuthState();
  const stateBrowserB = generateOAuthState();
  const cookieBrowserA = signOAuthState(stateBrowserA, secret);
  registerOAuthState(stateBrowserB);
  const differentBrowserResult = validateAndConsumeOAuthState({
    queryState: stateBrowserB,
    cookieState: cookieBrowserA,
    secret,
  });
  assert.equal(differentBrowserResult.valid, false);
  assert.equal(differentBrowserResult.error, "browser_binding_mismatch");

  // 8. Expired state is rejected
  const stateExpired = generateOAuthState();
  const cookieExpired = signOAuthState(stateExpired, secret);
  const registered = registerOAuthState(stateExpired);
  const expiredResult = validateAndConsumeOAuthState({
    queryState: stateExpired,
    cookieState: cookieExpired,
    secret,
    nowMs: registered.expiresAt + 1000,
  });
  assert.equal(expiredResult.valid, false);
  assert.equal(expiredResult.error, "expired_state");

  // 10. Invalid browser cookie attempt does not consume a valid registered state
  const statePreserve = generateOAuthState();
  const validCookiePreserve = signOAuthState(statePreserve, secret);
  registerOAuthState(statePreserve, { mode: "signup", preserves: true });

  // First call with wrong cookie fails
  const failedAttempt = validateAndConsumeOAuthState({
    queryState: statePreserve,
    cookieState: "wrong.cookie",
    secret,
  });
  assert.equal(failedAttempt.valid, false);
  assert.equal(failedAttempt.error, "browser_binding_mismatch");

  // Subsequent call with the legitimate valid cookie succeeds (state was not prematurely consumed)
  const subsequentValidAttempt = validateAndConsumeOAuthState({
    queryState: statePreserve,
    cookieState: validCookiePreserve,
    secret,
  });
  assert.equal(subsequentValidAttempt.valid, true);
  assert.equal(subsequentValidAttempt.metadata?.preserves, true);

  // 11. Crypto auth id generation
  const userId = generateCryptoAuthId("usr");
  assert.equal(userId.startsWith("usr_"), true);
  assert.equal(userId.length >= 24, true);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  isTrustedMetaOrigin,
  extractEmbeddedSignupEventData,
  launchMetaEmbeddedSignup,
} from "./meta-embedded-signup-service.ts";

test("isTrustedMetaOrigin strictly accepts valid HTTPS Meta origins and rejects hostile origins", () => {
  // Valid origins
  assert.equal(isTrustedMetaOrigin("https://facebook.com"), true);
  assert.equal(isTrustedMetaOrigin("https://www.facebook.com"), true);
  assert.equal(isTrustedMetaOrigin("https://web.facebook.com"), true);

  // Insecure protocol
  assert.equal(isTrustedMetaOrigin("http://facebook.com"), false);
  assert.equal(isTrustedMetaOrigin("http://www.facebook.com"), false);

  // Hostile / spoofed domains
  assert.equal(isTrustedMetaOrigin("https://evilfacebook.com"), false);
  assert.equal(isTrustedMetaOrigin("https://notfacebook.com"), false);
  assert.equal(isTrustedMetaOrigin("https://facebook.com.attacker.com"), false);
  assert.equal(isTrustedMetaOrigin("https://contact-d3e93ff6c7f0@example.invalid"), false);
  assert.equal(isTrustedMetaOrigin("https://attacker.com"), false);
  assert.equal(isTrustedMetaOrigin("javascript:void(0)"), false);
  assert.equal(isTrustedMetaOrigin(""), false);
});

test("extractEmbeddedSignupEventData parses valid WA_EMBEDDED_SIGNUP object and string", () => {
  const payloadObj = {
    type: "WA_EMBEDDED_SIGNUP",
    data: {
      waba_id: "waba_12345",
      phone_number_id: "phone_67890",
      business_id: "biz_111",
      current_step: "REGISTER_PHONE",
    },
  };

  const parsed = extractEmbeddedSignupEventData(payloadObj);
  assert.ok(parsed);
  assert.equal(parsed.wabaId, "waba_12345");
  assert.equal(parsed.phoneNumberId, "phone_67890");
  assert.equal(parsed.businessId, "biz_111");

  // JSON string
  const parsedStr = extractEmbeddedSignupEventData(JSON.stringify(payloadObj));
  assert.ok(parsedStr);
  assert.equal(parsedStr.wabaId, "waba_12345");

  // Unrelated postMessage events
  assert.equal(extractEmbeddedSignupEventData({ type: "OTHER_EVENT" }), null);
  assert.equal(extractEmbeddedSignupEventData("invalid json string"), null);
  assert.equal(extractEmbeddedSignupEventData(null), null);
});

test("launchMetaEmbeddedSignup coordinates FB.login and postMessage event", async () => {
  let loginCalled = false;
  let loginConfig: any = null;
  let loginCallback: any = null;
  const messageListeners: Array<(e: any) => void> = [];

  // Stub window and FB
  (globalThis as any).window = globalThis;
  (globalThis as any).window.addEventListener = (type: string, listener: any) => {
    if (type === "message") messageListeners.push(listener);
  };
  (globalThis as any).window.removeEventListener = (type: string, listener: any) => {
    const idx = messageListeners.indexOf(listener);
    if (idx >= 0) messageListeners.splice(idx, 1);
  };

  (globalThis as any).window.FB = {
    init: () => {},
    login: (cb: any, opts: any) => {
      loginCalled = true;
      loginConfig = opts;
      loginCallback = cb;
    },
  };

  let capturedResult: any = null;

  const cleanup = await launchMetaEmbeddedSignup({
    appId: "app_123",
    configId: "cfg_456",
    state: "state_token_789",
    onSuccess: (res) => {
      capturedResult = res;
    },
    onError: (err) => {
      assert.fail(`Unexpected error: ${err.message}`);
    },
  });

  assert.equal(loginCalled, true);
  assert.equal(loginConfig.config_id, "cfg_456");
  assert.equal(loginConfig.response_type, "code");
  assert.equal(loginConfig.override_default_response_type, true);
  assert.equal(loginConfig.state, "state_token_789");

  // 1. Simulate postMessage event from Facebook
  const event = {
    origin: "https://www.facebook.com",
    data: {
      type: "WA_EMBEDDED_SIGNUP",
      data: {
        waba_id: "waba_999",
        phone_number_id: "phone_888",
        business_id: "biz_777",
      },
    },
  };

  for (const listener of [...messageListeners]) {
    listener(event);
  }

  // 2. Simulate FB.login code return
  loginCallback({
    authResponse: { code: "test_auth_code_from_fb" },
  });

  assert.ok(capturedResult);
  assert.equal(capturedResult.code, "test_auth_code_from_fb");
  assert.equal(capturedResult.sessionInfo.wabaId, "waba_999");
  assert.equal(capturedResult.sessionInfo.phoneNumberId, "phone_888");
  assert.equal(capturedResult.sessionInfo.businessId, "biz_777");

  // Verify cleanup removed listener
  cleanup();
  assert.equal(messageListeners.length, 0);
});

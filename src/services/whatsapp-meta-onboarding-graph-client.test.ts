import test from "node:test";
import assert from "node:assert/strict";
import {
  exchangeAuthorizationCode,
  getWabaPhoneNumbers,
  subscribeWabaApp,
  registerPhoneNumber,
  MetaGraphOnboardingError,
} from "./whatsapp-meta-onboarding-graph-client.ts";

test("exchangeAuthorizationCode parses access token successfully with mock fetch", async () => {
  let capturedUrl = "";
  const mockFetch = async (url: any) => {
    capturedUrl = String(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "EAABwz_mock_access_token_12345",
        token_type: "bearer",
        expires_in: 5184000,
      }),
    } as any;
  };

  const result = await exchangeAuthorizationCode({
    appId: "app_111",
    appSecret: "sec_222",
    code: "auth_code_333",
    redirectUri: "https://blackarrow-source.offline.invalid/oauth",
    fetchImpl: mockFetch,
  });

  assert.equal(result.accessToken, "EAABwz_mock_access_token_12345");
  assert.match(capturedUrl, /oauth\/access_token/);
  assert.match(capturedUrl, /client_id=app_111/);
  assert.match(capturedUrl, /code=auth_code_333/);
});

test("exchangeAuthorizationCode classifies 400 error safely", async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      error: { message: "Invalid verification code format.", type: "OAuthException", code: 100 },
    }),
  } as any);

  await assert.rejects(
    async () => {
      await exchangeAuthorizationCode({
        appId: "app_111",
        appSecret: "sec_222",
        code: "invalid_code",
        fetchImpl: mockFetch,
      });
    },
    (err: MetaGraphOnboardingError) => {
      assert.equal(err.status, 400);
      assert.equal(err.errorCode, "meta_bad_request");
      return true;
    }
  );
});

test("getWabaPhoneNumbers returns authoritative phone records", async () => {
  const mockFetch = async (url: any, init: any) => {
    assert.equal(init?.headers?.Authorization, "Bearer valid_token");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: "phone_1001",
            display_phone_number: "+1 555-0100",
            verified_name: "BlackArrow Support",
            quality_rating: "GREEN",
          },
          {
            id: "phone_1002",
            display_phone_number: "+1 555-0200",
          },
        ],
      }),
    } as any;
  };

  const phones = await getWabaPhoneNumbers({
    wabaId: "waba_999",
    accessToken: "valid_token",
    fetchImpl: mockFetch,
  });

  assert.equal(phones.length, 2);
  assert.equal(phones[0].id, "phone_1001");
  assert.equal(phones[0].display_phone_number, "+1 555-0100");
  assert.equal(phones[0].verified_name, "BlackArrow Support");
  assert.equal(phones[1].id, "phone_1002");
});

test("subscribeWabaApp calls subscribed_apps and returns success", async () => {
  let capturedUrl = "";
  const mockFetch = async (url: any, init: any) => {
    capturedUrl = String(url);
    assert.equal(init?.method, "POST");
    assert.equal(init?.headers?.Authorization, "Bearer valid_token");
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as any;
  };

  const res = await subscribeWabaApp({
    wabaId: "waba_999",
    accessToken: "valid_token",
    fetchImpl: mockFetch,
  });

  assert.equal(res.success, true);
  assert.match(capturedUrl, /waba_999\/subscribed_apps/);
});

test("registerPhoneNumber rejects invalid PIN before network call", async () => {
  let fetchCalled = false;
  const mockFetch = async () => {
    fetchCalled = true;
    return {} as any;
  };

  await assert.rejects(
    async () => {
      await registerPhoneNumber({
        phoneNumberId: "phone_123",
        pin: "12345", // 5 digits instead of 6
        accessToken: "valid_token",
        fetchImpl: mockFetch,
      });
    },
    /PIN must be exactly 6 digits/
  );

  assert.equal(fetchCalled, false);
});

test("registerPhoneNumber sends valid PIN and returns success", async () => {
  let capturedBody = "";
  const mockFetch = async (url: any, init: any) => {
    capturedBody = String(init?.body);
    assert.equal(init?.method, "POST");
    assert.equal(init?.headers?.Authorization, "Bearer valid_token");
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as any;
  };

  const res = await registerPhoneNumber({
    phoneNumberId: "phone_123",
    pin: "654321",
    accessToken: "valid_token",
    fetchImpl: mockFetch,
  });

  assert.equal(res.success, true);
  assert.deepEqual(JSON.parse(capturedBody), {
    messaging_product: "whatsapp",
    pin: "654321",
  });
});

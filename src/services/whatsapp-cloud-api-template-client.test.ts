// src/services/whatsapp-cloud-api-template-client.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  listWabaMessageTemplates,
  normalizeMetaTemplate,
  sendWabaTemplateMessage,
  MetaGraphTemplateError,
} from "./whatsapp-cloud-api-template-client.ts";

test("normalizeMetaTemplate: normalizes standard and custom fields", () => {
  const raw = {
    id: "tpl_123",
    name: "order_confirmation",
    language: "en_US",
    status: "APPROVED",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Hello {{1}}, your order {{2}} is confirmed.",
      },
    ],
    quality_score: { score: "GREEN" },
  };

  const normalized = normalizeMetaTemplate(raw);
  assert.equal(normalized.id, "tpl_123");
  assert.equal(normalized.name, "order_confirmation");
  assert.equal(normalized.language, "en_US");
  assert.equal(normalized.status, "APPROVED");
  assert.equal(normalized.category, "UTILITY");
  assert.equal(normalized.components.length, 1);
  assert.deepEqual(normalized.qualityScore, { score: "GREEN" });
});

test("normalizeMetaTemplate: preserves unknown statuses and handles missing fields", () => {
  const raw = {
    id: "tpl_456",
    name: "special_promo",
    status: "FLAGGED_RESTRICTED",
  };

  const normalized = normalizeMetaTemplate(raw);
  assert.equal(normalized.id, "tpl_456");
  assert.equal(normalized.status, "FLAGGED_RESTRICTED");
  assert.equal(normalized.language, "en_US");
  assert.equal(normalized.category, "UTILITY");
  assert.deepEqual(normalized.components, []);
});

test("listWabaMessageTemplates: single page fetch returns normalized templates", async () => {
  let capturedUrl = "";
  let capturedAuth = "";

  const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedAuth = String(init?.headers ? (init.headers as any).Authorization : "");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: "101",
            name: "welcome_template",
            language: "en_US",
            status: "APPROVED",
            category: "MARKETING",
            components: [{ type: "BODY", text: "Welcome to our store!" }],
          },
          {
            id: "102",
            name: "order_update",
            language: "en_US",
            status: "PENDING",
            category: "UTILITY",
            components: [{ type: "BODY", text: "Your order is ready." }],
          },
        ],
      }),
    } as Response;
  };

  const result = await listWabaMessageTemplates({
    wabaId: "waba_test_999",
    accessToken: "secret_token_123",
    fetchImpl: fakeFetch as any,
  });

  assert.equal(result.length, 2);
  assert.equal(result[0].name, "welcome_template");
  assert.equal(result[0].status, "APPROVED");
  assert.equal(result[1].name, "order_update");
  assert.equal(result[1].status, "PENDING");
  assert.ok(capturedUrl.includes("waba_test_999/message_templates"));
  assert.equal(capturedAuth, "Bearer secret_token_123");
});

test("listWabaMessageTemplates: paginates through multiple pages with cursor", async () => {
  const pageRequests: string[] = [];

  const fakeFetch = async (url: string | URL | Request) => {
    const urlStr = String(url);
    pageRequests.push(urlStr);

    if (urlStr.includes("after=cursor_page_1")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: "201", name: "page_2_template", language: "en_US", status: "APPROVED" },
          ],
          paging: {}, // no more
        }),
      } as Response;
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: "101", name: "page_1_template", language: "en_US", status: "APPROVED" },
        ],
        paging: {
          cursors: {
            after: "cursor_page_1",
          },
        },
      }),
    } as Response;
  };

  const result = await listWabaMessageTemplates({
    wabaId: "waba_paged",
    accessToken: "token_abc",
    limit: 1, // trigger pagination after 1 item
    fetchImpl: fakeFetch as any,
  });

  assert.equal(result.length, 2);
  assert.equal(result[0].name, "page_1_template");
  assert.equal(result[1].name, "page_2_template");
  assert.equal(pageRequests.length, 2);
  assert.ok(pageRequests[1].includes("after=cursor_page_1"));
});

test("listWabaMessageTemplates: throws MetaGraphTemplateError on API error without exposing token", async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({
      error: {
        message: "Invalid OAuth access token.",
        type: "OAuthException",
        code: 190,
      },
    }),
  } as Response);

  await assert.rejects(
    async () => {
      await listWabaMessageTemplates({
        wabaId: "waba_fail",
        accessToken: "super_secret_token",
        fetchImpl: fakeFetch as any,
      });
    },
    (err: any) => {
      assert.ok(err instanceof MetaGraphTemplateError);
      assert.equal(err.status, 401);
      assert.equal(err.errorCode, "meta_auth_error");
      assert.ok(!err.message.includes("super_secret_token"));
      return true;
    }
  );
});

test("sendWabaTemplateMessage: sends template successfully and returns real WAMID", async () => {
  let capturedPayload: any = null;

  const fakeFetch = async (_url: string | URL | Request, init?: RequestInit) => {
    capturedPayload = JSON.parse(String(init?.body || "{}"));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        messaging_product: "whatsapp",
        contacts: [{ input: "195545134641", wa_id: "195545134641" }],
        messages: [{ id: "wamid.HBgNNzk1MDM3NDAwMzQ0FQIAERgSRTk0OTM3REE4ODRDODg1QjQ1AA==" }],
      }),
    } as Response;
  };

  const result = await sendWabaTemplateMessage({
    phoneNumberId: "phone_123456",
    accessToken: "access_token_xyz",
    to: "+92 300 1234567",
    templateName: "order_followup",
    languageCode: "en_US",
    components: [
      {
        type: "body",
        parameters: [{ type: "text", text: "John" }],
      },
    ],
    fetchImpl: fakeFetch as any,
  });

  assert.equal(result.success, true);
  assert.equal(result.providerMessageId, "wamid.HBgNNzk1MDM3NDAwMzQ0FQIAERgSRTk0OTM3REE4ODRDODg1QjQ1AA==");
  assert.equal(capturedPayload.type, "template");
  assert.equal(capturedPayload.template.name, "order_followup");
  assert.equal(capturedPayload.template.language.code, "en_US");
  assert.equal(capturedPayload.to, "195545134641");
  assert.deepEqual(capturedPayload.template.components, [
    {
      type: "body",
      parameters: [{ type: "text", text: "John" }],
    },
  ]);
});

test("sendWabaTemplateMessage: fails when recipient is invalid", async () => {
  const result = await sendWabaTemplateMessage({
    phoneNumberId: "phone_123456",
    accessToken: "access_token_xyz",
    to: "invalid-number-xyz",
    templateName: "order_followup",
    languageCode: "en_US",
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, "invalid_recipient");
});

test("sendWabaTemplateMessage: handles Meta API error cleanly", async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      error: {
        message: "(#100) Param template['components'] has invalid values",
        type: "OAuthException",
        code: 100,
      },
    }),
  } as Response);

  const result = await sendWabaTemplateMessage({
    phoneNumberId: "phone_123456",
    accessToken: "access_token_xyz",
    to: "contact-e4ed32210a80@example.invalid",
    templateName: "invalid_template",
    languageCode: "en_US",
    fetchImpl: fakeFetch as any,
  });

  assert.equal(result.success, false);
  assert.ok(result.errorCode);
  assert.equal(result.retryable, false);
});

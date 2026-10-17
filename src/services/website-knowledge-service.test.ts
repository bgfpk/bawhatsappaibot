import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { __websiteKnowledgeTestUtils } from "./website-knowledge-service.ts";

describe("website knowledge helpers", () => {
  it("creates deterministic account-scoped knowledge IDs", () => {
    const input = { siteUrl: "https://shop.example.com", sourceItemId: "42", type: "page" };
    const first = __websiteKnowledgeTestUtils.websiteKnowledgeStableId("account_1", input);
    const second = __websiteKnowledgeTestUtils.websiteKnowledgeStableId("account_1", input);
    const other = __websiteKnowledgeTestUtils.websiteKnowledgeStableId("account_2", input);

    assert.equal(first, second);
    assert.notEqual(first, other);
    assert.match(first, /^wk_[a-f0-9]{24}$/);
  });

  it("strips scripts, styles, HTML, and shortcodes from synced content", () => {
    const cleaned = __websiteKnowledgeTestUtils.sanitizeWebsiteKnowledgeContent(
      '<style>.x{}</style><script>alert("x")</script><h1>Title</h1>[gallery ids="1"] Body <strong>text</strong>',
    );

    assert.equal(cleaned.includes("script"), false);
    assert.equal(cleaned.includes("gallery"), false);
    assert.equal(cleaned, "Title Body text");
  });

  it("builds public knowledge rows without exposing oversized content", () => {
    const row = __websiteKnowledgeTestUtils.publicKnowledgeItem("account_1", {
      siteUrl: "https://shop.example.com",
      sourceItemId: "home",
      title: "Home",
      content: "Hello ".repeat(4000),
      botId: "bot_1",
      type: "post",
    });

    assert.equal(row.accountId, "account_1");
    assert.equal(row.botId, "bot_1");
    assert.equal(row.title, "Home");
    assert.equal(row.type, "post");
    assert.equal(row.sourceType, "WordPress");
    assert.equal(row.status, "active");
    assert.equal(row.contentHash.length, 16);
    assert.ok(row.content.length <= 12000);
  });

  it("builds safe failed sync rows without content or secrets", () => {
    const failed = __websiteKnowledgeTestUtils.publicFailedKnowledgeItem("account_1", {
      siteUrl: "https://shop.example.com",
      sourceItemId: "99",
      title: "Private draft",
      url: "https://shop.example.com/private",
      content: "secret body should not appear",
    }, "Knowledge title or content is required.");

    assert.equal(failed.accountId, "account_1");
    assert.equal(failed.sourceItemId, "99");
    assert.equal(failed.title, "Private draft");
    assert.equal((failed as any).content, undefined);
    assert.match(failed.errorReason, /required/);
  });

  it("accepts single and batch public sync payloads with a safe batch limit", () => {
    const single = __websiteKnowledgeTestUtils.normalizeWebsiteKnowledgeSyncInputs({ title: "Home" });
    const batch = __websiteKnowledgeTestUtils.normalizeWebsiteKnowledgeSyncInputs({ items: [{ title: "A" }, { title: "B" }] });

    assert.equal(single.length, 1);
    assert.equal(batch.length, 2);
    assert.throws(
      () => __websiteKnowledgeTestUtils.normalizeWebsiteKnowledgeSyncInputs({ items: Array.from({ length: 21 }, (_, index) => ({ title: `Item ${index}` })) }),
      /up to 20 items/,
    );
  });

  it("builds public batch results without raw synced content", () => {
    const accepted = __websiteKnowledgeTestUtils.acceptedKnowledgeItem({
      id: "wk_1",
      sourceItemId: "42",
      title: "Home",
      type: "page",
      url: "https://shop.example.com",
      status: "active",
      content: "raw body must not be returned",
      contentLength: 32,
      contentHash: "abc123",
    });
    const failed = __websiteKnowledgeTestUtils.failedKnowledgeItem({
      sourceItemId: "43",
      title: "Bad item",
      type: "post",
      url: "https://shop.example.com/bad",
      errorReason: "Validation failed",
      failedAt: 123,
      content: "raw body must not be returned",
    });

    assert.equal((accepted as any).content, undefined);
    assert.equal((failed as any).content, undefined);
    assert.equal(accepted.contentHash, "abc123");
    assert.equal(failed.errorReason, "Validation failed");
  });

  it("sorts synced and failed overview rows newest first", () => {
    const synced = __websiteKnowledgeTestUtils.sortKnowledgeItemsForOverview([
      { id: "old", lastSyncedAt: 10 },
      { id: "new", lastSyncedAt: 30 },
      { id: "middle", updatedAt: 20 },
    ]);
    const failed = __websiteKnowledgeTestUtils.sortFailedKnowledgeItemsForOverview([
      { id: "fail_old", failedAt: 100 },
      { id: "fail_new", failedAt: 300 },
    ]);

    assert.deepEqual(synced.map((item: any) => item.id), ["new", "middle", "old"]);
    assert.deepEqual(failed.map((item: any) => item.id), ["fail_new", "fail_old"]);
  });

  it("selects AI snippets by bot scope, relevance, and hard limits", () => {
    const snippets = __websiteKnowledgeTestUtils.selectWebsiteKnowledgeSnippets([
      {
        id: "wk_1",
        botId: "bot_a",
        title: "Return Policy",
        type: "page",
        url: "https://shop.example.com/returns",
        content: "Returns are accepted within seven days for unused products.",
        lastSyncedAt: 10,
      },
      {
        id: "wk_2",
        botId: "bot_b",
        title: "Hidden Bot B",
        type: "page",
        content: "Should not be used.",
        lastSyncedAt: 20,
      },
      {
        id: "wk_3",
        botId: "",
        title: "Delivery",
        type: "post",
        content: "Delivery takes two to four business days.",
        lastSyncedAt: 30,
      },
    ], { botId: "bot_a", query: "what is return policy", maxItems: 2, maxChars: 280 });

    assert.equal(snippets.length, 2);
    assert.equal(snippets.some((item) => item.title === "Hidden Bot B"), false);
    assert.equal(snippets[0].title, "Return Policy");
    const prompt = __websiteKnowledgeTestUtils.renderWebsiteKnowledgePromptSection(snippets);
    assert.match(prompt, /Website Knowledge/);
    assert.match(prompt, /Returns are accepted/);
    assert.ok(prompt.length < 600);
  });
});

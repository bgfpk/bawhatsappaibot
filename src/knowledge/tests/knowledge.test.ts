import test from "node:test";
import assert from "node:assert/strict";
import { normalizeKnowledgeSource } from "../knowledge-model";

test("normalizeKnowledgeSource: parses raw website knowledge source correctly", () => {
  const item = normalizeKnowledgeSource({
    $id: "ks_101",
    url: "https://blackarrow.ai/faq",
    crawled: true,
  });

  assert.equal(item.id, "ks_101");
  assert.equal(item.url, "https://blackarrow.ai/faq");
  assert.equal(item.status, "ready");
});

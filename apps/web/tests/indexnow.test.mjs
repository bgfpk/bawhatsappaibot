import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  INDEXNOW_HOST,
  INDEXNOW_KEY,
  INDEXNOW_KEY_LOCATION,
  INDEXNOW_API_ENDPOINT,
  filterValidBlackArrowUrls,
} from "../../../scripts/submit-indexnow.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../..");

test("IndexNow: verification key file exists and matches protocol configuration", () => {
  const keyFilePath = path.join(rootDir, "apps/web/public", `${INDEXNOW_KEY}.txt`);
  assert.ok(fs.existsSync(keyFilePath), `Key file must exist at ${keyFilePath}`);

  const content = fs.readFileSync(keyFilePath, "utf8").trim();
  assert.equal(content, INDEXNOW_KEY, "Key file content must match INDEXNOW_KEY string");
  assert.equal(INDEXNOW_HOST, "blackarrow-source.offline.invalid", "Host must be blackarrow-source.offline.invalid");
  assert.equal(INDEXNOW_API_ENDPOINT, "https://api.indexnow.org/indexnow", "Must use official IndexNow endpoint");
  assert.equal(INDEXNOW_KEY_LOCATION, `https://blackarrow-source.offline.invalid/${INDEXNOW_KEY}.txt`, "Key location URL must match");
});

test("IndexNow: URL filtering strictly allows only valid blackarrow-source.offline.invalid URLs", () => {
  const testUrls = [
    "https://blackarrow-source.offline.invalid/whatsapp-automation",
    "https://blackarrow-source.offline.invalid/pricing",
    "http://blackarrow-source.offline.invalid/insecure", // Rejected (not https)
    "https://spam-site.com/blackarrow", // Rejected (wrong domain)
    "https://blackarrow-source.offline.invalid/page", // Rejected (subdomain)
    "not-a-valid-url", // Rejected (invalid format)
    "https://blackarrow-source.offline.invalid/whatsapp-automation", // Duplicate
  ];

  const filtered = filterValidBlackArrowUrls(testUrls);
  assert.deepEqual(filtered, [
    "https://blackarrow-source.offline.invalid/whatsapp-automation",
    "https://blackarrow-source.offline.invalid/pricing",
  ]);
});

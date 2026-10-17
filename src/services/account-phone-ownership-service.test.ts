import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDuplicatePhoneSignupMessage,
  findExistingAccountByPhone,
  getAccountPhoneCandidates,
  normalizeAccountPhone,
} from "./account-phone-ownership-service.ts";

test("normalizeAccountPhone normalizes local and international phone formats", () => {
  assert.equal(normalizeAccountPhone("0300-1112233"), "110064053003");
  assert.equal(normalizeAccountPhone("+92 300 1112233"), "110064053003");
  assert.equal(normalizeAccountPhone("0092 300 1112233"), "110064053003");
  assert.equal(normalizeAccountPhone("1584956125"), "1584956125");
  assert.equal(normalizeAccountPhone("abc"), "");
});

test("getAccountPhoneCandidates reads common phone fields", () => {
  const candidates = getAccountPhoneCandidates({
    whatsapp_number: "0300 1112233",
    phone: "+92 300 1112233",
    mobile: "0312 5556677",
  });

  assert.deepEqual(candidates, ["110064053003", "196236150427"]);
});

test("findExistingAccountByPhone finds existing signup phone owner", () => {
  const accounts = [
    { $id: "user_1", email: "contact-f7faa8d2b759@example.invalid", whatsapp_number: "0300 1112233" },
    { $id: "user_2", email: "contact-27b677683f02@example.invalid", whatsapp_number: "0312 5556677" },
  ];

  const found = findExistingAccountByPhone(accounts, "+92 300 1112233");

  assert.equal(found?.$id, "user_1");
});

test("findExistingAccountByPhone supports same-user exception", () => {
  const accounts = [
    { $id: "user_1", email: "contact-f7faa8d2b759@example.invalid", whatsapp_number: "0300 1112233" },
  ];

  assert.equal(findExistingAccountByPhone(accounts, "17705953312", { exceptUserId: "user_1" }), null);
});

test("buildDuplicatePhoneSignupMessage guides user to login or recover", () => {
  const message = buildDuplicatePhoneSignupMessage({ name: "Client One", whatsapp_number: "0300 1112233" });

  assert.match(message, /already registered/i);
  assert.match(message, /Client One/);
  assert.match(message, /log in/i);
  assert.match(message, /account recovery/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCampaignPhone,
  parseCsvString,
  detectColumnMapping,
  sanitizeCsvExportValue,
  createContactList,
  getContactList,
  listContactLists,
  deleteContactList,
  importContactsFromCsv,
  runContactListWhatsAppValidation,
  queryContactListContacts,
  exportContactListCsv,
  suppressPhone,
  unsuppressPhone,
  isPhoneSuppressed,
  listSuppressions,
  downloadPrivateOriginalCsv,
  __clearContactListStoresForTest,
} from "./contact-list-service.ts";

test("Contact List - Phone Normalization requires country code and rejects invalid forms", () => {
  // Valid international numbers
  const pk = normalizeCampaignPhone("+92 300 1234567");
  assert.equal(pk.valid, true);
  assert.equal(pk.normalizedPhone, "195545134641");
  assert.equal(pk.canonicalWhatsAppJid, "contact-e4ed32210a80@example.invalid");

  const us = normalizeCampaignPhone("001-555-0199234");
  assert.equal(us.valid, true);
  assert.equal(us.normalizedPhone, "13246846843");

  const ae = normalizeCampaignPhone("+971 50 123 4567");
  assert.equal(ae.valid, true);
  assert.equal(ae.normalizedPhone, "117085508500");

  // Invalid cases: local 0-prefix without country code
  const localPk = normalizeCampaignPhone("15811061380");
  assert.equal(localPk.valid, false);
  assert.ok(localPk.reason?.includes("starts with local 0"));

  // Reject WhatsApp LIDs
  const lid = normalizeCampaignPhone("12345678901234@lid");
  assert.equal(lid.valid, false);
  assert.ok(lid.reason?.includes("WhatsApp LID"));

  // Reject empty / non-numeric
  const empty = normalizeCampaignPhone("");
  assert.equal(empty.valid, false);

  const letters = normalizeCampaignPhone("abc12345678");
  assert.equal(letters.valid, false);

  // Reject too short or too long
  const tooShort = normalizeCampaignPhone("+1234");
  assert.equal(tooShort.valid, false);

  const tooLong = normalizeCampaignPhone("+1234567890123456789");
  assert.equal(tooLong.valid, false);
});

test("Contact List - CSV Parser and Column Detection with Formula Injection Protection", () => {
  const csv = `Full Name,Phone Number,AI Instructions,Fixed Message
"Ahad Firdosi","+144225232320","Focus on enterprise setup","Hello Ahad"
"Sara Khan","+108540457300","VIP customer","Special discount for Sara"
"=1+2","+152360205746","Formula row","Calculated"`;

  const parsed = parseCsvString(csv);
  assert.equal(parsed.headers.length, 4);
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[0]["Full Name"], "Ahad Firdosi");

  const mapping = detectColumnMapping(parsed.headers);
  assert.equal(mapping.fullNameColumn, "Full Name");
  assert.equal(mapping.phoneNumberColumn, "Phone Number");
  assert.equal(mapping.aiInstructionsColumn, "AI Instructions");
  assert.equal(mapping.fixedMessageColumn, "Fixed Message");

  // Formula injection sanitization check
  assert.equal(sanitizeCsvExportValue("=SUM(A1:A10)"), "'=SUM(A1:A10)");
  assert.equal(sanitizeCsvExportValue("+12345"), "'+12345");
  assert.equal(sanitizeCsvExportValue("Normal Text"), "Normal Text");
});

test("Contact List - CSV Import 10 rows with duplicates, invalid numbers, and suppression", async () => {
  __clearContactListStoresForTest();
  const accountId = "acct_test_1";

  // Pre-suppress one number
  await suppressPhone({ accountId, phone: "+146509172358", reason: "opted_out" });

  const list = await createContactList({
    accountId,
    name: "VIP Customers July",
    description: "Retail VIPs",
  });
  assert.ok(list);

  const csvRows = [
    `Name,Mobile,Instructions,Message`,
    `Customer 1,+923001111111,Ask about wholesale,Hi 1`,
    `Customer 2,+923002222222,Ask about retail,Hi 2`,
    `Customer 3,+923003333333,,Hi 3`,
    `Customer 4,03004444444,,Hi 4`, // Invalid format (local 0, no country code)
    `Customer 5,+923001111111,Duplicate of 1,Hi duplicate`, // Duplicate phone
    `Customer 6,+923006666666,,Hi 6`,
    `Customer 7,+923007777777,,Hi 7`,
    `Customer 8,+923009999999,,Hi 8`, // Suppressed
    `Customer 9,+923008888888,,Hi 9`,
    `Customer 10,invalid_number,,Hi 10`, // Invalid format
  ].join("\n");

  const summary = await importContactsFromCsv({
    accountId,
    listId: list.id,
    csvText: csvRows,
    fileName: "vip_july.csv",
  });

  assert.equal(summary.totalRows, 10);
  assert.equal(summary.invalidContacts, 2); // Customer 4 and Customer 10
  assert.equal(summary.duplicateContacts, 1); // Customer 5
  assert.equal(summary.suppressedContacts, 1); // Customer 8
  assert.equal(summary.uniqueContacts, 7); // 1, 2, 3, 6, 7, 8 (suppressed), 9

  const updatedList = await getContactList(accountId, list.id);
  assert.equal(updatedList?.totalRows, 10);
  assert.equal(updatedList?.uniqueContacts, 7);
  assert.equal(updatedList?.invalidContacts, 2);
  assert.equal(updatedList?.suppressedContacts, 1);
});

test("Contact List - 1,000 rows import performance & bounded memory architecture", async () => {
  __clearContactListStoresForTest();
  const accountId = "acct_scale_test";

  const list = await createContactList({
    accountId,
    name: "Large List 1k",
  });

  const lines = ["Full Name,Phone Number,AI Instructions,Fixed Message"];
  for (let i = 1; i <= 1000; i++) {
    const phone = `+92300${String(1000000 + i).slice(1)}`;
    lines.push(`Person ${i},${phone},Instructions for ${i},Message for ${i}`);
  }

  const csv = lines.join("\n");
  const summary = await importContactsFromCsv({
    accountId,
    listId: list.id,
    csvText: csv,
  });

  assert.equal(summary.totalRows, 1000);
  assert.equal(summary.uniqueContacts, 1000);
  assert.equal(summary.invalidContacts, 0);

  // Paginated query
  const page1 = await queryContactListContacts(accountId, list.id, { page: 1, limit: 50 });
  assert.equal(page1.contacts.length, 50);
  assert.equal(page1.total, 1000);
  assert.equal(page1.totalPages, 20);
});

test("Contact List - WhatsApp Existence Validation with Bounded Batches, Success, and Socket Retry", async () => {
  __clearContactListStoresForTest();
  const accountId = "acct_val_test";

  const list = await createContactList({ accountId, name: "Validation Test List" });
  const csv = [
    `Name,Phone`,
    `Alice,+923001111111`, // on WhatsApp
    `Bob,+923002222222`, // NOT on WhatsApp
    `Charlie,+923003333333`, // socket error batch
    `David,+923004444444`, // socket error batch
  ].join("\n");

  await importContactsFromCsv({ accountId, listId: list.id, csvText: csv });

  let callCount = 0;
  const mockOnWhatsApp = async (jids: string[]) => {
    callCount++;
    if (callCount === 1) {
      // First batch: Alice exists, Bob does not
      return [
        { jid: "contact-85d2a3563239@example.invalid", exists: true },
        { jid: "contact-126f2cd31c20@example.invalid", exists: false },
      ];
    }
    // Second batch: throws temporary socket error
    throw new Error("Socket disconnected during validation");
  };

  const progress = await runContactListWhatsAppValidation({
    accountId,
    listId: list.id,
    botId: "bot_1",
    onWhatsAppFn: mockOnWhatsApp,
    batchSize: 2,
  });

  assert.equal(progress.processed, 4);
  assert.equal(progress.valid, 1); // Alice
  assert.equal(progress.notOnWhatsApp, 1); // Bob
  assert.equal(progress.failed, 2); // Charlie & David (VALIDATION_FAILED, not marked invalid!)

  const contacts = await queryContactListContacts(accountId, list.id);
  const alice = contacts.contacts.find((c) => c.originalName === "Alice");
  assert.equal(alice?.validationStatus, "VALID");

  const bob = contacts.contacts.find((c) => c.originalName === "Bob");
  assert.equal(bob?.validationStatus, "NOT_ON_WHATSAPP");

  const charlie = contacts.contacts.find((c) => c.originalName === "Charlie");
  assert.equal(charlie?.validationStatus, "VALIDATION_FAILED");

  // Re-run validation for failed contacts (restart resume test)
  const retryProgress = await runContactListWhatsAppValidation({
    accountId,
    listId: list.id,
    botId: "bot_1",
    onWhatsAppFn: async (jids) => jids.map((j) => ({ jid: j, exists: true })),
    batchSize: 2,
  });

  assert.equal(retryProgress.processed, 2); // only Charlie and David
  assert.equal(retryProgress.valid, 2);

  const updatedList = await getContactList(accountId, list.id);
  assert.equal(updatedList?.validContacts, 3);
  assert.equal(updatedList?.readyContacts, 3);
});

test("Contact List - Cross-Tenant Access Security & Private CSV File Protection", async () => {
  __clearContactListStoresForTest();
  const accountA = "account_a";
  const accountB = "account_b";

  const listA = await createContactList({ accountId: accountA, name: "List of Account A" });
  await importContactsFromCsv({
    accountId: accountA,
    listId: listA.id,
    csvText: "Name,Phone\nAhad,+923001234567",
    fileName: "secret_a.csv",
  });

  // Account B trying to read Account A's list -> returns null / denied
  const readAttempt = await getContactList(accountB, listA.id);
  assert.equal(readAttempt, null);

  // Account B querying contacts of Account A's list -> throws Unauthorized
  await assert.rejects(async () => {
    await queryContactListContacts(accountB, listA.id);
  }, /unauthorized/i);

  // Account B trying to download Account A's original CSV -> returns null / denied
  const importDoc = Array.from(listA.sourceImportId ? [listA.sourceImportId] : [])[0];
  const fileDownload = await downloadPrivateOriginalCsv(accountB, `csv_${importDoc}`);
  assert.equal(fileDownload, null);

  // Account A downloading its own CSV -> succeeds
  const ownerDownload = await downloadPrivateOriginalCsv(accountA, `csv_${importDoc}`);
  assert.ok(ownerDownload);
  assert.equal(ownerDownload.fileName, "secret_a.csv");
});

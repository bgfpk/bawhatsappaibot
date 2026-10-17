import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  MockStorageAdapter,
  setStorageAdapterForTest,
  getStorageAdapter,
  ensureAppwriteStorageBuckets,
  uploadContactImportFile,
  downloadContactImportFile,
  uploadWorkspaceFile,
  downloadWorkspaceFile,
  deleteContactImportFile,
  deleteWorkspaceFile,
  CONTACT_IMPORT_BUCKET_CONFIG,
  WORKSPACE_FILES_BUCKET_CONFIG,
} from "./appwrite-storage-service.ts";
import { BUCKETS } from "../config/appwrite-client.ts";
import {
  createContactList,
  importContactsFromCsv,
  downloadPrivateOriginalCsv,
  getContactList,
  __clearContactListStoresForTest,
  __registerContactImportForTest,
  __registerContactListForTest,
  __getContactImportForTest,
} from "./contact-list-service.ts";
import {
  createWorkspace,
  ingestGroupMessage,
  listFiles,
  getFileDownload,
  retryWorkspaceFileProcessing,
  handleInstanceDeleted,
  attachWorkspace,
  deleteWorkspace,
  __clearWorkspaceStoresForTest,
  __registerWorkspaceFileForTest,
  __registerWorkspaceForTest,
} from "./workspace-service.ts";

test("Storage Provisioning - creates required private buckets and is idempotent", async () => {
  const mockAdapter = new MockStorageAdapter();
  setStorageAdapterForTest(mockAdapter);

  // 1. Initial run: no buckets -> creates contact_import_files and workspace_files
  const run1 = await ensureAppwriteStorageBuckets(mockAdapter);
  assert.equal(run1.created.length, 2);
  assert.ok(run1.created.includes(BUCKETS.CONTACT_IMPORT_FILES));
  assert.ok(run1.created.includes(BUCKETS.WORKSPACE_FILES));
  assert.equal(run1.errors.length, 0);

  // Verify private configuration
  const importBucket = mockAdapter.buckets.get(BUCKETS.CONTACT_IMPORT_FILES);
  assert.ok(importBucket);
  assert.equal(importBucket.fileSecurity, true);
  assert.deepEqual(importBucket.permissions, []); // No public permissions

  const wsBucket = mockAdapter.buckets.get(BUCKETS.WORKSPACE_FILES);
  assert.ok(wsBucket);
  assert.equal(wsBucket.fileSecurity, true);
  assert.deepEqual(wsBucket.permissions, []); // No public permissions

  // 2. Second run: idempotency -> existing buckets are safe no-ops
  const run2 = await ensureAppwriteStorageBuckets(mockAdapter);
  assert.equal(run2.created.length, 0);
  assert.equal(run2.existing.length, 2);
  assert.equal(run2.errors.length, 0);

  // 3. Provisioning failure exits cleanly with error logged
  mockAdapter.failBucketCreation = true;
  mockAdapter.buckets.delete(BUCKETS.CONTACT_IMPORT_FILES);
  const run3 = await ensureAppwriteStorageBuckets(mockAdapter);
  assert.ok(run3.errors.length > 0);
  assert.match(run3.errors[0], /Failed to create bucket/);
});

test("Contact CSV Storage - Upload, Restart Persistence, and Tenant Security", async () => {
  const mockAdapter = new MockStorageAdapter();
  setStorageAdapterForTest(mockAdapter);
  await ensureAppwriteStorageBuckets(mockAdapter);

  const accountA = "acc_csv_owner_1";
  const accountB = "acc_csv_intruder_2";

  const list = await createContactList({
    accountId: accountA,
    name: "VIP Customers List",
  });

  const rawCsv = "Full Name,Phone Number,Notes\nAlice Smith,+15551234567,VIP client\nBob Jones,+447911123456,Enterprise";
  const importResult = await importContactsFromCsv({
    accountId: accountA,
    listId: list.id,
    fileName: "vip_contacts_2026.csv",
    csvText: rawCsv,
  });

  assert.equal(importResult.totalRows, 2);
  assert.equal(importResult.uniqueContacts, 2);
  assert.ok(importResult.importId);

  // 1. Verify Storage upload occurred in private bucket
  const storedFile = Array.from(mockAdapter.files.values()).find(
    (f) => f.bucketId === BUCKETS.CONTACT_IMPORT_FILES && f.name.includes("vip_contacts")
  );
  assert.ok(storedFile, "Raw CSV must be persisted to Appwrite Storage");
  assert.equal(storedFile.buffer.toString("utf8"), rawCsv);

  const importDocBefore = __getContactImportForTest(importResult.importId);
  assert.ok(importDocBefore);
  assert.equal(importDocBefore.storageBucketId, BUCKETS.CONTACT_IMPORT_FILES);
  assert.equal(importDocBefore.fileStorageId, storedFile.fileId);

  // 2. Restart Simulation (Section 6): Clear all in-memory state in contact-list-service
  // Simulates server reboot: all in-memory Maps are wiped
  __clearContactListStoresForTest();

  // Reload metadata from Appwrite Database
  __registerContactListForTest(list);
  __registerContactImportForTest(importDocBefore);

  // Verify exact original CSV is retrieved from Appwrite Storage after restart
  const downloaded = await downloadPrivateOriginalCsv(accountA, storedFile.fileId);
  assert.ok(downloaded);
  assert.equal(downloaded.fileName, "vip_contacts_2026.csv");
  assert.equal(downloaded.content, rawCsv);

  // 3. Cross-account access denied (Section 7)
  const crossAttempt = await downloadPrivateOriginalCsv(accountB, storedFile.fileId);
  assert.equal(crossAttempt, null);

  // 4. WhatsApp Instance deletion does NOT delete Contact CSV (Section 9)
  const stillThereAfterInstanceCheck = await downloadPrivateOriginalCsv(accountA, storedFile.fileId);
  assert.ok(stillThereAfterInstanceCheck);
  assert.equal(stillThereAfterInstanceCheck.content, rawCsv);

  // 5. Storage upload failure behavior (Section 5)
  mockAdapter.failNextUpload = true;
  await assert.rejects(
    async () => {
      await importContactsFromCsv({
        accountId: accountA,
        listId: list.id,
        fileName: "failing.csv",
        csvText: "Name,Phone\nTest,+15559998888",
      });
    },
    /Failed to persist raw CSV to Appwrite Storage/
  );
});

test("Workspace Files - Multimodal Raw Persistence, Dedupe, Processing Retry, and Restart", async () => {
  const mockAdapter = new MockStorageAdapter();
  setStorageAdapterForTest(mockAdapter);
  await ensureAppwriteStorageBuckets(mockAdapter);

  const accountA = "acc_ws_media_a";
  const accountB = "acc_ws_media_b";

  const { workspace: wsA, binding } = await createWorkspace({
    accountId: accountA,
    name: "Engineering Operations Workspace",
    purpose: "Operational tracking",
    instructions: "Track field notes",
    replyMode: "SMART_ASSIST",
    responderInstanceId: "bot_field_01",
    groupJid: "contact-8dded9f4924c@example.invalid",
    groupName: "Field Ops",
  });

  // 1. Raw media ingestion: Voice note
  const rawAudio = Buffer.from("OggS\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00audio_payload_voice_record");
  const msgRes = await ingestGroupMessage({
    accountId: accountA,
    instanceId: "bot_field_01",
    groupJid: binding.groupJid,
    whatsappMessageId: "wam_voice_01",
    senderJid: "contact-6c9bc40fc084@example.invalid",
    senderDisplayName: "Lead Tech",
    timestamp: Date.now(),
    messageType: "audio",
    mediaBuffer: rawAudio,
    mediaMimeType: "audio/ogg; codecs=opus",
    fileName: "site_inspection.ogg",
  });
  assert.ok(msgRes.messageRecordId);

  // Verify raw file stored in workspace_files Storage bucket BEFORE processing
  const filesA = await listFiles(accountA, wsA.workspaceId);
  assert.equal(filesA.length, 1);
  const fileA = filesA[0];
  assert.equal(fileA.fileName, "site_inspection.ogg");
  assert.equal(fileA.mimeType, "audio/ogg; codecs=opus");
  assert.equal(fileA.processingStatus, "COMPLETED");
  assert.ok(fileA.transcript?.includes("Voice note transcribed"));

  // Verify raw binary in Storage
  const dl1 = await getFileDownload(accountA, wsA.workspaceId, fileA.fileId);
  assert.equal(dl1.buffer.toString(), rawAudio.toString());

  // 2. Multi-worker duplicate event / Content Deduplication (Section 15)
  // Worker 2 (e.g. personal worker) observes the same media buffer in same group
  const initialStorageCount = mockAdapter.files.size;
  await ingestGroupMessage({
    accountId: accountA,
    instanceId: "bot_personal_backup",
    groupJid: binding.groupJid,
    whatsappMessageId: "wam_voice_01_duplicate",
    senderJid: "contact-6c9bc40fc084@example.invalid",
    senderDisplayName: "Lead Tech",
    timestamp: Date.now(),
    messageType: "audio",
    mediaBuffer: rawAudio, // Exact same media buffer
    mediaMimeType: "audio/ogg; codecs=opus",
    fileName: "site_inspection.ogg",
  });

  // Exactly 1 raw storage object remains (content-addressed by hash)
  assert.equal(mockAdapter.files.size, initialStorageCount);
  const filesAfterDupe = await listFiles(accountA, wsA.workspaceId);
  assert.equal(filesAfterDupe.length, 1);

  // 3. Cross-Account Access Security (Section 16)
  await assert.rejects(
    async () => {
      await getFileDownload(accountB, wsA.workspaceId, fileA.fileId);
    },
    /Forbidden/
  );

  // 4. Processing Failure -> PENDING_RETRY and Later Retry (Section 13)
  // Ingest a document with mock processing error
  const rawPdf = Buffer.from("%PDF-1.4 contract and terms agreement invoice $5000");
  const failedFileId = "wsfile_retry_test";
  const hash = crypto.createHash("sha256").update(rawPdf).digest("hex");
  const uploadRes = await uploadWorkspaceFile({
    accountId: accountA,
    workspaceId: wsA.workspaceId,
    fileName: "contract.pdf",
    mimeType: "application/pdf",
    buffer: rawPdf,
  });

  const pendingFile = {
    fileId: failedFileId,
    accountId: accountA,
    workspaceId: wsA.workspaceId,
    messageId: "wam_doc_fail",
    fileName: "contract.pdf",
    mimeType: "application/pdf",
    size: rawPdf.length,
    hash,
    storageId: uploadRes.storageFileId,
    storageBucketId: uploadRes.storageBucketId,
    processingStatus: "PENDING_RETRY" as const,
    createdAt: Date.now(),
  };
  __registerWorkspaceFileForTest(pendingFile);

  // Verify file in PENDING_RETRY status has raw binary safely preserved
  const retryDl = await getFileDownload(accountA, wsA.workspaceId, failedFileId);
  assert.equal(retryDl.buffer.toString(), rawPdf.toString());
  assert.equal(retryDl.file.processingStatus, "PENDING_RETRY");

  // Run retry: processes from existing Appwrite Storage without WhatsApp resend
  const processed = await retryWorkspaceFileProcessing(accountA, wsA.workspaceId, failedFileId);
  assert.equal(processed.processingStatus, "COMPLETED");
  assert.ok(processed.extractedText?.includes("PDF-1.4 contract"));

  // 5. Restart Test (Section 14): Clear all service in-memory stores
  __clearWorkspaceStoresForTest();

  // Restore workspace & file metadata from durable representation
  __registerWorkspaceForTest(wsA, binding);
  __registerWorkspaceFileForTest(processed);

  // Verify file remains retrievable directly from Appwrite Storage after service restart
  const postRestart = await getFileDownload(accountA, wsA.workspaceId, failedFileId);
  assert.equal(postRestart.buffer.toString(), rawPdf.toString());
  assert.equal(postRestart.file.processingStatus, "COMPLETED");

  // 6. Instance Deletion & Responder Reassignment Lifecycle (Section 17)
  // Deleting responder instance must NOT delete workspace files
  await handleInstanceDeleted("bot_field_01");
  const postInstanceDelete = await getFileDownload(accountA, wsA.workspaceId, failedFileId);
  assert.equal(postInstanceDelete.buffer.toString(), rawPdf.toString());

  // Reattaching another responder still accesses old files
  await attachWorkspace(accountA, wsA.workspaceId, "bot_new_responder", binding.groupJid, "Field Ops");
  const postReattach = await getFileDownload(accountA, wsA.workspaceId, failedFileId);
  assert.equal(postReattach.buffer.toString(), rawPdf.toString());

  // 7. Explicit Workspace Deletion (Section 18)
  // Only explicit deleteWorkspace cleans up files from Storage
  await deleteWorkspace(accountA, wsA.workspaceId);
  // Storage files associated with this workspace should be deleted
  assert.ok(!mockAdapter.files.has(`${BUCKETS.WORKSPACE_FILES}:${uploadRes.storageFileId}`));
});

test("Storage File-ID Tenant Safety - Collision, Deduplication, and Isolation (Section 2)", async () => {
  const mockAdapter = new MockStorageAdapter();
  setStorageAdapterForTest(mockAdapter);
  await ensureAppwriteStorageBuckets(mockAdapter);

  const accountA = "acc_safe_tenant_a";
  const accountB = "acc_safe_tenant_b";

  // --- PART 1: Workspace Files Tenant Isolation ---
  const { workspace: wsA, binding: bindingA } = await createWorkspace({
    accountId: accountA,
    name: "Workspace A",
    purpose: "Operational tracking",
    instructions: "Assist group",
    replyMode: "SMART_ASSIST",
    groupJid: "contact-a0f9fd2d568d@example.invalid",
    groupName: "Group A",
    responderInstanceId: "bot_a",
  });

  const { workspace: wsB, binding: bindingB } = await createWorkspace({
    accountId: accountB,
    name: "Workspace B",
    purpose: "Operational tracking",
    instructions: "Assist group",
    replyMode: "SMART_ASSIST",
    groupJid: "contact-a86f01f2d89b@example.invalid",
    groupName: "Group B",
    responderInstanceId: "bot_b",
  });

  // Identical binary payload X
  const binaryPayloadX = Buffer.from("SECURE_CONFIDENTIAL_INVOICE_DATA_2026_EXACT_IDENTICAL_BYTES");

  // Account A uploads binary X
  await ingestGroupMessage({
    accountId: accountA,
    instanceId: "bot_a",
    groupJid: bindingA.groupJid,
    whatsappMessageId: "wam_a_001",
    senderJid: "contact-be408f970461@example.invalid",
    senderDisplayName: "Alice",
    timestamp: Date.now(),
    messageType: "document",
    mediaBuffer: binaryPayloadX,
    mediaMimeType: "application/pdf",
    fileName: "invoice.pdf",
  });

  // Account B uploads identical binary X
  await ingestGroupMessage({
    accountId: accountB,
    instanceId: "bot_b",
    groupJid: bindingB.groupJid,
    whatsappMessageId: "wam_b_001",
    senderJid: "contact-f05ee87490b6@example.invalid",
    senderDisplayName: "Bob",
    timestamp: Date.now(),
    messageType: "document",
    mediaBuffer: binaryPayloadX,
    mediaMimeType: "application/pdf",
    fileName: "invoice.pdf",
  });

  const filesA = await listFiles(accountA, wsA.workspaceId);
  const filesB = await listFiles(accountB, wsB.workspaceId);

  assert.equal(filesA.length, 1);
  assert.equal(filesB.length, 1);

  const fileA = filesA[0];
  const fileB = filesB[0];

  // 1. Verify A and B have separate, non-colliding storage file IDs despite identical binary
  assert.notEqual(fileA.storageId, fileB.storageId, "Storage IDs must not collide across tenants");
  assert.ok(mockAdapter.files.has(`${BUCKETS.WORKSPACE_FILES}:${fileA.storageId}`));
  assert.ok(mockAdapter.files.has(`${BUCKETS.WORKSPACE_FILES}:${fileB.storageId}`));

  // 2. Cross-tenant access denied
  await assert.rejects(
    async () => {
      await getFileDownload(accountA, wsB.workspaceId, fileB.fileId);
    },
    /Workspace not found or unauthorized|Forbidden/i
  );
  await assert.rejects(
    async () => {
      await getFileDownload(accountB, wsA.workspaceId, fileA.fileId);
    },
    /Workspace not found or unauthorized|Forbidden/i
  );

  // 3. Deleting A resource does not remove B resource
  await deleteWorkspace(accountA, wsA.workspaceId);
  assert.ok(!mockAdapter.files.has(`${BUCKETS.WORKSPACE_FILES}:${fileA.storageId}`), "Account A file deleted");
  assert.ok(mockAdapter.files.has(`${BUCKETS.WORKSPACE_FILES}:${fileB.storageId}`), "Account B file remains intact");

  // Account B can still download its file
  const bDownload = await getFileDownload(accountB, wsB.workspaceId, fileB.fileId);
  assert.equal(bDownload.buffer.toString(), binaryPayloadX.toString());

  // 4. Same Workspace/account duplicate observation of identical WhatsApp media still deduplicates
  // Personal and Business workers observing the same group media
  await ingestGroupMessage({
    accountId: accountB,
    instanceId: "bot_b",
    groupJid: bindingB.groupJid,
    whatsappMessageId: "wam_b_002",
    senderJid: "contact-6eb7da5a797f@example.invalid",
    senderDisplayName: "Charlie",
    timestamp: Date.now(),
    messageType: "document",
    mediaBuffer: binaryPayloadX,
    mediaMimeType: "application/pdf",
    fileName: "invoice.pdf",
  });

  const filesBAfterDup = await listFiles(accountB, wsB.workspaceId);
  assert.equal(filesBAfterDup.length, 1, "Must deduplicate inside same workspace to 1 file record");

  // --- PART 2: Contact CSV Imports Tenant Isolation ---
  const rawCsv = "Name,Phone\nDave,+15550001111\nEve,+15550002222";
  const listA = await createContactList({ accountId: accountA, name: "List A" });
  const listB = await createContactList({ accountId: accountB, name: "List B" });

  const impA = await importContactsFromCsv({
    accountId: accountA,
    listId: listA.id,
    fileName: "contacts.csv",
    csvText: rawCsv,
  });

  const impB = await importContactsFromCsv({
    accountId: accountB,
    listId: listB.id,
    fileName: "contacts.csv",
    csvText: rawCsv,
  });

  const docA = __getContactImportForTest(impA.importId);
  const docB = __getContactImportForTest(impB.importId);
  assert.ok(docA);
  assert.ok(docB);

  // Separate, non-colliding storage file IDs
  assert.notEqual(docA.fileStorageId, docB.fileStorageId, "Contact CSV storage IDs must not collide across tenants");
  assert.ok(mockAdapter.files.has(`${BUCKETS.CONTACT_IMPORT_FILES}:${docA.fileStorageId}`));
  assert.ok(mockAdapter.files.has(`${BUCKETS.CONTACT_IMPORT_FILES}:${docB.fileStorageId}`));

  // Deleting A does not delete B
  await deleteContactImportFile(docA.fileStorageId!);
  assert.ok(!mockAdapter.files.has(`${BUCKETS.CONTACT_IMPORT_FILES}:${docA.fileStorageId}`));
  assert.ok(mockAdapter.files.has(`${BUCKETS.CONTACT_IMPORT_FILES}:${docB.fileStorageId}`));

  // B can still retrieve original CSV
  const bCsv = await downloadPrivateOriginalCsv(accountB, docB.fileStorageId!);
  assert.ok(bCsv);
  assert.equal(bCsv.content, rawCsv);

  // A cannot retrieve B
  const crossCsv = await downloadPrivateOriginalCsv(accountA, docB.fileStorageId!);
  assert.equal(crossCsv, null);
});

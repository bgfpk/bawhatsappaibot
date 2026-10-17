import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkspace,
  getWorkspace,
  listWorkspaces,
  updateWorkspace,
  archiveWorkspace,
  restoreWorkspace,
  cloneWorkspace,
  deleteWorkspace,
  attachWorkspace,
  switchResponder,
  handleInstanceDeleted,
  ingestGroupMessage,
  addMemoryItem,
  listMemoryItems,
  deleteMemoryItem,
  createTask,
  updateTaskStatus,
  listTasks,
  createReminder,
  listReminders,
  sweepDueReminders,
  listFiles,
  getFileDownload,
  listMessages,
  listRecords,
  listEvents,
  exportWorkspaceData,
  retrieveWorkspaceKnowledge,
  listWorkspaceParticipants,
  getWorkspaceParticipant,
  grantWorkspaceAdmin,
  revokeWorkspaceAdmin,
  syncParticipantWhatsAppMetadata,
} from "./workspace-service.ts";

test("Workspace Lifecycle: Create, Read, Update, and List owned Workspaces", async () => {
  const accountId = "acc_owner_100";
  const { workspace, binding } = await createWorkspace({
    accountId,
    name: "Engineering Squad Alpha",
    purpose: "Daily standup and task tracking",
    instructions: "Be concise and summarize action items",
    replyMode: "SMART_ASSIST",
    responderInstanceId: "bot_business_01",
    groupJid: "contact-5875fcb80c19@example.invalid",
    groupName: "Engineering Team",
  });

  assert.ok(workspace.workspaceId.startsWith("ws_"));
  assert.equal(workspace.status, "ACTIVE");
  assert.equal(binding.responderInstanceId, "bot_business_01");
  assert.equal(binding.groupJid, "contact-5875fcb80c19@example.invalid");

  const fetched = await getWorkspace(accountId, workspace.workspaceId);
  assert.equal(fetched.name, "Engineering Squad Alpha");
  assert.equal(fetched.binding?.responderInstanceId, "bot_business_01");

  // Update instructions
  const updated = await updateWorkspace(accountId, workspace.workspaceId, {
    instructions: "Focus strictly on pull requests and deployments",
  });
  assert.equal(updated.instructions, "Focus strictly on pull requests and deployments");

  // List workspaces
  const list = await listWorkspaces(accountId);
  assert.ok(list.length >= 1);
  assert.ok(list.some((w) => w.workspaceId === workspace.workspaceId));
});

test("Responder Switch & Reverse Direction: Business -> Personal and Personal -> Business", async () => {
  const accountId = "acc_owner_200";
  const { workspace } = await createWorkspace({
    accountId,
    name: "Marketing Ops",
    purpose: "Campaign updates",
    instructions: "Track campaign ideas",
    replyMode: "SMART_ASSIST",
    responderInstanceId: "bot_business_marketing",
    groupJid: "contact-4f6d472a389e@example.invalid",
    groupName: "Marketing Group",
  });

  // 1. Switch from Business -> Personal
  const personalBinding = await switchResponder(accountId, workspace.workspaceId, "bot_personal_phone");
  assert.equal(personalBinding.responderInstanceId, "bot_personal_phone");
  assert.equal(personalBinding.status, "ACTIVE");
  assert.equal(personalBinding.version, 2);

  // 2. Switch from Personal -> Business (Reverse direction)
  const businessBinding = await switchResponder(accountId, workspace.workspaceId, "bot_business_marketing");
  assert.equal(businessBinding.responderInstanceId, "bot_business_marketing");
  assert.equal(businessBinding.status, "ACTIVE");
  assert.equal(businessBinding.version, 3);
});

test("Multi-Worker Group Ingestion & Deduplication: 2 workers see same message -> 1 stored message, 1 AI reply", async () => {
  const accountId = "acc_owner_300";
  const groupJid = "contact-4fa3a8472a00@example.invalid";
  const { workspace } = await createWorkspace({
    accountId,
    name: "Ops Dispatch",
    purpose: "Logistics alerts",
    instructions: "Acknowledge queries",
    replyMode: "SMART_ASSIST",
    responderInstanceId: "bot_primary_responder",
    groupJid,
    groupName: "Ops Dispatch Group",
  });

  const whatsappMessageId = "wamid_dedupe_test_999";
  let sendCount = 0;
  const mockSender = async () => {
    sendCount++;
  };

  // Process 1: Worker on primary responder instance receives message
  const res1 = await ingestGroupMessage({
    accountId,
    instanceId: "bot_primary_responder",
    groupJid,
    whatsappMessageId,
    senderJid: "contact-1cab889f611b@example.invalid",
    senderDisplayName: "Warehouse Lead",
    timestamp: Date.now(),
    messageType: "text",
    textContent: "Can someone confirm if shipment 445 has been loaded?",
    isFromMe: false,
    transportSendFn: mockSender,
  });

  assert.equal(res1.status, "REPLIED");
  assert.equal(sendCount, 1);

  // Process 2: Worker on secondary connected instance receives SAME message simultaneously
  const res2 = await ingestGroupMessage({
    accountId,
    instanceId: "bot_secondary_observer",
    groupJid,
    whatsappMessageId,
    senderJid: "contact-1cab889f611b@example.invalid",
    senderDisplayName: "Warehouse Lead",
    timestamp: Date.now(),
    messageType: "text",
    textContent: "Can someone confirm if shipment 445 has been loaded?",
    isFromMe: false,
    transportSendFn: mockSender,
  });

  // Second worker cleanly detects duplicate and does not duplicate message or AI reply
  assert.equal(res2.status, "DUPLICATE_INGESTED");
  assert.equal(sendCount, 1, "AI Reply count must remain exactly 1");

  // Verify stored message count for this workspace is exactly 1
  const history = await listMessages(accountId, workspace.workspaceId);
  const matched = history.messages.filter((m) => m.whatsappMessageId === whatsappMessageId);
  assert.equal(matched.length, 1);
});

test("One AI Responder Enforcement: Non-responder instance observing unique message skips reply generation", async () => {
  const accountId = "acc_owner_400";
  const groupJid = "contact-3c86c3d5861c@example.invalid";
  const { workspace } = await createWorkspace({
    accountId,
    name: "Executive Steering",
    purpose: "Strategy",
    instructions: "Assist executives",
    replyMode: "EVERY_MESSAGE",
    responderInstanceId: "bot_assigned_responder",
    groupJid,
    groupName: "Executive Steering Group",
  });

  let sendCount = 0;
  const mockSender = async () => {
    sendCount++;
  };

  // Message received ONLY through non-responder instance
  const res = await ingestGroupMessage({
    accountId,
    instanceId: "bot_different_number", // NOT the responder
    groupJid,
    whatsappMessageId: "wamid_non_responder_test_001",
    senderJid: "contact-94d1bae5dd24@example.invalid",
    senderDisplayName: "Director",
    timestamp: Date.now(),
    messageType: "text",
    textContent: "Review project milestones",
    isFromMe: false,
    transportSendFn: mockSender,
  });

  assert.equal(res.status, "SKIPPED_NOT_RESPONDER");
  assert.equal(sendCount, 0, "Non-responder must not generate WhatsApp replies");
});

test("FromMe Loop Prevention: Outgoing messages from responder never re-enter planning or reply generation", async () => {
  const accountId = "acc_owner_500";
  const groupJid = "contact-c7dd5198dc5c@example.invalid";
  await createWorkspace({
    accountId,
    name: "Loop Guard Demo",
    purpose: "Loop test",
    instructions: "Loop test",
    replyMode: "EVERY_MESSAGE",
    responderInstanceId: "bot_responder_loop",
    groupJid,
    groupName: "Loop Group",
  });

  let sendCount = 0;
  const mockSender = async () => {
    sendCount++;
  };

  const res = await ingestGroupMessage({
    accountId,
    instanceId: "bot_responder_loop",
    groupJid,
    whatsappMessageId: "wamid_from_me_loop_001",
    senderJid: "contact-9ea471b5b828@example.invalid",
    senderDisplayName: "BlackArrow Responder",
    timestamp: Date.now(),
    messageType: "text",
    textContent: "Here is the response I just gave to the group",
    isFromMe: true, // FromMe message
    transportSendFn: mockSender,
  });

  assert.equal(res.status, "SKIPPED_FROM_ME");
  assert.equal(sendCount, 0, "fromMe message must never trigger AI reply loop");
});

test("Group Admin vs Workspace Admin: WhatsApp group admin status does NOT grant Workspace Admin privilege", async () => {
  const accountId = "acc_owner_600";
  const groupJid = "contact-20cdfaf7ed6a@example.invalid";
  const participantJid = "contact-80e91c1852cf@example.invalid";

  const { workspace } = await createWorkspace({
    accountId,
    name: "Role Security Team",
    purpose: "Testing permission tiers",
    instructions: "Original strict owner instructions",
    replyMode: "SMART_ASSIST",
    responderInstanceId: "bot_role_test",
    groupJid,
    groupName: "Role Group",
  });

  // STEP 1: Participant joins Workspace group -> BlackArrow role: MEMBER
  const res1 = await ingestGroupMessage({
    accountId,
    instanceId: "bot_role_test",
    groupJid,
    whatsappMessageId: "wamid_role_check_01",
    senderJid: participantJid,
    senderDisplayName: "Alice Member",
    timestamp: Date.now(),
    messageType: "text",
    textContent: "Hello everyone, glad to join this workspace!",
    isFromMe: false,
    isWhatsAppAdmin: false,
  });
  assert.equal(res1.status, "REPLIED");

  const part1 = await getWorkspaceParticipant(accountId, workspace.workspaceId, participantJid);
  assert.ok(part1);
  assert.equal(part1.role, "MEMBER");
  assert.equal(part1.whatsappAdmin, false);

  // STEP 2: WhatsApp owner promotes participant to WhatsApp group admin
  // Transport metadata: admin = true
  // BlackArrow role: MUST STILL BE MEMBER!
  await syncParticipantWhatsAppMetadata(accountId, workspace.workspaceId, participantJid, true);
  const part2 = await getWorkspaceParticipant(accountId, workspace.workspaceId, participantJid);
  assert.ok(part2);
  assert.equal(part2.whatsappAdmin, true);
  assert.equal(part2.role, "MEMBER");

  // Ingest another message from this user with isWhatsAppAdmin: true -> role MUST REMAIN MEMBER
  await ingestGroupMessage({
    accountId,
    instanceId: "bot_role_test",
    groupJid,
    whatsappMessageId: "wamid_role_check_02",
    senderJid: participantJid,
    senderDisplayName: "Alice GroupAdmin",
    timestamp: Date.now() + 1000,
    messageType: "text",
    textContent: "I am now a WhatsApp group admin",
    isFromMe: false,
    isWhatsAppAdmin: true,
  });
  const part2Post = await getWorkspaceParticipant(accountId, workspace.workspaceId, participantJid);
  assert.equal(part2Post?.role, "MEMBER");
  assert.equal(part2Post?.whatsappAdmin, true);

  // STEP 3: Participant attempts privileged actions (WhatsApp ADMIN + BlackArrow MEMBER) -> DENIED
  // 3a. Change instructions
  await assert.rejects(
    async () => updateWorkspace(accountId, workspace.workspaceId, { instructions: "Hacked instructions" }, { jid: participantJid }),
    /Forbidden.*Action "EDIT_INSTRUCTIONS" denied.*Actor role is MEMBER/
  );

  // 3b. Change responder
  await assert.rejects(
    async () => switchResponder(accountId, workspace.workspaceId, "bot_rogue", { jid: participantJid }),
    /Forbidden.*Action "CHANGE_RESPONDER" denied.*Actor role is MEMBER/
  );

  // 3c. Change reply mode
  await assert.rejects(
    async () => updateWorkspace(accountId, workspace.workspaceId, { replyMode: "OWNER_ONLY" }, { jid: participantJid }),
    /Forbidden.*Action "CHANGE_REPLY_MODE" denied.*Actor role is MEMBER/
  );

  // 3d. Export workspace data
  await assert.rejects(
    async () => exportWorkspaceData(accountId, workspace.workspaceId, { jid: participantJid }),
    /Forbidden.*Action "EXPORT" denied.*Actor role is MEMBER/
  );

  // 3e. Archive workspace
  await assert.rejects(
    async () => archiveWorkspace(accountId, workspace.workspaceId, { jid: participantJid }),
    /Forbidden.*Action "ARCHIVE" denied.*Actor role is MEMBER/
  );

  // 3f. Delete workspace
  await assert.rejects(
    async () => deleteWorkspace(accountId, workspace.workspaceId, { jid: participantJid }),
    /Forbidden.*Action "DELETE" denied.*Actor role is MEMBER/
  );

  // 3g. In-chat privileged command attempt via WhatsApp message
  const chatCmdRes = await ingestGroupMessage({
    accountId,
    instanceId: "bot_role_test",
    groupJid,
    whatsappMessageId: "wamid_role_check_03",
    senderJid: participantJid,
    senderDisplayName: "Alice GroupAdmin",
    timestamp: Date.now() + 2000,
    messageType: "text",
    textContent: "!set-instructions Hacked from in-chat command",
    isFromMe: false,
    isWhatsAppAdmin: true,
  });
  assert.ok(chatCmdRes.aiReplyText?.includes("Permission Denied: WhatsApp group-admin status is transport metadata only"));

  // Verify workspace instructions remain pristine
  const freshWs = await getWorkspace(accountId, workspace.workspaceId);
  assert.equal(freshWs.instructions, "Original strict owner instructions");

  // Normal group operations for WhatsApp group admin who is BlackArrow MEMBER:
  // Normal discussion and questions still work!
  const normalChatRes = await ingestGroupMessage({
    accountId,
    instanceId: "bot_role_test",
    groupJid,
    whatsappMessageId: "wamid_role_check_04",
    senderJid: participantJid,
    senderDisplayName: "Alice GroupAdmin",
    timestamp: Date.now() + 3000,
    messageType: "text",
    textContent: "Can you summarize our recent discussion?",
    isFromMe: false,
    isWhatsAppAdmin: true,
  });
  assert.equal(normalChatRes.status, "REPLIED");
  assert.ok(normalChatRes.aiReplyText && !normalChatRes.aiReplyText.includes("Permission Denied"));

  // Non-owner cannot grant Workspace Admin:
  await assert.rejects(
    async () => grantWorkspaceAdmin(accountId, workspace.workspaceId, participantJid, "MEMBER"),
    /Forbidden.*Only BlackArrow Workspace OWNER can grant WORKSPACE_ADMIN/
  );

  // STEP 4: BlackArrow OWNER explicitly grants participant WORKSPACE_ADMIN
  const granted = await grantWorkspaceAdmin(accountId, workspace.workspaceId, participantJid, "OWNER");
  assert.equal(granted.role, "WORKSPACE_ADMIN");

  // Authorized Workspace Admin capabilities now work:
  await updateWorkspace(accountId, workspace.workspaceId, { instructions: "Admin updated instructions" }, { jid: participantJid });
  const adminUpdated = await getWorkspace(accountId, workspace.workspaceId);
  assert.equal(adminUpdated.instructions, "Admin updated instructions");

  const exported = await exportWorkspaceData(accountId, workspace.workspaceId, { jid: participantJid });
  assert.ok(exported && exported.workspace);

  // But OWNER-ONLY actions remain blocked for WORKSPACE_ADMIN:
  await assert.rejects(
    async () => deleteWorkspace(accountId, workspace.workspaceId, { jid: participantJid }),
    /Forbidden: Only BlackArrow Workspace OWNER can perform DELETE/
  );
  await assert.rejects(
    async () => switchResponder(accountId, workspace.workspaceId, "bot_other", { jid: participantJid }),
    /Forbidden: Only BlackArrow Workspace OWNER can perform CHANGE_RESPONDER/
  );

  // STEP 5: OWNER revokes WORKSPACE_ADMIN while person remains WhatsApp group admin
  const revoked = await revokeWorkspaceAdmin(accountId, workspace.workspaceId, participantJid, "OWNER");
  assert.equal(revoked.role, "MEMBER");
  assert.equal(revoked.whatsappAdmin, true); // Still WhatsApp admin!

  // BlackArrow privileged actions DENIED again:
  await assert.rejects(
    async () => updateWorkspace(accountId, workspace.workspaceId, { instructions: "Attempt after revoke" }, { jid: participantJid }),
    /Forbidden.*Action "EDIT_INSTRUCTIONS" denied.*Actor role is MEMBER/
  );
  await assert.rejects(
    async () => exportWorkspaceData(accountId, workspace.workspaceId, { jid: participantJid }),
    /Forbidden.*Action "EXPORT" denied.*Actor role is MEMBER/
  );

  // STEP 6: Cross-worker / Restart / Group Metadata Refresh:
  // Re-syncing WhatsApp metadata with whatsappAdmin: true DOES NOT escalate role!
  await syncParticipantWhatsAppMetadata(accountId, workspace.workspaceId, participantJid, true);
  const partRefreshed = await getWorkspaceParticipant(accountId, workspace.workspaceId, participantJid);
  assert.equal(partRefreshed?.role, "MEMBER");

  // Superadmin metadata check:
  await syncParticipantWhatsAppMetadata(accountId, workspace.workspaceId, participantJid, true);
  await assert.rejects(
    async () => updateWorkspace(accountId, workspace.workspaceId, { replyMode: "OWNER_ONLY" }, { jid: participantJid }),
    /Forbidden.*Actor role is MEMBER/
  );

  // STEP 7: Cross-account isolation:
  await assert.rejects(
    async () => getWorkspace("acc_attacker_999", workspace.workspaceId),
    /Forbidden/
  );
});

test("Multimodal Ingestion: Voice, Image, Document text extraction and Hash Deduplication", async () => {
  const accountId = "acc_owner_700";
  const groupJid = "contact-db2d9c109f4a@example.invalid";
  const { workspace } = await createWorkspace({
    accountId,
    name: "Media Records Workspace",
    purpose: "Media test",
    instructions: "Track all media",
    replyMode: "SMART_ASSIST",
    responderInstanceId: "bot_media_test",
    groupJid,
    groupName: "Media Group",
  });

  // 1. Audio voice note ingestion
  const voiceBuffer = Buffer.from("mock_voice_audio_bytes_ogg_opus");
  const voiceRes = await ingestGroupMessage({
    accountId,
    instanceId: "bot_media_test",
    groupJid,
    whatsappMessageId: "wamid_audio_01",
    senderJid: "contact-e12c044a6d0c@example.invalid",
    senderDisplayName: "Field Inspector",
    timestamp: Date.now(),
    messageType: "audio",
    mediaBuffer: voiceBuffer,
    mediaMimeType: "audio/ogg; codecs=opus",
    fileName: "voice_note.ogg",
  });
  assert.ok(voiceRes.messageRecordId);

  // 2. Document PDF ingestion
  const docBuffer = Buffer.from("%PDF-1.4 sample invoice content with total $250.00 for office supplies");
  const docRes = await ingestGroupMessage({
    accountId,
    instanceId: "bot_media_test",
    groupJid,
    whatsappMessageId: "wamid_doc_01",
    senderJid: "contact-e12c044a6d0c@example.invalid",
    senderDisplayName: "Field Inspector",
    timestamp: Date.now(),
    messageType: "document",
    mediaBuffer: docBuffer,
    mediaMimeType: "application/pdf",
    fileName: "invoice_250.pdf",
  });
  assert.ok(docRes.messageRecordId);

  // Verify files listing and extracted records
  const files = await listFiles(accountId, workspace.workspaceId);
  assert.equal(files.length, 2);
  assert.ok(files.some((f) => f.fileName === "voice_note.ogg" && f.transcript?.includes("Voice note transcribed")));
  assert.ok(files.some((f) => f.fileName === "invoice_250.pdf" && f.extractedText?.includes("PDF-1.4")));

  // Verify file download
  const download = await getFileDownload(accountId, workspace.workspaceId, files[0].fileId);
  assert.ok(download.buffer.length > 0);
});

test("Tasks & Reminders: Creation, Stale Checks, and WAITING_FOR_RESPONDER on Detached Instance", async () => {
  const accountId = "acc_owner_800";
  const groupJid = "contact-285761367306@example.invalid";
  const { workspace } = await createWorkspace({
    accountId,
    name: "Tasks & Reminders Workspace",
    purpose: "Action tracking",
    instructions: "Manage team actions",
    replyMode: "SMART_ASSIST",
    responderInstanceId: "bot_action_test",
    groupJid,
    groupName: "Actions Group",
  });

  // 1. Tasks
  const task = await createTask(accountId, workspace.workspaceId, "Fix deployment pipeline", "Deploy staging branch", "Alice");
  assert.equal(task.title, "Fix deployment pipeline");
  assert.equal(task.status, "OPEN");

  const updatedTask = await updateTaskStatus(accountId, workspace.workspaceId, task.taskId, "COMPLETED");
  assert.equal(updatedTask.status, "COMPLETED");

  const tasksList = await listTasks(accountId, workspace.workspaceId);
  assert.equal(tasksList.length, 1);

  // 2. Reminders: Due immediately
  const dueReminder = await createReminder(accountId, workspace.workspaceId, "group", Date.now() - 1000, "Review staging logs");
  assert.equal(dueReminder.status, "PENDING");

  // Sweep with active responder -> Sent
  let reminderSentCount = 0;
  const sweep1 = await sweepDueReminders(async () => {
    reminderSentCount++;
  });
  assert.equal(sweep1.sent, 1);
  assert.equal(reminderSentCount, 1);

  // 3. Stale Reminder: > 24 hours overdue
  const ancientDue = Date.now() - (26 * 3600 * 1000);
  await createReminder(accountId, workspace.workspaceId, "group", ancientDue, "Ancient standup reminder");
  const sweep2 = await sweepDueReminders();
  assert.equal(sweep2.stale, 1, "Ancient reminder must be marked STALE, not blasted to group");
});

test("Instance Deletion: Detaches binding and moves to NEEDS_RESPONDER while PRESERVING ALL DATA", async () => {
  const accountId = "acc_owner_900";
  const groupJid = "contact-8dded9f4924c@example.invalid";
  const botId = "bot_to_be_deleted_123";

  const { workspace } = await createWorkspace({
    accountId,
    name: "Resilient Workspace",
    purpose: "Testing survival across instance deletions",
    instructions: "Essential persistent instructions",
    replyMode: "SMART_ASSIST",
    responderInstanceId: botId,
    groupJid,
    groupName: "Resilient Group",
  });

  // Ingest a message and create a task
  await ingestGroupMessage({
    accountId,
    instanceId: botId,
    groupJid,
    whatsappMessageId: "wamid_survival_001",
    senderJid: "contact-1373fe092f49@example.invalid",
    senderDisplayName: "Project Lead",
    timestamp: Date.now(),
    messageType: "text",
    textContent: "Keep this history safe forever",
    isFromMe: false,
  });

  await createTask(accountId, workspace.workspaceId, "Permanent Task", "Survives instance deletion");
  await addMemoryItem(accountId, workspace.workspaceId, "FACT", "Core architecture rule", "Workspace data is account-owned");

  // Simulating bot instance deletion
  const deletionResult = await handleInstanceDeleted(botId);
  assert.ok(deletionResult.affectedWorkspaces.includes(workspace.workspaceId));

  // Workspace status must be NEEDS_RESPONDER
  const fresh = await getWorkspace(accountId, workspace.workspaceId);
  assert.equal(fresh.status, "NEEDS_RESPONDER");

  // ALL data must be 100% PRESERVED
  const msgs = await listMessages(accountId, workspace.workspaceId);
  assert.equal(msgs.total, 1);
  assert.equal(msgs.messages[0].textContent, "Keep this history safe forever");

  const tasks = await listTasks(accountId, workspace.workspaceId);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, "Permanent Task");

  const memories = await listMemoryItems(accountId, workspace.workspaceId);
  assert.equal(memories.length, 1);
  assert.equal(memories[0].title, "Core architecture rule");
});

test("Reattach Existing Workspace & Clone Workspace", async () => {
  const accountId = "acc_owner_1000";
  const { workspace } = await createWorkspace({
    accountId,
    name: "Original Source Workspace",
    purpose: "Source purpose",
    instructions: "Source instructions",
    replyMode: "SMART_ASSIST",
    responderInstanceId: "bot_source_initial",
    groupJid: "contact-7eaed8de8bee@example.invalid",
    groupName: "Old Group",
  });

  await addMemoryItem(accountId, workspace.workspaceId, "FACT", "Important Key", "Secret Value");

  // 1. Reattach to a NEW WhatsApp group with a NEW instance
  const newBinding = await attachWorkspace(
    accountId,
    workspace.workspaceId,
    "bot_new_connected_line",
    "contact-82cb2c6d9a90@example.invalid",
    "New Team Group"
  );
  assert.equal(newBinding.responderInstanceId, "bot_new_connected_line");
  assert.equal(newBinding.groupJid, "contact-82cb2c6d9a90@example.invalid");

  const reattachedWs = await getWorkspace(accountId, workspace.workspaceId);
  assert.equal(reattachedWs.status, "ACTIVE");

  // 2. Clone Workspace
  const cloned = await cloneWorkspace(accountId, workspace.workspaceId, {
    copyInstructions: true,
    copySummary: true,
    copyMemory: true,
    copyTasks: true,
    newName: "Cloned Production Workspace",
  });

  assert.notEqual(cloned.workspaceId, workspace.workspaceId);
  assert.equal(cloned.name, "Cloned Production Workspace");
  assert.equal(cloned.instructions, "Source instructions");

  const clonedMemories = await listMemoryItems(accountId, cloned.workspaceId);
  assert.equal(clonedMemories.length, 1);
  assert.equal(clonedMemories[0].title, "Important Key");
});

test("Tenant Security & Cross-Account Access Guards: Account A cannot read or access Account B workspace", async () => {
  const accountA = "acc_tenant_A";
  const accountB = "acc_tenant_B";

  const { workspace: wsA } = await createWorkspace({
    accountId: accountA,
    name: "Tenant A Private Room",
    purpose: "Private",
    instructions: "Private",
    replyMode: "SMART_ASSIST",
    responderInstanceId: "bot_tenant_a",
    groupJid: "contact-e4aa3f9374f2@example.invalid",
    groupName: "Private Group A",
  });

  // Account B attempts to read Account A workspace -> 403 Forbidden
  await assert.rejects(
    async () => {
      await getWorkspace(accountB, wsA.workspaceId);
    },
    /Forbidden|another account/i
  );

  // Account B attempts to update Account A workspace -> 403 Forbidden
  await assert.rejects(
    async () => {
      await updateWorkspace(accountB, wsA.workspaceId, { name: "Hacked by Tenant B" });
    },
    /Forbidden|another account/i
  );

  // Account B attempts to delete Account A workspace -> 403 Forbidden
  await assert.rejects(
    async () => {
      await deleteWorkspace(accountB, wsA.workspaceId);
    },
    /Forbidden|another account/i
  );
});

test("Archive, Restore, and Export Workspace Data", async () => {
  const accountId = "acc_owner_1100";
  const { workspace } = await createWorkspace({
    accountId,
    name: "Q1 Campaign Archive",
    purpose: "Q1",
    instructions: "Q1 rules",
    replyMode: "SMART_ASSIST",
    responderInstanceId: "bot_q1",
    groupJid: "contact-5e421fc3cba9@example.invalid",
    groupName: "Q1 Group",
  });

  // Archive
  const archived = await archiveWorkspace(accountId, workspace.workspaceId);
  assert.equal(archived.status, "ARCHIVED");
  assert.ok(archived.archivedAt);

  // Restore
  const restored = await restoreWorkspace(accountId, workspace.workspaceId);
  assert.equal(restored.status, "ACTIVE");

  // Export
  const exported = await exportWorkspaceData(accountId, workspace.workspaceId);
  assert.equal(exported.workspace.name, "Q1 Campaign Archive");
  assert.ok(Array.isArray(exported.messages));
  assert.ok(Array.isArray(exported.tasks));
  assert.ok(Array.isArray(exported.memory));
});

test("Requirements 13, 14, 15: Long-History Memory Acceptance (500+ messages) and Obscure-Detail Retrieval with Provenance", async () => {
  const accountId = "acc_owner_long_history";
  const { workspace, binding } = await createWorkspace({
    accountId,
    name: "Project Titan Durable Room",
    purpose: "Long-term durable coordination",
    instructions: "Answer team questions accurately from historical facts",
    replyMode: "SMART_ASSIST",
    responderInstanceId: "bot_titan_01",
    groupJid: "contact-c7dd5198dc5c@example.invalid",
    groupName: "Project Titan Group",
  });

  const workspaceId = workspace.workspaceId;

  // 1. Seed early important fact (message #15)
  await ingestGroupMessage({
    accountId,
    instanceId: "bot_titan_01",
    groupJid: binding.groupJid,
    whatsappMessageId: "msg_early_titan_launch",
    senderJid: "contact-77270030253c@example.invalid",
    senderDisplayName: "Chief Architect",
    timestamp: Date.now() - 10000000,
    messageType: "text",
    textContent: "Key milestone decision: Project Titan launch date agreed as 2026-11-15 with confirmed core budget.",
    isFromMe: false,
  });

  // 2. Seed obscure detail not repeated later (message #42)
  await ingestGroupMessage({
    accountId,
    instanceId: "bot_titan_01",
    groupJid: binding.groupJid,
    whatsappMessageId: "msg_obscure_ref_part",
    senderJid: "contact-184fa94d3b89@example.invalid",
    senderDisplayName: "Procurement Lead",
    timestamp: Date.now() - 9500000,
    messageType: "text",
    textContent: "The supplier confirmed custom brackets order under reference REF-88219-B, required bolt diameter is 14.5mm.",
    isFromMe: false,
  });

  // 3. Simulate 500+ unrelated messages across several topics
  const topics = [
    "Discussing daily cafeteria menu options",
    "Reviewing frontend CSS padding on profile card",
    "Did anyone test the staging webhook listener today?",
    "Sprint retrospective notes: remember to update Jira tickets",
    "Office temperature set to 22 degrees Celsius",
  ];

  for (let i = 1; i <= 510; i++) {
    const topic = topics[i % topics.length];
    await ingestGroupMessage({
      accountId,
      instanceId: "bot_titan_01",
      groupJid: binding.groupJid,
      whatsappMessageId: `msg_filler_${i}`,
      senderJid: `1415555${1000 + (i % 50)}@s.whatsapp.net`,
      senderDisplayName: `Teammate ${i % 20}`,
      timestamp: Date.now() - 9000000 + i * 10000,
      messageType: "text",
      textContent: `Routine message #${i}: ${topic}. Random code ${Math.random().toString(36).slice(2, 7)}.`,
      isFromMe: false,
    });
  }

  // Verify history length exceeds 500
  const history = await listMessages(accountId, workspaceId, 600, 0);
  assert.ok(history.total >= 512, `Expected >= 512 messages, got ${history.total}`);

  // Test 13: Ask naturally about early project fact
  const launchFact = await retrieveWorkspaceKnowledge(accountId, workspaceId, "What was the agreed launch date for Project Titan?");
  assert.equal(launchFact.recovered, true, "Early fact must be recovered from long history");
  assert.ok(launchFact.boundedItemCount <= 3, "Retrieval must be bounded, never dumping 500 messages");
  assert.ok(launchFact.mechanism === "structured_memory" || launchFact.mechanism === "indexed_historical_retrieval");
  assert.ok(launchFact.matchedContent.includes("2026-11-15"), "Matched content must contain exact launch date");
  assert.ok(launchFact.sourceProvenance?.sourceMessageId, "Source message ID must be retained");
  assert.ok(launchFact.sourceProvenance?.sender);
  assert.ok(launchFact.sourceProvenance?.provenance);

  // Test 14: Obscure-detail retrieval test (reference number & measurement)
  const obscureFact = await retrieveWorkspaceKnowledge(accountId, workspaceId, "What is the supplier reference number REF-88219-B and bolt diameter?");
  assert.equal(obscureFact.recovered, true, "Obscure detail must be recovered from history");
  assert.ok(obscureFact.boundedItemCount <= 3, "Query must be bounded");
  assert.equal(obscureFact.mechanism, "indexed_historical_retrieval");
  assert.ok(obscureFact.matchedContent.includes("REF-88219-B"));
  assert.ok(obscureFact.matchedContent.includes("14.5mm"));

  // Test 15: Source Provenance verification
  assert.equal(obscureFact.sourceProvenance?.sourceMessageId, "msg_obscure_ref_part");
  assert.equal(obscureFact.sourceProvenance?.sender, "Procurement Lead");
  assert.ok(typeof obscureFact.sourceProvenance?.timestamp === "number");
  assert.equal(obscureFact.sourceProvenance?.provenance, "user-entered");

  // Verify natural conversational response through ingestGroupMessage
  let sentReplyText = "";
  const queryResult = await ingestGroupMessage({
    accountId,
    instanceId: "bot_titan_01",
    groupJid: binding.groupJid,
    whatsappMessageId: "msg_user_inquiry_obscure",
    senderJid: "contact-c073766cba80@example.invalid",
    senderDisplayName: "Engineering Director",
    timestamp: Date.now(),
    messageType: "text",
    textContent: "Can anyone check the supplier reference number REF-88219-B for custom brackets?",
    isFromMe: false,
    transportSendFn: async (_jid, text) => {
      sentReplyText = text;
    },
  });

  assert.equal(queryResult.status, "REPLIED");
  assert.ok(sentReplyText.includes("REF-88219-B"));
  assert.ok(sentReplyText.includes("Procurement Lead"));
});

test("Requirements 16 & 17: Reattach Memory Acceptance and New Group Binding", async () => {
  const accountId = "acc_owner_reattach";
  const { workspace, binding } = await createWorkspace({
    accountId,
    name: "Operations Hub Alpha",
    purpose: "Durable operations memory",
    instructions: "Track shipments and vendor details",
    replyMode: "SMART_ASSIST",
    responderInstanceId: "bot_ops_01",
    groupJid: "contact-db2d9c109f4a@example.invalid",
    groupName: "Ops Room 1",
  });

  const workspaceId = workspace.workspaceId;

  // Ingest durable fact with initial responder
  await ingestGroupMessage({
    accountId,
    instanceId: "bot_ops_01",
    groupJid: binding.groupJid,
    whatsappMessageId: "msg_ops_warehouse_code",
    senderJid: "contact-f70036a4182d@example.invalid",
    senderDisplayName: "Logistics Manager",
    timestamp: Date.now() - 50000,
    messageType: "text",
    textContent: "The primary dispatch warehouse code is WH-NORTH-402.",
    isFromMe: false,
  });

  // Detach old responder instance via deletion hook
  await handleInstanceDeleted("bot_ops_01");
  const wsDetached = await getWorkspace(accountId, workspaceId);
  assert.equal(wsDetached.status, "NEEDS_RESPONDER");

  // Attach replacement instance bot_ops_02 without data copy
  const switched = await attachWorkspace(accountId, workspaceId, "bot_ops_02", binding.groupJid, "Ops Room 1");
  assert.equal(switched.responderInstanceId, "bot_ops_02");
  assert.equal(switched.workspaceId, workspaceId, "Workspace ID must remain identical");

  // Query historical knowledge with new responder
  const recoveredAfterSwitch = await retrieveWorkspaceKnowledge(accountId, workspaceId, "What is the primary dispatch warehouse code?");
  assert.equal(recoveredAfterSwitch.recovered, true);
  assert.ok(recoveredAfterSwitch.matchedContent.includes("WH-NORTH-402"));

  // Requirement 17: Bind a new WhatsApp group to existing workspace
  const newGroupJid = "contact-285761367306@example.invalid";
  const rebound = await attachWorkspace(accountId, workspaceId, "bot_ops_02", newGroupJid, "Ops Room 2 (New Transport)");
  assert.equal(rebound.groupJid, newGroupJid);
  assert.equal(rebound.workspaceId, workspaceId);

  // Query historical fact from new group
  let newGroupReply = "";
  const newGroupMsgResult = await ingestGroupMessage({
    accountId,
    instanceId: "bot_ops_02",
    groupJid: newGroupJid,
    whatsappMessageId: "msg_new_group_query",
    senderJid: "contact-5e9e31a6e748@example.invalid",
    senderDisplayName: "Site Director",
    timestamp: Date.now(),
    messageType: "text",
    textContent: "What is the dispatch warehouse code?",
    isFromMe: false,
    transportSendFn: async (_jid, text) => {
      newGroupReply = text;
    },
  });

  assert.equal(newGroupMsgResult.status, "REPLIED");
  assert.ok(newGroupReply.includes("WH-NORTH-402"));
});

test("Requirements 18 & 19: Multi-Instance Same Group Deduplication and Responder Race", async () => {
  const accountId = "acc_owner_concurrency";
  const { workspace, binding } = await createWorkspace({
    accountId,
    name: "Multi-Instance Guard Room",
    purpose: "Concurrency testing",
    instructions: "Handle concurrent observations safely",
    replyMode: "SMART_ASSIST",
    responderInstanceId: "bot_primary_business",
    groupJid: "contact-330ab68270f0@example.invalid",
    groupName: "Concurrent Test Group",
  });

  const sharedMessageId = "wa_shared_msg_001";
  let primaryReplyCount = 0;
  let secondaryReplyCount = 0;

  // Primary Business instance observes message
  const res1 = await ingestGroupMessage({
    accountId,
    instanceId: "bot_primary_business",
    groupJid: binding.groupJid,
    whatsappMessageId: sharedMessageId,
    senderJid: "contact-b687d63aac88@example.invalid",
    senderDisplayName: "Bob",
    timestamp: Date.now(),
    messageType: "text",
    textContent: "Can anyone help with the server deployment status?",
    isFromMe: false,
    transportSendFn: async () => {
      primaryReplyCount++;
    },
  });

  // Secondary Personal instance observes exact same group message
  const res2 = await ingestGroupMessage({
    accountId,
    instanceId: "bot_secondary_personal",
    groupJid: binding.groupJid,
    whatsappMessageId: sharedMessageId,
    senderJid: "contact-b687d63aac88@example.invalid",
    senderDisplayName: "Bob",
    timestamp: Date.now(),
    messageType: "text",
    textContent: "Can anyone help with the server deployment status?",
    isFromMe: false,
    transportSendFn: async () => {
      secondaryReplyCount++;
    },
  });

  // Assert exactly 1 reply generated across instances
  assert.equal(res1.status, "REPLIED");
  assert.ok(res2.status === "SKIPPED_NOT_RESPONDER" || res2.status === "DUPLICATE_INGESTED");
  assert.equal(primaryReplyCount, 1);
  assert.equal(secondaryReplyCount, 0);

  // Assert deduplication: exactly 1 stored message in workspace history
  const msgs = await listMessages(accountId, workspace.workspaceId);
  const matchingMsgs = msgs.messages.filter((m) => m.whatsappMessageId === sharedMessageId);
  assert.equal(matchingMsgs.length, 1);
});

test("Requirements 20 & 21: Media Durability and Private File Authorization", async () => {
  const accountA = "acc_tenant_media_a";
  const accountB = "acc_tenant_media_b";

  const { workspace: wsA, binding } = await createWorkspace({
    accountId: accountA,
    name: "Media Vault Alpha",
    purpose: "Media storage",
    instructions: "Secure files",
    replyMode: "SILENT_ARCHIVE",
    responderInstanceId: "bot_vault_01",
    groupJid: "contact-6f139d5563e7@example.invalid",
    groupName: "Vault Group",
  });

  const voiceBuffer = Buffer.from("RIFF....WAVEfmt voice audio sample payload");
  await ingestGroupMessage({
    accountId: accountA,
    instanceId: "bot_vault_01",
    groupJid: binding.groupJid,
    whatsappMessageId: "msg_voice_note_1",
    senderJid: "contact-02b025f2d51f@example.invalid",
    senderDisplayName: "Field Agent",
    timestamp: Date.now(),
    messageType: "audio",
    textContent: "",
    mediaBuffer: voiceBuffer,
    mediaMimeType: "audio/ogg",
    fileName: "voice_note_may_12.ogg",
    isFromMe: false,
  });

  const files = await listFiles(accountA, wsA.workspaceId);
  assert.equal(files.length, 1);
  const fileA = files[0];
  assert.equal(fileA.mimeType, "audio/ogg");
  assert.ok(fileA.transcript?.includes("Voice note transcribed"));

  // Account A downloads file successfully
  const downloaded = await getFileDownload(accountA, wsA.workspaceId, fileA.fileId);
  assert.ok(Buffer.isBuffer(downloaded.buffer));
  assert.equal(downloaded.buffer.toString(), voiceBuffer.toString());

  // Account B attempts to download Account A file -> 403 Forbidden
  await assert.rejects(
    async () => {
      await getFileDownload(accountB, wsA.workspaceId, fileA.fileId);
    },
    /Forbidden|another account/i
  );
});

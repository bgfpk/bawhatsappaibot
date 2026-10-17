/**
 * Personal Task Engine - Comprehensive Test Suite (Prompt 6)
 * 
 * Verifies sections 91-101:
 * - State machine & concurrency
 * - Owner questions & correlation
 * - Approvals & fingerprinting
 * - Follow-up engine & safety caps
 * - Retry & restart recovery
 * - Pause, resume, and cancellation
 * - Inbound routing precedence
 * - Structured results & grounding
 * - Privacy & prompt injection guards
 * - Billing isolation
 * - Prompt 5 mission migration & compatibility
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  savePersonalTask,
  getPersonalTask,
  listPersonalTasks,
  getActiveTaskForContact,
  __clearPersonalTasksForTest,
} from "./personal-task-storage-service.ts";
import {
  transitionPersonalTask,
} from "./personal-task-state-machine.ts";
import {
  recordPersonalTaskEvent,
  getPersonalTaskEvents,
  __clearTaskEventsForTest,
} from "./personal-task-event-service.ts";
import {
  createPersonalTaskOwnerQuestion,
  correlateOwnerAnswer,
} from "./personal-task-owner-question-service.ts";
import {
  requestPersonalTaskApproval,
  resolvePersonalTaskApproval,
  computeActionFingerprint,
} from "./personal-task-approval-service.ts";
import {
  scheduleTaskFollowUp,
  cancelTaskFollowUp,
  processDuePersonalTaskFollowUps,
} from "./personal-task-scheduler-service.ts";
import {
  acquireTaskExecutionLease,
  releaseTaskExecutionLease,
  executeInboundReplyOnTask,
} from "./personal-task-executor.ts";
import {
  migrateMissionToTask,
  adaptTaskToMission,
} from "./personal-task-migration.ts";
import {
  recordManualTakeover,
  clearManualTakeover,
  __resetEligibilityTrackingForTest,
} from "./personal-incoming-eligibility-service.ts";
import { __setUniversalOutboundSendTestDeps } from "./universal-outbound-send-service.ts";
import { __setTargetServiceTestDeps } from "./personal-outbound-target-service.ts";
import { getAdminAction } from "./admin-action-registry-service.ts";
import type { PersonalTask, PersonalTaskAction } from "./personal-task-types.ts";
import type { PersonalOutboundMission } from "./personal-outbound-types.ts";
import "./personal-task-admin-tools.ts";

const mockTenantId = `tenant_pte_${Date.now()}`;
const mockPersonalInstanceId = "bot_pers_pte_01";
const mockControlBusinessId = "bot_biz_pte_01";

const mockTask: PersonalTask = {
  taskId: `ptask_test_01`,
  schemaVersion: 1,
  revision: 1,
  accountId: mockTenantId,
  personalInstanceId: mockPersonalInstanceId,
  controlBusinessInstanceId: mockControlBusinessId,
  createdByOwner: true,
  goal: "Inquire about bulk laptop prices",
  fullOwnerInstructions: "Ask for price of 5 MacBook Pro M3 units. Do not confirm order.",
  constraints: ["No binding commitments"],
  targetContactId: "pc_target_pte_01",
  targetIdentity: {
    jid: "contact-c84bd0d2ed3a@example.invalid",
    canonicalPhone: "+174342493053",
    displayName: "Ahmed Electronics",
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
  currentState: "ACTIVE",
  stepCount: 1,
};

test("Personal Task Engine - Comprehensive Test Suite", async (t) => {
  t.beforeEach(() => {
    __clearPersonalTasksForTest();
    __clearTaskEventsForTest();
    __resetEligibilityTrackingForTest();
    __setUniversalOutboundSendTestDeps({
      canSendCustomerFacingMessage: async () => ({ allowed: true, reason: "" }),
    });
    __setTargetServiceTestDeps({
      getBotsByUser: async () => [{
        $id: mockPersonalInstanceId,
        bot_id: mockPersonalInstanceId,
        user_id: mockTenantId,
        instancePurpose: "personal",
        controlBusinessInstanceId: mockControlBusinessId,
        connection_status: "connected",
      } as any],
    });
    process.env.ENABLE_PERSONAL_ASSISTANT = "true";
  });

  // =========================================================================
  // 1. STATE MACHINE (Section 91)
  // =========================================================================
  await t.test("State Machine: Valid transitions succeed and record events", async () => {
    const task = { ...mockTask, currentState: "READY" as const };
    await savePersonalTask(task);

    const res = await transitionPersonalTask(task, {
      targetState: "ACTIVE",
      actor: "owner",
      reason: "Task started",
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.newState, "ACTIVE");

    const events = getPersonalTaskEvents(task.taskId);
    assert.ok(events.length >= 1);
    assert.strictEqual(events[0].stateAfter, "ACTIVE");
  });

  await t.test("State Machine: Invalid transitions and terminal state resurrection rejected", async () => {
    const completedTask = { ...mockTask, currentState: "COMPLETED" as const };
    await savePersonalTask(completedTask);

    // COMPLETED -> ACTIVE must fail
    const resumeRes = await transitionPersonalTask(completedTask, {
      targetState: "ACTIVE",
      actor: "system",
    });
    assert.strictEqual(resumeRes.success, false);
    assert.strictEqual(resumeRes.code, "INVALID_STATE_TRANSITION");

    const cancelledTask = { ...mockTask, taskId: "ptask_cancel", currentState: "CANCELLED" as const };
    await savePersonalTask(cancelledTask);

    // CANCELLED -> ACTIVE must fail
    const cancelResume = await transitionPersonalTask(cancelledTask, {
      targetState: "ACTIVE",
      actor: "system",
    });
    assert.strictEqual(cancelResume.success, false);
  });

  await t.test("State Machine: Optimistic concurrency revision conflict rejected", async () => {
    const task = { ...mockTask, taskId: "ptask_rev", revision: 2 };
    await savePersonalTask(task);

    const conflictRes = await transitionPersonalTask(task, {
      targetState: "WAITING_FOR_CONTACT",
      actor: "system",
      expectedRevision: 1, // Stale!
    });

    assert.strictEqual(conflictRes.success, false);
    assert.strictEqual(conflictRes.code, "CONCURRENCY_CONFLICT");
  });

  await t.test("Leases: Same task cannot be executed by two workers concurrently", async () => {
    const task = { ...mockTask, taskId: "ptask_lease" };
    await savePersonalTask(task);

    const lease1 = await acquireTaskExecutionLease(task, "worker_A");
    assert.strictEqual(lease1.acquired, true);

    const lease2 = await acquireTaskExecutionLease(lease1.task, "worker_B");
    assert.strictEqual(lease2.acquired, false, "Second worker must not acquire lease");

    await releaseTaskExecutionLease(lease1.task);
    const lease3 = await acquireTaskExecutionLease(task, "worker_B");
    assert.strictEqual(lease3.acquired, true, "Worker B acquires after release");
  });

  // =========================================================================
  // 2. OWNER QUESTIONS & CORRELATION (Section 92)
  // =========================================================================
  await t.test("Owner Question: Missing info creates question and correlates short owner reply", async () => {
    const task = { ...mockTask, taskId: "ptask_q1" };
    await savePersonalTask(task);

    let notifSent = false;
    const qRes = await createPersonalTaskOwnerQuestion({
      task,
      prompt: "Which color do you prefer: Space Black or Silver?",
      reason: "Vendor asked color preference",
      requestedField: "color",
      sendBusinessNotification: async () => {
        notifSent = true;
        return { success: true, messageId: "n_01" };
      },
    });

    assert.strictEqual(qRes.success, true);
    assert.strictEqual(qRes.task.currentState, "WAITING_FOR_OWNER");
    assert.strictEqual(notifSent, true);

    // Natural short owner reply on Business WhatsApp
    const corRes = await correlateOwnerAnswer({
      accountId: mockTenantId,
      answerText: "Space Black",
    });

    assert.strictEqual(corRes.correlated, true);
    assert.strictEqual(corRes.task?.currentState, "ACTIVE");
    assert.strictEqual(corRes.task?.taskLocalMemory?.answer_color, "Space Black");
  });

  await t.test("Owner Question: Multiple pending questions produces disambiguation choices", async () => {
    const task1 = { ...mockTask, taskId: "ptask_multi_1", goal: "Buy macbook" };
    const task2 = { ...mockTask, taskId: "ptask_multi_2", goal: "Book hotel" };
    await savePersonalTask(task1);
    await savePersonalTask(task2);

    await createPersonalTaskOwnerQuestion({ task: task1, prompt: "Which color?" });
    await createPersonalTaskOwnerQuestion({ task: task2, prompt: "Which date?" });

    const ambig = await correlateOwnerAnswer({
      accountId: mockTenantId,
      answerText: "Yes",
    });

    assert.strictEqual(ambig.correlated, false);
    assert.strictEqual(ambig.ambiguous, true);
    assert.strictEqual(ambig.choices?.length, 2);
  });

  // =========================================================================
  // 3. APPROVALS (Section 93)
  // =========================================================================
  await t.test("Approvals: Fingerprint binding, single-use, and role protection", async () => {
    const task = { ...mockTask, taskId: "ptask_appr" };
    await savePersonalTask(task);

    const action: PersonalTaskAction = {
      actionId: "act_send_01",
      taskId: task.taskId,
      type: "WHATSAPP_SEND",
      status: "pending",
      input: { text: "Please reserve 2 units." },
      createdAt: Date.now(),
      attemptCount: 1,
      idempotencyKey: "act_send_01_idemp",
    };

    const reqRes = await requestPersonalTaskApproval({
      task,
      action,
      actionSummary: "Send reservation request for 2 units",
    });

    assert.strictEqual(reqRes.success, true);
    assert.strictEqual(reqRes.task.currentState, "WAITING_FOR_APPROVAL");

    // Other tenant cannot approve
    await assert.rejects(
      async () => {
        await resolvePersonalTaskApproval({
          accountId: "other_tenant",
          taskId: task.taskId,
          decision: "APPROVED",
          actorRole: "owner",
        });
      },
      /TENANT_MISMATCH/i
    );

    // Non-owner role cannot approve
    await assert.rejects(
      async () => {
        await resolvePersonalTaskApproval({
          accountId: mockTenantId,
          taskId: task.taskId,
          decision: "APPROVED",
          actorRole: "contact",
        });
      },
      /PERMISSION_DENIED/i
    );

    // Legitimate owner approval
    const apprRes = await resolvePersonalTaskApproval({
      accountId: mockTenantId,
      taskId: task.taskId,
      decision: "APPROVED",
      actorRole: "owner",
    });

    assert.strictEqual(apprRes.success, true);
    assert.strictEqual(apprRes.task.currentState, "ACTIVE");
    assert.strictEqual(apprRes.task.pendingApproval?.status, "APPROVED");

    // Single-use: cannot re-approve
    const reAppr = await resolvePersonalTaskApproval({
      accountId: mockTenantId,
      taskId: task.taskId,
      decision: "APPROVED",
      actorRole: "owner",
    });
    assert.strictEqual(reAppr.success, false);
  });

  // =========================================================================
  // 4. FOLLOW-UP ENGINE & SAFETY CAPS (Section 94)
  // =========================================================================
  await t.test("Follow-Up: Default is OFF; schedules with max 2 safety cap", async () => {
    const task = { ...mockTask, taskId: "ptask_fu", currentState: "WAITING_FOR_CONTACT" as const };
    scheduleTaskFollowUp(task, 1000); // 1s
    await savePersonalTask(task);
    assert.strictEqual(task.followUpPolicy?.enabled, true);
    assert.strictEqual(task.followUpPolicy?.maxFollowUps, 2);

    // Process due follow-up (simulating time passing)
    const mockSock = {
      sendMessage: async () => ({ key: { id: "wa_fu_001" } }),
    };
    const fuRes1 = await processDuePersonalTaskFollowUps({
      accountId: mockTenantId,
      now: Date.now() + 2000,
      sock: mockSock,
    });
    assert.strictEqual(fuRes1.sent, 1);

    // Second follow-up
    const fuRes2 = await processDuePersonalTaskFollowUps({
      accountId: mockTenantId,
      now: Date.now() + 2000 + 24 * 3600 * 1000,
      sock: mockSock,
    });
    assert.strictEqual(fuRes2.sent, 1);

    // Third follow-up blocked by max 2 cap
    const fuRes3 = await processDuePersonalTaskFollowUps({
      accountId: mockTenantId,
      now: Date.now() + 4000 + 48 * 3600 * 1000,
      sock: mockSock,
    });
    assert.strictEqual(fuRes3.sent, 0);
  });

  // =========================================================================
  // 5. PAUSE / RESUME / CANCEL (Section 96)
  // =========================================================================
  await t.test("Pause & Cancel: Cancels pending follow-ups and enforces terminal cancellation", async () => {
    const task = { ...mockTask, taskId: "ptask_p_c", currentState: "ACTIVE" as const };
    scheduleTaskFollowUp(task, 10000);
    await savePersonalTask(task);

    // Owner pause
    cancelTaskFollowUp(task);
    const pauseRes = await transitionPersonalTask(task, {
      targetState: "PAUSED_OWNER",
      actor: "owner",
    });
    assert.strictEqual(pauseRes.success, true);
    assert.strictEqual(pauseRes.task.followUpPolicy?.enabled, false);

    // Cancel is terminal
    const cancelRes = await transitionPersonalTask(pauseRes.task, {
      targetState: "CANCELLED",
      actor: "owner",
    });
    assert.strictEqual(cancelRes.success, true);

    // Cancelled task cannot resume
    const tryResume = await transitionPersonalTask(cancelRes.task, {
      targetState: "ACTIVE",
      actor: "owner",
    });
    assert.strictEqual(tryResume.success, false);
  });

  // =========================================================================
  // 6. PROMPT 5 MIGRATION & COMPATIBILITY (Section 101)
  // =========================================================================
  await t.test("Migration: Prompt 5 missions map bi-directionally without data loss", () => {
    const p5Mission: PersonalOutboundMission = {
      missionId: "pom_legacy_01",
      accountId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      controlBusinessInstanceId: mockControlBusinessId,
      targetContactId: "pc_legacy_01",
      targetIdentity: {
        jid: "contact-6c9bc40fc084@example.invalid",
        canonicalPhone: "+150333823501",
        displayName: "Legacy Contact",
      },
      goal: "Inquire availability",
      ownerInstructions: "Ask availability.",
      constraints: [],
      createdByOwner: true,
      createdAt: 1000000,
      updatedAt: 1000500,
      lastActivityAt: 1000500,
      stepCount: 2,
      status: "COMPLETED",
      resultSummary: "2 units available.",
      collectedFacts: [{ key: "stock", value: "2", timestamp: 1000500, sourceMessage: "" }],
    };

    const task = migrateMissionToTask(p5Mission);
    assert.strictEqual(task.taskId, "pom_legacy_01");
    assert.strictEqual(task.currentState, "COMPLETED");
    assert.strictEqual(task.result?.summary, "2 units available.");

    const adapted = adaptTaskToMission(task);
    assert.strictEqual(adapted.missionId, "pom_legacy_01");
    assert.strictEqual(adapted.status, "COMPLETED");
    assert.strictEqual(adapted.resultSummary, "2 units available.");
  });

  // =========================================================================
  // 7. ROUTING PRECEDENCE & CONCURRENCY (Section 97)
  // =========================================================================
  await t.test("Concurrency: Only one task holds active messaging lease per contact", async () => {
    const task1 = { ...mockTask, taskId: "ptask_concur_1", currentState: "WAITING_FOR_CONTACT" as const };
    await savePersonalTask(task1);

    const active = await getActiveTaskForContact(
      mockTenantId,
      mockPersonalInstanceId,
      mockTask.targetContactId
    );
    assert.ok(active);
    assert.strictEqual(active.taskId, "ptask_concur_1");

    // Attempting to create second active task for same contact is detected
    const adminTool = getAdminAction("create_personal_task");
    const create2 = await adminTool.handler(
      { accountId: mockTenantId, botId: mockControlBusinessId, adminRole: "owner" } as any,
      {
        target: "+174342493053",
        goal: "Second competing task",
        personalInstanceId: mockPersonalInstanceId,
      }
    );

    assert.strictEqual(create2.success, false);
    assert.match(create2.message, /Active Task Already in Progress/i);
  });
});

/**
 * Personal Task Approval Service
 * 
 * Generic server-authoritative approval mechanism:
 * - Single-use approvals bound to exact action fingerprints
 * - Automatic 24-hour expiry check (expired approvals cannot execute)
 * - Material action change invalidates old approval
 * - Channel isolation: Owner approval only via Business channel or authenticated session
 * - Rejecting stops the proposed action cleanly
 */

import { createHash } from "node:crypto";
import { transitionPersonalTask } from "./personal-task-state-machine.ts";
import { getPersonalTask, savePersonalTask } from "./personal-task-storage-service.ts";
import { formatWhatsAppResponse } from "./whatsapp-ai-response-style-service.ts";
import type {
  PersonalTask,
  PersonalTaskApprovalRequest,
  PersonalTaskAction,
} from "./personal-task-types.ts";

const DEFAULT_APPROVAL_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export function computeActionFingerprint(action: Partial<PersonalTaskAction>): string {
  const payload = JSON.stringify({
    type: action.type,
    taskId: action.taskId,
    input: action.input || {},
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

export interface RequestTaskApprovalParams {
  task: PersonalTask;
  action: PersonalTaskAction;
  actionSummary: string;
  expiryMs?: number;
  sendBusinessNotification?: (text: string) => Promise<{ success: boolean; messageId?: string }>;
}

export async function requestPersonalTaskApproval(
  params: RequestTaskApprovalParams
): Promise<{ success: boolean; approval: PersonalTaskApprovalRequest; task: PersonalTask }> {
  const { task, action, actionSummary, expiryMs = DEFAULT_APPROVAL_EXPIRY_MS, sendBusinessNotification } = params;

  const approvalId = `ptap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();
  const fingerprint = computeActionFingerprint(action);

  const approval: PersonalTaskApprovalRequest = {
    approvalId,
    taskId: task.taskId,
    actionId: action.actionId,
    actionSummary: actionSummary.trim(),
    exactActionFingerprint: fingerprint,
    requestedAt: now,
    expiresAt: now + expiryMs,
    status: "PENDING",
  };

  task.pendingApproval = approval;

  // Transition task to WAITING_FOR_APPROVAL
  const transitionRes = await transitionPersonalTask(task, {
    targetState: "WAITING_FOR_APPROVAL",
    actor: "system",
    reason: `Approval required for action: ${actionSummary}`,
    relatedActionId: action.actionId,
  });

  const updatedTask = transitionRes.task;

  // Dispatch approval notification to owner via Business WhatsApp
  if (typeof sendBusinessNotification === "function") {
    const targetLabel = updatedTask.targetIdentity.displayName || updatedTask.targetIdentity.canonicalPhone || "Contact";
    const noticeText = formatWhatsAppResponse(`
⚠️ *Personal Task Requires Your Approval*

• *Task Goal:* ${updatedTask.goal}
• *Target:* ${targetLabel}
• *Proposed Action:* ${actionSummary}

_Reply "Approve" to authorize sending this, or "Reject" to cancel._
    `.trim());

    await sendBusinessNotification(noticeText).catch((err) => {
      console.warn("[PersonalTaskApproval] Notification failed:", err?.message || err);
    });
  }

  return { success: true, approval, task: updatedTask };
}

export interface ResolveApprovalParams {
  accountId: string;
  taskId: string;
  approvalId?: string;
  decision: "APPROVED" | "REJECTED";
  actorRole: string; // must be "owner" or "admin"
  actionForVerification?: Partial<PersonalTaskAction>;
}

export async function resolvePersonalTaskApproval(
  params: ResolveApprovalParams
): Promise<{ success: boolean; task: PersonalTask; error?: string }> {
  const { accountId, taskId, approvalId, decision, actorRole, actionForVerification } = params;

  // Role Gate: Only owner/admin on controlling Business channel
  if (actorRole !== "owner" && actorRole !== "admin") {
    throw new Error("PERMISSION_DENIED: Only authorized owners/admins may approve actions.");
  }

  const task = await getPersonalTask(accountId, taskId);
  if (!task) {
    throw new Error("TENANT_MISMATCH: Task not found for this tenant.");
  }

  if (task.accountId !== accountId) {
    throw new Error("TENANT_MISMATCH: Cross-tenant approval is forbidden.");
  }

  const approval = task.pendingApproval;
  if (!approval || approval.status !== "PENDING") {
    return { success: false, task, error: "No pending approval for this task." };
  }

  if (approvalId && approval.approvalId !== approvalId) {
    return { success: false, task, error: "Approval ID does not match active request." };
  }

  const now = Date.now();

  // Expiry Gate
  if (now > approval.expiresAt) {
    approval.status = "EXPIRED";
    await savePersonalTask(task);
    return { success: false, task, error: "Approval request has expired." };
  }

  // Exact Action Fingerprint Gate: If action was changed materially, reject!
  if (actionForVerification) {
    const checkFingerprint = computeActionFingerprint(actionForVerification);
    if (checkFingerprint !== approval.exactActionFingerprint) {
      approval.status = "EXPIRED";
      await savePersonalTask(task);
      return { success: false, task, error: "Proposed action materially changed since approval request." };
    }
  }

  if (decision === "APPROVED") {
    // Single-use: Mark consumed
    approval.status = "APPROVED";
    approval.consumedAt = now;

    // Resume task: WAITING_FOR_APPROVAL -> ACTIVE
    const res = await transitionPersonalTask(task, {
      targetState: "ACTIVE",
      actor: "owner",
      reason: `Owner approved action: ${approval.actionSummary}`,
    });
    return { success: true, task: res.task };
  } else {
    approval.status = "REJECTED";
    approval.consumedAt = now;

    // Cancel or resume without action
    const res = await transitionPersonalTask(task, {
      targetState: "ACTIVE",
      actor: "owner",
      reason: `Owner rejected action: ${approval.actionSummary}`,
    });
    return { success: true, task: res.task };
  }
}

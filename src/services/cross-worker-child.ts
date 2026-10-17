/**
 * Child Worker Process for True Multi-Process Cross-Worker Concurrency Testing
 * 
 * Runs in an independent OS process with isolated memory and heap.
 * Validates that inFlightGoalLocks and inFlightAlertLocks in one process
 * do NOT leak to or protect another process, and that atomic canonical
 * persistence claims guarantee single-execution semantics.
 */

import http from "node:http";
import {
  advanceConversationGoalAtomically,
  saveConversationGoal,
  __setCanonicalGoalStorageAdapterForTest,
  getStoredConversationGoal,
  type CanonicalGoalStorageAdapter,
} from "./conversation-goal-manager.ts";
import {
  dispatchProactiveLeadAlert,
  __setCanonicalAlertStorageAdapterForTest,
  updateProactiveLeadSettings,
  type CanonicalAlertStorageAdapter,
  type ProactiveLeadEvent,
} from "./proactive-lead-intelligence-service.ts";

function requestHttp(url: string, payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body || "{}"));
          } catch {
            resolve({});
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function createHttpGoalAdapter(serverUrl: string): CanonicalGoalStorageAdapter {
  const localMap = new Map<string, string>();
  return {
    getGoalDocument(docId: string): string | null {
      return localMap.get(docId) ?? null;
    },
    setGoalDocument(docId: string, value: string, _updatedAt: number): void {
      localMap.set(docId, value);
    },
    deleteGoalDocument(docId: string): void {
      localMap.delete(docId);
    },
    async createClaimDocument(docId: string, value: string, updatedAt: number): Promise<boolean> {
      const res = await requestHttp(`${serverUrl}/goal-claim`, { action: "create", docId, value, updatedAt });
      return Boolean(res.success);
    },
    async getClaimDocument(docId: string): Promise<string | null> {
      const res = await requestHttp(`${serverUrl}/goal-claim`, { action: "get", docId });
      return res.value ?? null;
    },
    async updateClaimDocument(docId: string, value: string, updatedAt: number): Promise<void> {
      await requestHttp(`${serverUrl}/goal-claim`, { action: "update", docId, value, updatedAt });
    },
    async deleteClaimDocument(docId: string): Promise<void> {
      await requestHttp(`${serverUrl}/goal-claim`, { action: "delete", docId });
    },
  };
}

function createHttpAlertAdapter(serverUrl: string): CanonicalAlertStorageAdapter {
  return {
    async createClaimDocument(docId: string, value: string, updatedAt: number): Promise<boolean> {
      const res = await requestHttp(`${serverUrl}/alert-claim`, { action: "create", docId, value, updatedAt });
      return Boolean(res.success);
    },
    async getClaimDocument(docId: string): Promise<string | null> {
      const res = await requestHttp(`${serverUrl}/alert-claim`, { action: "get", docId });
      return res.value ?? null;
    },
    async updateClaimDocument(docId: string, value: string, updatedAt: number): Promise<void> {
      await requestHttp(`${serverUrl}/alert-claim`, { action: "update", docId, value, updatedAt });
    },
    async deleteClaimDocument(docId: string): Promise<void> {
      await requestHttp(`${serverUrl}/alert-claim`, { action: "delete", docId });
    },
  };
}

let cachedGoalAdapter: CanonicalGoalStorageAdapter | null = null;
let cachedAlertAdapter: CanonicalAlertStorageAdapter | null = null;

function getGoalAdapter(serverUrl: string): CanonicalGoalStorageAdapter {
  if (!cachedGoalAdapter) {
    cachedGoalAdapter = createHttpGoalAdapter(serverUrl);
  }
  return cachedGoalAdapter;
}

function getAlertAdapter(serverUrl: string): CanonicalAlertStorageAdapter {
  if (!cachedAlertAdapter) {
    cachedAlertAdapter = createHttpAlertAdapter(serverUrl);
  }
  return cachedAlertAdapter;
}

process.on("message", async (msg: any) => {
  if (!msg || !msg.action) return;

  try {
    const { action, workerId, serverUrl } = msg;

    if (serverUrl) {
      __setCanonicalGoalStorageAdapterForTest(getGoalAdapter(serverUrl));
      __setCanonicalAlertStorageAdapterForTest(getAlertAdapter(serverUrl));
    }

    if (action === "GOAL_STEP_EXECUTION") {
      const { accountId, conversationId, expectedVersion, initialGoal } = msg;
      if (initialGoal) {
        saveConversationGoal({ ...initialGoal, version: expectedVersion || 1 });
      }

      let sideEffectExecuted = false;

      const result = await advanceConversationGoalAtomically({
        accountId,
        conversationId,
        expectedVersion,
        workerId,
        executeExternalStep: async (goal) => {
          // Record side effect attempt to parent coordinator
          sideEffectExecuted = true;
          await requestHttp(`${serverUrl}/external-side-effect`, {
            workerId,
            type: "whatsapp_send",
            goalId: goal.goalId,
            version: goal.version,
          });

          return {
            actionId: "personal_outbound_send",
            params: {},
            success: true,
            resultSummary: `Dispatched message by ${workerId}`,
          };
        },
      });

      process.send!({
        workerId,
        action,
        success: result.success,
        sideEffectExecuted,
        goalVersion: result.goal?.version,
        error: result.error,
      });
    } else if (action === "GOAL_BIZ_WRITE") {
      const { accountId, conversationId, expectedVersion, initialGoal } = msg;
      if (initialGoal) {
        saveConversationGoal({ ...initialGoal, version: expectedVersion || 1 });
      }

      let sideEffectExecuted = false;

      const result = await advanceConversationGoalAtomically({
        accountId,
        conversationId,
        expectedVersion,
        workerId,
        executeExternalStep: async (goal) => {
          // Record business write side effect attempt to parent coordinator
          sideEffectExecuted = true;
          await requestHttp(`${serverUrl}/external-side-effect`, {
            workerId,
            type: "biz_write",
            goalId: goal.goalId,
            version: goal.version,
          });

          return {
            actionId: "biz_catalog_update",
            params: {},
            success: true,
            resultSummary: `Catalog item updated by ${workerId}`,
          };
        },
      });

      process.send!({
        workerId,
        action,
        success: result.success,
        sideEffectExecuted,
        goalVersion: result.goal?.version,
        error: result.error,
      });
    } else if (action === "PROACTIVE_ALERT_DISPATCH") {
      const { event } = msg;

      updateProactiveLeadSettings(event.accountId, {
        enabled: true,
        ownerAlertPhone: "+144225232320",
        ownerAlertJid: "contact-e4ed32210a80@example.invalid",
        notifyQualifiedLeads: true,
      });

      let whatsappAttempted = false;

      const mockSock = {
        sendMessage: async (_jid: string, payload: any) => {
          whatsappAttempted = true;
          await requestHttp(`${serverUrl}/external-side-effect`, {
            workerId,
            type: "owner_alert_whatsapp",
            eventId: event.eventId,
            text: payload.text,
          });
          return { key: { id: `msg_${workerId}_${Date.now()}` } };
        },
      };

      const result = await dispatchProactiveLeadAlert(event, {
        sock: mockSock,
        workerId,
      });

      process.send!({
        workerId,
        action,
        success: result.success,
        duplicate: result.duplicate,
        whatsappSent: result.whatsappSent,
        whatsappAttempted,
        notificationCreated: result.dashboardNotificationCreated,
      });
    } else if (action === "PING") {
      process.send!({ workerId, action: "PONG" });
    }
  } catch (err: any) {
    process.send!({
      error: err?.message || String(err),
    });
  }
});

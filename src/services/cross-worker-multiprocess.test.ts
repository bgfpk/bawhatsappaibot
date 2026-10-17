/**
 * Cross-Worker Multi-Process Concurrency & Idempotency Acceptance Tests
 * 
 * Verifies that two INDEPENDENT Node.js processes with separate memory heaps
 * and separate inFlightGoalLocks / inFlightAlertLocks cannot both execute
 * external side effects (WhatsApp outbound send or business write) or duplicate
 * owner proactive lead alerts.
 */

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fork, type ChildProcess } from "node:child_process";
import { buildGoalDocId } from "./conversation-goal-manager.ts";

test("Cross-Worker Concurrency: Two independent OS processes competing on identical goals and proactive alerts", async () => {
  // 1. In-memory coordinator backing canonical store
  const goalStore = new Map<string, { value: string; updatedAt: number }>();
  const goalClaimStore = new Map<string, { value: string; updatedAt: number }>();
  const alertClaimStore = new Map<string, { value: string; updatedAt: number }>();
  const externalSideEffects: any[] = [];

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let data: any = {};
      try {
        data = JSON.parse(body || "{}");
      } catch {}

      res.writeHead(200, { "Content-Type": "application/json" });

      if (req.url === "/goal-doc") {
        if (data.action === "get") {
          const item = goalStore.get(data.docId);
          return res.end(JSON.stringify({ value: item ? item.value : null }));
        }
        if (data.action === "set") {
          goalStore.set(data.docId, { value: data.value, updatedAt: data.updatedAt });
          return res.end(JSON.stringify({ success: true }));
        }
        if (data.action === "delete") {
          goalStore.delete(data.docId);
          return res.end(JSON.stringify({ success: true }));
        }
      }

      if (req.url === "/goal-claim") {
        if (data.action === "create") {
          // Atomic uniqueness test (Appwrite 409 collision equivalent)
          if (goalClaimStore.has(data.docId)) {
            return res.end(JSON.stringify({ success: false, code: 409 }));
          }
          goalClaimStore.set(data.docId, { value: data.value, updatedAt: data.updatedAt });
          return res.end(JSON.stringify({ success: true }));
        }
        if (data.action === "get") {
          const item = goalClaimStore.get(data.docId);
          return res.end(JSON.stringify({ value: item ? item.value : null }));
        }
        if (data.action === "update") {
          goalClaimStore.set(data.docId, { value: data.value, updatedAt: data.updatedAt });
          return res.end(JSON.stringify({ success: true }));
        }
        if (data.action === "delete") {
          goalClaimStore.delete(data.docId);
          return res.end(JSON.stringify({ success: true }));
        }
      }

      if (req.url === "/alert-claim") {
        if (data.action === "create") {
          // Atomic uniqueness test (Appwrite 409 collision equivalent)
          if (alertClaimStore.has(data.docId)) {
            return res.end(JSON.stringify({ success: false, code: 409 }));
          }
          alertClaimStore.set(data.docId, { value: data.value, updatedAt: data.updatedAt });
          return res.end(JSON.stringify({ success: true }));
        }
        if (data.action === "get") {
          const item = alertClaimStore.get(data.docId);
          return res.end(JSON.stringify({ value: item ? item.value : null }));
        }
        if (data.action === "update") {
          alertClaimStore.set(data.docId, { value: data.value, updatedAt: data.updatedAt });
          return res.end(JSON.stringify({ success: true }));
        }
        if (data.action === "delete") {
          alertClaimStore.delete(data.docId);
          return res.end(JSON.stringify({ success: true }));
        }
      }

      if (req.url === "/external-side-effect") {
        externalSideEffects.push(data);
        return res.end(JSON.stringify({ received: true }));
      }

      return res.end(JSON.stringify({ error: "not_found" }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as any;
  const serverUrl = `http://127.0.0.1:${address.port}`;

  // 2. Fork 2 independent worker processes
  const childScript = path.resolve(process.cwd(), "src/services/cross-worker-child.ts");

  function spawnWorker(workerId: string): {
    cp: ChildProcess;
    send: (msg: any) => Promise<any>;
  } {
    const cp = fork(childScript, [], {
      execArgv: ["--import", "tsx"],
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    });

    const send = (msg: any): Promise<any> => {
      return new Promise((resolve, reject) => {
        const handler = (response: any) => {
          cp.off("message", handler);
          resolve(response);
        };
        cp.on("message", handler);
        cp.send({ ...msg, workerId, serverUrl }, (err) => {
          if (err) reject(err);
        });
      });
    };

    return { cp, send };
  }

  const worker1 = spawnWorker("worker_pid_1");
  const worker2 = spawnWorker("worker_pid_2");

  try {
    // Warmup / Ping workers
    const [p1, p2] = await Promise.all([
      worker1.send({ action: "PING" }),
      worker2.send({ action: "PING" }),
    ]);
    assert.equal(p1.action, "PONG");
    assert.equal(p2.action, "PONG");

    // =========================================================================
    // TEST PART 1: Multi-Process Goal Execution (Personal WhatsApp Outbound Send)
    // =========================================================================
    const testAccount = "acc_multi_process_test";
    const testConv = "conv_personal_outbound_01";
    const goalDocId = buildGoalDocId(testAccount, testConv);

    // Initial goal state seeded in shared canonical persistent store
    const initialGoal = {
      goalId: "goal_mp_101",
      accountId: testAccount,
      conversationId: testConv,
      goalType: "personal_outbound_send",
      originalObjective: "Send WhatsApp message to vendor",
      currentObjectiveSummary: "Ready to dispatch WhatsApp text",
      status: "IN_PROGRESS",
      knownEntities: {},
      knownArguments: { recipient: "+150333823501", message: "Order confirmed" },
      missingArguments: [],
      currentStep: 1,
      completedSteps: [],
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + 7200000,
    };
    goalStore.set(goalDocId, { value: JSON.stringify(initialGoal), updatedAt: Math.floor(Date.now() / 1000) });

    externalSideEffects.length = 0;

    // Both independent processes receive identical actionable goal step simultaneously
    const [goalRes1, goalRes2] = await Promise.all([
      worker1.send({
        action: "GOAL_STEP_EXECUTION",
        accountId: testAccount,
        conversationId: testConv,
        expectedVersion: 1,
        initialGoal,
      }),
      worker2.send({
        action: "GOAL_STEP_EXECUTION",
        accountId: testAccount,
        conversationId: testConv,
        expectedVersion: 1,
        initialGoal,
      }),
    ]);

    // Assert: Exactly ONE external WhatsApp outbound side effect was executed across both processes
    const whatsappSends = externalSideEffects.filter((e) => e.type === "whatsapp_send");
    assert.equal(whatsappSends.length, 1, "Exactly one process must execute the external WhatsApp send");

    // Assert: One worker succeeded, one was blocked by atomic claim collision
    const goalResults = [goalRes1, goalRes2];
    const winningGoalWorker = goalResults.find((r) => r.sideEffectExecuted === true);
    const losingGoalWorker = goalResults.find((r) => r.sideEffectExecuted === false);

    assert.ok(winningGoalWorker, "One process must win the atomic claim");
    assert.equal(winningGoalWorker.success, true);
    assert.equal(winningGoalWorker.goalVersion, 2);

    assert.ok(losingGoalWorker, "One process must lose the race");
    assert.equal(losingGoalWorker.sideEffectExecuted, false);

    // Verify goal version was advanced in canonical store or winning worker
    assert.equal(winningGoalWorker.goalVersion, 2);

    // =========================================================================
    // TEST PART 2: Multi-Process Business Write Side Effect
    // =========================================================================
    const testConvBiz = "conv_biz_write_01";
    const goalBizDocId = buildGoalDocId(testAccount, testConvBiz);

    const initialBizGoal = {
      goalId: "goal_mp_biz_202",
      accountId: testAccount,
      conversationId: testConvBiz,
      goalType: "catalog_management",
      originalObjective: "Update catalog item price",
      currentObjectiveSummary: "Execute business write action",
      status: "IN_PROGRESS",
      knownEntities: {},
      knownArguments: { itemId: "item_99", price: 49.99 },
      missingArguments: [],
      currentStep: 1,
      completedSteps: [],
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + 7200000,
    };
    goalStore.set(goalBizDocId, { value: JSON.stringify(initialBizGoal), updatedAt: Math.floor(Date.now() / 1000) });

    externalSideEffects.length = 0;

    const [bizRes1, bizRes2] = await Promise.all([
      worker1.send({
        action: "GOAL_BIZ_WRITE",
        accountId: testAccount,
        conversationId: testConvBiz,
        expectedVersion: 1,
        initialGoal: initialBizGoal,
      }),
      worker2.send({
        action: "GOAL_BIZ_WRITE",
        accountId: testAccount,
        conversationId: testConvBiz,
        expectedVersion: 1,
        initialGoal: initialBizGoal,
      }),
    ]);

    const bizWrites = externalSideEffects.filter((e) => e.type === "biz_write");
    assert.equal(bizWrites.length, 1, "Exactly one process must execute the business write");

    const bizResults = [bizRes1, bizRes2];
    const winningBiz = bizResults.find((r) => r.sideEffectExecuted === true);
    const losingBiz = bizResults.find((r) => r.sideEffectExecuted === false);

    assert.ok(winningBiz, "One process won the business write claim");
    assert.ok(losingBiz, "One process was safely blocked from duplicate business write");
    assert.equal(losingBiz.sideEffectExecuted, false);

    // =========================================================================
    // TEST PART 3: Multi-Process Proactive Alert Deduplication
    // =========================================================================
    externalSideEffects.length = 0;

    const proactiveEvent = {
      eventId: "evt_mp_lead_888",
      eventType: "NEW_QUALIFIED_LEAD",
      accountId: testAccount,
      leadId: "lead_mp_888",
      customerJid: "contact-3a5a592abb0a@example.invalid",
      customerName: "Rashid Mahmood",
      customerPhone: "+125113132523",
      serviceOrProduct: "Solar Kit 10KW",
      summary: "Customer requested pricing on 10KW Solar Kit.",
      urgency: "normal",
      timestamp: Date.now(),
      deduplicationKey: `${testAccount}:lead_mp_888:NEW_QUALIFIED_LEAD:nodept_+923001239988`,
    };

    // Both independent processes attempt to dispatch the exact same lead event
    const [alertRes1, alertRes2] = await Promise.all([
      worker1.send({
        action: "PROACTIVE_ALERT_DISPATCH",
        event: proactiveEvent,
      }),
      worker2.send({
        action: "PROACTIVE_ALERT_DISPATCH",
        event: proactiveEvent,
      }),
    ]);

    // Assert: Exactly ONE owner WhatsApp alert was attempted across both independent processes
    const alertSends = externalSideEffects.filter((e) => e.type === "owner_alert_whatsapp");
    assert.equal(alertSends.length, 1, "Exactly one process must execute the owner WhatsApp alert transport");

    const alertResults = [alertRes1, alertRes2];
    const winningAlert = alertResults.find((r) => r.duplicate === false);
    const duplicateAlert = alertResults.find((r) => r.duplicate === true);

    assert.ok(winningAlert, "One process won the alert claim");
    assert.equal(winningAlert.whatsappSent, true);
    assert.equal(winningAlert.notificationCreated, true);

    assert.ok(duplicateAlert, "The competing process recognized the duplicate via atomic claim");
    assert.equal(duplicateAlert.whatsappSent, false);
    assert.equal(duplicateAlert.whatsappAttempted, false);
  } finally {
    worker1.cp.kill();
    worker2.cp.kill();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

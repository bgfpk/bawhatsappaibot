import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
    recordSuccessfulCustomerTurnAiCall,
    recordSuccessfulCustomerTurnAiCallAsync,
    getSuccessfulCustomerTurnAiCallsCount,
    getSuccessfulCustomerTurnAiCallsCountAsync,
    getTurnExtraAiCallsCount,
    getTurnExtraAiCallsCountAsync,
    calculateCustomerTurnBilling,
    calculateCustomerTurnBillingAsync,
    clearCustomerTurnAiCalls,
    clearCustomerTurnAiCallsAsync,
    cleanupExpiredCustomerTurnAiCalls,
    buildCustomerTurnAiCallDocId,
    __clearCustomerTurnLedgerDatabaseForTest,
    __clearCustomerTurnLedgerMemoryCacheOnlyForTest,
} from "./customer-turn-ai-call-ledger-service.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("customer-turn-ai-call-ledger-service: exact accounting formulas", () => {
    const turn1 = "test_turn_1";
    clearCustomerTurnAiCalls(turn1);

    // 0 calls
    assert.equal(getSuccessfulCustomerTurnAiCallsCount(turn1), 0);
    assert.equal(getTurnExtraAiCallsCount(turn1), 0);
    let billing = calculateCustomerTurnBilling(turn1);
    assert.equal(billing.successfulCallsCount, 0);
    assert.equal(billing.extraCallsCount, 0);
    assert.equal(billing.baseAmount, 0);
    assert.equal(billing.extraAmount, 0);
    assert.equal(billing.totalAmount, 0);

    // 1 call -> $0.003 base, 0 extra ($0.003 total)
    recordSuccessfulCustomerTurnAiCall({
        customerTurnId: turn1,
        providerCallId: "call_reply_1",
        provider: "deepinfra",
        purpose: "customer_ai_reply",
    });
    assert.equal(getSuccessfulCustomerTurnAiCallsCount(turn1), 1);
    assert.equal(getTurnExtraAiCallsCount(turn1), 0);
    billing = calculateCustomerTurnBilling(turn1);
    assert.equal(billing.successfulCallsCount, 1);
    assert.equal(billing.extraCallsCount, 0);
    assert.equal(billing.baseAmount, 0.003);
    assert.equal(billing.extraAmount, 0);
    assert.equal(billing.totalAmount, 0.003);

    // 2 calls -> $0.003 base, 1 extra at $0.001 ($0.004 total)
    recordSuccessfulCustomerTurnAiCall({
        customerTurnId: turn1,
        providerCallId: "call_tool_1",
        provider: "deepinfra",
        purpose: "customer_ai_tool_followup",
    });
    assert.equal(getSuccessfulCustomerTurnAiCallsCount(turn1), 2);
    assert.equal(getTurnExtraAiCallsCount(turn1), 1);
    billing = calculateCustomerTurnBilling(turn1);
    assert.equal(billing.successfulCallsCount, 2);
    assert.equal(billing.extraCallsCount, 1);
    assert.equal(billing.baseAmount, 0.003);
    assert.equal(billing.extraAmount, 0.001);
    assert.equal(billing.totalAmount, 0.004);

    // 3 calls -> $0.003 base, 2 extra at $0.001 ($0.005 total)
    recordSuccessfulCustomerTurnAiCall({
        customerTurnId: turn1,
        providerCallId: "call_missing_1",
        provider: "deepinfra",
        purpose: "customer_ai_missing_order_field",
    });
    assert.equal(getSuccessfulCustomerTurnAiCallsCount(turn1), 3);
    assert.equal(getTurnExtraAiCallsCount(turn1), 2);
    billing = calculateCustomerTurnBilling(turn1);
    assert.equal(billing.successfulCallsCount, 3);
    assert.equal(billing.extraCallsCount, 2);
    assert.equal(billing.baseAmount, 0.003);
    assert.equal(billing.extraAmount, 0.002);
    assert.equal(billing.totalAmount, 0.005);

    // 4 calls -> $0.003 base, 3 extra at $0.001 ($0.006 total)
    recordSuccessfulCustomerTurnAiCall({
        customerTurnId: turn1,
        providerCallId: "call_repair_1",
        provider: "deepinfra",
        purpose: "customer_ai_reply_repair",
    });
    assert.equal(getSuccessfulCustomerTurnAiCallsCount(turn1), 4);
    assert.equal(getTurnExtraAiCallsCount(turn1), 3);
    billing = calculateCustomerTurnBilling(turn1);
    assert.equal(billing.successfulCallsCount, 4);
    assert.equal(billing.extraCallsCount, 3);
    assert.equal(billing.baseAmount, 0.003);
    assert.equal(billing.extraAmount, 0.003);
    assert.equal(billing.totalAmount, 0.006);

    // 7 calls -> $0.003 base, 6 extra at $0.001 ($0.009 total)
    recordSuccessfulCustomerTurnAiCall({ customerTurnId: turn1, providerCallId: "call_5", provider: "deepinfra", purpose: "guard_repair" });
    recordSuccessfulCustomerTurnAiCall({ customerTurnId: turn1, providerCallId: "call_6", provider: "deepinfra", purpose: "safety_repair" });
    recordSuccessfulCustomerTurnAiCall({ customerTurnId: turn1, providerCallId: "call_7", provider: "deepinfra", purpose: "c360_extraction" });

    assert.equal(getSuccessfulCustomerTurnAiCallsCount(turn1), 7);
    assert.equal(getTurnExtraAiCallsCount(turn1), 6);
    billing = calculateCustomerTurnBilling(turn1);
    assert.equal(billing.successfulCallsCount, 7);
    assert.equal(billing.extraCallsCount, 6);
    assert.equal(billing.baseAmount, 0.003);
    assert.equal(billing.extraAmount, 0.006);
    assert.equal(billing.totalAmount, 0.009);

    clearCustomerTurnAiCalls(turn1);
});

test("customer-turn-ai-call-ledger-service: atomic idempotency deduplicates retry calls", async () => {
    const turnA = `test_turn_isolation_${Date.now()}`;
    await clearCustomerTurnAiCallsAsync(turnA);

    // Initial call
    const res1 = await recordSuccessfulCustomerTurnAiCallAsync({
        customerTurnId: turnA,
        providerCallId: "call_reply_A",
        provider: "deepinfra",
        purpose: "customer_ai_reply",
    });
    assert.equal(res1, true);

    // Duplicate call with same providerCallId (e.g. SDK retry)
    const res2 = await recordSuccessfulCustomerTurnAiCallAsync({
        customerTurnId: turnA,
        providerCallId: "call_reply_A",
        provider: "deepinfra",
        purpose: "customer_ai_reply",
    });
    assert.equal(res2, false); // Idempotently rejected (409 conflict handled)

    assert.equal(getSuccessfulCustomerTurnAiCallsCount(turnA), 1);
    assert.equal(getTurnExtraAiCallsCount(turnA), 0);

    await clearCustomerTurnAiCallsAsync(turnA);
});

test("customer-turn-ai-call-ledger-service: provider-agnostic recording across DeepInfra, Gemini, DeepSeek, Google", () => {
    const turnProviderAgnostic = "test_turn_multi_provider";
    clearCustomerTurnAiCalls(turnProviderAgnostic);

    // Call 1 from DeepInfra
    recordSuccessfulCustomerTurnAiCall({
        customerTurnId: turnProviderAgnostic,
        providerCallId: "call_deepinfra_1",
        provider: "deepinfra",
        purpose: "customer_ai_reply",
        model: "deepseek-ai/DeepSeek-V4-Flash",
    });

    // Call 2 from Gemini
    recordSuccessfulCustomerTurnAiCall({
        customerTurnId: turnProviderAgnostic,
        providerCallId: "call_gemini_1",
        provider: "gemini",
        purpose: "customer_ai_tool_followup",
        model: "gemini-2.5-flash",
    });

    // Call 3 from DeepSeek
    recordSuccessfulCustomerTurnAiCall({
        customerTurnId: turnProviderAgnostic,
        providerCallId: "call_deepseek_1",
        provider: "deepseek",
        purpose: "customer_ai_reply_repair",
        model: "deepseek-ai/DeepSeek-V3",
    });

    // 3 calls total across 3 providers
    assert.equal(getSuccessfulCustomerTurnAiCallsCount(turnProviderAgnostic), 3);
    assert.equal(getTurnExtraAiCallsCount(turnProviderAgnostic), 2);

    const billing = calculateCustomerTurnBilling(turnProviderAgnostic);
    assert.equal(billing.successfulCallsCount, 3);
    assert.equal(billing.baseAmount, 0.003);
    assert.equal(billing.extraAmount, 0.002);
    assert.equal(billing.totalAmount, 0.005);

    clearCustomerTurnAiCalls(turnProviderAgnostic);
});

test("customer-turn-ai-call-ledger-service: crash and restart recovery without local filesystem authority", async () => {
    const crashTurn = `test_turn_crash_recovery_${Date.now()}`;
    await clearCustomerTurnAiCallsAsync(crashTurn);

    // Provider call 1 succeeds and writes to Appwrite canonical store
    await recordSuccessfulCustomerTurnAiCallAsync({
        customerTurnId: crashTurn,
        providerCallId: "call_crash_1",
        provider: "deepinfra",
        purpose: "customer_ai_reply",
    });

    // Provider call 2 succeeds and writes to Appwrite canonical store
    await recordSuccessfulCustomerTurnAiCallAsync({
        customerTurnId: crashTurn,
        providerCallId: "call_crash_2",
        provider: "deepinfra",
        purpose: "customer_ai_tool_followup",
    });

    // Worker crashes! Wipe in-memory cache completely
    __clearCustomerTurnLedgerMemoryCacheOnlyForTest();

    // Worker restarts and prepares outbound send: queries canonical ledger
    const rehydratedCount = await getSuccessfulCustomerTurnAiCallsCountAsync(crashTurn);
    assert.equal(rehydratedCount, 2);

    const rehydratedExtra = await getTurnExtraAiCallsCountAsync(crashTurn);
    assert.equal(rehydratedExtra, 1);

    const billing = await calculateCustomerTurnBillingAsync(crashTurn);
    assert.equal(billing.successfulCallsCount, 2);
    assert.equal(billing.baseAmount, 0.003);
    assert.equal(billing.extraAmount, 0.001);
    assert.equal(billing.totalAmount, 0.004); // Must be exactly $0.004, NOT $0.003 or $0.005

    await clearCustomerTurnAiCallsAsync(crashTurn);
});

test("customer-turn-ai-call-ledger-service: 45-day retention cleanup prunes expired records", async () => {
    const oldTimestamp = Date.now() - (46 * 24 * 60 * 60 * 1000); // 46 days ago (> 45 days retention)
    const freshTimestamp = Date.now() - (10 * 24 * 60 * 60 * 1000); // 10 days ago (active)

    const nowSuffix = Date.now();
    const oldTurn = `turn_retention_old_${nowSuffix}`;
    const freshTurn = `turn_retention_fresh_${nowSuffix}`;

    await clearCustomerTurnAiCallsAsync(oldTurn);
    await clearCustomerTurnAiCallsAsync(freshTurn);

    await recordSuccessfulCustomerTurnAiCallAsync({
        customerTurnId: oldTurn,
        providerCallId: "call_old_1",
        timestamp: oldTimestamp,
    });
    await recordSuccessfulCustomerTurnAiCallAsync({
        customerTurnId: freshTurn,
        providerCallId: "call_fresh_1",
        timestamp: freshTimestamp,
    });

    const pruned = await cleanupExpiredCustomerTurnAiCalls(Date.now(), 45 * 24 * 60 * 60 * 1000);
    assert.ok(pruned >= 1, "Should prune at least the 46-day-old record");

    // Fresh record remains accessible
    const freshCount = await getSuccessfulCustomerTurnAiCallsCountAsync(freshTurn);
    assert.equal(freshCount, 1);

    await clearCustomerTurnAiCallsAsync(freshTurn);
    await clearCustomerTurnAiCallsAsync(oldTurn);
});

test("customer-turn-ai-call-ledger-service: auto follow-up stable turn ID prevents duplicate billing on retry", () => {
    const followupTurn = "followup_sched_abc_attempt_0";
    clearCustomerTurnAiCalls(followupTurn);

    // Attempt 1: evaluation succeeds
    recordSuccessfulCustomerTurnAiCall({
        customerTurnId: followupTurn,
        providerCallId: "call_followup_eval",
        provider: "deepinfra",
        purpose: "ai_smart_followup_evaluation",
    });

    assert.equal(getSuccessfulCustomerTurnAiCallsCount(followupTurn), 1);
    assert.equal(calculateCustomerTurnBilling(followupTurn).totalAmount, 0.003);

    // Worker crashes, attempt retries with the SAME logical followupTurnId
    __clearCustomerTurnLedgerMemoryCacheOnlyForTest();

    // Duplicate evaluation call during retry gets deduped
    recordSuccessfulCustomerTurnAiCall({
        customerTurnId: followupTurn,
        providerCallId: "call_followup_eval",
        provider: "deepinfra",
        purpose: "ai_smart_followup_evaluation",
    });

    assert.equal(getSuccessfulCustomerTurnAiCallsCount(followupTurn), 1);
    assert.equal(calculateCustomerTurnBilling(followupTurn).totalAmount, 0.003); // Remains $0.003, no duplicate $0.003 base!

    clearCustomerTurnAiCalls(followupTurn);
});

test("customer-turn-ai-call-ledger-service: cross-worker multi-process concurrency (2 workers & 7 workers)", async () => {
    // 1. Setup shared HTTP coordinator backing canonical Appwrite SYSTEM_CONFIGS
    const canonicalDb = new Map<string, { value: string; updated_at: number }>();

    const server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
            let data: any = {};
            try { data = JSON.parse(body || "{}"); } catch {}

            res.writeHead(200, { "Content-Type": "application/json" });

            if (req.url === "/turn-ledger/create") {
                const docId = data.documentId;
                if (canonicalDb.has(docId)) {
                    res.writeHead(409, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ error: "Document already exists", code: 409 }));
                }
                canonicalDb.set(docId, { value: data.data.value, updated_at: data.data.updated_at });
                return res.end(JSON.stringify({ success: true, $id: docId }));
            }

            if (req.url?.startsWith("/turn-ledger/get/")) {
                const docId = req.url.replace("/turn-ledger/get/", "");
                const item = canonicalDb.get(docId);
                if (!item) {
                    res.writeHead(404, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ error: "Not found", code: 404 }));
                }
                return res.end(JSON.stringify({ $id: docId, ...item }));
            }

            if (req.url === "/turn-ledger/list") {
                const documents = Array.from(canonicalDb.entries()).map(([docId, entry]) => ({
                    $id: docId,
                    value: entry.value,
                    updated_at: entry.updated_at,
                }));
                return res.end(JSON.stringify({ documents }));
            }

            if (req.url?.startsWith("/turn-ledger/delete/")) {
                const docId = req.url.replace("/turn-ledger/delete/", "");
                canonicalDb.delete(docId);
                return res.end(JSON.stringify({ success: true }));
            }

            res.writeHead(404);
            res.end();
        });
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const coordinatorUrl = `http://127.0.0.1:${port}`;
    const workerScript = path.join(__dirname, "../../tests/ledger-concurrency-worker.mjs");

    function spawnWorker(envVars: Record<string, string>): Promise<number> {
        return new Promise((resolve) => {
            const child: ChildProcess = fork(workerScript, [], {
                env: {
                    ...process.env,
                    CUSTOMER_TURN_LEDGER_HTTP_ENDPOINT: coordinatorUrl,
                    ...envVars,
                },
                stdio: "ignore",
            });
            child.on("exit", (code) => resolve(code || 0));
        });
    }

    try {
        // --- 2 WORKERS CONCURRENT TEST ---
        const turn2Workers = "turn_concurrent_2_workers";

        // Spawn 2 independent Node.js processes concurrently
        const [codeA, codeB] = await Promise.all([
            spawnWorker({
                CUSTOMER_TURN_ID: turn2Workers,
                PROVIDER_CALL_ID: "call_from_worker_A",
                PROVIDER_NAME: "deepinfra",
            }),
            spawnWorker({
                CUSTOMER_TURN_ID: turn2Workers,
                PROVIDER_CALL_ID: "call_from_worker_B",
                PROVIDER_NAME: "gemini",
            }),
        ]);

        assert.equal(codeA, 0);
        assert.equal(codeB, 0);

        // Verify canonical database contains both calls without lost updates
        const turn2Calls = Array.from(canonicalDb.values())
            .map((entry) => JSON.parse(entry.value))
            .filter((rec) => rec.customerTurnId === turn2Workers);

        assert.equal(turn2Calls.length, 2, "Canonical database must hold both distinct provider calls");
        const extra2 = Math.max(0, turn2Calls.length - 1);
        assert.equal(extra2, 1, "2 calls = 1 extra call");
        const charge2 = Number((0.003 + extra2 * 0.001).toFixed(6));
        assert.equal(charge2, 0.004, "Delivered charge must be exactly $0.004");

        // --- 7 WORKERS CONCURRENT TEST ---
        const turn7Workers = "turn_concurrent_7_workers";

        // Spawn 7 independent Node.js processes concurrently
        const exitCodes = await Promise.all(
            Array.from({ length: 7 }, (_, i) =>
                spawnWorker({
                    CUSTOMER_TURN_ID: turn7Workers,
                    PROVIDER_CALL_ID: `call_worker_${i + 1}`,
                    PROVIDER_NAME: i % 2 === 0 ? "deepinfra" : "gemini",
                })
            )
        );

        for (const code of exitCodes) {
            assert.equal(code, 0, "All 7 worker processes must exit with code 0");
        }

        const turn7Calls = Array.from(canonicalDb.values())
            .map((entry) => JSON.parse(entry.value))
            .filter((rec) => rec.customerTurnId === turn7Workers);

        assert.equal(turn7Calls.length, 7, "Canonical database must hold all 7 distinct provider calls without lost updates");
        const extra7 = Math.max(0, turn7Calls.length - 1);
        assert.equal(extra7, 6, "7 calls = 6 extra calls");
        const charge7 = Number((0.003 + extra7 * 0.001).toFixed(6));
        assert.equal(charge7, 0.009, "Delivered charge must be exactly $0.009");

    } finally {
        server.close();
    }
});

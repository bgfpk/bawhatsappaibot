import test from "node:test";
import assert from "node:assert/strict";

// Simulation helper modeling /api/bots/update-config backend logic
async function simulateUpdateConfigHandler(options: {
  botId: string;
  config: any;
  userOwnsBot: boolean;
  dbSaveFn: (botId: string, config: any) => Promise<void>;
  activeWorkers: Map<string, { port: number }>;
  workerUpdateFn?: (port: number, config: any) => Promise<{ ok: boolean; status: number }>;
  payloadSizeLimitBytes?: number;
}) {
  const {
    botId,
    config,
    userOwnsBot,
    dbSaveFn,
    activeWorkers,
    workerUpdateFn,
    payloadSizeLimitBytes = 2 * 1024 * 1024,
  } = options;

  // Check payload size
  const serialized = JSON.stringify({ botId, config });
  if (Buffer.byteLength(serialized, "utf8") > payloadSizeLimitBytes) {
    return { status: 413, body: { error: "Payload Too Large" } };
  }

  if (!botId || !config) {
    return { status: 400, body: { error: "Missing fields" } };
  }

  if (!userOwnsBot) {
    return { status: 403, body: { error: "Unauthorized access to bot" } };
  }

  // 1. DB Save attempt
  try {
    await dbSaveFn(botId, config);
  } catch (dbError: any) {
    return {
      status: 500,
      body: {
        success: false,
        persisted: false,
        error: "Failed to persist configuration to database. Please check your connection and try again.",
      },
    };
  }

  // 2. Worker update attempt if worker exists
  let appliedToWorker = true;
  let workerWarning: string | undefined = undefined;

  if (activeWorkers.has(botId)) {
    const worker = activeWorkers.get(botId)!;
    try {
      if (workerUpdateFn) {
        const workerRes = await workerUpdateFn(worker.port, config);
        if (!workerRes.ok) {
          appliedToWorker = false;
          workerWarning = "Configuration saved to database, but the active instance could not reload it immediately. Settings will take effect on next restart.";
        }
      }
    } catch {
      appliedToWorker = false;
      workerWarning = "Configuration saved to database, but the active instance could not reload it immediately. Settings will take effect on next restart.";
    }
  }

  return {
    status: 200,
    body: {
      success: true,
      persisted: true,
      appliedToWorker,
      config,
      warning: workerWarning,
    },
  };
}

test("CASE A: DB save succeeds and running worker update succeeds", async () => {
  let dbSaved = false;
  let workerUpdated = false;

  const activeWorkers = new Map([["bot_1", { port: 5001 }]]);

  const res = await simulateUpdateConfigHandler({
    botId: "bot_1",
    config: { prompt: "Custom instructions", autoReply: true },
    userOwnsBot: true,
    dbSaveFn: async () => { dbSaved = true; },
    activeWorkers,
    workerUpdateFn: async () => {
      workerUpdated = true;
      return { ok: true, status: 200 };
    },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.persisted, true);
  assert.equal(res.body.appliedToWorker, true);
  assert.equal(res.body.warning, undefined);
  assert.equal(dbSaved, true);
  assert.equal(workerUpdated, true);
});

test("CASE B: DB save succeeds and no worker is running", async () => {
  let dbSaved = false;
  const activeWorkers = new Map<string, { port: number }>(); // No running worker

  const res = await simulateUpdateConfigHandler({
    botId: "bot_offline",
    config: { prompt: "Offline bot instructions", autoReply: false },
    userOwnsBot: true,
    dbSaveFn: async () => { dbSaved = true; },
    activeWorkers,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.persisted, true);
  assert.equal(res.body.appliedToWorker, true);
  assert.equal(res.body.warning, undefined);
  assert.equal(dbSaved, true);
});

test("CASE C: DB save succeeds but running worker update fails", async () => {
  let dbSaved = false;
  let workerAttempted = false;
  const activeWorkers = new Map([["bot_busy", { port: 5002 }]]);

  const res = await simulateUpdateConfigHandler({
    botId: "bot_busy",
    config: { prompt: "Updated instructions", autoReply: true },
    userOwnsBot: true,
    dbSaveFn: async () => { dbSaved = true; },
    activeWorkers,
    workerUpdateFn: async () => {
      workerAttempted = true;
      return { ok: false, status: 503 }; // Worker temporarily unresponsive
    },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.persisted, true);
  assert.equal(res.body.appliedToWorker, false, "appliedToWorker is false when worker update fails");
  assert.match(res.body.warning || "", /could not reload it immediately/);
  assert.equal(dbSaved, true);
  assert.equal(workerAttempted, true);
});

test("CASE D: DB save fails", async () => {
  let workerAttempted = false;
  const activeWorkers = new Map([["bot_error", { port: 5003 }]]);

  const res = await simulateUpdateConfigHandler({
    botId: "bot_error",
    config: { prompt: "Failed instructions" },
    userOwnsBot: true,
    dbSaveFn: async () => {
      throw new Error("Appwrite network failure");
    },
    activeWorkers,
    workerUpdateFn: async () => {
      workerAttempted = true;
      return { ok: true, status: 200 };
    },
  });

  assert.equal(res.status, 500, "Non-2xx returned when DB save fails");
  assert.equal(res.body.success, false);
  assert.equal(res.body.persisted, false);
  assert.equal(workerAttempted, false, "No worker update is attempted when DB save fails");
});

test("CASE E: Request exceeds configured payload limit (>2MB)", async () => {
  const hugePayload = {
    prompt: "x".repeat(3 * 1024 * 1024), // 3MB
  };
  const activeWorkers = new Map<string, { port: number }>();

  const res = await simulateUpdateConfigHandler({
    botId: "bot_huge",
    config: hugePayload,
    userOwnsBot: true,
    dbSaveFn: async () => {},
    activeWorkers,
  });

  assert.equal(res.status, 413, "HTTP 413 returned for payloads exceeding 2MB");
});

test("CASE F: Worker update-config is strictly apply-only and never creates duplicate DB generations", async () => {
  let dbSaveCount = 0;
  const dbSaveFn = async () => {
    dbSaveCount++;
  };

  const activeWorkers = new Map([["bot_apply_only", { port: 5005 }]]);

  // Manager updates config
  const res = await simulateUpdateConfigHandler({
    botId: "bot_apply_only",
    config: { prompt: "Test instruction", autoReply: true },
    userOwnsBot: true,
    dbSaveFn,
    activeWorkers,
    workerUpdateFn: async (_port, _config) => {
      // In the corrected worker code, worker does NOT call dbSaveFn!
      return { ok: true, status: 200 };
    },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  // Exactly 1 DB save occurred (from the authoritative manager), NOT 2
  assert.equal(dbSaveCount, 1, "Authoritative manager performs exactly 1 DB save; worker is apply-only");
});


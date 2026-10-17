import {
  buildBatchMessageCursor,
  normalizeBatchMessageTimestampSeconds,
} from "./customer-message-batch-service.ts";

type CustomerBatchStateDeps = {
  getSystemConfig: (key: string) => Promise<string | null>;
  setSystemConfig: (key: string, value: string) => Promise<void>;
};

export type CustomerMessageBatchTerminalState = "sent" | "failed_final" | "cancelled";

export type CustomerMessageBatchState = {
  lastHandledMessageCursor: string;
  lastHandledMessageTimestamp: number;
  handledMessageIds: string[];
  baselineAppliedAt: number;
  baselineReplyCursor: string;
  recentTerminalBatches: Array<{
    batchId: string;
    status: CustomerMessageBatchTerminalState;
    updatedAt: number;
  }>;
  activeBatch: null | {
    batchId: string;
    status: string;
    messageIds: string[];
    latestGenerationMessageId: string;
    updatedAt: number;
    transport: "socket" | "cloud";
  };
  updatedAt: number;
};

const MAX_HANDLED_MESSAGE_IDS = 200;
const MAX_TERMINAL_BATCHES = 40;
let testDeps: Partial<CustomerBatchStateDeps> | null = null;

function clean(value: any, max = 200) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function buildStorageKey(botId: string, jid: string) {
  return `customer_message_batch_state:${clean(botId, 80) || "unknown"}:${clean(jid, 120) || "unknown"}`;
}

function normalizeState(value: any): CustomerMessageBatchState {
  const handledMessageIds = Array.from(new Set<string>(
    Array.isArray(value?.handledMessageIds)
      ? value.handledMessageIds.map((item: any) => clean(item, 120)).filter(Boolean)
      : []
  )).slice(-MAX_HANDLED_MESSAGE_IDS);

  const recentTerminalBatches = (Array.isArray(value?.recentTerminalBatches) ? value.recentTerminalBatches : [])
    .map((item: any) => ({
      batchId: clean(item?.batchId, 120),
      status: clean(item?.status, 40) as CustomerMessageBatchTerminalState,
      updatedAt: Math.max(0, Number(item?.updatedAt || 0)),
    }))
    .filter((item) => item.batchId && (item.status === "sent" || item.status === "failed_final" || item.status === "cancelled"))
    .slice(-MAX_TERMINAL_BATCHES);

  const activeBatch = value?.activeBatch && clean(value.activeBatch.batchId, 120)
    ? {
      batchId: clean(value.activeBatch.batchId, 120),
      status: clean(value.activeBatch.status, 60),
      messageIds: Array.from(new Set<string>(
        Array.isArray(value.activeBatch.messageIds)
          ? value.activeBatch.messageIds.map((item: any) => clean(item, 120)).filter(Boolean)
          : []
      )).slice(-MAX_HANDLED_MESSAGE_IDS),
      latestGenerationMessageId: clean(value.activeBatch.latestGenerationMessageId, 120),
      updatedAt: Math.max(0, Number(value.activeBatch.updatedAt || 0)),
      transport: (clean(value.activeBatch.transport, 20) === "cloud" ? "cloud" : "socket") as "socket" | "cloud",
    }
    : null;

  return {
    lastHandledMessageCursor: clean(value?.lastHandledMessageCursor, 160),
    lastHandledMessageTimestamp: Math.max(0, Number(value?.lastHandledMessageTimestamp || 0)),
    handledMessageIds,
    baselineAppliedAt: Math.max(0, Number(value?.baselineAppliedAt || 0)),
    baselineReplyCursor: clean(value?.baselineReplyCursor, 160),
    recentTerminalBatches,
    activeBatch,
    updatedAt: Math.max(0, Number(value?.updatedAt || 0)),
  };
}

function parseState(raw: string | null) {
  if (!raw) return normalizeState(null);
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return normalizeState(null);
  }
}

async function resolveDeps(): Promise<CustomerBatchStateDeps> {
  if (testDeps?.getSystemConfig && testDeps?.setSystemConfig) {
    return testDeps as CustomerBatchStateDeps;
  }
  const dbService = await import("./db-service.ts");
  return {
    getSystemConfig: dbService.getSystemConfig,
    setSystemConfig: dbService.setSystemConfig,
  };
}

export async function loadCustomerMessageBatchState(botId: string, jid: string) {
  const deps = await resolveDeps();
  const raw = await deps.getSystemConfig(buildStorageKey(botId, jid));
  return parseState(raw);
}

export async function saveCustomerMessageBatchState(botId: string, jid: string, state: CustomerMessageBatchState) {
  const deps = await resolveDeps();
  const next = normalizeState({
    ...state,
    updatedAt: Date.now(),
  });
  await deps.setSystemConfig(buildStorageKey(botId, jid), JSON.stringify(next));
  return next;
}

export function withActiveBatchState(state: CustomerMessageBatchState, activeBatch: CustomerMessageBatchState["activeBatch"]) {
  return normalizeState({
    ...state,
    activeBatch,
  });
}

export function withHandledBatchMessages(
  state: CustomerMessageBatchState,
  input: { batchId: string; terminalStatus?: CustomerMessageBatchTerminalState; messages: any[] }
) {
  const terminalStatus = input.terminalStatus || "sent";
  let lastHandledMessageCursor = clean(state.lastHandledMessageCursor, 160);
  let lastHandledMessageTimestamp = Math.max(0, Number(state.lastHandledMessageTimestamp || 0));
  const nextHandledIds = new Set(state.handledMessageIds);

  for (const message of input.messages || []) {
    const messageId = clean(message?.key?.id, 120);
    if (messageId) nextHandledIds.add(messageId);
    const cursor = buildBatchMessageCursor(message);
    const timestamp = normalizeBatchMessageTimestampSeconds(message);
    if (cursor && (!lastHandledMessageCursor || cursor > lastHandledMessageCursor)) {
      lastHandledMessageCursor = cursor;
    }
    if (timestamp > lastHandledMessageTimestamp) {
      lastHandledMessageTimestamp = timestamp;
    }
  }

  const filteredTerminalBatches = state.recentTerminalBatches.filter((item) => item.batchId !== clean(input.batchId, 120));
  filteredTerminalBatches.push({
    batchId: clean(input.batchId, 120),
    status: terminalStatus,
    updatedAt: Date.now(),
  });

  return normalizeState({
    ...state,
    lastHandledMessageCursor,
    lastHandledMessageTimestamp,
    handledMessageIds: Array.from(nextHandledIds).slice(-MAX_HANDLED_MESSAGE_IDS),
    baselineReplyCursor: state.baselineReplyCursor || lastHandledMessageCursor,
    recentTerminalBatches: filteredTerminalBatches.slice(-MAX_TERMINAL_BATCHES),
    activeBatch: state.activeBatch?.batchId === clean(input.batchId, 120) ? null : state.activeBatch,
  });
}

export function withBaselineHandledMessages(
  state: CustomerMessageBatchState,
  input: { replyCursor?: string; replyTimestamp?: number; handledMessageIds?: string[]; markedMessages?: any[] }
) {
  const nextHandledIds = new Set(state.handledMessageIds);
  for (const messageId of input.handledMessageIds || []) {
    const safeId = clean(messageId, 120);
    if (safeId) nextHandledIds.add(safeId);
  }
  let lastHandledCursor = clean(state.lastHandledMessageCursor, 160);
  let lastHandledTimestamp = Math.max(0, Number(state.lastHandledMessageTimestamp || 0));
  for (const message of input.markedMessages || []) {
    const cursor = buildBatchMessageCursor(message);
    const timestamp = normalizeBatchMessageTimestampSeconds(message);
    if (cursor && (!lastHandledCursor || cursor > lastHandledCursor)) lastHandledCursor = cursor;
    if (timestamp > lastHandledTimestamp) lastHandledTimestamp = timestamp;
  }
  const replyCursor = clean(input.replyCursor, 160) || lastHandledCursor;
  const replyTimestamp = Math.max(0, Number(input.replyTimestamp || 0), lastHandledTimestamp);
  return normalizeState({
    ...state,
    handledMessageIds: Array.from(nextHandledIds).slice(-MAX_HANDLED_MESSAGE_IDS),
    lastHandledMessageCursor: replyCursor || lastHandledCursor,
    lastHandledMessageTimestamp: replyTimestamp || lastHandledTimestamp,
    baselineAppliedAt: Date.now(),
    baselineReplyCursor: replyCursor,
  });
}

export function isTerminalBatchRecorded(state: CustomerMessageBatchState, batchId: string) {
  const safeBatchId = clean(batchId, 120);
  return state.recentTerminalBatches.some((item) => item.batchId === safeBatchId);
}

export function __setCustomerMessageBatchStateTestDeps(overrides: Partial<CustomerBatchStateDeps>) {
  testDeps = { ...(testDeps || {}), ...(overrides || {}) };
}

export function __resetCustomerMessageBatchStateTestDeps() {
  testDeps = null;
}

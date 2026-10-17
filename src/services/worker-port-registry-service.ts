/**
 * Worker Port Registry Service
 * 
 * Provides cross-process worker port resolution between server master and bot worker processes.
 * Ensures services in one worker (e.g. Business Assistant) or server can reliably dispatch
 * outbound actions to another specific instance worker (e.g. Personal WhatsApp instance).
 */

import fs from "node:fs";
import path from "node:path";

export interface WorkerPortEntry {
  botId: string;
  port: number;
  updatedAt: number;
}

const memoryRegistry = new Map<string, WorkerPortEntry>();

function getRegistryFilePath(): string {
  return path.join(process.cwd(), "data", "worker-ports.json");
}

function ensureDataDir(): void {
  try {
    const dir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {
    // Non-blocking
  }
}

function readRegistryFile(): Record<string, WorkerPortEntry> {
  try {
    const filePath = getRegistryFilePath();
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      return JSON.parse(content) || {};
    }
  } catch {
    // Non-blocking fallback
  }
  return {};
}

function writeRegistryFile(data: Record<string, WorkerPortEntry>): void {
  try {
    ensureDataDir();
    const filePath = getRegistryFilePath();
    const tmpPath = `${filePath}.tmp_${Date.now()}`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmpPath, filePath);
  } catch {
    // Non-blocking fallback
  }
}

export function registerWorkerPort(botId: string, port: number): void {
  const cleanBotId = String(botId || "").trim();
  const cleanPort = Number(port);
  if (!cleanBotId || !cleanPort || isNaN(cleanPort)) return;

  const entry: WorkerPortEntry = {
    botId: cleanBotId,
    port: cleanPort,
    updatedAt: Date.now(),
  };

  memoryRegistry.set(cleanBotId, entry);

  try {
    const current = readRegistryFile();
    current[cleanBotId] = entry;
    writeRegistryFile(current);
  } catch {
    // Non-blocking
  }
}

export function unregisterWorkerPort(botId: string): void {
  const cleanBotId = String(botId || "").trim();
  if (!cleanBotId) return;

  memoryRegistry.delete(cleanBotId);

  try {
    const current = readRegistryFile();
    delete current[cleanBotId];
    writeRegistryFile(current);
  } catch {
    // Non-blocking
  }
}

export function getWorkerPort(botId: string): number | null {
  const cleanBotId = String(botId || "").trim();
  if (!cleanBotId) return null;

  if (memoryRegistry.has(cleanBotId)) {
    return memoryRegistry.get(cleanBotId)!.port;
  }

  const fileData = readRegistryFile();
  if (fileData[cleanBotId]?.port) {
    memoryRegistry.set(cleanBotId, fileData[cleanBotId]);
    return fileData[cleanBotId].port;
  }

  return null;
}

export function __setWorkerPortForTest(botId: string, port: number): void {
  memoryRegistry.set(botId, { botId, port, updatedAt: Date.now() });
}

export function __clearWorkerPortsForTest(): void {
  memoryRegistry.clear();
}

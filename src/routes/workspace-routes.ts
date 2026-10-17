/**
 * AI Group Workspaces HTTP & API Routes
 * 
 * Account-owned, instance-independent Workspace endpoints:
 * - Full CRUD & Lifecycle: List, Create, Get, Update, Archive, Restore, Clone, Delete
 * - Binding & Transports: Attach existing, Switch responder, Get available participating groups
 * - Messages & Media: Message history, File list, Secure authorized file downloads
 * - Memory & Intelligence: Structured memory CRUD, Tasks, Reminders (with sweep), Records, Audit events, Export
 */

import express, { type Express, type Request, type Response } from "express";
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
  listMessages,
  listMemoryItems,
  addMemoryItem,
  deleteMemoryItem,
  listFiles,
  getFileDownload,
  listTasks,
  createTask,
  updateTaskStatus,
  listReminders,
  createReminder,
  sweepDueReminders,
  listRecords,
  listEvents,
  exportWorkspaceData,
  listWorkspaceParticipants,
  grantWorkspaceAdmin,
  revokeWorkspaceAdmin,
} from "../services/workspace-service.ts";
import { buildWorkerInternalHeaders } from "../services/worker-internal-auth-service.ts";
import { getWorkerPort } from "../services/worker-port-registry-service.ts";
import type { WorkspaceStatus, WorkspaceReplyMode } from "../services/workspace-types.ts";

export type WorkspaceRouteDeps = {
  requireSessionAccount: (req: Request, res: Response) => Promise<any>;
  requireOwnedBot: (req: Request, res: Response, ownerUserId: string, botId: string) => Promise<any>;
  getStableUserId: (user: any) => string;
  spawnWorker?: (botId: string, userId: string, reason?: string) => Promise<{ port: number; process: any }>;
  activeWorkers?: Map<string, { port: number; process: any }>;
};

export function registerWorkspaceRoutes(app: Express, deps: WorkspaceRouteDeps) {
  // ==========================================
  // 1. WORKSPACE CRUD & LIFECYCLE
  // ==========================================

  // List all workspaces
  app.get("/api/user/workspaces", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);

      const status = req.query.status as WorkspaceStatus | undefined;
      const search = req.query.search ? String(req.query.search) : undefined;

      const workspaces = await listWorkspaces(accountId, { status, search });
      res.json({ success: true, workspaces });
    } catch (err: any) {
      const statusCode = err?.status || 500;
      res.status(statusCode).json({ error: err?.message || "Failed to list workspaces" });
    }
  });

  // Create workspace
  app.post("/api/user/workspaces", express.json({ limit: "64kb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);

      const { name, purpose, instructions, replyMode, responderInstanceId, groupJid, groupName, groupDescription } = req.body || {};

      if (!name || !responderInstanceId || !groupJid) {
        return res.status(400).json({ error: "Missing required fields: name, responderInstanceId, and groupJid are required" });
      }

      // Verify responder instance is owned by user
      const ownedBot = await deps.requireOwnedBot(req, res, accountId, responderInstanceId);
      if (!ownedBot) return;

      const result = await createWorkspace({
        accountId,
        name: String(name).trim(),
        purpose: String(purpose || "").trim(),
        instructions: String(instructions || "").trim(),
        replyMode: (replyMode as WorkspaceReplyMode) || "SMART_ASSIST",
        responderInstanceId: String(responderInstanceId).trim(),
        groupJid: String(groupJid).trim(),
        groupName: String(groupName || groupJid).trim(),
        groupDescription: String(groupDescription || "").trim(),
      });

      res.status(201).json({ success: true, workspace: result.workspace, binding: result.binding });
    } catch (err: any) {
      const statusCode = err?.status || 500;
      res.status(statusCode).json({ error: err?.message || "Failed to create workspace" });
    }
  });

  // Shared instance-level participating groups handler for Workspaces, Media, Sequence, and Welcome groups
  const handleParticipatingGroups = async (req: any, res: any) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const botId = String(req.query.botId || "").trim();

      if (!botId) {
        return res.status(400).json({ success: false, error: "botId is required" });
      }

      const ownedBot = await deps.requireOwnedBot(req, res, accountId, botId);
      if (!ownedBot) return;

      // Query active worker
      let workerPort: number | null = null;
      const worker = deps.activeWorkers?.get(botId) || (global as any).activeWorkers?.get(botId);
      if (worker?.port) {
        workerPort = worker.port;
      }
      if (!workerPort) {
        workerPort = getWorkerPort(botId);
      }

      if (!workerPort) {
        return res.status(503).json({ success: false, groups: [], offline: true, error: "Selected instance is offline or worker is unavailable" });
      }

      const workerResp = await fetch(`http://127.0.0.1:${workerPort}/api/instance-participating-groups`, {
        headers: {
          ...buildWorkerInternalHeaders(),
        },
      });

      if (!workerResp.ok) {
        return res.status(workerResp.status).json({ success: false, groups: [], error: `WhatsApp group sync failed with status ${workerResp.status}` });
      }

      const data: any = await workerResp.json();
      if (!data.success && data.error) {
        return res.status(500).json({ success: false, groups: [], error: data.error });
      }
      res.json({ success: true, groups: data.groups || [] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Failed to query participating groups" });
    }
  };

  app.get("/api/user/whatsapp/participating-groups", handleParticipatingGroups);
  app.get("/api/user/workspaces/participating-groups", handleParticipatingGroups);

  // Get workspace details and active binding
  app.get("/api/user/workspaces/:workspaceId", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const workspaceId = req.params.workspaceId;

      const workspace = await getWorkspace(accountId, workspaceId);
      res.json({ success: true, workspace });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to fetch workspace" });
    }
  });

  // Update workspace settings
  app.patch("/api/user/workspaces/:workspaceId", express.json({ limit: "64kb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const workspaceId = req.params.workspaceId;

      const { name, purpose, instructions, replyMode } = req.body || {};

      const updated = await updateWorkspace(accountId, workspaceId, {
        name,
        purpose,
        instructions,
        replyMode,
      });

      res.json({ success: true, workspace: updated });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to update workspace" });
    }
  });

  // Archive workspace
  app.post("/api/user/workspaces/:workspaceId/archive", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const workspaceId = req.params.workspaceId;

      const archived = await archiveWorkspace(accountId, workspaceId);
      res.json({ success: true, workspace: archived });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to archive workspace" });
    }
  });

  // Restore workspace
  app.post("/api/user/workspaces/:workspaceId/restore", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const workspaceId = req.params.workspaceId;

      const restored = await restoreWorkspace(accountId, workspaceId);
      res.json({ success: true, workspace: restored });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to restore workspace" });
    }
  });

  // Clone workspace
  app.post("/api/user/workspaces/:workspaceId/clone", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const workspaceId = req.params.workspaceId;

      const { copyInstructions, copySummary, copyMemory, copyTasks, newName } = req.body || {};

      const cloned = await cloneWorkspace(accountId, workspaceId, {
        copyInstructions: copyInstructions !== false,
        copySummary: copySummary !== false,
        copyMemory: copyMemory !== false,
        copyTasks: copyTasks !== false,
        newName,
      });

      res.status(201).json({ success: true, workspace: cloned });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to clone workspace" });
    }
  });

  // Delete workspace
  app.delete("/api/user/workspaces/:workspaceId", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const workspaceId = req.params.workspaceId;

      await deleteWorkspace(accountId, workspaceId);
      res.json({ success: true, message: "Workspace deleted successfully" });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to delete workspace" });
    }
  });

  // ==========================================
  // 2. BINDINGS & TRANSPORTS
  // ==========================================

  // Attach existing workspace to group/responder
  app.post("/api/user/workspaces/:workspaceId/attach", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const workspaceId = req.params.workspaceId;

      const { responderInstanceId, groupJid, groupName, groupDescription } = req.body || {};

      if (!responderInstanceId || !groupJid) {
        return res.status(400).json({ error: "responderInstanceId and groupJid are required" });
      }

      const ownedBot = await deps.requireOwnedBot(req, res, accountId, responderInstanceId);
      if (!ownedBot) return;

      const binding = await attachWorkspace(
        accountId,
        workspaceId,
        String(responderInstanceId).trim(),
        String(groupJid).trim(),
        String(groupName || groupJid).trim(),
        String(groupDescription || "").trim()
      );

      res.json({ success: true, binding });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to attach workspace" });
    }
  });

  // Switch responder instance
  app.post("/api/user/workspaces/:workspaceId/change-responder", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const workspaceId = req.params.workspaceId;

      const { newResponderInstanceId } = req.body || {};
      if (!newResponderInstanceId) {
        return res.status(400).json({ error: "newResponderInstanceId is required" });
      }

      const ownedBot = await deps.requireOwnedBot(req, res, accountId, newResponderInstanceId);
      if (!ownedBot) return;

      const binding = await switchResponder(accountId, workspaceId, String(newResponderInstanceId).trim());
      res.json({ success: true, binding });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to switch responder" });
    }
  });

  // ==========================================
  // 3. MESSAGES & FILES
  // ==========================================

  // Paginated message history
  app.get("/api/user/workspaces/:workspaceId/messages", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const workspaceId = req.params.workspaceId;

      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "50"), 10)));
      const offset = Math.max(0, parseInt(String(req.query.offset || "0"), 10));

      const { messages, total } = await listMessages(accountId, workspaceId, limit, offset);
      res.json({ success: true, messages, total, limit, offset });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to list messages" });
    }
  });

  // List files
  app.get("/api/user/workspaces/:workspaceId/files", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const workspaceId = req.params.workspaceId;

      const files = await listFiles(accountId, workspaceId);
      res.json({ success: true, files });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to list files" });
    }
  });

  // Download private workspace file
  app.get("/api/user/workspaces/:workspaceId/files/:fileId/download", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const { workspaceId, fileId } = req.params;

      const { file, buffer } = await getFileDownload(accountId, workspaceId, fileId);

      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.fileName)}"`);
      res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
      res.setHeader("Content-Length", buffer.length);
      res.end(buffer);
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to download file" });
    }
  });

  // ==========================================
  // 4. MEMORY, TASKS, REMINDERS, RECORDS, EVENTS
  // ==========================================

  // List memory items
  app.get("/api/user/workspaces/:workspaceId/memory", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const workspaceId = req.params.workspaceId;

      const memory = await listMemoryItems(accountId, workspaceId);
      res.json({ success: true, memory });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to list memory items" });
    }
  });

  // Add memory item
  app.post("/api/user/workspaces/:workspaceId/memory", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const workspaceId = req.params.workspaceId;

      const { type, title, content, metadata } = req.body || {};
      if (!type || !title || !content) {
        return res.status(400).json({ error: "type, title, and content are required" });
      }

      const item = await addMemoryItem(accountId, workspaceId, type, title, content, metadata || {}, null, null, "user-entered");
      res.status(201).json({ success: true, memoryItem: item });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to create memory item" });
    }
  });

  // Delete memory item
  app.delete("/api/user/workspaces/:workspaceId/memory/:memoryId", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const { workspaceId, memoryId } = req.params;

      await deleteMemoryItem(accountId, workspaceId, memoryId);
      res.json({ success: true });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to delete memory item" });
    }
  });

  // List tasks
  app.get("/api/user/workspaces/:workspaceId/tasks", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const workspaceId = req.params.workspaceId;

      const tasks = await listTasks(accountId, workspaceId);
      res.json({ success: true, tasks });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to list tasks" });
    }
  });

  // Create task
  app.post("/api/user/workspaces/:workspaceId/tasks", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const workspaceId = req.params.workspaceId;

      const { title, details, assignee, dueAt } = req.body || {};
      if (!title) return res.status(400).json({ error: "Task title is required" });

      const task = await createTask(accountId, workspaceId, title, details || "", assignee, dueAt);
      res.status(201).json({ success: true, task });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to create task" });
    }
  });

  // Update task status
  app.patch("/api/user/workspaces/:workspaceId/tasks/:taskId", express.json({ limit: "16kb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const { workspaceId, taskId } = req.params;
      const { status } = req.body || {};

      if (!status) return res.status(400).json({ error: "status is required" });

      const task = await updateTaskStatus(accountId, workspaceId, taskId, status);
      res.json({ success: true, task });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to update task" });
    }
  });

  // List reminders
  app.get("/api/user/workspaces/:workspaceId/reminders", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const workspaceId = req.params.workspaceId;

      const reminders = await listReminders(accountId, workspaceId);
      res.json({ success: true, reminders });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to list reminders" });
    }
  });

  // Create reminder
  app.post("/api/user/workspaces/:workspaceId/reminders", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const workspaceId = req.params.workspaceId;

      const { destination, dueAt, message } = req.body || {};
      if (!dueAt || !message) return res.status(400).json({ error: "dueAt and message are required" });

      const reminder = await createReminder(accountId, workspaceId, destination || "group", dueAt, message, "owner", accountId);
      res.status(201).json({ success: true, reminder });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to create reminder" });
    }
  });

  // List structured records
  app.get("/api/user/workspaces/:workspaceId/records", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const workspaceId = req.params.workspaceId;

      const records = await listRecords(accountId, workspaceId);
      res.json({ success: true, records });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to list records" });
    }
  });

  // List audit events
  app.get("/api/user/workspaces/:workspaceId/events", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const workspaceId = req.params.workspaceId;

      const events = await listEvents(accountId, workspaceId);
      res.json({ success: true, events });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to list events" });
    }
  });

  // Export workspace data
  app.get("/api/user/workspaces/:workspaceId/export", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const workspaceId = req.params.workspaceId;

      const data = await exportWorkspaceData(accountId, workspaceId);
      res.setHeader("Content-Disposition", `attachment; filename="workspace_${workspaceId}_export.json"`);
      res.setHeader("Content-Type", "application/json");
      res.json(data);
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to export workspace" });
    }
  });

  // ==========================================
  // 5. PARTICIPANTS & EXPLICIT WORKSPACE ADMIN
  // ==========================================

  // List participants
  app.get("/api/user/workspaces/:workspaceId/participants", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const workspaceId = req.params.workspaceId;

      const participants = await listWorkspaceParticipants(accountId, workspaceId);
      res.json({ success: true, participants });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to list participants" });
    }
  });

  // Grant Workspace Admin (OWNER only)
  app.post("/api/user/workspaces/:workspaceId/participants/:jid/grant-admin", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const { workspaceId, jid } = req.params;

      const participant = await grantWorkspaceAdmin(accountId, workspaceId, decodeURIComponent(jid), "OWNER");
      res.json({ success: true, participant });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to grant Workspace Admin" });
    }
  });

  // Revoke Workspace Admin (OWNER only)
  app.post("/api/user/workspaces/:workspaceId/participants/:jid/revoke-admin", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const { workspaceId, jid } = req.params;

      const participant = await revokeWorkspaceAdmin(accountId, workspaceId, decodeURIComponent(jid), "OWNER");
      res.json({ success: true, participant });
    } catch (err: any) {
      const statusCode = err?.status || (err?.message?.includes("Forbidden") ? 403 : 500);
      res.status(statusCode).json({ error: err?.message || "Failed to revoke Workspace Admin" });
    }
  });
}

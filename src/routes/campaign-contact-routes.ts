import type { Express, Request, Response } from "express";
import express from "express";
import {
  createContactList,
  deleteContactList,
  downloadPrivateOriginalCsv,
  exportContactListCsv,
  getContactList,
  importContactsFromCsv,
  listContactLists,
  listSuppressions,
  queryContactListContacts,
  runContactListWhatsAppValidation,
  sanitizeCsvExportValue,
  suppressPhone,
  unsuppressPhone,
  type ContactValidationStatus,
  type SuppressionStatus,
} from "../services/contact-list-service.ts";
import {
  cancelCampaign,
  changeCampaignSendingInstance,
  createCampaign,
  getCampaign,
  listCampaignEvents,
  listCampaigns,
  pauseCampaign,
  processDueCampaignRecipients,
  queryCampaignRecipients,
  resumeCampaign,
  startCampaign,
  type CampaignMessageMode,
  type CampaignStatus,
  type CampaignRecipientStatus,
} from "../services/campaign-service.ts";
import { buildWorkerInternalHeaders } from "../services/worker-internal-auth-service.ts";

export type CampaignContactRouteDeps = {
  requireSessionAccount: (req: Request, res: Response) => Promise<any>;
  requireOwnedBot: (req: Request, res: Response, ownerUserId: string, botId: string) => Promise<any>;
  getStableUserId: (user: any) => string;
  spawnWorker?: (botId: string, userId: string, reason?: string) => Promise<{ port: number; process: any }>;
  activeWorkers?: Map<string, { port: number; process: any }>;
};

export function registerCampaignContactRoutes(app: Express, deps: CampaignContactRouteDeps) {
  // ==========================================
  // CONTACT LISTS
  // ==========================================

  // List all contact lists for account
  app.get("/api/user/contact-lists", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const lists = await listContactLists(accountId);
      res.json({ success: true, lists });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch contact lists" });
    }
  });

  // Create a new contact list
  app.post("/api/user/contact-lists", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const name = String(req.body?.name || "").trim();
      const description = String(req.body?.description || "").trim();
      if (!name) {
        return res.status(400).json({ error: "List name is required" });
      }
      const list = await createContactList({ accountId, name, description });
      res.json({ success: true, list });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to create contact list" });
    }
  });

  // Get contact list detail
  app.get("/api/user/contact-lists/:id", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const list = await getContactList(accountId, req.params.id);
      if (!list) {
        return res.status(404).json({ error: "Contact list not found" });
      }
      res.json({ success: true, list });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to get contact list" });
    }
  });

  // Delete contact list
  app.delete("/api/user/contact-lists/:id", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const success = await deleteContactList(accountId, req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Contact list not found or delete rejected" });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to delete contact list" });
    }
  });

  // Import contacts into list (from parsed rows or raw CSV)
  app.post("/api/user/contact-lists/:id/import", express.json({ limit: "15mb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const listId = req.params.id;

      const list = await getContactList(accountId, listId);
      if (!list) {
        return res.status(404).json({ error: "Contact list not found" });
      }

      let csvText = typeof req.body?.rawCsvContent === "string" ? req.body.rawCsvContent : "";
      const rawRows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const fileName = String(req.body?.fileName || "contacts.csv").trim();
      const columnMapping = req.body?.headerMapping || req.body?.columnMapping;

      if (!csvText && rawRows.length > 0) {
        // Convert rows array to CSV text
        const keys = Object.keys(rawRows[0] || {});
        if (keys.length > 0) {
          const headerLine = keys.map((k) => `"${k.replace(/"/g, '""')}"`).join(",");
          const dataLines = rawRows.map((r: any) =>
            keys.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(",")
          );
          csvText = [headerLine, ...dataLines].join("\n");
        }
      }

      if (!csvText) {
        return res.status(400).json({ error: "No valid CSV content or rows provided for import" });
      }

      const summary = await importContactsFromCsv({
        accountId,
        listId,
        csvText,
        fileName,
        columnMapping,
      });

      res.json({
        success: true,
        importSummary: {
          totalRows: summary.totalRows,
          uniqueContacts: summary.uniqueContacts,
          validContacts: summary.validContacts,
          invalidContacts: summary.invalidContacts,
          suppressedContacts: summary.suppressedContacts,
          importId: summary.importId,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to import contacts" });
    }
  });

  // List contacts in list (paginated, searchable, filterable)
  app.get("/api/user/contact-lists/:id/contacts", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const listId = req.params.id;

      const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "50"), 10)));
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const validationStatus = typeof req.query.validationStatus === "string" ? (req.query.validationStatus as ContactValidationStatus) : undefined;
      const suppressionStatus = typeof req.query.suppressionStatus === "string" ? (req.query.suppressionStatus as SuppressionStatus) : undefined;

      const data = await queryContactListContacts(accountId, listId, {
        page,
        limit,
        search,
        validationStatus,
        suppressionStatus,
      });

      res.json({ success: true, ...data });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch contacts" });
    }
  });

  // Download raw original CSV (private, authenticated)
  app.get("/api/user/contact-lists/:id/raw-csv", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const listId = req.params.id;

      const list = await getContactList(accountId, listId);
      if (!list) {
        return res.status(404).json({ error: "Contact list not found" });
      }

      const fileData = await downloadPrivateOriginalCsv(accountId, list.sourceImportId);
      if (!fileData) {
        return res.status(404).json({ error: "Original CSV file not found in storage" });
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileData.fileName)}"`);
      res.setHeader("Cache-Control", "no-store, private");
      res.send(fileData.content);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to download original CSV" });
    }
  });

  // Export contacts as sanitized CSV (formula injection protected)
  app.get("/api/user/contact-lists/:id/export", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const listId = req.params.id;

      const csvContent = await exportContactListCsv(accountId, listId);
      const list = await getContactList(accountId, listId);
      const exportName = list?.name ? `${list.name}-contacts.csv` : "contacts.csv";

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(exportName)}"`);
      res.send(csvContent);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to export contacts" });
    }
  });

  // Start WhatsApp existence validation for contact list
  app.post("/api/user/contact-lists/:id/validate", express.json({ limit: "16kb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const listId = req.params.id;
      const botId = String(req.body?.botId || "").trim();

      if (!botId) {
        return res.status(400).json({ error: "A connected WhatsApp instance (botId) is required for validation" });
      }

      // Verify instance ownership
      const bot = await deps.requireOwnedBot(req, res, accountId, botId);
      if (!bot) return;

      // Ensure worker is running
      let workerPort: number | undefined;
      if (deps.activeWorkers?.has(botId)) {
        workerPort = deps.activeWorkers.get(botId)!.port;
      } else if (deps.spawnWorker) {
        const worker = await deps.spawnWorker(botId, accountId, "campaign_validation");
        workerPort = worker.port;
      }

      if (!workerPort) {
        return res.status(503).json({ error: "WhatsApp instance worker is not running or available" });
      }

      // Baileys onWhatsApp checker caller
      const onWhatsAppChecker = async (numbers: string[]) => {
        try {
          const resp = await fetch(`http://127.0.0.1:${workerPort}/api/check-on-whatsapp`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...buildWorkerInternalHeaders(),
            },
            body: JSON.stringify({ numbers }),
          });
          if (!resp.ok) {
            throw new Error(`Worker returned status ${resp.status}`);
          }
          const body: any = await resp.json();
          return (body.results || []) as Array<{ jid?: string; exists: boolean }>;
        } catch (checkErr: any) {
          console.error("[Validation Checker] Call failed:", checkErr?.message || checkErr);
          throw checkErr;
        }
      };

      const result = await runContactListWhatsAppValidation({
        accountId,
        listId,
        botId,
        onWhatsAppFn: onWhatsAppChecker,
        batchSize: 50,
      });

      res.json({ success: true, validationSummary: result });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to validate contacts" });
    }
  });

  // ==========================================
  // CONTACT SUPPRESSIONS
  // ==========================================

  // List account suppressions
  app.get("/api/user/contact-suppressions", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const suppressions = await listSuppressions(accountId);
      res.json({ success: true, suppressions });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch suppressions" });
    }
  });

  // Manually suppress a phone number
  app.post("/api/user/contact-suppressions", express.json({ limit: "16kb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const phone = String(req.body?.phone || "").trim();
      const reason = String(req.body?.reason || "MANUAL").trim();

      if (!phone) {
        return res.status(400).json({ error: "Phone number is required" });
      }

      const rec = await suppressPhone({ accountId, phone, reason });
      res.json({ success: true, suppression: rec });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to suppress contact" });
    }
  });

  // Unsuppress a phone number
  app.delete("/api/user/contact-suppressions/:phone", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const phone = req.params.phone;

      const success = await unsuppressPhone(accountId, phone);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to unsuppress contact" });
    }
  });

  // ==========================================
  // CAMPAIGNS
  // ==========================================

  // List campaigns for account
  app.get("/api/user/campaigns", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const campaigns = await listCampaigns(accountId);
      res.json({ success: true, campaigns });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to list campaigns" });
    }
  });

  // Create a new campaign
  app.post("/api/user/campaigns", express.json({ limit: "64kb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);

      const name = String(req.body?.name || "").trim();
      const contactListId = String(req.body?.contactListId || "").trim();
      const sendingInstanceId = String(req.body?.sendingInstanceId || "").trim();
      const messageMode = (req.body?.messageMode === "AI_PERSONALIZED" ? "AI_PERSONALIZED" : "FIXED") as CampaignMessageMode;
      const campaignInstructions = req.body?.campaignInstructions ? String(req.body.campaignInstructions).trim() : undefined;
      const campaignFixedMessage = req.body?.campaignFixedMessage ? String(req.body.campaignFixedMessage).trim() : undefined;
      const timingMode = req.body?.timingMode === "RANDOM_RANGE" ? "RANDOM_RANGE" : "FIXED_DELAY";
      const fixedDelaySeconds = typeof req.body?.fixedDelaySeconds === "number" ? req.body.fixedDelaySeconds : undefined;
      const randomMinSeconds = typeof req.body?.randomMinSeconds === "number" ? req.body.randomMinSeconds : undefined;
      const randomMaxSeconds = typeof req.body?.randomMaxSeconds === "number" ? req.body.randomMaxSeconds : undefined;
      const timezone = req.body?.timezone ? String(req.body.timezone).trim() : undefined;
      const sendingWindowStart = req.body?.sendingWindowStart ? String(req.body.sendingWindowStart).trim() : undefined;
      const sendingWindowEnd = req.body?.sendingWindowEnd ? String(req.body.sendingWindowEnd).trim() : undefined;

      if (!name) return res.status(400).json({ error: "Campaign name is required" });
      if (!contactListId) return res.status(400).json({ error: "Contact list is required" });
      if (!sendingInstanceId) return res.status(400).json({ error: "Sending instance is required" });

      // Verify list ownership
      const list = await getContactList(accountId, contactListId);
      if (!list) return res.status(404).json({ error: "Contact list not found" });

      // Verify sending instance ownership
      const bot = await deps.requireOwnedBot(req, res, accountId, sendingInstanceId);
      if (!bot) return;

      const campaign = await createCampaign({
        accountId,
        name,
        contactListId,
        sendingInstanceId,
        messageMode,
        campaignInstructions,
        campaignFixedMessage,
        timingMode,
        fixedDelaySeconds,
        randomMinSeconds,
        randomMaxSeconds,
        timezone,
        sendingWindowStart,
        sendingWindowEnd,
      });

      res.json({ success: true, campaign });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to create campaign" });
    }
  });

  // Get campaign detail
  app.get("/api/user/campaigns/:id", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const campaign = await getCampaign(accountId, req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.json({ success: true, campaign });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to get campaign" });
    }
  });

  // Start campaign (creates recipient snapshot and transitions to RUNNING/SCHEDULED)
  app.post("/api/user/campaigns/:id/start", express.json({ limit: "16kb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const consentAcknowledged = req.body?.consentAcknowledged === true;

      const campaign = await startCampaign({
        accountId,
        campaignId: req.params.id,
        consentAcknowledged,
      });
      res.json({ success: true, campaign });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to start campaign" });
    }
  });

  // Pause campaign
  app.post("/api/user/campaigns/:id/pause", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const campaign = await pauseCampaign(accountId, req.params.id);
      res.json({ success: true, campaign });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to pause campaign" });
    }
  });

  // Resume campaign
  app.post("/api/user/campaigns/:id/resume", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const campaign = await resumeCampaign(accountId, req.params.id);
      res.json({ success: true, campaign });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to resume campaign" });
    }
  });

  // Cancel campaign
  app.post("/api/user/campaigns/:id/cancel", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const campaign = await cancelCampaign(accountId, req.params.id);
      res.json({ success: true, campaign });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to cancel campaign" });
    }
  });

  // Reassign sending instance
  app.post("/api/user/campaigns/:id/change-instance", express.json({ limit: "16kb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const newBotId = String(req.body?.newSendingInstanceId || "").trim();

      if (!newBotId) {
        return res.status(400).json({ error: "Replacement sending instance ID is required" });
      }

      // Check ownership of new bot
      const bot = await deps.requireOwnedBot(req, res, accountId, newBotId);
      if (!bot) return;

      const campaign = await changeCampaignSendingInstance({
        accountId,
        campaignId: req.params.id,
        newInstanceId: newBotId,
      });
      res.json({ success: true, campaign });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to reassign campaign sending instance" });
    }
  });

  // List campaign recipients (paginated)
  app.get("/api/user/campaigns/:id/recipients", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const campaignId = req.params.id;

      // Ownership check
      const campaign = await getCampaign(accountId, campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "50"), 10)));
      const status = typeof req.query.status === "string" ? (req.query.status as CampaignRecipientStatus) : undefined;

      const data = await queryCampaignRecipients(accountId, campaignId, { page, limit, status });
      res.json({ success: true, ...data });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch campaign recipients" });
    }
  });

  // List campaign events
  app.get("/api/user/campaigns/:id/events", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const campaignId = req.params.id;

      // Ownership check
      const campaign = await getCampaign(accountId, campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const events = await listCampaignEvents(accountId, campaignId);
      res.json({ success: true, events });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch campaign events" });
    }
  });

  // Manual or scheduled trigger for due recipient processing
  app.post("/api/user/campaigns/sweep", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);

      // Define sendTextMessageFn conforming to SendTextMessageFn
      const sendTextMessageFn = async (
        jid: string,
        text: string,
        options?: { sendingInstanceId?: string; recipientId?: string }
      ) => {
        const botId = options?.sendingInstanceId || "";
        let port: number | undefined;
        if (deps.activeWorkers?.has(botId)) {
          port = deps.activeWorkers.get(botId)!.port;
        } else if (deps.spawnWorker) {
          const worker = await deps.spawnWorker(botId, accountId, "campaign_send");
          port = worker.port;
        }
        if (!port) {
          return { success: false, error: "Sending instance worker not available" };
        }

        const resp = await fetch(`http://127.0.0.1:${port}/api/send-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...buildWorkerInternalHeaders() },
          body: JSON.stringify({
            to: jid,
            text,
            accountId,
            contextType: "campaign",
            idempotencyKey: `camp_send_${options?.recipientId || Date.now()}`,
          }),
        });
        const body: any = await resp.json().catch(() => ({}));
        if (resp.ok && (body.success || body.messageId)) {
          return {
            success: true,
            messageId: body.messageId || `msg_camp_${Date.now()}`,
            rawReceipt: body,
          };
        }
        return { success: false, error: body.error || `Worker send failed (${resp.status})` };
      };

      const result = await processDueCampaignRecipients({
        workerId: `api_sweep_${accountId}`,
        accountId,
        sendTextMessageFn,
      });

      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Campaign sweep failed" });
    }
  });
}

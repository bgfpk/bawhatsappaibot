import type { Express, Request, Response } from "express";
import express from "express";
import { bulkAssignCrmLeads } from "../services/crm-lead-bulk-assignment-service.ts";
import { buildCrmTeamWorkflow } from "../services/crm-team-workflow-service.ts";
import {
  loadLeadRoutingSettings,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  listRecentRoutingAudits,
  reassignLeadDepartment,
} from "../services/department-lead-routing-service.ts";

export type CrmLeadRoutingRouteDeps = {
  requireSessionAccount: (req: Request, res: Response) => Promise<any>;
  getStableUserId: (user: any) => string;
};

function safeError(error: any, fallback = "CRM routing request failed") {
  return String(error?.message || fallback).slice(0, 240);
}

function withTeamWorkflow(body: any) {
  if (!body || typeof body !== "object" || body.teamWorkflow) return body;
  const hasOverviewData = Array.isArray(body.staff) || Array.isArray(body.leads) || Array.isArray(body.followUps);
  if (!hasOverviewData) return body;
  return {
    ...body,
    teamWorkflow: buildCrmTeamWorkflow({
      staff: body.staff || [],
      leads: body.leads || [],
      followUps: body.followUps || [],
      reports: body.reports || {},
    }),
  };
}

export function registerCrmLeadRoutingRoutes(app: Express, deps: CrmLeadRoutingRouteDeps) {
  app.use("/api/user/crm/overview", (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = ((body: any) => originalJson(withTeamWorkflow(body))) as any;
    next();
  });

  app.post("/api/user/crm/leads/bulk-assign", express.json({ limit: "24kb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const result = await bulkAssignCrmLeads(deps.getStableUserId(user), req.body || {});
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: safeError(error, "Failed to bulk assign CRM leads") });
    }
  });

  // -------------------------------------------------------------------------
  // Department-Based Lead Routing REST APIs (Strict Tenant Isolation)
  // -------------------------------------------------------------------------

  app.get("/api/user/lead-routing/departments", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const settings = await loadLeadRoutingSettings(accountId);
      res.json({
        success: true,
        departments: settings.departments || [],
        fallbackDepartmentId: settings.fallbackDepartmentId,
        autoForwardOnConfirmation: settings.autoForwardOnConfirmation,
      });
    } catch (error: any) {
      res.status(500).json({ error: safeError(error, "Failed to load departments") });
    }
  });

  app.post("/api/user/lead-routing/departments", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const dept = await createDepartment(accountId, req.body || {});
      res.json({ success: true, department: dept });
    } catch (error: any) {
      res.status(400).json({ error: safeError(error, "Failed to create department") });
    }
  });

  app.put("/api/user/lead-routing/departments/:id", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const dept = await updateDepartment(accountId, req.params.id, req.body || {});
      res.json({ success: true, department: dept });
    } catch (error: any) {
      res.status(400).json({ error: safeError(error, "Failed to update department") });
    }
  });

  app.delete("/api/user/lead-routing/departments/:id", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const deleted = await deleteDepartment(accountId, req.params.id);
      res.json({ success: true, deleted });
    } catch (error: any) {
      res.status(400).json({ error: safeError(error, "Failed to delete department") });
    }
  });

  app.get("/api/user/lead-routing/audits", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const audits = listRecentRoutingAudits(accountId);
      res.json({ success: true, audits });
    } catch (error: any) {
      res.status(500).json({ error: safeError(error, "Failed to load lead routing audits") });
    }
  });

  app.post("/api/user/lead-routing/reassign", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const { leadId, targetDepartmentId, reason } = req.body || {};
      const result = await reassignLeadDepartment(
        accountId,
        req.body?.botId || accountId,
        leadId,
        targetDepartmentId,
        "manual_admin",
        reason
      );
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: safeError(error, "Failed to reassign department") });
    }
  });
}

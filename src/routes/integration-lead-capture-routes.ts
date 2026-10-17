import type { Express, Request, Response } from "express";
import express from "express";
import { registerCrmLeadRoutingRoutes } from "./crm-lead-routing-routes.ts";
import {
  authenticateIntegrationApiKey,
  authenticateLeadCaptureHmacSignature,
  authenticateLeadCaptureWebhookSecret,
  getLeadCaptureAuthStatus,
  regenerateLeadCaptureWebhookSecret,
} from "../services/integration-auth-service.ts";
import {
  captureIntegrationLead,
  recordIntegrationCaptureFailure,
} from "../services/integration-lead-capture-service.ts";
import {
  getIntegrationEventSummary,
  listIntegrationEvents,
  recordIntegrationEvent,
} from "../services/integration-event-log-service.ts";

export type IntegrationLeadCaptureRouteDeps = {
  requireSessionAccount: (req: Request, res: Response) => Promise<any>;
  getStableUserId: (user: any) => string;
  getRequestIp?: (req: Request) => string;
};

function safeError(error: any, fallback = "Integration request failed") {
  return String(error?.message || fallback)
    .replace(/bai_live_[a-zA-Z0-9_-]+/g, "[redacted_api_key]")
    .replace(/bai_whsec_[a-zA-Z0-9_-]+/g, "[redacted_webhook_secret]")
    .slice(0, 240);
}

function getIdempotencyKey(req: Request) {
  return String(req.headers["idempotency-key"] || req.headers["x-idempotency-key"] || req.body?.idempotencyKey || req.body?.externalId || req.body?.id || req.body?.orderId || "").trim();
}

function getRawAuthHeader(req: Request) {
  return req.headers.authorization || req.headers["x-api-key"] || req.headers["x-blackarrow-api-key"];
}

function getWebhookSecretHeader(req: Request) {
  return req.headers["x-blackarrow-webhook-secret"] || req.headers["x-webhook-secret"];
}

function inferWooEventType(req: Request) {
  const topic = String(req.headers["x-wc-webhook-topic"] || req.headers["x-woocommerce-topic"] || req.body?.eventType || "").toLowerCase();
  if (topic.includes("customer")) return "customer.created";
  if (topic.includes("order")) return "order.created";
  return String(req.body?.billing || req.body?.line_items ? "order.created" : "customer.created");
}

async function loadStatus(accountId: string) {
  const [auth, events, summary] = await Promise.all([
    getLeadCaptureAuthStatus(accountId),
    listIntegrationEvents(accountId).catch(() => []),
    getIntegrationEventSummary(accountId).catch(() => ({ recentCount: 0, counts: {}, lastSuccess: null, lastFailure: null })),
  ]);
  return {
    auth,
    events: events.slice(0, 20),
    summary,
  };
}

export function registerIntegrationLeadCaptureRoutes(app: Express, deps: IntegrationLeadCaptureRouteDeps) {
  registerCrmLeadRoutingRoutes(app, deps);

  app.get("/api/user/integrations/lead-capture/status", async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      res.json({ success: true, leadCapture: await loadStatus(accountId) });
    } catch (error: any) {
      res.status(500).json({ error: safeError(error, "Failed to load lead capture status") });
    }
  });

  app.post("/api/user/integrations/lead-capture/regenerate-secret", express.json({ limit: "16kb" }), async (req, res) => {
    try {
      const user = await deps.requireSessionAccount(req, res);
      if (!user) return;
      const accountId = deps.getStableUserId(user);
      const result = await regenerateLeadCaptureWebhookSecret(accountId);
      res.json({ success: true, ...result, leadCapture: await loadStatus(accountId) });
    } catch (error: any) {
      res.status(400).json({ error: safeError(error, "Failed to regenerate webhook secret") });
    }
  });

  app.post("/api/integrations/leads", express.json({ limit: "64kb" }), async (req, res) => {
    let accountId = "";
    try {
      const auth = await authenticateIntegrationApiKey(getRawAuthHeader(req), "write:leads", req.path, req.method);
      if (!auth) return res.status(401).json({ success: false, error: "Invalid API key or missing write:leads scope" });
      accountId = auth.userId;
      const result = await captureIntegrationLead(accountId, req.body || {}, {
        source: String(req.body?.source || "").toLowerCase().includes("wordpress") ? "wordpress" : "website_api",
        eventType: "lead.created",
        idempotencyKey: getIdempotencyKey(req),
      });
      res.status(result.duplicate ? 200 : 202).json({
        success: true,
        duplicate: result.duplicate,
        lead: result.lead ? { id: result.lead.id, source: result.lead.source, status: result.lead.status } : null,
        event: { id: result.event?.id, status: result.event?.status, reason: result.event?.reason },
      });
    } catch (error: any) {
      if (accountId) {
        await recordIntegrationCaptureFailure(accountId, {
          provider: "website_api",
          source: "website_api",
          eventType: "lead.created",
          reason: safeError(error, "lead_capture_failed"),
          idempotencyKey: getIdempotencyKey(req),
          httpStatus: 400,
          metadata: req.body || {},
        }).catch(() => {});
      }
      res.status(400).json({ success: false, error: safeError(error, "Failed to capture lead") });
    }
  });

  app.post(
    "/api/integrations/woocommerce/webhook",
    express.json({
      limit: "256kb",
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
    async (req: any, res) => {
      let accountId = "";
      try {
        const rawSignature = req.headers["x-wc-webhook-signature"] || req.headers["x-woocommerce-signature"];
        if (!rawSignature) {
          return res.status(401).json({
            success: false,
            error: "Missing required WooCommerce webhook signature (X-WC-Webhook-Signature).",
          });
        }

        const rawPayload = req.rawBody || (typeof req.body === "string" ? req.body : JSON.stringify(req.body || {}));
        const auth = await authenticateLeadCaptureHmacSignature(rawPayload, rawSignature, "base64");

        if (!auth) {
          return res.status(401).json({
            success: false,
            error: "Invalid WooCommerce webhook signature or signing secret needs regeneration",
          });
        }

        accountId = auth.userId;
        const eventType = inferWooEventType(req);
        const result = await captureIntegrationLead(accountId, { ...(req.body || {}), eventType }, {
          source: "woocommerce",
          eventType,
          idempotencyKey: getIdempotencyKey(req),
        });
        res.status(result.duplicate ? 200 : 202).json({
          success: true,
          duplicate: result.duplicate,
          lead: result.lead ? { id: result.lead.id, source: result.lead.source, status: result.lead.status } : null,
          event: { id: result.event?.id, status: result.event?.status, reason: result.event?.reason },
        });
      } catch (error: any) {
        if (accountId) {
          await recordIntegrationEvent(accountId, {
            provider: "woocommerce",
            source: "woocommerce",
            eventType: inferWooEventType(req),
            status: "failed",
            reason: safeError(error, "woocommerce_capture_failed"),
            idempotencyKey: getIdempotencyKey(req),
            httpStatus: 400,
            metadata: req.body || {},
          }).catch(() => {});
        }
        res.status(400).json({ success: false, error: safeError(error, "Failed to capture WooCommerce webhook") });
      }
    }
  );
}

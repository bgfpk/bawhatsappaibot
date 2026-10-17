import fs from "fs";
import path from "path";

export type MarketingReportEntry = {
  timestamp?: number;
  userId?: string;
  botId?: string;
  botName?: string;
  followupId?: string;
  campaignName?: string;
  campaignType?: string;
  audience?: string;
  status: "scan" | "sent" | "failed" | "skipped" | "sending";
  contact?: string;
  phone?: string;
  customerJid?: string;
  sourceCustomerId?: string;
  sentMessageId?: string;
  reason?: string;
  attemptKey?: string;
  billingDedupeKey?: string;
  costCharged?: number;
  foundCount?: number;
  sentCount?: number;
  failedCount?: number;
  skippedCount?: number;
  windowFromHours?: number;
  windowToHours?: number;
  actualBotId?: string;
  actualBotJid?: string;
  defaultBotId?: string;
  sendFromMode?: string;
  fallbackReason?: string;
};

const REPORT_DIR = path.join(process.cwd(), "data", "marketing-reports");

function dateKey(timestamp = Date.now()) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function reportPath(date = dateKey()) {
  return path.join(REPORT_DIR, `${date}.jsonl`);
}

export function appendMarketingReport(entry: MarketingReportEntry) {
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const safeCost = entry.status === "sent" && entry.sentMessageId ? Number(entry.costCharged || 0) : 0;
    const suspiciousBilling = entry.status !== "sent" && Number(entry.costCharged || 0) > 0;
    const row = {
      ...entry,
      costCharged: safeCost,
      ...(suspiciousBilling ? { suspiciousBilling: true, reason: entry.reason || "billing_without_successful_receipt" } : {}),
      timestamp: entry.timestamp || Date.now(),
    };
    fs.appendFileSync(reportPath(dateKey(row.timestamp)), `${JSON.stringify(row)}\n`, "utf8");
    return row;
  } catch (error) {
    console.error("[MarketingReport] Failed to write report:", error);
    return { ...entry, timestamp: entry.timestamp || Date.now() };
  }
}

export function readMarketingReport(date = dateKey()) {
  const file = reportPath(date);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

export function getMarketingReportPath(date = dateKey()) {
  return reportPath(date);
}

/**
 * Gmail Send-Only Service (Free-Only V1)
 * 
 * Strict V1 Limitations:
 * - SEND EMAIL ONLY via users/me/messages/send
 * - Single recipient validation (no bulk lists or spam)
 * - Deterministic idempotency preventing double-send
 * - Absolutely NO inbox reading, thread lookup, or mail search
 */

import { getValidGoogleAccessToken } from "./google-personal-oauth-service.ts";
import {
  evaluateGoogleFreeUsage,
  recordGoogleUsageSuccess,
} from "./google-free-usage-guard.ts";

export const googleGmailDeps = {
  fetch: (url: string, init?: RequestInit) => fetch(url, init),
};

export interface SendGmailParams {
  accountId: string;
  to: string;
  subject: string;
  bodyText: string;
  cc?: string[];
  bcc?: string[];
  taskId?: string;
  actionId?: string;
  now?: number;
  overrideFetch?: (url: string, init?: RequestInit) => Promise<any>;
}

export interface SendGmailResult {
  messageId: string;
  threadId?: string;
  to: string;
  subject: string;
  sentAt: number;
}

// In-memory idempotency store: taskId:actionId -> SendGmailResult
const sentEmailIdempotencyStore = new Map<string, SendGmailResult>();

export function buildRfc2822Email(options: {
  fromEmail?: string;
  to: string;
  subject: string;
  bodyText: string;
  cc?: string[];
  bcc?: string[];
}): string {
  const { fromEmail, to, subject, bodyText, cc = [], bcc = [] } = options;
  const lines: string[] = [];

  if (fromEmail) lines.push(`From: ${fromEmail}`);
  lines.push(`To: ${to}`);
  if (cc.length > 0) lines.push(`Cc: ${cc.join(", ")}`);
  if (bcc.length > 0) lines.push(`Bcc: ${bcc.join(", ")}`);
  lines.push(`Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`);
  lines.push("MIME-Version: 1.0");
  lines.push("Content-Type: text/plain; charset=UTF-8");
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("");
  lines.push(Buffer.from(bodyText, "utf-8").toString("base64"));

  return lines.join("\r\n");
}

export async function sendGmailMessage(params: SendGmailParams): Promise<SendGmailResult> {
  const { accountId, to, subject, bodyText, cc = [], bcc = [], taskId, actionId, now = Date.now() } = params;

  // 1. Recipient Validation (Section 43)
  const cleanTo = String(to || "").trim().toLowerCase();
  if (!cleanTo || !cleanTo.includes("@")) {
    const err: any = new Error("Invalid recipient email address.");
    err.code = "INVALID_EMAIL_RECIPIENT";
    throw err;
  }

  // Personal Assistant V1 single recipient safety cap (no bulk lists)
  if (cleanTo.includes(",") || cleanTo.includes(";") || (cc.length + bcc.length) > 3) {
    const err: any = new Error("Bulk or excessive recipient email is not permitted by Personal Assistant safety policy.");
    err.code = "EXCESSIVE_EMAIL_RECIPIENTS";
    throw err;
  }

  // 2. Idempotency Check (Section 44)
  const idempotencyKey = taskId && actionId ? `${taskId}:${actionId}` : null;
  if (idempotencyKey && sentEmailIdempotencyStore.has(idempotencyKey)) {
    return sentEmailIdempotencyStore.get(idempotencyKey)!;
  }

  // 3. Free-Only Usage Guard Check
  const guard = await evaluateGoogleFreeUsage({
    accountId,
    service: "gmail",
    method: "send",
    estimatedQuotaUnits: 1,
    now,
  });

  if (guard.decision !== "ALLOW") {
    const err: any = new Error(guard.reasonMessage);
    err.code = guard.reasonCode;
    throw err;
  }

  // 4. Obtain valid token and verify capability
  const { accessToken, connection } = await getValidGoogleAccessToken(accountId);
  if (!connection.capabilities.gmailSend) {
    const err: any = new Error("GOOGLE_GMAIL_SEND_NOT_GRANTED");
    err.code = "GOOGLE_SCOPE_NOT_GRANTED";
    throw err;
  }

  // 5. Build RFC 2822 message and base64url encode
  const rawEmail = buildRfc2822Email({
    fromEmail: connection.googleEmail,
    to: cleanTo,
    subject,
    bodyText,
    cc,
    bcc,
  });
  const encodedMessage = Buffer.from(rawEmail, "utf-8").toString("base64url");

  // 6. Send via Gmail API
  const fetchFn = params.overrideFetch || googleGmailDeps.fetch;
  const res = await fetchFn("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encodedMessage }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const err: any = new Error(data.error?.message || "GMAIL_SEND_FAILED");
    err.code = "GMAIL_API_ERROR";
    throw err;
  }

  // 7. Record usage on success
  await recordGoogleUsageSuccess({
    accountId,
    service: "gmail",
    method: "send",
    estimatedQuotaUnits: 1,
    now,
  });

  const result: SendGmailResult = {
    messageId: data.id || `gmsg_${Date.now()}`,
    threadId: data.threadId,
    to: cleanTo,
    subject,
    sentAt: now,
  };

  if (idempotencyKey) {
    sentEmailIdempotencyStore.set(idempotencyKey, result);
  }

  return result;
}

export function __clearGmailIdempotencyForTest(): void {
  sentEmailIdempotencyStore.clear();
}

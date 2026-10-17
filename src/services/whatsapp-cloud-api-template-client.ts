// src/services/whatsapp-cloud-api-template-client.ts
//
// Meta WhatsApp Cloud API Template Client
// Handles template listing with bounded pagination, template status normalization,
// and authoritative template sending via Graph API.
//
// Security guarantees:
// - Never logs or exposes access tokens / Authorization headers
// - Bounded pagination with cursor reconstruction (SSRF safe)
// - Real WAMID mapping via mapCloudApiSendResponse

import { buildCloudApiGraphUrl, buildCloudApiMessagesUrl } from "./whatsapp-cloud-api-version.ts";
import { normalizeCloudApiRecipient } from "./whatsapp-cloud-api-recipient.ts";
import { mapCloudApiSendResponse, classifyCloudApiHttpError } from "./whatsapp-cloud-api-response.ts";
import type { OutgoingSendResult } from "./whatsapp-transport-types.ts";

export type MetaTemplateStatus =
  | "APPROVED"
  | "PENDING"
  | "REJECTED"
  | "DISABLED"
  | "DELETED"
  | "FLAGGED"
  | "REINSTATED"
  | string;

export interface NormalizedMetaTemplate {
  id: string;
  name: string;
  language: string;
  status: MetaTemplateStatus;
  category: string;
  components: any[];
  qualityScore?: any;
}

export interface ListWabaTemplatesOptions {
  wabaId: string;
  accessToken: string;
  graphVersion?: string;
  limit?: number;
  maxPages?: number;
  fetchImpl?: typeof fetch;
}

export interface SendWabaTemplateOptions {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  templateName: string;
  languageCode: string;
  components?: any[];
  graphVersion?: string;
  fetchImpl?: typeof fetch;
}

export class MetaGraphTemplateError extends Error {
  readonly status: number;
  readonly errorCode: string;
  readonly metaErrorCode?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    status: number,
    errorCode: string,
    metaErrorCode?: number,
    retryable: boolean = false
  ) {
    super(message);
    this.name = "MetaGraphTemplateError";
    this.status = status;
    this.errorCode = errorCode;
    this.metaErrorCode = metaErrorCode;
    this.retryable = retryable;
  }
}

function clean(value: any): string {
  return String(value ?? "").trim();
}

/**
 * Normalizes raw Meta template object into a clean, tenant-safe structure.
 */
export function normalizeMetaTemplate(raw: any): NormalizedMetaTemplate {
  const rawStatus = clean(raw?.status).toUpperCase();
  const status = rawStatus || "PENDING";
  const category = clean(raw?.category).toUpperCase() || "UTILITY";

  return {
    id: clean(raw?.id),
    name: clean(raw?.name),
    language: clean(raw?.language) || "en_US",
    status,
    category,
    components: Array.isArray(raw?.components) ? raw.components : [],
    qualityScore: raw?.quality_score ?? undefined,
  };
}

/**
 * Fetches all message templates for a given WABA using bounded cursor-based pagination.
 */
export async function listWabaMessageTemplates(
  options: ListWabaTemplatesOptions
): Promise<NormalizedMetaTemplate[]> {
  const wabaId = clean(options.wabaId);
  const accessToken = clean(options.accessToken);
  const fetchFn = options.fetchImpl || fetch;
  const pageSize = Math.min(Math.max(1, options.limit || 100), 100);
  const maxPages = Math.min(Math.max(1, options.maxPages || 10), 20);

  if (!wabaId || !accessToken) {
    throw new MetaGraphTemplateError("Missing wabaId or accessToken", 400, "missing_param");
  }

  const allTemplates: NormalizedMetaTemplate[] = [];
  let nextCursor: string | undefined = undefined;
  let pageCount = 0;

  while (pageCount < maxPages) {
    pageCount += 1;
    const url = new URL(buildCloudApiGraphUrl(`${wabaId}/message_templates`, options.graphVersion));
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("fields", "id,name,language,status,category,components,quality_score");
    if (nextCursor) {
      url.searchParams.set("after", nextCursor);
    }

    let response: Response;
    try {
      response = await fetchFn(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
    } catch (err: any) {
      throw new MetaGraphTemplateError(
        "Network error listing WABA message templates",
        0,
        "network_error",
        undefined,
        true
      );
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data?.data)) {
      const classified = classifyCloudApiHttpError(data, response.status);
      throw new MetaGraphTemplateError(
        classified.errorMessage || "Failed to list WABA message templates",
        response.status,
        classified.errorCode,
        data?.error?.code,
        classified.retryable
      );
    }

    for (const item of data.data) {
      if (item && item.name) {
        allTemplates.push(normalizeMetaTemplate(item));
      }
    }

    const pagingAfter = data?.paging?.cursors?.after;
    const hasMore = Boolean(pagingAfter && data.data.length >= pageSize);
    if (!hasMore) {
      break;
    }
    nextCursor = pagingAfter;
  }

  return allTemplates;
}

/**
 * Sends an approved template message to a normalized recipient via WhatsApp Cloud API.
 */
export async function sendWabaTemplateMessage(
  options: SendWabaTemplateOptions
): Promise<OutgoingSendResult> {
  const phoneNumberId = clean(options.phoneNumberId);
  const accessToken = clean(options.accessToken);
  const to = clean(options.to);
  const templateName = clean(options.templateName);
  const languageCode = clean(options.languageCode) || "en_US";
  const fetchFn = options.fetchImpl || fetch;

  if (!phoneNumberId || !accessToken) {
    return {
      success: false,
      errorCode: "missing_credentials",
      errorMessage: "phoneNumberId and accessToken are required to send template",
      retryable: false,
    };
  }

  if (!templateName) {
    return {
      success: false,
      errorCode: "missing_template_name",
      errorMessage: "templateName is required",
      retryable: false,
    };
  }

  const normalized = normalizeCloudApiRecipient(to);
  if (!normalized.ok) {
    return {
      success: false,
      errorCode: "invalid_recipient",
      errorMessage: `Invalid recipient '${to}': ${normalized.reason}`,
      retryable: false,
    };
  }

  const payload: any = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalized.to,
    type: "template",
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
    },
  };

  if (Array.isArray(options.components) && options.components.length > 0) {
    payload.template.components = options.components;
  }

  const url = buildCloudApiMessagesUrl(phoneNumberId, options.graphVersion);

  try {
    const response = await fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    return mapCloudApiSendResponse(data, response.status);
  } catch (err: any) {
    const classified = classifyCloudApiHttpError(err);
    return {
      success: false,
      errorCode: classified.errorCode,
      errorMessage: classified.errorMessage || err?.message || "template_send_failed",
      retryable: classified.retryable,
    };
  }
}

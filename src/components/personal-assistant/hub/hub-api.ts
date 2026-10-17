/**
 * Personal Assistant Hub - Client API Service
 * 
 * Server-authoritative client calls for Hub Overview, Tasks,
 * Conversations, Connected Apps, and Google Tools.
 */

import type {
  HubOverviewMetrics,
  AttentionItem,
  PersonalActivityEvent,
  PersonalInstanceSummary,
  PersonalConversationSummary,
  PersonalChatMessage,
  TaskFilterOptions,
  ConversationFilterOptions,
} from "./hub-types.ts";
import type { PersonalTask } from "../../../services/personal-task-types.ts";
import type { GooglePersonalConnection, SelectedDriveFile } from "../../../services/google-personal-auth-types.ts";

export interface HubOverviewResponse {
  metrics: HubOverviewMetrics;
  attentionQueue: AttentionItem[];
  recentActivity: PersonalActivityEvent[];
  personalNumbers: PersonalInstanceSummary[];
  googleStatus: {
    status: string;
    email?: string;
    capabilities: Record<string, boolean>;
    hasIssues: boolean;
    reauthRequired: boolean;
  };
}

export interface HubTasksResponse {
  tasks: PersonalTask[];
  total: number;
  page: number;
  limit: number;
}

export async function fetchHubOverview(
  personalInstanceId?: string,
  signal?: AbortSignal
): Promise<HubOverviewResponse> {
  const query = new URLSearchParams();
  if (personalInstanceId) query.set("instanceId", personalInstanceId);

  const res = await fetch(`/api/personal-assistant/hub/overview?${query.toString()}`, { signal });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to load Personal Assistant overview.");
  }
  return res.json();
}

export async function fetchHubTasks(
  options: TaskFilterOptions = {},
  signal?: AbortSignal
): Promise<HubTasksResponse> {
  const query = new URLSearchParams();
  if (options.statusCategory && options.statusCategory !== "all") {
    query.set("category", options.statusCategory);
  }
  if (options.personalInstanceId) {
    query.set("instanceId", options.personalInstanceId);
  }
  if (options.search) {
    query.set("search", options.search);
  }
  query.set("page", String(options.page || 1));
  query.set("limit", String(options.limit || 20));

  const res = await fetch(`/api/personal-assistant/tasks?${query.toString()}`, { signal });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to fetch tasks.");
  }
  const data = await res.json();
  return {
    tasks: data.tasks || [],
    total: data.total ?? (data.tasks || []).length,
    page: data.page ?? 1,
    limit: data.limit ?? 20,
  };
}

export async function fetchHubTaskDetail(
  taskId: string,
  signal?: AbortSignal
): Promise<{ task: PersonalTask }> {
  const res = await fetch(`/api/personal-assistant/tasks/${encodeURIComponent(taskId)}`, { signal });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to load task details.");
  }
  return res.json();
}

export async function executeTaskAction(
  taskId: string,
  action: "pause" | "resume" | "cancel" | "answer" | "approve" | "reject",
  payload: any = {}
): Promise<{ success: boolean; task: PersonalTask }> {
  const res = await fetch(`/api/personal-assistant/tasks/${encodeURIComponent(taskId)}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to execute task action: ${action}`);
  }
  return res.json();
}

export async function fetchHubConversations(
  options: ConversationFilterOptions = {},
  signal?: AbortSignal
): Promise<PersonalConversationSummary[]> {
  const query = new URLSearchParams();
  if (options.personalInstanceId) query.set("instanceId", options.personalInstanceId);
  if (options.status && options.status !== "all") query.set("status", options.status);
  if (options.search) query.set("search", options.search);

  const res = await fetch(`/api/personal-assistant/hub/conversations?${query.toString()}`, { signal });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to fetch personal conversations.");
  }
  const data = await res.json();
  return data.conversations || [];
}

export async function fetchConversationMessages(
  jid: string,
  signal?: AbortSignal
): Promise<PersonalChatMessage[]> {
  const res = await fetch(`/api/personal-assistant/hub/conversations/${encodeURIComponent(jid)}/messages`, { signal });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to load conversation history.");
  }
  const data = await res.json();
  return data.messages || [];
}

export async function setConversationTakeover(
  jid: string,
  takeover: boolean
): Promise<{ success: boolean }> {
  const endpoint = takeover ? "takeover" : "resume";
  const res = await fetch(`/api/personal-assistant/hub/conversations/${encodeURIComponent(jid)}/${endpoint}`, {
    method: "POST",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to update takeover state.");
  }
  return res.json();
}

export async function setConversationDnc(
  jid: string,
  dnc: boolean
): Promise<{ success: boolean }> {
  const res = await fetch(`/api/personal-assistant/hub/conversations/${encodeURIComponent(jid)}/dnc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doNotContact: dnc }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to update Do Not Contact status.");
  }
  return res.json();
}

export async function fetchGoogleStatus(): Promise<{ connection: GooglePersonalConnection }> {
  const res = await fetch("/api/personal-assistant/google/status");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to fetch Google status.");
  }
  return res.json();
}

export async function toggleGoogleCapability(
  capability: string,
  enabled: boolean
): Promise<{ connection: GooglePersonalConnection }> {
  const res = await fetch("/api/personal-assistant/google/capabilities/toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ capability, enabled }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to update Google capability.");
  }
  return res.json();
}

export async function disconnectGoogle(): Promise<{ success: boolean }> {
  const res = await fetch("/api/personal-assistant/google/disconnect", {
    method: "POST",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to disconnect Google account.");
  }
  return res.json();
}

export async function listAuthorizedDriveFiles(): Promise<SelectedDriveFile[]> {
  const res = await fetch("/api/personal-assistant/google/drive/files");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to list authorized Drive files.");
  }
  const data = await res.json();
  return data.files || [];
}

export async function validateAndAddDriveFile(fileId: string): Promise<SelectedDriveFile> {
  const res = await fetch("/api/personal-assistant/google/drive/validate-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to authorize selected Drive file.");
  }
  const data = await res.json();
  return data.file;
}

export async function unlinkAuthorizedDriveFile(fileId: string): Promise<{ success: boolean }> {
  const res = await fetch("/api/personal-assistant/google/drive/unlink", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to unlink Drive file.");
  }
  return res.json();
}

export async function fetchGooglePickerConfig(): Promise<{
  configured: boolean;
  appId?: string;
  apiKeyMasked?: string;
  driveFileGranted?: boolean;
}> {
  const res = await fetch("/api/personal-assistant/google/picker-config");
  if (!res.ok) {
    return { configured: false };
  }
  return res.json();
}

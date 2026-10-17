import type { DashboardNotificationItem } from "./dashboard-notification-ui-service";

export const DASHBOARD_NOTIFICATION_STATE_STORE_KEY = "dashboardNotificationState";

export type DashboardNotificationStateRow = {
  id: string;
  read: boolean;
  completed: boolean;
  updatedAt: number;
};

export type DashboardNotificationState = {
  rows: DashboardNotificationStateRow[];
};

const MAX_NOTIFICATION_STATE_ROWS = 200;

function cleanId(value: any) {
  return String(value || "").trim().slice(0, 180);
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function normalizeDashboardNotificationState(input?: any): DashboardNotificationState {
  const rawRows = Array.isArray(input?.rows) ? input.rows : Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const rows: DashboardNotificationStateRow[] = [];

  for (const item of rawRows) {
    const id = cleanId(item?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push({
      id,
      read: item?.read === true,
      completed: item?.completed === true,
      updatedAt: Number(item?.updatedAt || 0),
    });
  }

  return {
    rows: rows
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .slice(0, MAX_NOTIFICATION_STATE_ROWS),
  };
}

export function applyDashboardNotificationState(
  notifications: DashboardNotificationItem[] = [],
  state?: DashboardNotificationState,
) {
  const byId = new Map(normalizeDashboardNotificationState(state).rows.map((row) => [row.id, row]));
  return notifications.map((item) => {
    const persisted = byId.get(item.id);
    if (!persisted) return item;
    return {
      ...item,
      read: item.read === true || persisted.read === true,
      completed: item.completed === true || persisted.completed === true,
    };
  });
}

export function updateDashboardNotificationState(
  state: DashboardNotificationState | undefined,
  input: { ids?: string[]; read?: boolean; completed?: boolean },
) {
  const normalized = normalizeDashboardNotificationState(state);
  const byId = new Map(normalized.rows.map((row) => [row.id, row]));
  const updatedAt = nowSeconds();

  for (const rawId of input.ids || []) {
    const id = cleanId(rawId);
    if (!id) continue;
    const current = byId.get(id) || { id, read: false, completed: false, updatedAt: 0 };
    byId.set(id, {
      id,
      read: input.read === undefined ? current.read === true : input.read === true,
      completed: input.completed === undefined ? current.completed === true : input.completed === true,
      updatedAt,
    });
  }

  return normalizeDashboardNotificationState({ rows: Array.from(byId.values()) });
}

export function generatedDashboardNotificationIds(notifications: DashboardNotificationItem[] = []) {
  return notifications
    .filter((item) => item?.source && item.source !== "crm")
    .map((item) => cleanId(item.id))
    .filter(Boolean);
}

export type SettingsTabId =
  | "team"
  | "billing"
  | "account"
  | "instance"
  | "alerts"
  | "security"
  | "sessions"
  | "proxy"
  | "status"
  | "lead_routing";

export interface TeamMemberRecord {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "manager" | "agent";
  roleLabel: string;
  status: "active" | "invited" | "suspended";
  joinedAt?: number | string;
}

export interface AdminAlertConfig {
  adminPhone: string;
  isAlertsEnabled: boolean;
  isBusinessAssistantEnabled?: boolean;
  isVerified?: boolean;
  alertTypes: {
    lowBalance: boolean;
    instanceDisconnected: boolean;
    humanEscalation: boolean;
    failedOrders: boolean;
  };
  proactiveAlerts?: {
    isProactiveAlertsEnabled: boolean;
    categories: {
      operations: boolean;
      customers: boolean;
      orders: boolean;
      stock: boolean;
      campaigns: boolean;
      integrations: boolean;
      billing: boolean;
      security: boolean;
      dailyDigest: boolean;
      weeklyDigest: boolean;
    };
    schedules?: {
      dailyDigestTime: string;
      weeklyDigestDay: number;
      timezone?: string;
    };
    thresholds?: {
      highValueOrderUsd: number;
      lowWalletAlertFloorUsd: number;
      lowStockThreshold?: number;
    };
    quietHours?: {
      enabled: boolean;
      start: string;
      end: string;
      urgentBypass: boolean;
    };
  };
  proactiveLeadAlerts?: {
    enabled: boolean;
    notifyQualifiedLeads: boolean;
    notifyContactCaptured: boolean;
    notifyLeadRouted: boolean;
    notifyRoutingFailed: boolean;
    notifyHumanRequested: boolean;
    notifyHighIntentLeads: boolean;
  };
}

export interface SecurityConfig {
  isTwoFaEnabled?: boolean;
  twoFaMethod?: "authenticator_app" | "sms";
  lastPasswordChange?: number | string;
}

export interface SessionRecord {
  id: string;
  device: string;
  browser: string;
  ipAddress: string;
  location?: string;
  isCurrent: boolean;
  lastActive: number | string;
}

export interface ProxyConfig {
  isConfigured: boolean;
  host?: string;
  port?: number;
  usernameMasked?: string;
  status: "active" | "disabled" | "error";
}

export interface AccountStatusData {
  status: "active" | "trial" | "restricted" | "suspended";
  termsAccepted: boolean;
  privacyAccepted: boolean;
  acceptedAt?: number | string;
}

export function filterTeamMembers(
  members: TeamMemberRecord[],
  query: string,
  roleFilter: string
): TeamMemberRecord[] {
  return members.filter((m) => {
    const matchesRole = roleFilter === "all" || m.role === roleFilter;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q);
    return matchesRole && matchesQuery;
  });
}

export function filterSessions(
  sessions: SessionRecord[],
  query: string
): SessionRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return sessions;
  return sessions.filter(
    (s) =>
      s.device.toLowerCase().includes(q) ||
      s.browser.toLowerCase().includes(q) ||
      s.ipAddress.toLowerCase().includes(q)
  );
}

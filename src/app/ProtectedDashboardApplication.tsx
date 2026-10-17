import React, { useState, useEffect, useRef } from "react";
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate, Link } from "react-router-dom";
import { DASHBOARD_ROUTE_REGISTRY, DASHBOARD_INTEGRATIONS_PATH, LIVE_MONITOR_PATH, resolveRouteByPath, resolvePathByViewAndTab } from "./dashboard-route-registry";
import { OrdersGrid } from '../components/OrdersGrid';
import { AppSidebar } from '../components/AppSidebar';
import { DashboardShell } from '../dashboard-shell';
import { CustomerLatestNotesCell } from '../components/CustomerLatestNotesCell';
import {
  CustomerDetailDrawer,
  getCustomerLeadOrderStatusLabel,
  getCustomerStatusLabel,
} from '../components/CustomerDetailDrawer';
import { CustomerCsvImportButton } from '../components/CustomerCsvImportButton';
import { Suspense } from 'react';
import { RouteErrorBoundary } from '../app/RouteErrorBoundary';
import { RouteLoadingFallback } from '../app/RouteLoadingFallback';
import {
  LazyCustomerUpdatesPage,
  LazyFollowupCenterPage,
  LazyContactListsPage,
  LazyCampaignsPage,
  LazySharedPhoneDirectoryAdminPanel,
  LazyIntegrationFoundationPage,
  LazyLiveMonitorPage,
  LazyWorkspacesPage,
} from '../routes/lazy-routes';
import { PLANS, Log, IncomingMessage } from '../types';
import { IntegrationCenter } from '../integrations/IntegrationCenter';
import { BillingPage } from '../billing/BillingPage';
import { buildBillingTransactionItems, buildUsageRecordItems } from '../billing/billing-adapter';
import { mapBillingAccessToAccountStatus } from '../billing/billing-model';
import { SettingsPage } from '../platform-settings/SettingsPage';
import {
  buildSequenceGroupItems,
  buildWelcomeSequenceConfig,
  buildMediaGroupItems,
  buildMediaLibraryItems,
  buildSavedReplyItems,
  buildAddedSyncGroups,
  buildEditedSyncGroups,
  buildToggledSyncGroups,
  buildUnlinkedSyncGroups,
  buildSavedReplyEditedSyncGroups,
  buildSavedReplyClearedSyncGroups,
} from '../content-library/content-library-runtime-adapter';
import {
  buildAddedSequenceGroups,
  buildEditedSequenceGroups,
  buildToggledSequenceGroups,
  buildUnlinkedSequenceGroups,
  normalizeSequenceGroupPurpose,
} from '../content-library/sequence-group-config-service';
import { getBillingAccess } from '../config/billing-access';
import type { SettingsTabId } from '../platform-settings/platform-model';

import {
  AI_USAGE_EXAMPLES,
  AI_USAGE_RATES,
  BETA_PLAN_DISCOUNT_EXPLANATION,
  BETA_PLAN_DISCOUNT_LABEL,
  AUTOMATION_USAGE_EXAMPLES,
  BILLING_ADDONS,
  BILLING_PLAN_DETAILS,
  FOUNDING_YEARLY_DISCOUNT_CTA,
  FOUNDING_YEARLY_DISCOUNT_LABEL,
  FULL_SETUP_PRICE,
  WALLET_TOPUP_AMOUNTS,
  describeUsageAnalyticsType,
  getPlanDisplayPricing,
  getUsageAnalyticsBucket,
} from '../config/pricing';
import {
  buildAccountStatementRows,
  buildUsageDailySeries,
  formatWalletTransactionDescription,
  getUsageCategoryKey,
  getWalletTransactionLabel,
  sanitizeBillingDescription,
  summarizeUsageRows,
} from '../services/billing-report-service';
import { buildUsageCompactChargeLabel, buildUsageSavingsLabel, resolveUsageBillingAction } from '../config/pricing-display';
import { CRM_UI_ENABLED, CRM_UI_PAUSED_MESSAGE, INBOX_UI_ENABLED, INBOX_UI_PAUSED_MESSAGE } from "../config/product-flags";
import { useDarkMode } from '../hooks/useDarkMode';
import { convertUsdToAccountCurrency, formatMoneyValue, parseDashboardAmount } from '../utils/money-format';
import { isDeletedOrder, isInactiveOrder, markOrderCancelled, markOrderDeleted } from '../utils/order-status';
import { getCustomerDisplayContact, getCustomerDisplayName } from '../utils/whatsapp-jid';
import {
  buildAiLearnedKnowledgePayload,
  buildConfirmationFieldsPayload,
  buildIntegrationPayload,
  buildReplyModePayload,
  buildSmartSalesPayload,
  buildSharedAiInstructionsPayload,
  getCustomerDetailsConfiguredSignal,
  getIntelligenceSaveButtonLabel,
  isIntelligenceTabSaving,
  type IntelligenceTab,
} from '../services/intelligence-settings-payload-service';
import {
  buildMagicLinkLoginSuccessState,
  getMagicLinkLoginErrorMessage,
  removeMagicLinkTokenFromUrl,
} from '../services/magic-link-login-flow';
import { chooseFollowupCenterInstance, getBotStableId } from '../services/followup-center-instance-service';
import {
  compareCustomersByLastInteraction,
  getCustomerLastInteractionTimestamp,
  sortCustomersByLastInteraction,
} from '../services/customer-display-state-service';
import {
  CRM_SOURCE_FILTERS,
  getCrmSourceDisplayLabel,
  getSourceBadgeClassName,
  normalizeCrmSource,
  sourceMatchesCrmFilter,
  summarizeCrmSources,
} from '../services/crm-source-service';
import {
  buildInstanceIdentitySummary,
  getInstanceDisplayIdentity,
  getInstanceShortIdentity,
} from '../services/instance-display-identity-service';
import {
  MAX_SYSTEM_PROXY_ASSIGNMENTS,
  calculateSystemProxyPoolStats,
  getSystemProxyHealthState,
  getSystemProxyLatency,
} from '../services/system-proxy-state-service';
import {
  COMMON_BUSINESS_TIMEZONES,
  formatBusinessDateTime,
  resolveBusinessTimezone,
} from '../services/business-timezone-service';
import {
  mapInstanceConnectionStatus,
  shouldHideNormalInstanceLog,
} from '../services/instance-connection-status-service';
import {
  buildEngineSocketStatusLog,
  buildInfrastructureSyncStatusLog,
  ENGINE_SOCKET_EVENT_RATE_LIMIT_MS,
  ENGINE_SOCKET_FALLBACK_RATE_LIMIT_MS,
  FRESH_WORKER_STATUS_GRACE_MS,
  hasFreshWorkerStatus,
  INFRASTRUCTURE_SYNC_DELAYED_ERROR,
  shouldRunRateLimitedAction,
  WORKER_ENGINE_SOCKET_PATH,
  WORKER_ENGINE_SOCKET_TRANSPORTS,
  WORKER_REALTIME_WARNING_MESSAGE,
} from "../services/engine-socket-fallback-service";
import { resolveBotAiChatReplyMode } from "../services/bot-ai-chat-reply-mode-service";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import {
  Bot,
  Terminal,
  Sparkles,
  MessageSquare,
  QrCode,
  ShieldCheck,
  ShieldAlert,
  Wifi,
  WifiOff,
  CheckCircle2,
  User,
  UserX,
  MinusCircle,
  PlusCircle,
  History,
  AlertCircle,
  RotateCcw,
  Save,
  BrainCircuit,
  Send,
  ArrowRight,
  Trash2,
  Package,
  ShoppingCart,
  LayoutDashboard,
  Users,
  Settings,
  BarChart3,
  Plus,
  Shield,
  FileText,
  FileX,
  Download,
  Zap,
  ZapOff,
  RefreshCw,
  Clock,
  ChevronRight,
  ChevronLeft,
  X,
  Check,
  Search,
  Filter,
  Edit2,
  Layers,
  Tag,
  Banknote,
  Database,
  MonitorPlay,
  Rss,
  AlertTriangle,
  Wallet,
  Smartphone,
  Megaphone,
  CreditCard,
  Mail,
  Puzzle,
  Copy,
  Menu,
  Sun,
  Moon,
  Mic,
  Eye,
  ShoppingBag,
  GripVertical,
  ChevronDown
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import Auth from "../components/Auth";
import Chatbot from "../components/Chatbot";
import { normalizeFollowupCampaignType } from "../services/followup-campaign-type-service";

import { TutorialVideoCard } from "../components/TutorialVideoCard";
import { TextLimitCounter } from "../components/TextLimitCounter";
import {
  CompactGuide,
  DataTableShell,
  DashboardEmptyState,
  DashboardPageHeader,
  DashboardToolbar,
  FormSection,
  IntegrationCard,
  MetricGrid,
  PageShell,
  SectionHeader,
  SettingsCard,
  StatusBadge,
  ToneBadge,
  ToggleRow,
  MetricTile,
  WorkspaceHero,
} from "../components/dashboard/DashboardPrimitives";
import { getDashboardChartColor } from "../components/dashboard/dashboard-chart-theme";
import { DashboardNotificationCenter } from "../components/dashboard/DashboardNotificationCenter";
import { ClientSectionTabs } from "../components/dashboard/ClientSectionTabs";
import { KnowledgeSourceList } from "../components/dashboard/KnowledgeSourceList";
import { ClientOnboardingChecklist } from "../components/dashboard/ClientOnboardingChecklist";
import { DashboardOverview } from "../dashboard-overview/DashboardOverview";
import { InstanceHubPage } from "../instance-hub/InstanceHubPage";
import { ConversationInboxPage } from "../conversation-inbox/ConversationInboxPage";
import { normalizeMessageItem } from "../conversation-inbox/message-adapter";
import { deduplicateMessages } from "../conversation-inbox/conversation-dedupe";
import { CustomersPage } from "../customers/CustomersPage";
import { CrmPipeline } from "../crm/CrmPipeline";
import { OrdersPage } from "../orders/OrdersPage";
import { KnowledgePage } from "../knowledge/KnowledgePage";
import { ProductsPage } from "../products/ProductsPage";
import { ContentLibraryPage } from "../content-library/ContentLibraryPage";
import { LeadRoutingSettingsSection } from "../components/dashboard/settings/LeadRoutingSettingsSection";
import { buildAccountLimits } from "../services/account-limit-service";
import { FollowupCenter } from "../engagement/followups/FollowupCenter";
import { BroadcastPage } from "../engagement/broadcasts/BroadcastPage";
import { CustomerUpdatesPage } from "../engagement/customer-updates/CustomerUpdatesPage";
import {
  buildClientOnboardingChecklist,
  getOnboardingCtaTarget,
  type ClientOnboardingChecklistItem,
} from "../services/client-onboarding-checklist-service";
import { GetStartedPage } from "../get-started/GetStartedPage";
import {
  loadStoredGetStartedPreference,
  saveStoredGetStartedPreference,
  resolveGetStartedVisibility,
  resolveDefaultLoginPath,
  type GetStartedVisibilityPreference,
} from "../services/get-started-visibility-service";
import {
  AIInstructionsPage,
  ConfirmationFieldsPage,
  IntegrationSectionCard,
  IntegrationsPage,
  LearnedKnowledgePage,
  ReplyCallRulesPage,
  SmartSalesSettingsPage,
} from "../components/dashboard/pages/SetupPages";
import { AiStudioV2Page } from "../components/dashboard/pages/AiStudioV2Page";
import { BusinessAssistantPage } from "../components/dashboard/pages/BusinessAssistantPage";
import { PersonalAssistantHub } from "../components/personal-assistant";

import { CrmFoundationPage } from "../components/dashboard/pages/CrmFoundationPage";
import { CrmToastStack } from "../components/dashboard/pages/CrmToastStack";
import { WebsiteKnowledgePanel } from "../components/dashboard/pages/WebsiteKnowledgePanel";
import {
  AdminDashboardPage,
  AdminLogsPage,
  AdminSmartSalesPage,
  AdminUsersPage,
  PlatformAccountingPage,
  SharedDirectoryPage,
  SystemProxiesPage,
} from "../components/dashboard/pages/AdminPages";
import {
  ConnectionOverview,
  LiveMonitor,
  QuickActions,
  SequencesMediaGroups,
} from "../components/dashboard/pages/InstanceDashboardSections";
import { ProductCatalogPage, ProductEditorOverlay } from "../components/dashboard/pages/ProductPages";
import blackArrowIcon from "../../media/black-arrow-icon.png";
import { isPublicAuthLocation } from "../config/public-seo";
import { initializeAnalytics } from "../lib/analytics";
import { trackBeginCheckoutConversion } from "../lib/conversion-events";
import { fetchJson } from "../services/api-json-response-service";
import { parseCourierTrackingIds } from "../services/courier-broadcast-service";
import {
  filterDashboardNotificationsByPreferences,
  DASHBOARD_ALERT_CATEGORIES,
  getAlertChannelEnabled,
  normalizeDashboardAlertPreferences,
  setAlertChannelPreference,
  type DashboardAlertChannel,
  type DashboardAlertCategory,
  type DashboardAlertPreferences,
} from "../services/dashboard-alert-preferences-service";
import {
  buildDashboardToast,
  crmDashboardNotifications,
  mergeDashboardNotifications,
  systemDashboardNotifications,
  type DashboardNotificationItem,
  type DashboardToastTone,
} from "../services/dashboard-notification-ui-service";
import {
  applyDashboardNotificationState,
  generatedDashboardNotificationIds,
  normalizeDashboardNotificationState,
  type DashboardNotificationState,
} from "../services/dashboard-notification-state-service";

type SyncGroup = {
  name: string;
  purpose: string;
  instructions?: string;
  jid?: string;
  shortcut_code?: string | null;
  templateCount?: number;
  enabled?: boolean;
  autoSync?: boolean;
  trigger_keywords?: string;
};

type LiveConsoleEvent = {
  id: string;
  timestamp: number;
  type: string;
  category: string;
  level: "info" | "warn" | "error" | "success";
  scope: "bot" | "account" | "admin" | "global";
  accountId?: string;
  botId?: string;
  customerJid?: string;
  title: string;
  message: string;
  reason?: string;
  status?: string;
};

const INSTANCE_CONFIG_KEYS = new Set([
  "systemPrompt",
  "businessType",
  "botVoice",
  "botGender",
  "botName",
  "isAutoReply",
  "autoReloadEnabled",
  "autoReloadMinutes",
  "syncGroups",
  "customFields",
  "replyBehavior",
  "replyInGroups",
  "humanDelayEnabled",
  "voiceSimulationEnabled",
  "learnedInstructions",
  "rejectCalls",
  "followupEnabled",
  "followupHours",
  "followupOfferContext",
  "followups",
  "muted_numbers",
  "difficultCustomerMode",
  "selectedBotLanguage",
  "smartSalesEngineEnabled",
  "smartSalesExtraCharge",
  "smartSalesPromptVersion",
  "customerIntelligenceScanEnabled",
  "customer_intelligence_scan_enabled",
]);

const ACCOUNT_CONFIG_KEYS = new Set([
  "postexApiKey",
  "leopardsApiKey",
  "leopardsApiPassword",
  "dhlApiKey",
  "dhlService",
  "dhlRequesterCountryCode",
  "dhlOriginCountryCode",
  "dhlLanguage",
  "dhlEnabled",
  "adminNumber",
  "proxyUrl",
  "useDedicatedProxy",
  "system_alerts_enabled",
  "billing_alerts_enabled",
  "proxy_alerts_enabled",
  "order_alerts_enabled",
  "businessTimezone",
  "business_timezone",
  "delayedReadReceiptsEnabled",
  "delayed_read_receipts_enabled",
  "readReceiptDelaySeconds",
  "read_receipt_delay_seconds",
]);

const ADMIN_ACCOUNT_ROLES = new Set(["admin", "super_admin", "superadmin"]);
const SETUP_FREE_CREDIT_USD = 1;
const BOT_NAME_MAX_CHARS = 255;

const isRegularClientAccount = (user: any) => !ADMIN_ACCOUNT_ROLES.has(String(user?.role || "user").toLowerCase());
const getUserId = (user: any) => user?.id || user?.$id || "";
const getSelectedBotStorageKey = (user: any) => {
  const userId = getUserId(user);
  return userId ? `selectedBotId:${userId}` : "selectedBotId";
};

const getRemainingSetupCredit = (user: any) => {
  const wallet = Math.max(0, Number(user?.wallet_balance || 0));
  const usage = Math.max(0, Number(user?.config?.usage_cost || 0));
  return Math.min(wallet, Math.max(SETUP_FREE_CREDIT_USD - usage, 0));
};

const getRealCustomerWalletBalance = (user: any) => Math.max(0, Number(user?.wallet_balance || 0) - getRemainingSetupCredit(user));
const getRealCustomerUsageRevenue = (user: any) => Math.max(0, Number(user?.config?.usage_cost || 0) - SETUP_FREE_CREDIT_USD);

const parseCustomerProfileForUi = (customer: any) => {
  const raw = customer?.profile;
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
};

const getCustomerSourceLabelForUi = (customer: any) => {
  const profile = parseCustomerProfileForUi(customer);
  return normalizeCrmSource(profile.leadSource || profile.source || profile.importSource || customer?.source || (customer?.sourceDetail === "message_history" ? "WhatsApp" : ""));
};

const clampFollowupWindowHours = (value: any) => {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return 1;
  return Math.min(Math.max(Math.round(hours), 1), 6);
};

export default function ProtectedDashboardApplication() {
  return <DashboardApplicationContent />;
}


function DashboardApplicationContent() {
  useEffect(() => {
    const isProd = import.meta.env.PROD;
    console.log(`[Black Arrow] UI running in ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} mode.`);
  }, []);

  useEffect(() => initializeAnalytics(), []);

  const [currentUser, setCurrentUser] = useState<any>(() => {
    try {
      const saved = localStorage.getItem("currentUser");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [showLanding, setShowLanding] = useState(!currentUser);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const [isDarkMode, setIsDarkMode] = useDarkMode();

  useEffect(() => {
    if (currentUser) {
      setProfileName(currentUser.name || "");
      setProfilePhone(currentUser.whatsapp_number || "");
      setSystemAlertsEnabled(currentUser.system_alerts_enabled !== false);
      setBillingAlertsEnabled(currentUser.billing_alerts_enabled !== false);
      setProxyAlertsEnabled(currentUser.proxy_alerts_enabled !== false);
      setOrderAlertsEnabled(currentUser.order_alerts_enabled !== false);
      setAlertPreferences(normalizeDashboardAlertPreferences(currentUser.dashboard_alert_preferences || currentUser.alert_preferences));
      localStorage.setItem("currentUser", JSON.stringify(currentUser));
    } else {
      localStorage.removeItem("currentUser");
    }
  }, [currentUser]);

  const [getStartedPreference, setGetStartedPreference] = useState<GetStartedVisibilityPreference>(() =>
    loadStoredGetStartedPreference(getUserId(currentUser))
  );

  useEffect(() => {
    const activeUid = getUserId(currentUser);
    if (activeUid) {
      setGetStartedPreference(loadStoredGetStartedPreference(activeUid));
      fetch("/api/user/preferences")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && typeof data.showGetStarted === "boolean") {
            setGetStartedPreference(data.showGetStarted);
            saveStoredGetStartedPreference(activeUid, data.showGetStarted);
          }
        })
        .catch(() => {});
    }
  }, [currentUser]);

  const [bots, setBots] = useState<any[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(getSelectedBotStorageKey(currentUser));
    } catch {
      return null;
    }
  });
  const [selectedBotLanguage, setSelectedBotLanguage] = useState("English");
  const [smartSalesEngineEnabled, setSmartSalesEngineEnabled] = useState(false);
  const [customerIntelligenceScanEnabled, setCustomerIntelligenceScanEnabled] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "disconnected" | "connected" | "connecting" | "proxy-connecting" | "qr-ready" | "retrying" | "error"
  >("connecting");
  const [connectionRetry, setConnectionRetry] = useState<{ retryCount: number; reason: string; detail: string; nextRetrySeconds: number }>({
    retryCount: 0,
    reason: "",
    detail: "",
    nextRetrySeconds: 0,
  });
  const [workerRealtimeWarning, setWorkerRealtimeWarning] = useState<string | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [broadcastHistory, setBroadcastHistory] = useState<any[]>([]);
  const [customerUpdates, setCustomerUpdates] = useState<any[]>([]);
  const [recipientLists, setRecipientLists] = useState<any[]>([]);
  const seenLiveEventIdsRef = useRef<Set<string>>(new Set());
  const liveEventSinceRef = useRef<number>(0);
  const liveEventsAuthBlockedRef = useRef(false);
  const engineSocketStateRef = useRef({
    degraded: false,
    lastDegradedAt: 0,
    lastFallbackAt: 0,
    lastReason: "",
  });
  const lastFreshWorkerStatusAtRef = useRef(0);
  const [messages, setMessages] = useState<IncomingMessage[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isAutoReplyEnabled, setIsAutoReplyEnabled] = useState(true);
  const [showAiRepliesOffConfirm, setShowAiRepliesOffConfirm] = useState(false);
  const [autoReloadEnabled, setAutoReloadEnabled] = useState(false);
  const [autoReloadMinutes, setAutoReloadMinutes] = useState(5);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [providerType, setProviderType] = useState("whatsapp_web");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [hasSavedToken, setHasSavedToken] = useState(false);
  const normalizeBusinessType = (value: any) => {
    const text = String(value || "").trim().toLowerCase();
    return text === "service" || text === "services" ? "service" : "product";
  };
  const [businessType, setBusinessType] = useState("product");
  const [botVoice, setBotVoice] = useState("Aoede");
  const [botGender, setBotGender] = useState("female");
  const [botName, setBotName] = useState("");
  const [adminNumber, setAdminNumber] = useState("");
  const [originalAdminNumber, setOriginalAdminNumber] = useState("");
  const [businessAssistantEnabled, setBusinessAssistantEnabled] = useState(false);
  const [adminNumberVerified, setAdminNumberVerified] = useState(false);
  const [proactiveAlerts, setProactiveAlerts] = useState<any>(null);
  const [proactiveLeadAlerts, setProactiveLeadAlerts] = useState<any>(null);
  const [proxyUrl, setProxyUrl] = useState("");
  const [useDedicatedProxy, setUseDedicatedProxy] = useState(false);
  const [isTestingProxy, setIsTestingProxy] = useState(false);
  const [proxyStatus, setProxyStatus] = useState<{ok: boolean, msg: string} | null>(null);
  const [learnedInstructions, setLearnedInstructions] = useState("");
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [trackingIdsInput, setTrackingIdsInput] = useState("");
  const [broadcastApi, setBroadcastApi] = useState<"postex" | "leopard" | "dhl">("postex");

  const [postexApiKey, setPostexApiKey] = useState("");
  const [leopardsApiKey, setLeopardsApiKey] = useState("");
  const [leopardsApiPassword, setLeopardsApiPassword] = useState("");
  const [dhlApiKey, setDhlApiKey] = useState("");
  const [dhlService, setDhlService] = useState("express");
  const [dhlRequesterCountryCode, setDhlRequesterCountryCode] = useState("");
  const [dhlOriginCountryCode, setDhlOriginCountryCode] = useState("");
  const [dhlLanguage, setDhlLanguage] = useState("");
  const [dhlEnabled, setDhlEnabled] = useState(false);
  const [dhlTestTrackingId, setDhlTestTrackingId] = useState("");
  const [isTestingDhl, setIsTestingDhl] = useState(false);
  const [clientGeminiEnabled, setClientGeminiEnabled] = useState(false);
  const [clientGeminiApiKey, setClientGeminiApiKey] = useState("");
  const [clientGeminiCacheBoostEnabled, setClientGeminiCacheBoostEnabled] = useState(false);
  const [clientGeminiStatus, setClientGeminiStatus] = useState<any>({ enabled: false, hasKey: false, maskedKey: "", cacheBoostEnabled: false, updatedAt: 0 });
  const [clientGeminiUsage, setClientGeminiUsage] = useState<any>({
    cacheBoostEnabled: false,
    today: { customGeminiCycles: 0, customGeminiRequests: 0, customGeminiCost: 0, cacheBoostCharges: 0, cacheBoostCost: 0 },
    last7Days: { customGeminiCycles: 0, customGeminiRequests: 0, customGeminiCost: 0, cacheBoostCharges: 0, cacheBoostCost: 0 },
    total: { customGeminiCycles: 0, customGeminiRequests: 0, customGeminiCost: 0, cacheBoostCharges: 0, cacheBoostCost: 0 },
  });
  const [isSavingClientGemini, setIsSavingClientGemini] = useState(false);
  const [isTestingClientGemini, setIsTestingClientGemini] = useState(false);
  const [followupEnabled, setFollowupEnabled] = useState(0);
  const [autoFollowupEnabled, setAutoFollowupEnabled] = useState(0);
  const [followupHours, setFollowupHours] = useState(12);
  const [followupOfferContext, setFollowupOfferContext] = useState("");
  const [followups, setFollowups] = useState<any[]>([]);
  const [humanDelayEnabled, setHumanDelayEnabled] = useState(1);
  const [voiceSimulationEnabled, setVoiceSimulationEnabled] = useState(1);
  const [rejectCalls, setRejectCalls] = useState(0);
  const [replyBehavior, setReplyBehavior] = useState("text_preferred");
  const [difficultCustomerMode, setDifficultCustomerMode] = useState("admin_pause");
  const [delayedReadReceiptsEnabled, setDelayedReadReceiptsEnabled] = useState(0);
  const [readReceiptDelaySeconds, setReadReceiptDelaySeconds] = useState(10);
  const [instanceConfigStatus, setInstanceConfigStatus] = useState<"LOADING" | "LOADED" | "EMPTY" | "ERROR">("EMPTY");
  const botConfigLoadRequestIdRef = useRef(0);
  const [mutedNumbers, setMutedNumbers] = useState<string[]>([]);
  const [newMutedNumber, setNewMutedNumber] = useState("");
  const [replyInGroups, setReplyInGroups] = useState(0);
  const [customFields, setCustomFields] = useState<{ name: string; instructions: string }[]>([]);
  const [customerDetailsConfigured, setCustomerDetailsConfigured] = useState<boolean | undefined>(undefined);
  const [draggedCustomFieldIndex, setDraggedCustomFieldIndex] = useState<number | null>(null);
  const [editGroupIndex, setEditGroupIndex] = useState<number>(-1);
  const [deleteGroupIndex, setDeleteGroupIndex] = useState<number>(-1);
  const [syncGroups, setSyncGroups] = useState<SyncGroup[]>([]);
  const [newGroupJid, setNewGroupJid] = useState("");
  const [newGroupPurpose, setNewGroupPurpose] = useState("");
  const [newGroupInstructions, setNewGroupInstructions] = useState("");
  const [selectedGroupTemplates, setSelectedGroupTemplates] = useState<{name: string, templates: any[]} | null>(null);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  const [allCustomers, setAllCustomers] = useState<any[]>([]);
  const [customersPage, setCustomersPage] = useState(1);
  const [customersPerPage, setCustomersPerPage] = useState(20);
  const [customerSourceFilter, setCustomerSourceFilter] = useState("all");
  const [customersSort, setCustomersSort] = useState<{column: "name" | "contact" | "interacted" | null, direction: "asc" | "desc"}>({ column: "interacted", direction: "desc" });
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState<any | null>(null);
  const customerSummaryRefreshTimeoutsRef = useRef<number[]>([]);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [orderRecordSection, setOrderRecordSection] = useState<"incomplete_orders" | "complete_orders" | "incomplete_leads" | "complete_leads">("incomplete_orders");
  const [products, setProducts] = useState<any[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [orderDateFrom, setOrderDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [orderDateTo, setOrderDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [userBilling, setUserBilling] = useState<any>({ usage: 0, limit: 10, productLimit: 3, instanceLimit: 1 });
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [isGroupSyncing, setIsGroupSyncing] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chatbot to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      const container = chatContainerRef.current;
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }, [messages]);

  const [analyticsData, setAnalyticsData] = useState<any[]>([]);
  const [usageLimit, setUsageLimit] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("blackarrow_usage_limit");
      if (saved) {
        const parsed = Number(saved);
        if ([10, 100, 1000].includes(parsed)) return parsed;
      }
    } catch {}
    return 100;
  });
  const [analyticsFromStr, setAnalyticsFromStr] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [analyticsToStr, setAnalyticsToStr] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [appError, setAppError] = useState<string | null>(null);
  const clearInfrastructureSyncError = () => {
    setAppError((prev) => prev === INFRASTRUCTURE_SYNC_DELAYED_ERROR ? null : prev);
  };
  const [appSuccess, setAppSuccess] = useState<string | null>(null);

  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminSearchQuery, setAdminSearchQuery] = useState("");
  const initialRoute = resolveRouteByPath(typeof window !== "undefined" ? window.location.pathname : "");
  const [contentLibraryTab, setContentLibraryTab] = useState<"media" | "saved_replies" | "sequences" | "welcome">(
    (initialRoute?.view === "content_library" && (initialRoute?.tab as any)) || "media"
  );
  const [contentLibraryTemplateDetails, setContentLibraryTemplateDetails] = useState<any>(null);
  const latestTemplateDetailsBotIdRef = useRef<string | null>(null);
  const selectedBotIdRef = useRef<string | null>(selectedBotId);
  useEffect(() => {
    selectedBotIdRef.current = selectedBotId;
  }, [selectedBotId]);

  const loadContentLibraryTemplateDetails = async (botId: string, options?: { throwOnError?: boolean }) => {
    if (!botId) return null;
    try {
      const res = await fetch(`/api/bot/${botId}/templates/details`);
      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status} loading template details`);
      }
      const data = await res.json();
      if (latestTemplateDetailsBotIdRef.current === botId && selectedBotIdRef.current === botId) {
        setContentLibraryTemplateDetails(data);
      }
      return data;
    } catch (err: any) {
      console.error("[Template Details] Load error:", err);
      if (options?.throwOnError) {
        throw err;
      }
      return null;
    }
  };
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>(
    (initialRoute?.tab as SettingsTabId) || "team"
  );
  const [aiTab, setAiTab] = useState<IntelligenceTab>("instructions");
  const [integrationTab, setIntegrationTab] = useState<"courier" | "gemini" | "dhl" | "commerce" | "knowledge" | "api" | "webhooks" | "alerts">("courier");
  const [intelligenceSavingTab, setIntelligenceSavingTab] = useState<IntelligenceTab | null>(null);
  const [billingTab, setBillingTab] = useState<"overview" | "usage" | "live" | "logs" | "statement" | "subscriptions" | "wallet">("overview");
  const [analyticsTab, setAnalyticsTab] = useState<"performance" | "usage" | "live" | "logs">("performance");
  const [visibleBillingCategoryKeys, setVisibleBillingCategoryKeys] = useState<Record<string, boolean>>({});
  const [dashboardToasts, setDashboardToasts] = useState<Array<{ id: string; tone: DashboardToastTone; message: string }>>([]);
  const [crmDashboardAlerts, setCrmDashboardAlerts] = useState<any[]>([]);
  const [dashboardNotificationState, setDashboardNotificationState] = useState<DashboardNotificationState>(() => normalizeDashboardNotificationState());
  const [crmOpenLeadRequest, setCrmOpenLeadRequest] = useState<{ leadId: string; token: number }>({ leadId: "", token: 0 });
  const [bundleQuantity, setBundleQuantity] = useState(1);
  const [instanceQuantity, setInstanceQuantity] = useState(1);
  const [addonQuantities, setAddonQuantities] = useState<Record<string, number>>({});
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [adminEditPrompt, setAdminEditPrompt] = useState<{ type: 'wallet' | 'extra' | 'subscriptions', userId: string, currentValue?: string, userName?: string, user?: any } | null>(null);
  const [appStatus, setAppStatus] = useState<{status: 'LIVE' | 'MAINTENANCE', environment: string, databaseId: string} | null>(null);
  const [isStatusChanging, setIsStatusChanging] = useState(false);
  const [adminSubsForm, setAdminSubsForm] = useState<{ assigned_proxy_url: string, proxy_subscription_expiry: string, trial_expires_at: string }>({ assigned_proxy_url: "", proxy_subscription_expiry: "", trial_expires_at: "" });
  const [adminConfirmAction, setAdminConfirmAction] = useState<{ type: 'delink' | 'loginAs', userId: string, botId?: string, identifier?: string, user?: any } | null>(null);
  const [tempPasswordResult, setTempPasswordResult] = useState<{ tempPass: string, expiresAt: number } | null>(null);
  const [logSearchDate, setLogSearchDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [adminPromptValue, setAdminPromptValue] = useState("");
  const [smartSalesPromptText, setSmartSalesPromptText] = useState("");
  const [smartSalesPromptVersion, setSmartSalesPromptVersion] = useState("v1");
  const [smartSalesPromptUpdatedAt, setSmartSalesPromptUpdatedAt] = useState<number | null>(null);
  const [isSmartSalesPromptLoading, setIsSmartSalesPromptLoading] = useState(false);
  const [isSmartSalesPromptSaving, setIsSmartSalesPromptSaving] = useState(false);
  const [marketingStats, setMarketingStats] = useState<{stats: any, logs: any[]} | null>(null);

  const aiPageMeta: Record<IntelligenceTab, { title: string; description: string; icon: any; widthClass: string }> = {
    instructions: {
      title: "Bot Training",
      description: "Train the bot with your business instructions, tone, products, and reply behavior.",
      icon: BrainCircuit,
      widthClass: "max-w-5xl",
    },
    learned: {
      title: "Bot Knowledge",
      description: "Review saved knowledge and refine what the bot learned from customer handling.",
      icon: Bot,
      widthClass: "max-w-5xl",
    },
    fields: {
      title: "Confirmation Fields",
      description: "Define the customer details the AI must collect before completing a lead or order.",
      icon: Puzzle,
      widthClass: "max-w-5xl",
    },
    calls: {
      title: "Reply & Call Settings",
      description: "Adjust call handling, saved replies, voice behavior, delays, and manual review settings.",
      icon: MessageSquare,
      widthClass: "max-w-5xl",
    },
    integrations: {
      title: "Integrations",
      description: "Set up website, WooCommerce, webhooks, and future connector options from one place.",
      icon: Puzzle,
      widthClass: "max-w-6xl",
    },
    smart_sales: {
      title: "Smart Sales Settings",
      description: "Help the bot understand buying intent and guide customers toward the next step.",
      icon: Sparkles,
      widthClass: "max-w-5xl",
    },
  };

  const adminPageMeta: Record<typeof adminTab, { title: string; description: string; icon: any }> = {
    dashboard: {
      title: "Admin Dashboard",
      description: "Platform overview, client totals, schema tools, and operational status.",
      icon: Shield,
    },
    users: {
      title: "Accounts & Users",
      description: "Manage client accounts, access shortcuts, plans, trials, and linked instances.",
      icon: Users,
    },
    training: {
      title: "Training",
      description: "Legacy admin training area.",
      icon: BrainCircuit,
    },
    logs: {
      title: "Logs",
      description: "Review and download administrative action logs.",
      icon: FileText,
    },
    proxies: {
      title: "System Proxies",
      description: "Manage the shared proxy pool and assignment capacity.",
      icon: Wifi,
    },
    accounting: {
      title: "Platform Accounting",
      description: "Review revenue, usage, provider cost, and reconciliation reports.",
      icon: Banknote,
    },
    directory: {
      title: "Shared Directory",
      description: "Manage shared phone, JID, and LID identity records.",
      icon: Database,
    },
    smart_sales: {
      title: "Smart Sales Global Control",
      description: "Tune the global Smart Sales engine prompt used by enabled accounts.",
      icon: Sparkles,
    },
  };

  const [autoFollowupSchedules, setAutoFollowupSchedules] = useState<any[]>([]);

  const loadMarketingStats = async () => {
    if (!currentUserId) return;
    try {
      const res = await fetch(`/api/bots/marketing-stats?userId=${currentUserId}`);
      const data = await res.json();
      if (res.ok) setMarketingStats(data);
    } catch(e) {}

    if (selectedBotId) {
      try {
        const sRes = await fetch(`/api/bots/${selectedBotId}/auto-followup-schedules`);
        const sData = await sRes.json();
        if (sRes.ok && Array.isArray(sData.schedules)) {
          setAutoFollowupSchedules(sData.schedules);
        }
      } catch(e) {}
    }
  };

  const DBBadge = () => {
    if (!appStatus) return null;
    const isDev = appStatus.environment === 'DEVELOPMENT';
    return (
      <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-sm ${isDev ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 border-amber-200 dark:border-amber-800' : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 border-emerald-200 dark:border-emerald-800'}`}>
        <Database className="w-3.5 h-3.5" />
        <span className="opacity-60">{isDev ? 'DEV' : 'LIVE'}</span>
        <span className="font-mono bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-gray-100 dark:border-neutral-800/50">{appStatus.databaseId || "DB not loaded"}</span>
      </div>
    );
  };

  const parseFollowupList = (raw: any) => {
    const normalize = (items: any[]) => items.map((item) => ({
      ...item,
      name: item?.name || item?.label || "",
      campaign_type: normalizeFollowupCampaignType(item?.campaign_type),
      hours: Number(item?.hours) > 0 ? Number(item.hours) : 24,
      window_hours: clampFollowupWindowHours(item?.window_hours ?? item?.past_window_hours),
      offer_context: item?.offer_context ?? "",
      audience: ["ordered", "all", "incomplete_lead"].includes(String(item?.audience || "")) ? item.audience : "not_ordered",
      is_active: item?.is_active === true || item?.is_active === 1 || item?.is_active === "1" ? 1 : 0,
    }));
    if (Array.isArray(raw)) return normalize(raw);
    try {
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? normalize(parsed) : [];
    } catch {
      return [];
    }
  };

  const serializeFollowupList = (items: any[] = []) => JSON.stringify((Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    campaign_type: normalizeFollowupCampaignType(item?.campaign_type),
    window_hours: clampFollowupWindowHours(item?.window_hours ?? item?.past_window_hours),
    audience: ["ordered", "all", "incomplete_lead"].includes(String(item?.audience || "")) ? item.audience : "not_ordered",
  })));

  const applyInstanceConfig = (config: any = {}) => {
    const next = config || {};
    setSystemPrompt(next.prompt_raw ?? next.prompt ?? next.ai_prompt ?? "");
    setIsAutoReplyEnabled(resolveBotAiChatReplyMode(next).enabled);
    setBotVoice(next.botVoice ?? next.bot_voice ?? "Aoede");
    setBotGender(next.botGender ?? next.bot_gender ?? "female");
    setBotName(next.botName ?? next.bot_name ?? "");
    setBusinessType(normalizeBusinessType(next.business_type));
    setCustomFields(Array.isArray(next.customFields) ? next.customFields : []);
    setCustomerDetailsConfigured(getCustomerDetailsConfiguredSignal(next));
    setSyncGroups(Array.isArray(next.groups) ? next.groups : []);
    setReplyBehavior(next.reply_behavior ?? "text_preferred");
    setDifficultCustomerMode(next.difficult_customer_mode ?? next.difficultCustomerMode ?? "admin_pause");
    setReplyInGroups(next.reply_in_groups ?? 0);
    setHumanDelayEnabled(next.human_delay_enabled ?? 1);
    setVoiceSimulationEnabled(next.voice_simulation_enabled ?? 1);
    setRejectCalls(next.reject_calls ?? 0);
    if (next.delayed_read_receipts_override === true || next.delayed_read_receipts_mode === "override" || next.delayedReadReceiptsOverride === true) {
      if (next.delayed_read_receipts_enabled !== undefined || next.delayedReadReceiptsEnabled !== undefined) {
        setDelayedReadReceiptsEnabled(next.delayed_read_receipts_enabled ?? next.delayedReadReceiptsEnabled ? 1 : 0);
      }
      if (next.read_receipt_delay_seconds !== undefined || next.readReceiptDelaySeconds !== undefined) {
        setReadReceiptDelaySeconds(next.read_receipt_delay_seconds ?? next.readReceiptDelaySeconds ?? 10);
      }
    }
    setLearnedInstructions(next.learned_instructions_raw ?? next.learned_instructions ?? "");
    setFollowupEnabled(next.followup_enabled ?? 0);
    setAutoFollowupEnabled(next.auto_followup_enabled ?? next.autoFollowupEnabled ?? 0);
    setFollowupHours(next.followup_hours ?? 12);
    setFollowupOfferContext(next.followup_offer_context ?? "");
    setFollowups(parseFollowupList(next.followups_json ?? next.followups));
    setMutedNumbers(Array.isArray(next.muted_numbers) ? next.muted_numbers : []);
    setAutoReloadEnabled(Boolean(next.autoReloadEnabled ?? next.auto_reload_enabled ?? false));
    setAutoReloadMinutes(next.autoReloadMinutes ?? next.auto_reload_minutes ?? 5);
    setSelectedBotLanguage(next.preferredLanguage || "English");
    setSmartSalesEngineEnabled(Boolean(next.smartSalesEngineEnabled ?? next.smart_sales_engine_enabled ?? false));
    setCustomerIntelligenceScanEnabled(Boolean(next.customerIntelligenceScanEnabled ?? next.customer_intelligence_scan_enabled ?? false));
    
    setProviderType(next.providerType ?? "whatsapp_web");
    setPhoneNumberId(next.phoneNumberId ?? "");
    setBusinessAccountId(next.businessAccountId ?? "");
    setAccessToken("");
    setHasSavedToken(Boolean(next.encryptedAccessTokenRef || next.accessToken));
  };

  const buildInstanceConfig = (overrides: any = {}) => ({
    prompt: overrides?.systemPrompt ?? systemPrompt,
    autoReply: overrides?.isAutoReply ?? overrides?.ai_chat_replies_enabled ?? isAutoReplyEnabled,
    ai_chat_replies_enabled: overrides?.ai_chat_replies_enabled ?? overrides?.isAutoReply ?? isAutoReplyEnabled,
    groups: overrides?.syncGroups ?? syncGroups,
    botVoice: overrides?.botVoice ?? botVoice,
    botGender: overrides?.botGender ?? botGender,
    botName: overrides?.botName ?? botName,
    business_type: overrides?.businessType ?? businessType,
    customFields: overrides?.customFields ?? customFields,
    ...(Object.prototype.hasOwnProperty.call(overrides, "customer_details_configured")
      ? { customer_details_configured: getCustomerDetailsConfiguredSignal(overrides) === true }
      : Object.prototype.hasOwnProperty.call(overrides, "customerDetailsConfigured")
        ? { customer_details_configured: getCustomerDetailsConfiguredSignal(overrides) === true }
        : customerDetailsConfigured !== undefined
          ? { customer_details_configured: customerDetailsConfigured }
          : {}),
    reply_behavior: overrides?.replyBehavior ?? overrides?.reply_behavior ?? replyBehavior,
    difficult_customer_mode: overrides?.difficultCustomerMode ?? overrides?.difficult_customer_mode ?? difficultCustomerMode,
    reply_in_groups: overrides?.replyInGroups ?? overrides?.reply_in_groups ?? replyInGroups,
    human_delay_enabled: overrides?.humanDelayEnabled ?? overrides?.human_delay_enabled ?? humanDelayEnabled,
    voice_simulation_enabled: overrides?.voiceSimulationEnabled ?? overrides?.voice_simulation_enabled ?? voiceSimulationEnabled,
    reject_calls: overrides?.rejectCalls ?? overrides?.reject_calls ?? rejectCalls,
    ...(Boolean(overrides?.delayed_read_receipts_override ?? overrides?.delayedReadReceiptsOverride)
      ? {
          delayed_read_receipts_override: true,
          delayed_read_receipts_enabled: (overrides?.delayedReadReceiptsEnabled ?? overrides?.delayed_read_receipts_enabled) ? 1 : 0,
          read_receipt_delay_seconds: overrides?.readReceiptDelaySeconds ?? overrides?.read_receipt_delay_seconds ?? 10,
        }
      : {}),
    learned_instructions: overrides?.learnedInstructions ?? learnedInstructions,
    followup_enabled: overrides?.followupEnabled ?? followupEnabled,
    auto_followup_enabled: (overrides?.autoFollowupEnabled ?? overrides?.auto_followup_enabled ?? autoFollowupEnabled) ? 1 : 0,
    followup_hours: overrides?.followupHours ?? followupHours,
    followup_offer_context: overrides?.followupOfferContext ?? followupOfferContext,
    followups_json: serializeFollowupList(overrides?.followups ?? followups),
    muted_numbers: overrides?.muted_numbers ?? mutedNumbers,
    autoReloadEnabled: (overrides?.autoReloadEnabled ?? autoReloadEnabled) ? 1 : 0,
    autoReloadMinutes: overrides?.autoReloadMinutes ?? autoReloadMinutes,
    preferredLanguage: overrides?.selectedBotLanguage ?? selectedBotLanguage,
    smartSalesEngineEnabled: (overrides?.smartSalesEngineEnabled ?? overrides?.smart_sales_engine_enabled ?? smartSalesEngineEnabled) ? 1 : 0,
    smartSalesExtraCharge: 0.001,
    smartSalesPromptVersion: overrides?.smartSalesPromptVersion ?? overrides?.smart_sales_prompt_version ?? "v1",
    customerIntelligenceScanEnabled: (overrides?.customerIntelligenceScanEnabled ?? overrides?.customer_intelligence_scan_enabled ?? customerIntelligenceScanEnabled) ? 1 : 0,
  });

  const buildPartialInstanceConfig = (overrides: Record<string, any>) => {
    const payload: Record<string, any> = {};
    if ("systemPrompt" in overrides || "prompt" in overrides) {
      payload.prompt = overrides.systemPrompt ?? overrides.prompt;
    }
    if ("isAutoReply" in overrides || "ai_chat_replies_enabled" in overrides) {
      const autoVal = overrides.isAutoReply ?? overrides.ai_chat_replies_enabled;
      payload.autoReply = autoVal;
      payload.ai_chat_replies_enabled = autoVal;
    }
    if ("syncGroups" in overrides || "groups" in overrides) {
      payload.groups = overrides.syncGroups ?? overrides.groups;
    }
    if ("botVoice" in overrides) payload.botVoice = overrides.botVoice;
    if ("botGender" in overrides) payload.botGender = overrides.botGender;
    if ("botName" in overrides) payload.botName = overrides.botName;
    if ("businessType" in overrides || "business_type" in overrides) {
      payload.business_type = overrides.businessType ?? overrides.business_type;
    }
    if ("customFields" in overrides) payload.customFields = overrides.customFields;
    if ("customer_details_configured" in overrides || "customerDetailsConfigured" in overrides) {
      payload.customer_details_configured = getCustomerDetailsConfiguredSignal(overrides) === true;
    }
    if ("replyBehavior" in overrides || "reply_behavior" in overrides) {
      payload.reply_behavior = overrides.replyBehavior ?? overrides.reply_behavior;
    }
    if ("difficultCustomerMode" in overrides || "difficult_customer_mode" in overrides) {
      payload.difficult_customer_mode = overrides.difficultCustomerMode ?? overrides.difficult_customer_mode;
    }
    if ("replyInGroups" in overrides || "reply_in_groups" in overrides) {
      payload.reply_in_groups = overrides.replyInGroups ?? overrides.reply_in_groups;
    }
    if ("humanDelayEnabled" in overrides || "human_delay_enabled" in overrides) {
      payload.human_delay_enabled = overrides.humanDelayEnabled ?? overrides.human_delay_enabled;
    }
    if ("voiceSimulationEnabled" in overrides || "voice_simulation_enabled" in overrides) {
      payload.voice_simulation_enabled = overrides.voiceSimulationEnabled ?? overrides.voice_simulation_enabled;
    }
    if ("rejectCalls" in overrides || "reject_calls" in overrides) {
      payload.reject_calls = overrides.rejectCalls ?? overrides.reject_calls;
    }
    if ("learnedInstructions" in overrides || "learned_instructions" in overrides) {
      payload.learned_instructions = overrides.learnedInstructions ?? overrides.learned_instructions;
    }
    if ("followupEnabled" in overrides || "followup_enabled" in overrides) {
      payload.followup_enabled = overrides.followupEnabled ?? overrides.followup_enabled;
    }
    if ("autoFollowupEnabled" in overrides || "auto_followup_enabled" in overrides) {
      payload.auto_followup_enabled = (overrides.autoFollowupEnabled ?? overrides.auto_followup_enabled) ? 1 : 0;
    }
    if ("followupHours" in overrides || "followup_hours" in overrides) {
      payload.followup_hours = overrides.followupHours ?? overrides.followup_hours;
    }
    if ("followupOfferContext" in overrides || "followup_offer_context" in overrides) {
      payload.followup_offer_context = overrides.followupOfferContext ?? overrides.followup_offer_context;
    }
    if ("followups" in overrides) {
      payload.followups_json = serializeFollowupList(overrides.followups);
    } else if ("followups_json" in overrides) {
      payload.followups_json = overrides.followups_json;
    }
    if ("muted_numbers" in overrides || "mutedNumbers" in overrides) {
      payload.muted_numbers = overrides.muted_numbers ?? overrides.mutedNumbers;
    }
    if ("autoReloadEnabled" in overrides) {
      payload.autoReloadEnabled = overrides.autoReloadEnabled ? 1 : 0;
    }
    if ("autoReloadMinutes" in overrides) {
      payload.autoReloadMinutes = overrides.autoReloadMinutes;
    }
    if ("selectedBotLanguage" in overrides || "preferredLanguage" in overrides) {
      payload.preferredLanguage = overrides.selectedBotLanguage ?? overrides.preferredLanguage;
    }
    if ("smartSalesEngineEnabled" in overrides || "smart_sales_engine_enabled" in overrides) {
      payload.smartSalesEngineEnabled = (overrides.smartSalesEngineEnabled ?? overrides.smart_sales_engine_enabled) ? 1 : 0;
      payload.smartSalesExtraCharge = 0.001;
      payload.smartSalesPromptVersion = overrides.smartSalesPromptVersion ?? overrides.smart_sales_prompt_version ?? "v1";
    }
    if ("customerIntelligenceScanEnabled" in overrides || "customer_intelligence_scan_enabled" in overrides) {
      payload.customerIntelligenceScanEnabled = (overrides.customerIntelligenceScanEnabled ?? overrides.customer_intelligence_scan_enabled) ? 1 : 0;
    }
    if (overrides.delayed_read_receipts_override || overrides.delayedReadReceiptsOverride) {
      payload.delayed_read_receipts_override = true;
      if ("delayedReadReceiptsEnabled" in overrides || "delayed_read_receipts_enabled" in overrides) {
        payload.delayed_read_receipts_enabled = (overrides.delayedReadReceiptsEnabled ?? overrides.delayed_read_receipts_enabled) ? 1 : 0;
      }
      if ("readReceiptDelaySeconds" in overrides || "read_receipt_delay_seconds" in overrides) {
        payload.read_receipt_delay_seconds = overrides.readReceiptDelaySeconds ?? overrides.read_receipt_delay_seconds;
      }
    }
    return payload;
  };

  const buildIntelligenceSnapshot = () => ({
    systemPrompt,
    botName,
    botGender,
    botVoice,
    businessType,
    learnedInstructions,
    customFields,
    rejectCalls,
    mutedNumbers,
    difficultCustomerMode,
    replyBehavior,
    replyInGroups,
    voiceSimulationEnabled,
    postexApiKey,
    leopardsApiKey,
    leopardsApiPassword,
    dhlApiKey,
    dhlService,
    dhlRequesterCountryCode,
    dhlOriginCountryCode,
    dhlLanguage,
    dhlEnabled,
    adminNumber,
    smartSalesEngineEnabled,
    customerIntelligenceScanEnabled,
  });

  const saveIntelligenceTab = async (tab: IntelligenceTab) => {
    const snapshot = buildIntelligenceSnapshot();
    setIntelligenceSavingTab(tab);
    try {
      if (tab === "integrations") {
        await saveUserConfig(buildIntegrationPayload(snapshot), {
          accountSection: "integrations",
          successMessage: "API & Integrations saved.",
        });
        return;
      }

      const payload = tab === "instructions"
        ? buildSharedAiInstructionsPayload(snapshot)
        : tab === "learned"
          ? buildAiLearnedKnowledgePayload(snapshot)
          : tab === "fields"
            ? buildConfirmationFieldsPayload(snapshot)
            : tab === "smart_sales"
              ? buildSmartSalesPayload(snapshot)
              : buildReplyModePayload(snapshot);

      await saveConfig(true, payload);
      setAppSuccess(`${getIntelligenceSaveButtonLabel(tab).replace(/^Save\s+/, "")} saved.`);
      setTimeout(() => setAppSuccess(null), 5000);
    } catch (e: any) {
      addLog("error", e.message || "Failed to save Intelligence settings");
      setAppError(e.message || "Failed to save Intelligence settings");
      setTimeout(() => setAppError(null), 6000);
    } finally {
      setIntelligenceSavingTab(null);
    }
  };

  const loadSystemProxies = async () => {
    try {
      const res = await fetch(`/api/admin/system-proxies?requesterId=${encodeURIComponent(currentUserId || "")}`);
      const data = await res.json();
      setAdminSystemProxies(Array.isArray(data.proxies) ? data.proxies : []);
    } catch (e) {
      console.error(e);
      setAdminSystemProxies([]);
    }
  };

  const loadWebshareToken = async () => {
    try {
      const res = await fetch(`/api/admin/webshare-token?requesterId=${encodeURIComponent(currentUserId || "")}`);
      const data = await res.json();
      if (res.ok && data.token) setWebshareToken(data.token);
    } catch (e) {
      console.error(e);
    }
  };

  const loadAdminUsers = async () => {
    setIsAdminLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      setAdminUsers(data);
    } catch(e) {
      console.error(e);
    } finally {
      setIsAdminLoading(false);
    }
  };


  const getFilteredCustomers = () => {
    let filtered = allCustomers.filter((c) => {
      const q = orderSearchQuery.toLowerCase();
      if (!sourceMatchesCrmFilter(getCustomerSourceLabelForUi(c), customerSourceFilter)) return false;
      // Combine multiple searchable fields to match the filter logic
      const searchableStr = `${getCustomerDisplayName(c)} ${getCustomerDisplayContact(c)} ${getCustomerSourceLabelForUi(c)} ${c.jid || ''} ${c.customer_id || ''} ${c.last_message || ''}`.toLowerCase();
      return searchableStr.includes(q);
    });

    filtered.sort((a, b) => {
       if (customersSort.column === "name") {
           const aname = getCustomerDisplayName(a).toLowerCase();
           const bname = getCustomerDisplayName(b).toLowerCase();
           return customersSort.direction === 'asc' ? aname.localeCompare(bname) : bname.localeCompare(aname);
       }
       if (customersSort.column === "contact") {
           const acontact = getCustomerDisplayContact(a).toLowerCase();
           const bcontact = getCustomerDisplayContact(b).toLowerCase();
           return customersSort.direction === 'asc' ? acontact.localeCompare(bcontact) : bcontact.localeCompare(acontact);
       }
       // Default to interacted
       return compareCustomersByLastInteraction(a, b, customersSort.direction);
    });

    return filtered;
  };

  const getFilteredTransactions = () => {
    return transactions.filter(t => {
      const tTime = normalizeTime(t.created_at || t.$createdAt) * 1000;
      let matchFrom = true;
      let matchTo = true;
      if (orderDateFrom) {
         const fromStart = new Date(orderDateFrom);
         fromStart.setHours(0, 0, 0, 0);
         matchFrom = tTime >= fromStart.getTime();
      }
      if (orderDateTo) {
         const toEnd = new Date(orderDateTo);
         toEnd.setHours(23, 59, 59, 999);
         matchTo = tTime <= toEnd.getTime();
      }
      return matchFrom && matchTo;
    });
  };

  const getOrderRecordType = (order: any) => {
    const value = String(order?.order_data?.recordType || "").trim().toLowerCase();
    return value === "lead" ? "lead" : "order";
  };

  const getOrderRecordStatus = (order: any) => {
    const details = order?.order_data || {};
    const value = String(details.recordStatus || "").trim().toLowerCase();
    if (value === "incomplete" || value === "complete") return value;
    if (getOrderRecordType(order) === "lead") return "incomplete";
    return "complete";
  };

  const getRecordSectionForOrder = (order: any) => {
    const type = getOrderRecordType(order);
    const status = getOrderRecordStatus(order);
    if (type === "lead") return status === "complete" ? "complete_leads" : "incomplete_leads";
    return status === "complete" ? "complete_orders" : "incomplete_orders";
  };

  const getFilteredOrders = () => {
    return allOrders.filter((o) => {
      if (isDeletedOrder(o)) return false;
      if (getRecordSectionForOrder(o) !== orderRecordSection) return false;
      const orderTime = normalizeTime(o.created_at || o.$createdAt) * 1000;
      let matchFrom = true;
      let matchTo = true;
      if (orderDateFrom) {
         const fromStart = new Date(orderDateFrom);
         fromStart.setHours(0, 0, 0, 0);
         matchFrom = orderTime >= fromStart.getTime();
      }
      if (orderDateTo) {
         const toEnd = new Date(orderDateTo);
         toEnd.setHours(23, 59, 59, 999);
         matchTo = orderTime <= toEnd.getTime();
      }
      return matchFrom && matchTo;
    }).sort((a, b) => (normalizeTime(b.created_at || b.$createdAt) - normalizeTime(a.created_at || a.$createdAt)));
  };

  const getDynamicCustomColumns = () => {
    const dynamic = customFields
      .filter(f => f.name && f.name.trim())
      .map(f => f.name.trim());
    
    const defaults = businessType === "product"
      ? ["Date", "Sr#", "Name", "Phone", "City", "Address", "Product", "Quantity", "COD Amount", "Pieces", "Order Type", "Pickup Address Code", "Tracking ID", "Courier Status", "Shipping Charge", "Notes"]
      : ["Date", "Sr#", "Name", "Phone", "Notes"];
    const filteredDynamic = dynamic.filter(d => !defaults.some(def => def.toLowerCase() === d.toLowerCase()));
    
    return [...defaults, ...filteredDynamic];
  };

  const isSuperAdmin = currentUser?.role === 'super_admin' || currentUser?.email === 'contact-f702aab6c91b@example.invalid' || currentUser?.email === 'contact-b20fab63366b@example.invalid';
  const isAdmin = isSuperAdmin || currentUser?.role === 'admin';
  const walletBillingPurchasesEnabled = Boolean(currentUser?.wallet_billing_purchases_enabled);
  const currentUserId = getUserId(currentUser);
  const selectedBotUserIdRef = useRef(currentUserId);

  useEffect(() => {
    if (!currentUserId || showLanding) return;
    let stopped = false;
    const pollLiveEvents = async () => {
      if (stopped || liveEventsAuthBlockedRef.current) return;
      try {
        const params = new URLSearchParams();
        if (liveEventSinceRef.current) params.set("since", String(liveEventSinceRef.current));
        if (selectedBotId) params.set("botId", selectedBotId);
        const res = await fetch(`/api/live-events?${params.toString()}`, {
          credentials: "same-origin",
        });
        if (res.status === 401 || res.status === 403) {
          liveEventsAuthBlockedRef.current = true;
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok || stopped) return;
        liveEventsAuthBlockedRef.current = false;
        (Array.isArray(data.events) ? data.events : []).forEach(handleLiveConsoleEvent);
      } catch {}
    };
    pollLiveEvents();
    const timer = window.setInterval(pollLiveEvents, isAdmin ? 6000 : 10000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [currentUserId, selectedBotId, isAdmin, showLanding]);

  const now = () => Math.floor(Date.now() / 1000);
  const normalizeTime = (t: any) => {
    if (!t) return 0;
    if (typeof t === 'object' && t.seconds) return t.seconds;
    if (typeof t === 'object' && t._seconds) return t._seconds;
    if (t instanceof Date) return Math.floor(t.getTime() / 1000);
    if (typeof t === 'string' && isNaN(Number(t))) {
      return Math.floor(new Date(t).getTime() / 1000);
    }
    const num = Number(t);
    if (!num) return 0;
    return num > 100000000000 ? Math.floor(num / 1000) : num;
  };

  const formatDatePK = (t: any, includeTime = false, timeOnly = false) => {
    if (!t) return 'N/A';
    const sec = normalizeTime(t);
    if (!sec) return 'N/A';
    const d = new Date(sec * 1000);
    const businessTimezone = resolveBusinessTimezone({ businessTimezone: profileBusinessTimezone });
    
    // timeOnly bypasses everything for a compact HH:MM AM/PM
    if (timeOnly) {
       return new Intl.DateTimeFormat('en-US', {
         timeZone: businessTimezone,
         hour: '2-digit',
         minute: '2-digit',
         hour12: true
       }).format(d).toLowerCase();
    }

    // Default formatting
    return new Intl.DateTimeFormat('en-PK', { 
      timeZone: businessTimezone,
      year: includeTime ? undefined : 'numeric', 
      month: 'short', 
      day: 'numeric',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit', hour12: true } : {})
    }).format(d);
  };


  const navigate = useNavigate();
  const location = useLocation();
  const isViewingPublicAuthPage = isPublicAuthLocation(location.pathname, location.hash);

  useEffect(() => {
    if (location.pathname === "/billing/account" || location.pathname === "/billing/account/") {
      navigate("/settings/billing", { replace: true });
    }
  }, [location.pathname, navigate]);

  const [activeView, setActiveView] = useState<
    | "get_started"
    | "global_dashboard"
    | "dashboard"
    | "bulk"
    | "marketing"
    | "contact_lists"
    | "campaigns"
    | "workspaces"
    | "broadcast"
    | "ai"
    | "geminichat"
    | "settings"
    | "security"
    | "selector"
    | "customers"
    | "crm"
    | "customer_updates"
    | "orders"
    | "products"
    | "analytics"
    | "billing"
    | "admin"
    | "meta_api"
    | "notifications"
    | "disclaimer"
    | "content_library"
    | "media"
    | "sequences"
    | "welcome"
    | "team"
  >(initialRoute?.view === "get_started" ? "get_started" : "global_dashboard");

  const handleSetView = (view: string, tab?: string) => {
    if (view === "crm" && !CRM_UI_ENABLED) {
      setAppError(CRM_UI_PAUSED_MESSAGE);
      setTimeout(() => setAppError(null), 5000);
      setActiveView("global_dashboard");
      setIsMobileSidebarOpen(false);
      navigate("/dashboard");
      return;
    }
    if ((view === "dashboard" || view === "inbox") && !INBOX_UI_ENABLED) {
      setActiveView("global_dashboard");
      setIsMobileSidebarOpen(false);
      navigate("/dashboard");
      return;
    }
    if (view === "dashboard" && !selectedBotId) {
      setAppError("Select a WhatsApp instance first to open the Instance Dashboard.");
      setTimeout(() => setAppError(null), 5000);
      setActiveView("selector");
      setIsMobileSidebarOpen(false);
      navigate("/instances");
      return;
    }
    if (view === "admin" && !isAdmin) {
      setAppError("Admin access required.");
      setTimeout(() => setAppError(null), 5000);
      setActiveView("global_dashboard");
      setIsMobileSidebarOpen(false);
      navigate("/dashboard");
      return;
    }

    if (tab) {
      if (view === "admin") setAdminTab(tab as any);
      else if (view === "billing") setBillingTab(tab as any);
      else if (view === "ai") setAiTab(tab as any);
      else if (view === "analytics") setAnalyticsTab(tab as any);
      else if (view === "content_library") setContentLibraryTab(tab as any);
      else if (view === "settings" || view === "team" || view === "security") setSettingsTab(tab as any);
    }

    setActiveView(view as any);
    setIsMobileSidebarOpen(false);
    const targetPath = resolvePathByViewAndTab(view, tab);
    navigate(targetPath);
  };

  // Sync URL routes to state
  useEffect(() => {
    if (!currentUser || isViewingPublicAuthPage) return;
    const resolved = resolveRouteByPath(location.pathname);
    if (resolved) {
      if (resolved.adminOnly && !isAdmin) {
        setAppError("Admin access required.");
        setTimeout(() => setAppError(null), 5000);
        navigate("/dashboard", { replace: true });
        return;
      }
      if (resolved.view === "crm" && !CRM_UI_ENABLED) {
        navigate("/dashboard", { replace: true });
        return;
      }
      if ((resolved.id === "inbox" || resolved.path === "/inbox" || (resolved.view === "dashboard" && resolved.path === "/inbox")) && !INBOX_UI_ENABLED) {
        navigate("/dashboard", { replace: true });
        return;
      }

      if (activeView !== resolved.view) {
        setActiveView(resolved.view as any);
      }
      if (resolved.tab) {
        if (resolved.view === "admin" && adminTab !== resolved.tab) setAdminTab(resolved.tab as any);
        else if (resolved.view === "billing" && billingTab !== resolved.tab) setBillingTab(resolved.tab as any);
        else if (resolved.view === "ai" && aiTab !== resolved.tab) setAiTab(resolved.tab as any);
        else if (resolved.view === "analytics" && analyticsTab !== resolved.tab) setAnalyticsTab(resolved.tab as any);
        else if (resolved.view === "content_library" && contentLibraryTab !== resolved.tab) setContentLibraryTab(resolved.tab as any);
        else if ((resolved.view === "settings" || resolved.view === "team" || resolved.view === "security") && settingsTab !== resolved.tab) setSettingsTab(resolved.tab as any);
      }
      if (!showLanding) {
        document.title = resolved.title || "BlackArrow Dashboard";
      }
    }
  }, [location.pathname, currentUser, isAdmin, isViewingPublicAuthPage, showLanding, navigate]);

  const notifyDashboard = (tone: DashboardToastTone, message: string) => {
    const toast = buildDashboardToast({ tone, message });
    setDashboardToasts((current) => [toast, ...current].slice(0, 4));
    window.setTimeout(() => setDashboardToasts((current) => current.filter((item) => item.id !== toast.id)), 4200);
  };

  const saveAlertPreferences = async (next: DashboardAlertPreferences) => {
    const normalized = normalizeDashboardAlertPreferences(next);
    setAlertPreferences(normalized);
    await fetchJson<any>("/api/user/alert-preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: normalized }),
    }, { context: "Alert preferences" });
  };

  const toggleAlertPreference = async (
    category: DashboardAlertCategory,
    channel: DashboardAlertChannel,
    enabled: boolean,
  ) => {
    const next = setAlertChannelPreference(alertPreferences, category, channel, enabled);
    try {
      await saveAlertPreferences(next);
      notifyDashboard("success", "Alert preferences saved.");
    } catch {
      setAppError("Could not save alert preferences.");
      setTimeout(() => setAppError(null), 5000);
    }
  };

  const refreshDashboardCrmAlerts = async () => {
    if (!CRM_UI_ENABLED || !currentUserId || showLanding) {
      setCrmDashboardAlerts([]);
      return;
    }
    try {
      const data = await fetchJson<any>("/api/user/crm/overview", {}, { context: "CRM notification overview" });
      setCrmDashboardAlerts(data.notifications || []);
    } catch {
      setCrmDashboardAlerts([]);
    }
  };

  const refreshDashboardNotificationState = async () => {
    if (!currentUserId || showLanding) return;
    try {
      const data = await fetchJson<any>("/api/user/dashboard-notifications/state", {}, { context: "Dashboard notification state" });
      setDashboardNotificationState(normalizeDashboardNotificationState(data.state));
    } catch {
      setDashboardNotificationState(normalizeDashboardNotificationState());
    }
  };

  useEffect(() => {
    if (!currentUserId || showLanding) return;
    if (CRM_UI_ENABLED) {
      refreshDashboardCrmAlerts();
    } else {
      setCrmDashboardAlerts([]);
    }
    refreshDashboardNotificationState();
    if (!CRM_UI_ENABLED) return;
    const timer = window.setInterval(refreshDashboardCrmAlerts, 60000);
    return () => window.clearInterval(timer);
  }, [currentUserId, showLanding]);

  const crmNotificationId = (item: DashboardNotificationItem) => String(item.id || "").replace(/^crm:/, "");

  const persistGeneratedDashboardNotifications = async (
    notifications: DashboardNotificationItem[],
    patch: { read?: boolean; completed?: boolean },
  ) => {
    const ids = generatedDashboardNotificationIds(notifications);
    if (ids.length === 0) return;
    const data = await fetchJson<any>("/api/user/dashboard-notifications/state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, ...patch }),
    }, { context: "Dashboard notification state update" });
    setDashboardNotificationState(normalizeDashboardNotificationState(data.state));
  };

  const patchDashboardCrmNotification = async (item: DashboardNotificationItem, patch: any) => {
    if (item.source !== "crm") return;
    const notificationId = crmNotificationId(item);
    await fetchJson<any>(`/api/user/crm/notifications/${encodeURIComponent(notificationId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }, { context: "CRM notification update" });
    setCrmDashboardAlerts((current) => current.map((row) => row.id === notificationId ? { ...row, ...patch } : row));
  };

  const patchDashboardNotification = async (item: DashboardNotificationItem, patch: { read?: boolean; completed?: boolean }) => {
    if (item.source === "crm") {
      await patchDashboardCrmNotification(item, patch);
      return;
    }
    await persistGeneratedDashboardNotifications([item], patch);
  };

  const bulkUpdateDashboardNotifications = async (
    action: "mark_all_read" | "clear_all" | "clear_read",
    notifications: DashboardNotificationItem[] = [],
  ) => {
    const crmRows = notifications.filter((item) => item.source === "crm");
    const generatedRows = notifications.filter((item) => item.source !== "crm");
    const requests: Promise<any>[] = [];

    if (crmRows.length > 0) {
      requests.push(fetchJson<any>("/api/user/crm/notifications/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }, { context: "CRM notification bulk update" }));
    }

    if (generatedRows.length > 0) {
      requests.push(persistGeneratedDashboardNotifications(generatedRows, {
        read: true,
        completed: action === "mark_all_read" ? undefined : true,
      }));
    }

    await Promise.all(requests);
    if (crmRows.length > 0) await refreshDashboardCrmAlerts();
  };

  const openDashboardNotificationLead = async (item: DashboardNotificationItem) => {
    if (!item.leadId) throw new Error("Missing lead");
    if (!CRM_UI_ENABLED) {
      setAppError(CRM_UI_PAUSED_MESSAGE);
      setTimeout(() => setAppError(null), 5000);
      setActiveView("global_dashboard");
      navigate("/global_dashboard");
      return;
    }
    setCrmOpenLeadRequest({ leadId: item.leadId, token: Date.now() });
    handleSetView("crm");
    await patchDashboardCrmNotification(item, { read: true });
  };

  const applyDashboardSmartAction = async (item: DashboardNotificationItem) => {
    if (!item.leadId || !item.actionId) throw new Error("Missing smart action");
    if (!CRM_UI_ENABLED) {
      setAppError(CRM_UI_PAUSED_MESSAGE);
      setTimeout(() => setAppError(null), 5000);
      return;
    }
    await fetchJson<any>(`/api/user/crm/leads/${item.leadId}/smart-actions/${item.actionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }, { context: "CRM smart action" });
    await patchDashboardCrmNotification(item, { read: true });
    await refreshDashboardCrmAlerts();
  };

  useEffect(() => {
    if (activeView === 'marketing') {
       loadMarketingStats();
       const interval = setInterval(loadMarketingStats, 60000);
       return () => clearInterval(interval);
    }
  }, [activeView, currentUserId]);



  const [adminTab, setAdminTab] = useState<"dashboard" | "users" | "training" | "logs" | "proxies" | "accounting" | "directory" | "smart_sales">("dashboard");
  const [adminLogs, setAdminLogs] = useState<any[]>([]);
  const [adminSystemProxies, setAdminSystemProxies] = useState<any[]>([]);
  const [systemBotId, setSystemBotId] = useState("");
  const [newSystemProxyUrl, setNewSystemProxyUrl] = useState("");
  const [webshareToken, setWebshareToken] = useState("");

  const [accountingData, setAccountingData] = useState<any | null>(null);
  const [accountingError, setAccountingError] = useState<string | null>(null);
  const [accountingIsLoading, setAccountingIsLoading] = useState(false);
  const [accountingFrom, setAccountingFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [accountingTo, setAccountingTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  const fetchAccounting = async () => {
    setAccountingIsLoading(true);
    setAccountingError(null);
    try {
      const res = await fetch(`/api/admin/accounting?from=${accountingFrom}&to=${accountingTo}`);
      const data = await res.json();
      if (data && !data.error) {
        setAccountingData(data);
      } else {
        setAccountingError(data?.error || "Unknown server error");
        setAccountingData(null);
      }
    } catch(e: any) {
      setAccountingError(e.message);
      setAccountingData(null);
    } finally {
      setAccountingIsLoading(false);
    }
  };

  const loadSmartSalesPromptConfig = async () => {
    setIsSmartSalesPromptLoading(true);
    try {
      const res = await fetch("/api/admin/smart-sales-prompt");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load Smart Sales Engine settings");
      setSmartSalesPromptText(data.smartSalesPromptText || "");
      setSmartSalesPromptVersion(data.smartSalesPromptVersion || "v1");
      setSmartSalesPromptUpdatedAt(data.smartSalesPromptUpdatedAt || null);
    } catch (e: any) {
      setAppError(e.message || "Failed to load Smart Sales Engine settings");
      setTimeout(() => setAppError(null), 5000);
    } finally {
      setIsSmartSalesPromptLoading(false);
    }
  };

  const saveSmartSalesPromptConfig = async () => {
    setIsSmartSalesPromptSaving(true);
    try {
      const res = await fetch("/api/admin/smart-sales-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smartSalesPromptText,
          smartSalesPromptVersion,
          requesterId: currentUserId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save Smart Sales Engine settings");
      setSmartSalesPromptText(data.smartSalesPromptText || "");
      setSmartSalesPromptVersion(data.smartSalesPromptVersion || "v1");
      setSmartSalesPromptUpdatedAt(data.smartSalesPromptUpdatedAt || null);
      setAppSuccess("Smart Sales Engine settings saved.");
      setTimeout(() => setAppSuccess(null), 5000);
    } catch (e: any) {
      setAppError(e.message || "Failed to save Smart Sales Engine settings");
      setTimeout(() => setAppError(null), 5000);
    } finally {
      setIsSmartSalesPromptSaving(false);
    }
  };

  const extendTrialForUser = async (targetUserId: string) => {
    try {
      const res = await fetch("/api/admin/users/extend-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: targetUserId, requesterId: currentUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to extend trial");
      setAppSuccess(`Trial active until ${formatDatePK(data.trial_expires_at)}.`);
      setTimeout(() => setAppSuccess(null), 5000);
      await loadAdminUsers();
    } catch (e: any) {
      setAppError(e.message || "Failed to extend trial");
      setTimeout(() => setAppError(null), 5000);
    }
  };

  useEffect(() => {
    if (activeView === 'admin' && adminTab === 'accounting') {
      fetchAccounting();
    }
  }, [activeView, adminTab, accountingFrom, accountingTo]);

  useEffect(() => {
    if (activeView === 'admin' && adminTab === 'smart_sales') {
      loadSmartSalesPromptConfig();
    }
  }, [activeView, adminTab]);
  const [isSyncingWebshare, setIsSyncingWebshare] = useState(false);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: '', color: '' });
  const [newPassword, setNewPassword] = useState("");
  const [twoFaStatus, setTwoFaStatus] = useState(false);
  const [twoFaSetup, setTwoFaSetup] = useState<{ secret: string, qrCodeUrl: string } | null>(null);
  const [twoFaOtp, setTwoFaOtp] = useState("");
  const [profileName, setProfileName] = useState(currentUser?.name || "");
  const [profileCurrency, setProfileCurrency] = useState(currentUser?.base_currency || "USD");
  const [profilePhone, setProfilePhone] = useState(currentUser?.whatsapp_number || "");
  const [profileBusinessTimezone, setProfileBusinessTimezone] = useState(resolveBusinessTimezone(currentUser));

  useEffect(() => {
    if (currentUser) {
      setProfileName(currentUser.name || "");
      setProfileCurrency(currentUser.base_currency || "USD");
      setProfilePhone(currentUser.whatsapp_number || "");
      setProfileBusinessTimezone(resolveBusinessTimezone(currentUser));
    }
  }, [currentUser]);
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const CURRENCIES = ["USD", "EUR", "GBP", "PKR", "INR", "AUD", "CAD", "ZAR", "AED"];

  // Fetch exchange rate once on load or when profileCurrency changes
  useEffect(() => {
    if (profileCurrency === "USD") {
      setExchangeRate(1);
      return;
    }
    fetch(`https://api.exchangerate-api.com/v4/latest/USD`)
      .then(res => res.json())
      .then(data => {
        if (data && data.rates && data.rates[profileCurrency]) {
          setExchangeRate(data.rates[profileCurrency]);
        }
      }).catch(console.error);
  }, [profileCurrency]);

  const getCurrencySymbol = () => {
    const symbols: Record<string, string> = {
      USD: '$', EUR: '€', GBP: '£', PKR: 'Rs ', INR: '₹', AUD: 'A$', CAD: 'C$', ZAR: 'R ', AED: 'د.إ '
    };
    return symbols[profileCurrency] || profileCurrency + ' ';
  };

  const formatCurrency = (usdAmount: number, maxFractions: number = 2, compact = false) => {
    const converted = convertUsdToAccountCurrency(usdAmount, exchangeRate);
    return formatMoneyValue(converted, getCurrencySymbol(), maxFractions, compact);
  };

  const formatAccountCurrency = (amount: number, maxFractions: number = 2, compact = false) => {
    return formatMoneyValue(amount, getCurrencySymbol(), maxFractions, compact);
  };

  const formatCompactCount = (value: any) => {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 1,
    }).format(Number(value || 0));
  };

  const toAmount = (value: any) => {
    return parseDashboardAmount(value);
  };

  const firstDefined = (...values: any[]) => values.find(value => value !== undefined && value !== null && value !== "");
  const getAddonQuantity = (addonId: string) => Math.max(1, Number(addonQuantities[addonId] || 1));
  const setAddonQuantity = (addonId: string, nextValue: number) => {
    setAddonQuantities(prev => ({ ...prev, [addonId]: Math.max(1, nextValue || 1) }));
  };
  const quotaBreakdowns = userBilling?.quotaBreakdowns || {};
  const billingFeatures = userBilling?.billingFeatures || {};
  const activeAddons = Array.isArray(userBilling?.activeAddons) ? userBilling.activeAddons : [];
  const setupStatus = userBilling?.setupStatus || null;
  const aiUsageRates = Array.isArray(userBilling?.aiUsageRates) && userBilling.aiUsageRates.length > 0 ? userBilling.aiUsageRates : AI_USAGE_RATES;
  const quotaOrder = [
    "whatsapp_instances",
    "products_services",
    "customers",
    "orders_per_month",
    "media_templates",
    "media_groups",
    "sequence_groups",
  ];
  const usageCategoryCards = summarizeUsageRows(analyticsData);
  const usageCategoryTotalCost = usageCategoryCards.reduce((sum, item) => sum + Number(item.cost || 0), 0);
  const isBillingCategoryVisible = (key: string) => visibleBillingCategoryKeys[key] === true;
  const toggleBillingCategory = (key: string) => {
    setVisibleBillingCategoryKeys(prev => ({ ...prev, [key]: prev[key] === false }));
  };
  const isLowWallet = walletBalance > 0 && walletBalance < 2;
  const stressedQuotaCount = Object.values(quotaBreakdowns || {}).filter((quota: any) => quota?.total > 0 && (Number(quota.used || 0) / Number(quota.total || 1)) >= 0.8).length;

  const normalizeMatchText = (value: any) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  const parseOrderDetail = (detail: any) => {
    const text = String(detail || "");
    const itemMatch = text.match(/(?:item|product)\s*:\s*([^,\n]+)/i);
    const qtyMatch = text.match(/(?:qty|quantity)\s*:\s*(\d+(?:\.\d+)?)/i);
    return {
      productName: itemMatch?.[1]?.trim() || "",
      quantity: qtyMatch ? toAmount(qtyMatch[1]) : 0,
    };
  };

  const getOrderData = (order: any) => order?.order_data || order?.orderData || {};

  const getOrderRevenue = (order: any) => {
    const data = getOrderData(order);
    return toAmount(firstDefined(data.totalPrice, data.total_price, data.codAmount, data.cod_amount, data.amount, data.total));
  };

  const getOrderQuantity = (order: any) => {
    const data = getOrderData(order);
    const parsed = parseOrderDetail(data.orderDetail || data.detail || data.notes);
    const quantity = toAmount(firstDefined(data.quantity, data.qty, data.units, parsed.quantity));
    return quantity > 0 ? quantity : 1;
  };

  const getOrderProductName = (order: any) => {
    const data = getOrderData(order);
    const parsed = parseOrderDetail(data.orderDetail || data.detail || data.notes);
    return String(firstDefined(data.productName, data.product_name, data.itemName, data.item_name, parsed.productName) || "");
  };

  const findProductForOrder = (order: any) => {
    const data = getOrderData(order);
    const orderName = normalizeMatchText(getOrderProductName(order));
    const orderText = normalizeMatchText(`${orderName} ${data.orderDetail || ""} ${data.detail || ""} ${data.notes || ""}`);
    if (!orderText) return null;

    return products.find((product: any) => {
      const productName = normalizeMatchText(product.name);
      const productSku = normalizeMatchText(product.sku);
      return (
        (productName && ((orderName && (orderName === productName || orderName.includes(productName) || productName.includes(orderName))) || orderText.includes(productName))) ||
        (productSku && ((orderName && orderName === productSku) || orderText.includes(productSku)))
      );
    }) || null;
  };

  const getOrderProductCost = (order: any) => {
    const data = getOrderData(order);
    const explicitCost = firstDefined(data.productCost, data.product_cost, data.totalCost, data.total_cost);
    const explicitCostAmount = toAmount(explicitCost);
    if (explicitCost !== undefined && explicitCostAmount > 0) return explicitCostAmount;

    const explicitUnitCost = firstDefined(data.productUnitCost, data.product_unit_cost, data.unitCost, data.unit_cost, data.costPrice, data.cost_price);
    const explicitUnitCostAmount = toAmount(explicitUnitCost);
    if (explicitUnitCost !== undefined && explicitUnitCostAmount > 0) return explicitUnitCostAmount * getOrderQuantity(order);

    const product = findProductForOrder(order);
    const productCost = toAmount(firstDefined(product?.cost_price, product?.costPrice, product?.unit_cost, product?.unitCost));
    return productCost > 0 ? productCost * getOrderQuantity(order) : explicitCostAmount;
  };

  const getOrderShippingCharge = (order: any) => {
    const data = getOrderData(order);
    return toAmount(firstDefined(
      data.shippingCharge,
      data.shipping_charge,
      data.shippingCharges,
      data.shipping_charges,
      data.shippingCost,
      data.shipping_cost,
      data.deliveryCharge,
      data.delivery_charge,
      data.deliveryFee,
      data.courierCharge,
      data.courierFee,
      data.freight
    ));
  };

  const getDashboardDateRangeMs = () => {
    const from = orderDateFrom ? startOfDay(new Date(orderDateFrom)).getTime() : 0;
    const to = orderDateTo ? endOfDay(new Date(orderDateTo)).getTime() : Date.now() + 86400000;
    return { from, to };
  };

  const getFilteredAnalytics = () => {
    const { from, to } = getDashboardDateRangeMs();
    return analyticsData.filter((entry: any) => {
      const entryTime = normalizeTime(entry.timestamp || entry.created_at || entry.$createdAt) * 1000;
      if (!entryTime) return false;
      return entryTime >= from && entryTime <= to;
    });
  };

  const getDashboardRecords = () => {
    const { from, to } = getDashboardDateRangeMs();
    return allOrders.filter((order) => {
      if (isDeletedOrder(order) || isInactiveOrder(order)) return false;
      const orderTime = normalizeTime(order.created_at || order.$createdAt || order.order_data?.createdAt || order.order_data?.created_at) * 1000;
      if (!orderTime) return false;
      return orderTime >= from && orderTime <= to;
    });
  };

  const getDashboardActiveCustomers = () => {
    const { from, to } = getDashboardDateRangeMs();
    return allCustomers.filter((customer) => {
      const interactionTime = getCustomerLastInteractionTimestamp(customer) * 1000;
      if (!interactionTime) return false;
      return interactionTime >= from && interactionTime <= to;
    }).length;
  };

  const isSubscriptionTransaction = (transaction: any) => {
    const type = String(transaction?.type || "").toLowerCase();
    const description = String(transaction?.description || "").toLowerCase();
    return type.includes("subscription") || description.includes("subscription") || description.includes("subscribed to") || description.includes("monthly auto-renewal") || description.includes("plan switch");
  };

  const getDashboardTotals = () => {
    const orders = getDashboardRecords();
    const analytics = getFilteredAnalytics();
    const revenue = orders.reduce((sum, order) => sum + getOrderRevenue(order), 0);
    const productCost = orders.reduce((sum, order) => sum + getOrderProductCost(order), 0);
    const shippingCharges = orders.reduce((sum, order) => sum + getOrderShippingCharge(order), 0);
    const aiApiCost = analytics.reduce((sum, entry) => sum + toAmount(entry.cost), 0);
    const aiApiCostAccount = convertUsdToAccountCurrency(aiApiCost, exchangeRate);
    const messagesHandled = analytics.reduce((sum, entry) => sum + (toAmount(entry.amount) || 1), 0);
    const aiRepliesSent = analytics
      .filter((entry: any) => /text_reply|voice_reply/i.test(String(entry.type || "")))
      .reduce((sum, entry) => sum + (toAmount(entry.amount) || 1), 0);
    const incompleteRecords = orders.filter((order) => getOrderRecordStatus(order) === "incomplete").length;
    const activeCustomers = getDashboardActiveCustomers();
    const subscriptionCost = getFilteredTransactions()
      .filter(transaction => toAmount(transaction.amount) < 0 && isSubscriptionTransaction(transaction))
      .reduce((sum, transaction) => sum + Math.abs(toAmount(transaction.amount)), 0);
    const subscriptionCostAccount = convertUsdToAccountCurrency(subscriptionCost, exchangeRate);

    return {
      revenue,
      productCost,
      aiApiCost,
      aiApiCostAccount,
      subscriptionCost,
      subscriptionCostAccount,
      shippingCharges,
      messagesHandled,
      aiRepliesSent,
      activeCustomers,
      incompleteRecords,
      profit: revenue - productCost - aiApiCostAccount - subscriptionCostAccount - shippingCharges,
      ordersCount: orders.length,
    };
  };
  const [profileOtpModal, setProfileOtpModal] = useState<{ isOpen: boolean, phone: string, purpose: 'profile' | 'admin', loading: boolean, otp: string }>({ isOpen: false, phone: '', purpose: 'profile', loading: false, otp: '' });
  
  const handleGenericSendOTP = async (phoneToVerify: string, purpose: 'profile' | 'admin') => {
    try {
      setProfileOtpModal(prev => ({ ...prev, loading: true }));
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneToVerify, isLogin: false, isReset: false })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send OTP");
      setProfileOtpModal({ isOpen: true, phone: phoneToVerify, purpose, loading: false, otp: '' });
      setAppSuccess("OTP sent successfully to " + phoneToVerify);
      setTimeout(() => setAppSuccess(null), 3000);
    } catch (e: any) {
      setProfileOtpModal(prev => ({ ...prev, loading: false }));
      setAppError(e.message || "Failed to send OTP");
      setTimeout(() => setAppError(null), 4000);
    }
  };

  const verifyAndSaveFeaturePhone = async () => {
    try {
      setProfileOtpModal(prev => ({ ...prev, loading: true }));
      const res = await fetch("/api/auth/verify-otp-generic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: profileOtpModal.phone, otp: profileOtpModal.otp })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid OTP");
      
      if (profileOtpModal.purpose === 'profile') {
        const updateRes = await fetch("/api/auth/update-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUserId, name: profileName, whatsapp_number: profileOtpModal.phone })
        });
        if (!updateRes.ok) throw new Error("Failed to update profile");
        setCurrentUser(prev => prev ? { ...prev, whatsapp_number: profileOtpModal.phone, name: profileName } : null);
        setAppSuccess("Profile updated successfully!");
      } else if (profileOtpModal.purpose === 'admin') {
        setOriginalAdminNumber(profileOtpModal.phone);
        await saveUserConfig({ skipOtp: true, adminNumber: profileOtpModal.phone });
        setAdminNumber(profileOtpModal.phone);
        setAppSuccess("Settings saved and Admin WhatsApp number verified!");
      }
      setTimeout(() => setAppSuccess(null), 3000);
      setProfileOtpModal({ isOpen: false, phone: '', purpose: 'profile', loading: false, otp: '' });
    } catch (e: any) {
      setProfileOtpModal(prev => ({ ...prev, loading: false }));
      setAppError(e.message || "Failed to verify OTP");
      setTimeout(() => setAppError(null), 4000);
    }
  };
  const [systemAlertsEnabled, setSystemAlertsEnabled] = useState(true);
  const [billingAlertsEnabled, setBillingAlertsEnabled] = useState(true);
  const [proxyAlertsEnabled, setProxyAlertsEnabled] = useState(true);
  const [orderAlertsEnabled, setOrderAlertsEnabled] = useState(true);
  const [alertPreferences, setAlertPreferences] = useState<DashboardAlertPreferences>(() => normalizeDashboardAlertPreferences());
  const [botActiveTab, setBotActiveTab] = useState<"general" | "actions" | "sequences" | "monitor">("general");
  const [newGroupShortcut, setNewGroupShortcut] = useState("");

  useEffect(() => {
    const checkStrength = (pass: string) => {
      let score = 0;
      if (!pass) return { score: 0, label: '', color: '' };
      if (pass.length >= 8) score += 1;
      if (/[A-Z]/.test(pass)) score += 1;
      if (/[0-9]/.test(pass)) score += 1;
      if (/[!@#$%^&*]/.test(pass)) score += 1;

      const labels = ['Very Weak', 'Weak', 'Good', 'Strong', 'Very Strong'];
      const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500', 'bg-emerald-500'];
      
      return { score, label: labels[score], color: colors[score] };
    };
    setPasswordStrength(checkStrength(newPassword));
  }, [newPassword]);

  const loadAdminLogs = async () => {
    setIsLogsLoading(true);
    try {
      const res = await fetch("/api/admin/logs/list");
      const data = await res.json();
      if (data.files) setAdminLogs(data.files);
    } catch (e) {
      console.error("[Logs] Failed to fetch admin logs:", e);
    } finally {
      setIsLogsLoading(false);
    }
  };

  useEffect(() => {
    if (activeView === 'admin' && adminTab === 'logs') {
      loadAdminLogs();
    }
    if (activeView === 'admin' && adminTab === 'proxies') {
      loadSystemProxies();
      loadWebshareToken();
    }
  }, [activeView, adminTab]);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [productSearchQuery, setProductSearchQuery] = useState<string>("");
  const [transactions, setTransactions] = useState<any[]>([]);
  const getBillingDateRangeMs = () => {
    const from = analyticsFromStr ? startOfDay(new Date(analyticsFromStr)).getTime() : 0;
    const to = analyticsToStr ? endOfDay(new Date(analyticsToStr)).getTime() : Date.now() + 86400000;
    return { from, to };
  };
  const getFilteredBillingTransactions = () => {
    const { from, to } = getBillingDateRangeMs();
    return transactions.filter((transaction: any) => {
      const transactionTime = normalizeTime(transaction?.created_at || transaction?.timestamp || transaction?.$createdAt) * 1000;
      if (!transactionTime) return false;
      return transactionTime >= from && transactionTime <= to;
    }).sort((a: any, b: any) => (
      normalizeTime(b?.created_at || b?.timestamp || b?.$createdAt) - normalizeTime(a?.created_at || a?.timestamp || a?.$createdAt)
    )).slice(0, 50);
  };
  
  const fetchTransactions = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/user/transactions?userId=${currentUserId}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };
  const [activeLeftTab, setActiveLeftTab] = useState<"agent" | "system">(
    "agent",
  );
  // Refs to avoid stale closures in socket listeners
  const promptRef = useRef(systemPrompt);
  const autoReplyRef = useRef(isAutoReplyEnabled);
  const [sessionExpiry, setSessionExpiry] = useState<number | null>(null);

  useEffect(() => {
    // Check for login token in URL
    const params = new URLSearchParams(window.location.search);
    const loginToken = params.get('login_token');
    if (loginToken) {
      console.log("[App] Found login token in URL, attempting token-based login...");
      fetch(`/api/auth/token-login?token=${loginToken}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            const loginState = buildMagicLinkLoginSuccessState(data.user);
            console.log("[App] Token login successful:", loginState.user);
            localStorage.setItem("currentUser", JSON.stringify(loginState.user));
            if (loginState.sessionType === "temporary") {
              localStorage.setItem("session_type", "temporary");
              localStorage.setItem("last_activity", Date.now().toString());
            } else {
              localStorage.removeItem("session_type");
              localStorage.removeItem("last_activity");
            }
            setCurrentUser(loginState.user);
            setShowLanding(loginState.showLanding);
            setAppSuccess("Logged in via administrative shortcut!");
            window.history.replaceState({}, document.title, removeMagicLinkTokenFromUrl(window.location.href, loginState.redirectPath));
            navigate(loginState.redirectPath, { replace: true });
          } else {
            setCurrentUser(null);
            setShowLanding(true);
            localStorage.removeItem("currentUser");
            localStorage.removeItem("session_type");
            localStorage.removeItem("last_activity");
            setAppError(getMagicLinkLoginErrorMessage(data));
          }
        })
        .catch(e => {
          console.error("[App] Token login error:", e);
          setCurrentUser(null);
          setShowLanding(true);
          localStorage.removeItem("currentUser");
          localStorage.removeItem("session_type");
          localStorage.removeItem("last_activity");
          setAppError("Failed to authenticate via login link.");
        });
    }
  }, [navigate]);

  useEffect(() => {
    // Inactivity check for temporary sessions
    const interval = setInterval(() => {
      const isTemporary = localStorage.getItem("session_type") === "temporary";
      if (isTemporary && currentUser) {
        const lastActivity = parseInt(localStorage.getItem("last_activity") || "0");
        const minutesPassed = (Date.now() - lastActivity) / 60000;
        
        if (minutesPassed >= 10) {
          console.warn("[App] Session expired due to 10 minutes of inactivity.");
          handleLogout("inactivity:10m");
          setAppError("Your temporary administrative session has expired due to inactivity.");
        }
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [currentUser]);

  useEffect(() => {
    // Track user activity
    const updateActivity = () => {
      if (localStorage.getItem("session_type") === "temporary") {
        localStorage.setItem("last_activity", Date.now().toString());
      }
    };
    
    window.addEventListener('mousedown', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('touchstart', updateActivity);
    
    return () => {
      window.removeEventListener('mousedown', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('touchstart', updateActivity);
    };
  }, []);

  useEffect(() => {
    // Debug logging for identity issues
    if (currentUser) {
      console.log(`[App] Current Identity: ${currentUser.email} (ID: ${currentUserId})`);
    }
  }, [currentUser, currentUserId]);

  useEffect(() => {
    if (activeView === "admin") {
      loadAdminUsers();
    }
    if (activeView === 'security' && currentUser) {
      fetch(`/api/auth/2fa-status?userId=${currentUserId}`)
        .then(res => res.json())
        .then(data => setTwoFaStatus(data.enabled));
    }
  }, [activeView]);

  useEffect(() => {
    const fetchAppStatus = async (retries = 5) => {
      try {
        const res = await fetch("/api/admin/app-status");
        if (res.ok) {
          const data = await res.json();
          console.log("[App] Received App Status:", data);
          setAppStatus(data);
        } else {
          throw new Error("Status " + res.status);
        }
      } catch (e) {
        console.error("[App] Failed to fetch app status", e);
        if (retries > 0) {
          console.log(`[App] Retrying status fetch... (${retries} left)`);
          setTimeout(() => fetchAppStatus(retries - 1), 3000);
        }
      }
    };
    fetchAppStatus();
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    try {
      setSelectedBotId(localStorage.getItem(getSelectedBotStorageKey(currentUser)));
    } catch {
      setSelectedBotId(null);
    }
    fetchBots();
    fetchUserConfig();
    fetchProducts();
    if (isSuperAdmin) {
       fetch("/api/admin/system-bot").then(res => res.json()).then(data => setSystemBotId(data.botId || "")).catch(()=>{});
    }
  }, [currentUserId, isSuperAdmin]);

  useEffect(() => {
    try {
      if (selectedBotUserIdRef.current !== currentUserId) {
        selectedBotUserIdRef.current = currentUserId;
        return;
      }
      if (selectedBotId) {
        localStorage.setItem(getSelectedBotStorageKey(currentUser), selectedBotId);
      } else {
        localStorage.removeItem(getSelectedBotStorageKey(currentUser));
      }
    } catch {}
  }, [selectedBotId, currentUserId]);

  useEffect(() => {
    if (!selectedBotId) {
      setInstanceConfigStatus("EMPTY");
      return;
    }
    const currentRequestId = ++botConfigLoadRequestIdRef.current;
    setInstanceConfigStatus("LOADING");

    if (!Array.isArray(bots) || bots.length === 0) return;
    const currentBot = bots.find((b) => String(b.id || b.$id || b._id || "") === String(selectedBotId));
    if (!currentBot) {
      setInstanceConfigStatus("ERROR");
      return;
    }
    let cfg: any = {};
    if (typeof currentBot.config_settings === "string") {
      try { cfg = JSON.parse(currentBot.config_settings); } catch {}
    } else if (typeof currentBot.config_settings === "object" && currentBot.config_settings !== null) {
      cfg = currentBot.config_settings;
    }
    if (botConfigLoadRequestIdRef.current === currentRequestId) {
      applyInstanceConfig(cfg);
      setInstanceConfigStatus("LOADED");
    }
  }, [selectedBotId, bots]);

  const fetchProducts = async (retryCount = 3) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/user/products?userId=${currentUserId}`);
      if (!res.ok) {
         if (res.status === 404) {
            console.warn("Products not found for user.");
            setProducts([]);
            return;
         }
         throw new Error("Status " + res.status);
      }
      const data = await res.json();
      setProducts(data);
    } catch (e) {
      console.error("Failed to fetch products", e);
      if (retryCount > 0) {
        setTimeout(() => fetchProducts(retryCount - 1), 1500);
      }
    }
  };

  const saveProduct = async (product: any) => {
    if (!currentUser) return;
    try {
      if (product.variations && product.variations.length > 0) {
        product.stock = product.variations.reduce((sum: number, v: any) => sum + (v.options?.reduce((s: number, o: any) => s + (Number(o.stock) || 0), 0) || 0), 0);
      }
      const res = await fetch("/api/user/products/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId, product }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save product");
      }
      setEditingProduct(null);
      fetchProducts();
    } catch (e: any) {
      console.error("Failed to save product", e);
      setAppError(e.message);
      setTimeout(() => setAppError(null), 5000);
    }
  };

  const confirmDeleteProduct = async (productId: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch("/api/user/products/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId, productId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete product");
      fetchProducts();
    } catch (e: any) {
      console.error("Failed to delete product", e);
      setAppError(e.message);
      setTimeout(() => setAppError(null), 5000);
    }
  };

  const handleLogout = (source?: string) => {
    console.warn(`[App] Logging out. Source: ${source || "User Manual"}`);
    fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" } }).catch(() => {});
    setCurrentUser(null);
    setBots([]);
    setSelectedBotId(null);
    setShowLanding(true);
    localStorage.removeItem("currentUser");
    localStorage.removeItem("selectedBotId");
    localStorage.removeItem("session_type");
    localStorage.removeItem("last_activity");
  };

  const fetchUserConfig = async (retryCount = 3, options?: { suppressInfraError?: boolean }) => {
    if (!currentUserId) return;
    try {
      const res = await fetch(`/api/user/config?userId=${currentUserId}&t=${Date.now()}`, {
        credentials: "same-origin",
      });
      if (!res.ok) {
        if (res.status === 404) {
           console.warn("Config row missing for user.");
           setIsConfigLoaded(true);
           return;
        }
        throw new Error(`HTTP Error ${res.status}`);
      }
      const data = await res.json();
      if (data) {
        setPostexApiKey(data.postex_api_key || "");
        setLeopardsApiKey(data.leopards_api_key || "");
        setLeopardsApiPassword(data.leopards_api_password || "");
        setDhlApiKey(data.dhl_api_key || "");
        setDhlService(data.dhl_service || "express");
        setDhlRequesterCountryCode(data.dhl_requester_country_code || "");
        setDhlOriginCountryCode(data.dhl_origin_country_code || "");
        setDhlLanguage(data.dhl_language || "");
        setDhlEnabled(data.dhl_enabled === 1 || data.dhl_enabled === true);
        setClientGeminiStatus(data.client_gemini || { enabled: false, hasKey: false, maskedKey: "", cacheBoostEnabled: false, updatedAt: 0 });
        setClientGeminiEnabled(Boolean(data.client_gemini?.enabled));
        setClientGeminiCacheBoostEnabled(Boolean(data.client_gemini?.cacheBoostEnabled));
        setClientGeminiUsage(data.client_gemini_usage || {
          cacheBoostEnabled: Boolean(data.client_gemini?.cacheBoostEnabled),
          today: { customGeminiCycles: 0, customGeminiRequests: 0, customGeminiCost: 0, cacheBoostCharges: 0, cacheBoostCost: 0 },
          last7Days: { customGeminiCycles: 0, customGeminiRequests: 0, customGeminiCost: 0, cacheBoostCharges: 0, cacheBoostCost: 0 },
          total: { customGeminiCycles: 0, customGeminiRequests: 0, customGeminiCost: 0, cacheBoostCharges: 0, cacheBoostCost: 0 },
        });
        setClientGeminiApiKey("");
        setAdminNumber(data.admin_number || "");
        setOriginalAdminNumber(data.admin_number || "");
        setBusinessAssistantEnabled(Boolean(data.business_assistant_enabled ?? data.businessAssistantEnabled ?? false));
        setAdminNumberVerified(Boolean(data.admin_number_verified));
        setSystemAlertsEnabled(data.system_alerts_enabled !== false);
        setBillingAlertsEnabled(data.billing_alerts_enabled !== false);
        setProxyAlertsEnabled(data.proxy_alerts_enabled !== false);
        setOrderAlertsEnabled(data.order_alerts_enabled !== false);
        setDelayedReadReceiptsEnabled(data.delayed_read_receipts_enabled ?? data.delayedReadReceiptsEnabled ? 1 : 0);
        setReadReceiptDelaySeconds(data.read_receipt_delay_seconds ?? data.readReceiptDelaySeconds ?? 10);
        if (data.proactive_lead_alerts) setProactiveLeadAlerts(data.proactive_lead_alerts);
        if (data.proactive_alerts) setProactiveAlerts(data.proactive_alerts);
        setAlertPreferences(normalizeDashboardAlertPreferences(data.dashboard_alert_preferences || data.alert_preferences));
        setProxyUrl(data.proxy_url || "");
        setUseDedicatedProxy(data.use_dedicated_proxy === 1);
        const loadedBusinessTimezone = resolveBusinessTimezone(data);
        setProfileBusinessTimezone(loadedBusinessTimezone);
        
        setUserBilling({ 
          usage: data.usage_cost || 0, 
          limit: data.billing_limit || 10, 
          productLimit: data.product_limit || 3,
          instanceLimit: data.instance_limit || 1,
          customerLimit: data.customer_limit,
          orderLimit: data.order_limit,
          mediaTemplateLimit: data.media_template_limit,
          mediaGroupLimit: data.media_group_limit,
          sequenceGroupLimit: data.sequence_group_limit,
          subscriptions: data.subscriptions || [],
          plan: data.plan || null,
          billing_access: data.billing_access || null,
          quotaBreakdowns: data.quota_breakdowns || {},
          billingFeatures: data.billing_features || {},
          activeAddons: data.active_addons || [],
          setupStatus: data.setup_status || null,
          aiUsageRates: data.ai_usage_rates || []
        });
        setWalletBalance(data.wallet_balance ?? 0);
        
        // Ensure role, created_at, plan, trial extension, and account-level display config are synced unconditionally.
        setCurrentUser(prev => {
          if (!prev) return prev;
          const updated = { ...prev };
          if (data.user_created_at) updated.created_at = data.user_created_at;
          if (data.role) updated.role = data.role;
          if (data.plan?.id) updated.plan_id = data.plan.id;
          if (data.plan?.name) updated.plan_name = data.plan.name;
          if (data.plan?.plan_expiry) updated.plan_expiry = data.plan.plan_expiry;
          if (data.plan?.trial_expires_at) updated.trial_expires_at = data.plan.trial_expires_at;
          updated.wallet_balance = data.wallet_balance ?? 0;
          updated.wallet_billing_purchases_enabled = Boolean(data.wallet_billing_purchases_enabled);
          updated.trial_extension_used = Boolean(data.trial_extension_used);
          if (loadedBusinessTimezone) {
            updated.business_timezone = loadedBusinessTimezone;
            updated.businessTimezone = loadedBusinessTimezone;
          }
          return updated;
        });
        clearInfrastructureSyncError();
        setIsConfigLoaded(true);
      }
    } catch (e: any) {
      console.error("[Config] Failed to fetch user config", e);
      if (retryCount > 0) {
        setTimeout(() => {
          void fetchUserConfig(retryCount - 1, options);
        }, 2000);
      } else {
        setIsConfigLoaded(true); // Unblock after retries
        if (!options?.suppressInfraError) {
          setAppError(INFRASTRUCTURE_SYNC_DELAYED_ERROR);
          setTimeout(() => setAppError(null), 10000);
        }
      }
    }
  };

  const startCreemCheckout = async (payload: any) => {
    if (!currentUser) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/billing/creem/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create checkout");
      if (data.upgraded) {
        setAppSuccess("Plan successfully upgraded via your active Card subscription!");
        await fetchUserConfig();
        return;
      }
      if (!data.checkoutUrl) throw new Error("Creem did not return a checkout URL");
      trackBeginCheckoutConversion({
        checkoutId: data.checkoutId,
        checkoutUrl: data.checkoutUrl,
        type: payload?.type,
        planId: payload?.planId,
        addonType: payload?.addonType,
        billingCycle: payload?.billingCycle,
      });
      setAppSuccess("Opening Creem checkout. Your account updates after verified webhook confirmation.");
      window.location.href = data.checkoutUrl;
    } catch (e: any) {
      setAppError(e.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setAppError(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const fetchAnalytics = async (fromOverride?: number, toOverride?: number) => {
    if (!currentUser) return;
    try {
      const from = fromOverride ?? startOfDay(new Date(analyticsFromStr)).getTime();
      const to = toOverride ?? endOfDay(new Date(analyticsToStr)).getTime();
      const res = await fetch(`/api/user/analytics?userId=${currentUserId}&from=${from}&to=${to}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setAnalyticsData(data);
      } else {
        setAnalyticsData([]);
      }
    } catch(e) {
      console.error(e);
    }
  };

  const fetchUsageAnalytics = async (limitToFetch?: number) => {
    if (!currentUser) return;
    const effectiveLimit = limitToFetch ?? usageLimit ?? 100;
    try {
      const res = await fetch(`/api/user/analytics?userId=${currentUserId}&limit=${effectiveLimit}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setAnalyticsData(prev => {
          const map = new Map();
          for (const item of data) {
            const key = item.$id || item.id || `doc_${item.timestamp}_${item.type}`;
            map.set(key, item);
          }
          for (const item of (Array.isArray(prev) ? prev : [])) {
            const key = item.$id || item.id || `doc_${item.timestamp}_${item.type}`;
            if (!map.has(key)) {
              map.set(key, item);
            }
          }
          const merged = Array.from(map.values());
          merged.sort((a: any, b: any) => {
            const timeA = Number(a.timestamp || a.created_at || 0);
            const timeB = Number(b.timestamp || b.created_at || 0);
            return timeB - timeA;
          });
          return merged.slice(0, effectiveLimit);
        });
      } else {
        setAnalyticsData([]);
      }
    } catch(e) {
      console.error(e);
    }
  };

  const handleUsageLimitChange = (newLimit: number) => {
    const valid = [10, 100, 1000].includes(newLimit) ? newLimit : 100;
    setUsageLimit(valid);
    try {
      localStorage.setItem("blackarrow_usage_limit", String(valid));
    } catch {}
    fetchUsageAnalytics(valid);
  };

  useEffect(() => {
    setContentLibraryTemplateDetails(null);
    latestTemplateDetailsBotIdRef.current = selectedBotId;
    if (selectedBotId && (activeView === "content_library" || activeView === "sequences" || activeView === "media" || activeView === "welcome")) {
      void loadContentLibraryTemplateDetails(selectedBotId);
    }
  }, [selectedBotId, activeView]);

  const fetchGroupTemplates = async (group: any) => {
    setIsLoadingTemplates(true);
    try {
      const res = await fetch(`/api/bot/${selectedBotId}/templates/details`);
      const data = await res.json();
      let templates = [];
      if (group.purpose === 'welcome') templates = data.welcome?.templates || [];
      else if (group.purpose === 'media') templates = data.media?.templates || [];
      else {
          templates = data.sequences?.[group.name]?.templates || [];
      }
      setSelectedGroupTemplates({ name: group.name, templates });
    } catch (e) {
      addLog("error", "Failed to fetch template details");
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  useEffect(() => {
    if (activeView === 'billing' || activeView === 'analytics') {
      const isUsageTab = activeView === 'billing' && billingTab === 'usage';
      const refreshUsage = () => {
        if (isUsageTab) {
          fetchUsageAnalytics(usageLimit);
        } else {
          fetchAnalytics();
        }
      };

      refreshUsage();
      fetchTransactions();
      const params = new URLSearchParams(location.search);
      if (activeView === 'billing' && params.get("checkout")) {
        setAppSuccess("Payment received or being verified. Your plan, wallet, or add-on will update after Creem webhook confirmation.");
        setTimeout(() => setAppSuccess(null), 9000);
        fetchUserConfig();
      }

      if (isUsageTab) {
        const interval = setInterval(refreshUsage, 10000);
        return () => clearInterval(interval);
      }
    }
  }, [activeView, billingTab, usageLimit, analyticsFromStr, analyticsToStr]);

  useEffect(() => {
    if (activeView === 'global_dashboard' && currentUser) {
      const { from, to } = getDashboardDateRangeMs();
      fetchAnalytics(from, to);
      fetchTransactions();
    }
  }, [activeView, orderDateFrom, orderDateTo, currentUserId]);

  const saveUserConfig = async (overrides?: any, options?: { accountSection?: string; successMessage?: string }) => {
    if (!currentUser || (!isConfigLoaded && !overrides?.force)) {
        console.warn("[Config] Blocked save attempt: Configuration not yet loaded from server.");
        return;
    }

    const overrideKeys = Object.keys(overrides || {}).filter(k => k !== "force" && k !== "skipOtp");
    const fullSave = !overrides;
    const shouldSaveAccount = fullSave || overrideKeys.some(k => ACCOUNT_CONFIG_KEYS.has(k));
    const shouldSaveInstance = fullSave || overrideKeys.some(k => INSTANCE_CONFIG_KEYS.has(k));
    const fullAccountPayload = {
      postexApiKey,
      leopardsApiKey,
      leopardsApiPassword,
      dhlApiKey,
      dhlService,
      dhlRequesterCountryCode,
      dhlOriginCountryCode,
      dhlLanguage,
      dhlEnabled,
      adminNumber,
      proxyUrl,
      useDedicatedProxy,
      system_alerts_enabled: systemAlertsEnabled,
      billing_alerts_enabled: billingAlertsEnabled,
      proxy_alerts_enabled: proxyAlertsEnabled,
      order_alerts_enabled: orderAlertsEnabled,
      delayed_read_receipts_enabled: delayedReadReceiptsEnabled,
      read_receipt_delay_seconds: readReceiptDelaySeconds,
    };
    const accountPayload = fullSave
      ? fullAccountPayload
      : overrideKeys.reduce((result: Record<string, any>, key) => {
          if (ACCOUNT_CONFIG_KEYS.has(key)) result[key] = overrides[key];
          return result;
        }, {});
    
    // If adminNumber changed and we are not skipping OTP verification
    const currentAdminNumber = overrides?.adminNumber ?? adminNumber;
    if (shouldSaveAccount && !overrides?.skipOtp && currentAdminNumber !== originalAdminNumber) {
        await handleGenericSendOTP(currentAdminNumber, 'admin');
        return; // wait for OTP verification before saving
    }

    setIsSaving(true);
    try {
      if (shouldSaveAccount) {
        const res = await fetch(`/api/user/update-config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            section: options?.accountSection,
            userId: currentUserId,
            ...accountPayload,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to save account configuration");
        }
        const responseData = await res.json().catch(() => ({}));
        if (responseData?.warning) {
          setAppError(responseData.warning);
          setTimeout(() => setAppError(null), 7000);
        }
        addLog("info", "Account settings updated.");
        if (overrides?.adminNumber !== undefined) setOriginalAdminNumber(overrides.adminNumber);
      }
      
      if (shouldSaveInstance && selectedBotId) {
        await saveConfig(true, overrides || {});
      }

      setAppSuccess(options?.successMessage || (shouldSaveAccount && shouldSaveInstance ? "Account and instance settings saved." : shouldSaveAccount ? "Account settings saved." : "Instance settings saved."));
      setTimeout(() => setAppSuccess(null), 5000);
    } catch (e: any) {
      addLog("error", e.message || "Failed to save settings");
      alert(e.message || "Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const saveFollowupCenterConfig = async (items?: any[], extraOverrides: Record<string, any> = {}) => {
    if (!selectedBotId) {
      const message = "Select a WhatsApp instance first.";
      setAppError(message);
      setTimeout(() => setAppError(null), 5000);
      throw new Error(message);
    }
    const targetBot = bots.find((bot) => bot.id === selectedBotId || bot.$id === selectedBotId);
    try {
      await saveConfig(true, {
        followups: items ?? followups,
        followupEnabled: extraOverrides.followupEnabled !== undefined ? extraOverrides.followupEnabled : followupEnabled,
        followupHours,
        followupOfferContext,
        ...extraOverrides,
      });
      await fetchBots();
      await loadMarketingStats();
      setAppSuccess(`Follow-up settings saved to ${targetBot?.name || targetBot?.jid || "selected instance"}.`);
      setTimeout(() => setAppSuccess(null), 5000);
    } catch (e: any) {
      const message = e?.message || "Failed to save Follow-up settings.";
      setAppError(message);
      setTimeout(() => setAppError(null), 6000);
      throw e;
    }
  };

  const openCreemCustomerPortal = async () => {
    if (!currentUser) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/billing/creem/customer-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to open Creem customer portal");
      if (!data.url) throw new Error("Creem did not return a portal link");
      window.location.href = data.url;
    } catch (e: any) {
      setAppError(e.message || "Payment methods are managed securely by Creem after your first payment.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setAppError(null), 6000);
    } finally {
      setIsSaving(false);
    }
  };

  const upgradePlan = async (planId: string, billingCycle: "monthly" | "annual" = "monthly") => {
    await startCreemCheckout({ type: "plan", planId, billingCycle });
  };

  const walletPurchaseKeysRef = useRef<Record<string, string>>({});

  const createWalletPurchaseKey = (scope: string) => {
    const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    return `wallet_purchase:${scope}:${suffix}`;
  };

  const purchaseWithWallet = async (scope: string, payload: any) => {
    const existingKey = walletPurchaseKeysRef.current[scope];
    const idempotencyKey = existingKey || createWalletPurchaseKey(scope);
    walletPurchaseKeysRef.current[scope] = idempotencyKey;
    let response: Response;
    try {
      response = await fetch("/api/billing/purchase-with-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, idempotencyKey }),
      });
    } catch (error) {
      throw error;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to complete wallet purchase");
    delete walletPurchaseKeysRef.current[scope];
    return data;
  };

  const changePlanWithWallet = async (planId: string, billingCycle: "monthly" | "annual" = "monthly") => {
    if (!currentUser) return;
    setIsSaving(true);
    try {
      await purchaseWithWallet(`plan:${planId}:${billingCycle}`, { type: "plan", planId, billingCycle });
      setAppSuccess(`Plan updated to ${PLANS[planId]?.name || "selected plan"} using wallet balance.`);
      setTimeout(() => setAppSuccess(null), 6000);
      await fetchUserConfig();
    } catch (e: any) {
      setAppError(e.message || "Unable to change plan with wallet balance");
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setAppError(null), 7000);
    } finally {
      setIsSaving(false);
    }
  };

  const buyAddonWithWallet = async (addonType: string, quantity: number) => {
    if (!currentUser) return;
    setIsSaving(true);
    try {
      await purchaseWithWallet(`addon:${addonType}:${quantity}`, { type: "addon", addonType, quantity });
      setAppSuccess(`Add-on purchased using wallet balance.`);
      setTimeout(() => setAppSuccess(null), 6000);
      await fetchUserConfig();
    } catch (e: any) {
      setAppError(e.message || "Unable to buy add-on with wallet balance");
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setAppError(null), 7000);
    } finally {
      setIsSaving(false);
    }
  };

  const buySetupWithWallet = async () => {
    if (!currentUser) return;
    setIsSaving(true);
    try {
      await purchaseWithWallet("setup:full_account_setup", { type: "setup" });
      setAppSuccess("Full Account Setup purchased using wallet balance.");
      setTimeout(() => setAppSuccess(null), 6000);
      await fetchUserConfig();
    } catch (e: any) {
      setAppError(e.message || "Unable to buy Full Account Setup with wallet balance");
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setAppError(null), 7000);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleWalletBillingPurchases = async (targetUserId: string, enabled: boolean) => {
    if (!currentUser || !isSuperAdmin || !targetUserId) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/billing/wallet-purchase-toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to update wallet billing toggle");
      setAdminUsers((prev: any[]) => Array.isArray(prev)
        ? prev.map((user: any) => (
          String(user?.id || user?.$id || "") === targetUserId
            ? { ...user, wallet_billing_purchases_enabled: Boolean(data.enabled) }
            : user
        ))
        : prev);
      if (String(currentUserId || "") === targetUserId) {
        setCurrentUser((prev: any) => prev ? { ...prev, wallet_billing_purchases_enabled: Boolean(data.enabled) } : prev);
        await fetchUserConfig();
      }
      setAppSuccess(`Wallet plan/add-on/setup payments ${data.enabled ? "enabled" : "disabled"} for the selected account.`);
      setTimeout(() => setAppSuccess(null), 6000);
    } catch (e: any) {
      setAppError(e.message || "Unable to update wallet billing toggle");
      setTimeout(() => setAppError(null), 7000);
    } finally {
      setIsSaving(false);
    }
  };

  const testProxy = async () => {
    if (!proxyUrl) return;
    setIsTestingProxy(true);
    setProxyStatus(null);
    try {
      const r = await fetch('/api/user/test-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxyUrl })
      });
      const data = await r.json();
      setProxyStatus({ ok: data.ok, msg: data.message });
    } catch (e) {
      setProxyStatus({ ok: false, msg: "Server error testing proxy" });
    } finally {
      setIsTestingProxy(false);
    }
  };

  const fetchCustomers = async () => {
    if (!currentUser) return;
    setIsLoadingList(true);
    try {
      const res = await fetch(`/api/user/customers?userId=${currentUserId}`);
      if (res.status === 404) { handleLogout("fetchCustomers:404"); return; }
      const data = await res.json();
      setAllCustomers(sortCustomersByLastInteraction(data));
    } catch (e) {}
    setIsLoadingList(false);
  };

  const scheduleCustomerSummaryRefetch = () => {
    customerSummaryRefreshTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    customerSummaryRefreshTimeoutsRef.current = [2500, 8000].map((delay) => window.setTimeout(() => {
      if (activeView === "customers") fetchCustomers();
    }, delay));
  };

  useEffect(() => {
    return () => {
      customerSummaryRefreshTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      customerSummaryRefreshTimeoutsRef.current = [];
    };
  }, []);

  const fetchOrders = async (silent = false) => {
    if (!currentUser) return;
    if (!silent) setIsLoadingList(true);
    fetchTransactions();
    const { from, to } = getDashboardDateRangeMs();
    fetchAnalytics(from, to);
    try {
      const res = await fetch(`/api/user/orders?userId=${currentUserId}`);
      if (res.status === 404) { handleLogout("fetchOrders:404"); return; }
      const data = await res.json();
      
      // Deduplicate orders
      const uniqueOrders = new Map();
      for (const order of data) {
         uniqueOrders.set(order.order_id || order.$id || order.id, order);
      }
      setAllOrders(Array.from(uniqueOrders.values()).sort((a: any, b: any) => new Date(b.$updatedAt || b.updated_at || b.$createdAt || b.created_at || 0).getTime() - new Date(a.$updatedAt || a.updated_at || a.$createdAt || a.created_at || 0).getTime()));
    } catch (e) {}
    if (!silent) setIsLoadingList(false);
  };

  useEffect(() => {
    if (!currentUserId) return;
    if (activeView === "orders") fetchOrders();
    if (activeView === "customers") fetchCustomers();
  }, [activeView, currentUserId]);

  useEffect(() => {
    if (activeView !== "orders" || !currentUserId) return;
    const interval = window.setInterval(() => fetchOrders(true), 20000);
    return () => window.clearInterval(interval);
  }, [activeView, currentUserId]);

  const handleUpdateOrder = async (orderId: string, orderData: any): Promise<boolean> => {
    try {
      const res = await fetch('/api/user/orders/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, orderId, orderData })
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const nextOrderData = data.orderData || orderData;
        setAllOrders(prev => prev.map(o => o.$id === orderId || o.id === orderId ? { ...o, order_data: nextOrderData } : o));
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  };

  const cancelOrder = async (order: any) => {
    const orderId = order?.$id || order?.id;
    if (!orderId) return;
    const nextOrderData = markOrderCancelled(order.order_data || {});
    const success = await handleUpdateOrder(orderId, nextOrderData);
    if (success) {
      setAppSuccess("Order cancelled. It will not be counted in profit/loss.");
      setTimeout(() => setAppSuccess(null), 4000);
    }
  };

  const deleteOrder = async (order: any) => {
    const orderId = order?.$id || order?.id;
    if (!orderId) return;
    const nextOrderData = markOrderDeleted(order.order_data || {});
    const success = await handleUpdateOrder(orderId, nextOrderData);
    if (success) {
      setAllOrders(prev => prev.filter(o => (o.$id || o.id) !== orderId));
      setAppSuccess("Order deleted from the active order list.");
      setTimeout(() => setAppSuccess(null), 4000);
    }
  };

  const replaceOrderInState = (updatedOrder: any) => {
    if (!updatedOrder) return;
    setAllOrders(prev => prev.map(order => (
      order.$id === updatedOrder.$id || order.id === updatedOrder.id
        ? { ...order, ...updatedOrder }
        : order
    )));
  };

  const bookOrderWithPostex = async (order: any) => {
    const orderId = order.$id || order.id;
    if (!currentUserId || !orderId) return;
    const res = await fetch('/api/user/orders/book-postex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUserId, orderId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to book PostEx order");
    replaceOrderInState(data.order);
    setAppSuccess(data.message || "PostEx order booked.");
    setTimeout(() => setAppSuccess(null), 5000);
  };

  const syncOrderPostexTracking = async (order: any) => {
    const orderId = order.$id || order.id;
    if (!currentUserId || !orderId) return;
    const courier = String(order?.order_data?.courierCompany || order?.order_data?.courier_company || order?.order_data?.courier || "").trim().toLowerCase();
    const endpoint = courier === "dhl" || courier === "dhl express"
      ? '/api/user/orders/sync-dhl-tracking'
      : '/api/user/orders/sync-postex-tracking';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUserId, orderId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to sync tracking");
    replaceOrderInState(data.order);
    setAppSuccess(data.message || "Tracking synced.");
    setTimeout(() => setAppSuccess(null), 5000);
  };

  const testDhlConnection = async () => {
    setIsTestingDhl(true);
    try {
      const res = await fetch('/api/user/test-dhl-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dhlApiKey,
          dhlService,
          dhlRequesterCountryCode,
          dhlOriginCountryCode,
          dhlLanguage,
          trackingId: dhlTestTrackingId,
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to test DHL connection");
      setAppSuccess(data.message || "DHL connection works.");
      setTimeout(() => setAppSuccess(null), 5000);
    } catch (e: any) {
      setAppError(e.message || "DHL connection test failed");
      setTimeout(() => setAppError(null), 5000);
    } finally {
      setIsTestingDhl(false);
    }
  };

  const saveClientGemini = async () => {
    setIsSavingClientGemini(true);
    try {
      const res = await fetch("/api/user/client-gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: clientGeminiEnabled, apiKey: clientGeminiApiKey, cacheBoostEnabled: clientGeminiCacheBoostEnabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save Google AI Studio Gemini API key");
      setClientGeminiStatus(data.status || { enabled: false, hasKey: false, maskedKey: "", cacheBoostEnabled: false, updatedAt: 0 });
      setClientGeminiEnabled(Boolean(data.status?.enabled));
      setClientGeminiCacheBoostEnabled(Boolean(data.status?.cacheBoostEnabled));
      setClientGeminiUsage((prev: any) => ({ ...(prev || {}), cacheBoostEnabled: Boolean(data.status?.cacheBoostEnabled) }));
      setClientGeminiApiKey("");
      setAppSuccess("Google AI Studio Gemini API settings saved.");
      setTimeout(() => setAppSuccess(null), 5000);
    } catch (e: any) {
      setAppError(e.message || "Failed to save Google AI Studio Gemini API key");
      setTimeout(() => setAppError(null), 5000);
    } finally {
      setIsSavingClientGemini(false);
    }
  };

  const testClientGemini = async () => {
    setIsTestingClientGemini(true);
    try {
      const res = await fetch("/api/user/client-gemini/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: clientGeminiApiKey, requestId: `${Date.now()}` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Invalid Google AI Studio Gemini API key.");
      setAppSuccess(data.message || "Google AI Studio Gemini API key test succeeded.");
      setTimeout(() => setAppSuccess(null), 5000);
    } catch (e: any) {
      setAppError(e.message || "Invalid Google AI Studio Gemini API key.");
      setTimeout(() => setAppError(null), 5000);
    } finally {
      setIsTestingClientGemini(false);
    }
  };

  const removeClientGemini = async () => {
    setIsSavingClientGemini(true);
    try {
      const res = await fetch("/api/user/client-gemini", { method: "DELETE", headers: { "Content-Type": "application/json" } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to remove Google AI Studio Gemini API key");
      setClientGeminiStatus(data.status || { enabled: false, hasKey: false, maskedKey: "", cacheBoostEnabled: false, updatedAt: 0 });
      setClientGeminiEnabled(false);
      setClientGeminiCacheBoostEnabled(false);
      setClientGeminiUsage((prev: any) => ({ ...(prev || {}), cacheBoostEnabled: false }));
      setClientGeminiApiKey("");
      setAppSuccess("Google AI Studio Gemini API key removed.");
      setTimeout(() => setAppSuccess(null), 5000);
    } catch (e: any) {
      setAppError(e.message || "Failed to remove Google AI Studio Gemini API key");
      setTimeout(() => setAppError(null), 5000);
    } finally {
      setIsSavingClientGemini(false);
    }
  };

  const downloadAccountStatementCSV = async () => {
    try {
      const { from: fromStart, to: toEnd } = getBillingDateRangeMs();

      // Fetch transactions directly bypassing memory limits
      let tUrl = `/api/user/transactions?userId=${currentUserId}`;
      if (analyticsFromStr) tUrl += `&fromTime=${Math.floor(fromStart / 1000)}`;
      if (analyticsToStr) tUrl += `&toTime=${Math.floor(toEnd / 1000)}`;
      const resT = await fetch(tUrl);
      let filteredT: any[] = [];
      if (resT.ok) filteredT = await resT.json() || [];

      // Fetch analytics directly bypassing chart bounds
      let aUrl = `/api/user/analytics?userId=${currentUserId}&from=${fromStart}&to=${toEnd}`;
      const resA = await fetch(aUrl);
      let filteredA: any[] = [];
      if (resA.ok) filteredA = await resA.json() || [];

      const rows = buildAccountStatementRows({
        usageRows: filteredA,
        walletTransactions: filteredT,
      });
      
      if (rows.length === 0) {
        setAppError("No transactions or expenses found for the selected dates.");
        setTimeout(() => setAppError(null), 3000);
        return;
      }

      let csv = "Date,Type,Amount ($),Description\n";
      rows.forEach((r: any) => {
         csv += `${r.date},${r.type},${r.amount.toFixed(4)},"${(r.description||'').replace(/"/g, '""')}"\n`;
      });
      
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Account_Statement_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error(e);
      setAppError("Failed to download account statement");
      setTimeout(() => setAppError(null), 3000);
    }
  };

  const downloadCustomersCSV = () => {
    const filteredCustomers = allCustomers.filter(c => {
      const q = orderSearchQuery.toLowerCase();
      if (!sourceMatchesCrmFilter(getCustomerSourceLabelForUi(c), customerSourceFilter)) return false;
      // Combine multiple searchable fields to match the filter logic
      const searchableStr = `${getCustomerDisplayName(c)} ${getCustomerDisplayContact(c)} ${getCustomerSourceLabelForUi(c)} ${c.jid || ''} ${c.customer_id || ''} ${c.last_message || ''}`.toLowerCase();
      return searchableStr.includes(q);
    });

    if (filteredCustomers.length === 0) {
      setAppError('No customers to download'); setTimeout(() => setAppError(null), 5000);
      return;
    }

    const headers = [
      "Customer Ref",
      "Name",
      "Phone",
      "Source",
      "Last Message",
      "Created At"
    ];

    const csvData = filteredCustomers.map(c => [
      `"${(c.customer_id || c.jid || '').replace(/"/g, '""')}"`,
      `"${getCustomerDisplayName(c).replace(/"/g, '""')}"`,
      `"${getCustomerDisplayContact(c).replace(/"/g, '""')}"`,
      `"${getCustomerSourceLabelForUi(c).replace(/"/g, '""')}"`,
      `"${(c.last_message || '').replace(/"/g, '""')}"`,
      `"${formatDatePK(c.$createdAt || c.created_at || Date.now())}"`
    ]);

    const csvString = [headers.join(","), ...csvData.map(row => row.join(","))].join("\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `customers_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadOrdersCSV = () => {
    const filteredOrders = getFilteredOrders();

    if (filteredOrders.length === 0) {
      setAppError('No orders to download'); setTimeout(() => setAppError(null), 5000);
      return;
    }

    const columns = ["Type", "Status", ...getDynamicCustomColumns().filter(col => !["Type", "Status"].includes(col))];
    const headers = columns;
    const csvRows = [headers.join(",")];

    filteredOrders.forEach((o) => {
      const details = o.order_data || {};
      
      const rowData = columns.map(col => {
         const lc = col.toLowerCase();
         let val = "";

         if (lc === "date") {
            val = formatDatePK(o.created_at || o.$createdAt || Date.now());
         } else if (lc === "type") {
            val = getOrderRecordType(o) === "lead" ? "Lead" : "Order";
         } else if (lc === "status") {
            val = getOrderRecordStatus(o) === "incomplete" ? "Incomplete" : "Complete";
         } else if (lc === "sr#") {
            val = o.sr_no || "—";
         } else if (lc === "name") {
            val = details.customerName || details.name || "—";
         } else if (lc === "phone") {
            val = details.customerPhone || details.phone || "—";
         } else if (lc === "notes") {
            val = details.orderDetail || details.detail || details.notes || "—";
         } else {
            val = details[col] || details[lc] || "—";
         }
         
         return `"${String(val).replace(/"/g, '""')}"`;
      });

      csvRows.push(rowData.join(","));
    });

    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
  const fetchBots = async (retryCount = 3) => {
    if (!currentUserId) return;
    try {
      const res = await fetch(`/api/bots/list?userId=${currentUserId}`);
      if (res.status === 404) {
        console.warn("User account not found on server during bots fetch. Logging out.");
        handleLogout("fetchBots:404");
        return;
      }
      if (!res.ok) throw new Error("Status " + res.status);
      const data = await res.json();
      console.log(`[App] Fetched ${data.length} bots for user ${currentUser.email}`);
      setBots(data);
      if (data.length === 0 && activeView === "global_dashboard") {
        handleSetView("selector");
      }
    } catch (e) {
      console.error("Failed to fetch bots", e);
      if (retryCount > 0) {
        setTimeout(() => fetchBots(retryCount - 1), 1500);
      }
    }
  };

  const createBot = async () => {
    if (!currentUser) {
       console.error("[WA] CreateBot failed: No currentUser");
       setAppError("You must be logged in to create an instance.");
       return;
    }
    setNewBotName("New Instance " + (bots.length + 1));
    setNewBotModalOpen(true);
  };

  const executeCreateBot = async (customName?: string, options?: { remainInSelector?: boolean; providerType?: string; instancePurpose?: string; controlBusinessInstanceId?: string }) => {
    setNewBotModalOpen(false);
    let name = (typeof customName === "string" && customName.trim()) ? customName.trim() : newBotName;
    
    setAppSuccess("Creating your new WhatsApp identity...");
    try {
      console.log("[WA] Sending create-bot request for user:", currentUserId, "provider:", options?.providerType || "whatsapp_web", "purpose:", options?.instancePurpose || "business");
      const res = await fetch(`/api/bots/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUserId,
          name,
          providerType: options?.providerType,
          instancePurpose: options?.instancePurpose,
          controlBusinessInstanceId: options?.controlBusinessInstanceId,
        }),
      });
      
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch(e) {
        throw new Error(`Invalid JSON from server. Status: ${res.status}. Content: ${text.slice(0, 100)}`);
      }
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to create instance");
      }
      
      if (!data.botId)
        throw new Error("No bot id returned from server");

      console.log("[WA] Bot created successfully:", data.botId);
      setAppSuccess("Instance created! Synchronizing...");
      
      // Fetch bots and redirect or remain in selector
      await fetchBots();
      selectBot(data.botId, { navigateToDashboard: !options?.remainInSelector });
      setAppSuccess(null);

    } catch (e: any) {
      console.error("[WA] createBot error:", e);
      setAppError(e.message);
      setAppSuccess(null);
      setTimeout(() => setAppError(null), 10000);
    }
  };

  const saveProviderConfig = async () => {
    if (!selectedBotId) return;
    setAppSuccess("Saving Official API settings...");
    try {
      const payload: any = {
        botId: selectedBotId,
        providerType: "whatsapp_cloud_api",
        phoneNumberId,
        businessAccountId,
      };
      if (accessToken.trim()) {
        payload.accessToken = accessToken.trim();
      }

      const res = await fetch(`/api/bots/update-provider-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save settings");
      }

      setAppSuccess("Official WhatsApp Cloud API settings saved successfully!");
      setAccessToken("");
      if (payload.accessToken) {
        setHasSavedToken(true);
      }
      await fetchBots();
      setTimeout(() => setAppSuccess(null), 5000);
    } catch (e: any) {
      console.error("[WA] saveProviderConfig error:", e);
      setAppError(e.message);
      setAppSuccess(null);
      setTimeout(() => setAppError(null), 10000);
    }
  };

  const toggleBot = async (botId: string, isActive: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentUser) return;
    try {
      await fetch(`/api/bots/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId, botId, isActive }),
      });
      await fetchBots();
    } catch (e: any) {
      setAppError('Failed to toggle bot: ' + e.message); setTimeout(() => setAppError(null), 5000);
    }
  };

  const [botToDelete, setBotToDelete] = useState<string | null>(null);
  const [newBotModalOpen, setNewBotModalOpen] = useState(false);
  const [newBotName, setNewBotName] = useState("");
  const [proxyToDelete, setProxyToDelete] = useState<string | null>(null);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [stopAllConfirm, setStopAllConfirm] = useState(false);
  const [resetSessionConfirm, setResetSessionConfirm] = useState(false);
  const [wipingBotId, setWipingBotId] = useState<string | null>(null);

  const confirmWipeBot = async (botId: string) => {
     try {
        await fetch(`/api/bot/${botId}/wipe-data`, {
          method: "POST",
        });
        setAppSuccess('Bot data wiped successfully'); setTimeout(() => setAppSuccess(null), 5000);
     } catch (e) {
        setAppError('Reset failed'); setTimeout(() => setAppError(null), 5000);
     } finally {
        setWipingBotId(null);
     }
  };

  const confirmDeleteBot = async (botId: string) => {
    if (!currentUser) return;
    try {
      const resp = await fetch(`/api/bots/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId, botId }),
      });
      const resData = await resp.json();
      if (!resp.ok || !resData.success) {
        setAppError(resData.error || 'Failed to delete from database'); setTimeout(() => setAppError(null), 5000);
        return;
      }
      await fetchBots();
      if (selectedBotId === botId) {
         setSelectedBotId(null);
         handleSetView("selector");
      }
    } catch (e: any) {
      setAppError('Failed to delete bot: ' + e.message); setTimeout(() => setAppError(null), 5000);
    } finally {
      setBotToDelete(null);
    }
  };

  const deleteBot = async (botId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setBotToDelete(botId);
  };

  const selectBot = (botId: string, options?: { navigateToDashboard?: boolean }) => {
    setSelectedBotId(botId);
    if (currentUser && botId) {
      try {
        localStorage.setItem(getSelectedBotStorageKey(currentUser), botId);
      } catch {}
    }
    if (options?.navigateToDashboard !== false) {
      handleSetView("dashboard");
    } else {
      // Keep URL search query in sync cleanly for deep linking
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("instance", botId);
        window.history.replaceState({}, document.title, url.toString());
      } catch {}
    }
    setMessages([]);
    setLogs([]);
    setQrCode(null);
    const targetBot = bots.find(b => b.id === botId || b.$id === botId);
    if (targetBot?.is_active === 0) {
       setStatus("disconnected");
    } else if (targetBot?.status === 'connected' || targetBot?.jid) {
       setStatus("connected");
    } else {
       setStatus("connecting");
    }
    const bot = bots.find(b => b.id === botId || b.$id === botId);
    if (bot) {
      try {
        const config = typeof bot.config_settings === 'string' ? JSON.parse(bot.config_settings) : bot.config_settings;
        applyInstanceConfig(config || {});
        setInstanceConfigStatus("LOADED");
      } catch(e) {
        applyInstanceConfig({});
        setInstanceConfigStatus("ERROR");
      }
    } else {
      setInstanceConfigStatus("LOADING");
    }
  };

  useEffect(() => {
    if (bots.length === 0) return;

    // Check URL search param for deep linking (?instance=<botId>)
    let urlBotId: string | null = null;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      urlBotId = urlParams.get("instance");
    } catch {}

    if (urlBotId) {
      const matchingUrlBot = bots.find(b => b.id === urlBotId || b.$id === urlBotId);
      if (matchingUrlBot && selectedBotId !== getBotStableId(matchingUrlBot)) {
        const stableId = getBotStableId(matchingUrlBot);
        selectBot(stableId, { navigateToDashboard: false });
        return;
      }
    }

    if (selectedBotId && !bots.some(b => b.id === selectedBotId || b.$id === selectedBotId)) {
      setSelectedBotId(null);
      return;
    }
    if ((activeView !== "dashboard" && activeView !== "ai" && activeView !== "marketing" && activeView !== "selector") || selectedBotId) return;
    const savedBotId = (() => {
      try {
        return localStorage.getItem(getSelectedBotStorageKey(currentUser));
      } catch {
        return null;
      }
    })();
    const restoredBot = activeView === "marketing"
      ? chooseFollowupCenterInstance(bots, savedBotId, selectedBotId)
      : bots.find(b => b.id === savedBotId || b.$id === savedBotId) || bots[0];
    if (restoredBot) {
      const restoredBotId = getBotStableId(restoredBot);
      if (activeView === "dashboard") {
        selectBot(restoredBotId);
      } else {
        setSelectedBotId(restoredBotId);
        try {
          const config = typeof restoredBot.config_settings === 'string' ? JSON.parse(restoredBot.config_settings) : restoredBot.config_settings;
          applyInstanceConfig(config || {});
        } catch(e) {
          applyInstanceConfig({});
        }
      }
    }
  }, [activeView, selectedBotId, bots, currentUserId]);

  useEffect(() => {
    if (!selectedBotId) return;

    liveEventsAuthBlockedRef.current = false;
    engineSocketStateRef.current = {
      degraded: false,
      lastDegradedAt: 0,
      lastFallbackAt: 0,
      lastReason: "",
    };
    lastFreshWorkerStatusAtRef.current = 0;
    setWorkerRealtimeWarning(null);

    const runInfrastructureRestFallback = async () => {
      const nowMs = Date.now();
      if (!shouldRunRateLimitedAction(engineSocketStateRef.current.lastFallbackAt, nowMs, ENGINE_SOCKET_FALLBACK_RATE_LIMIT_MS)) {
        return;
      }
      engineSocketStateRef.current.lastFallbackAt = nowMs;
      try {
        await fetchUserConfig(0, { suppressInfraError: true });
        const res = await fetch(`/api/bot/${selectedBotId}/sync/status`, {
          credentials: "same-origin",
        });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (typeof data?.isSyncing !== "undefined") {
            setIsGroupSyncing(Boolean(data.isSyncing));
          }
        }
        clearInfrastructureSyncError();
        addLog("info", buildInfrastructureSyncStatusLog());
      } catch {}
    };

    const hasRecentFreshWorkerStatus = () =>
      hasFreshWorkerStatus(lastFreshWorkerStatusAtRef.current, Date.now(), FRESH_WORKER_STATUS_GRACE_MS);

    const markEngineSocketDegraded = (reason: "connect_error" | "disconnect") => {
      const nowMs = Date.now();
      const shouldLog =
        !engineSocketStateRef.current.degraded
        || engineSocketStateRef.current.lastReason !== reason
        || shouldRunRateLimitedAction(engineSocketStateRef.current.lastDegradedAt, nowMs, ENGINE_SOCKET_EVENT_RATE_LIMIT_MS);
      engineSocketStateRef.current.degraded = true;
      engineSocketStateRef.current.lastReason = reason;
      if (shouldLog) {
        engineSocketStateRef.current.lastDegradedAt = nowMs;
        addLog("info", buildEngineSocketStatusLog({ status: "degraded", reason }));
      }
      setWorkerRealtimeWarning(WORKER_REALTIME_WARNING_MESSAGE);
      void runInfrastructureRestFallback();
    };

    const markEngineSocketRecovered = () => {
      if (engineSocketStateRef.current.degraded) {
        addLog("info", buildEngineSocketStatusLog({ status: "recovered" }));
      }
      engineSocketStateRef.current.degraded = false;
      engineSocketStateRef.current.lastReason = "";
      setWorkerRealtimeWarning(null);
    };

    const newSocket = io({ 
      path: WORKER_ENGINE_SOCKET_PATH,
      query: { botId: selectedBotId },
      withCredentials: true,
      transports: WORKER_ENGINE_SOCKET_TRANSPORTS,
      reconnectionAttempts: 20,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });
    setSocket(newSocket);

    newSocket.on("connect", () => {
      markEngineSocketRecovered();
      addLog("info", "Websocket connected to backend engine");
      // Removed auto-sync on connect as per user request to be manual
      fetch(`/api/bot/${selectedBotId}/sync/status`, {
        credentials: "same-origin",
      })
        .then(r => r.json())
        .then(d => {
           setIsGroupSyncing(d.isSyncing);
           if (d.status) setStatus(d.status);
        })
        .catch((err) => addLog("error", `Status check failed: ${err.message}`));
    });

    newSocket.on("connect_error", (err) => {
      const issue = `Engine socket error: ${err.message}`;
      if (mapInstanceConnectionStatus({ status: "error", issue }).status === "retrying") {
        markEngineSocketDegraded("connect_error");
        if (!hasRecentFreshWorkerStatus()) {
          setStatus("retrying");
          setConnectionRetry((prev) => {
            const mapped = mapInstanceConnectionStatus({
              status: "error",
              issue,
              retryCount: prev.retryCount + 1,
              nextRetryMs: 2000,
            });
            return {
            retryCount: mapped.retryCount,
            reason: mapped.lastIssue,
            detail: "Waiting for QR code or connected status...",
            nextRetrySeconds: mapped.nextRetrySeconds,
            };
          });
        }
        return;
      }
      markEngineSocketDegraded("connect_error");
      if (!hasRecentFreshWorkerStatus()) {
        setStatus("retrying");
      }
    });

    newSocket.on("disconnect", (reason) => {
      if (reason === "io client disconnect") return;
      const issue = `Engine socket disconnected: ${reason}`;
      if (mapInstanceConnectionStatus({ status: "disconnected", issue }).status === "retrying") {
        markEngineSocketDegraded("disconnect");
        if (!hasRecentFreshWorkerStatus()) {
          setStatus("retrying");
          setConnectionRetry((prev) => {
            const mapped = mapInstanceConnectionStatus({
              status: "disconnected",
              issue,
              retryCount: prev.retryCount + 1,
              nextRetryMs: 2000,
            });
            return {
            retryCount: mapped.retryCount,
            reason: mapped.lastIssue,
            detail: "Waiting for QR code or connected status...",
            nextRetrySeconds: mapped.nextRetrySeconds,
            };
          });
        }
        return;
      }
      markEngineSocketDegraded("disconnect");
      if (!hasRecentFreshWorkerStatus()) {
        setStatus("retrying");
      }
    });

    newSocket.on("sync-status", (data) => {
      setIsGroupSyncing(data.isSyncing);
    });

    newSocket.on("config", (config) => {
      applyInstanceConfig(config || {});
    });

    newSocket.on("whatsapp-status", (s) => {
      if (s === "connected" || s === "qr-ready") {
        lastFreshWorkerStatusAtRef.current = Date.now();
      }
      setStatus(s);
      if (s === "connected") {
        markEngineSocketRecovered();
        setQrCode(null);
        setConnectionRetry({ retryCount: 0, reason: "", detail: "", nextRetrySeconds: 0 });
        addLog("wa", "WhatsApp Engine Online");
      } else if (s === "connecting" || s === "disconnected" || s === "proxy-connecting" || s === "retrying" || s === "error") {
        setQrCode(null);
      }
    });

    newSocket.on("whatsapp-retry-status", (data) => {
      const mapped = mapInstanceConnectionStatus({
        status: data?.status || "retrying",
        issue: data?.reason,
        retryCount: data?.retryCount,
        nextRetryMs: data?.nextRetryMs,
      });
      setConnectionRetry({
        retryCount: mapped.retryCount,
        reason: mapped.lastIssue,
        detail: String(data?.detail || "").trim(),
        nextRetrySeconds: mapped.nextRetrySeconds,
      });
      if (mapped.status === "retrying") {
        setStatus("retrying");
        setQrCode(null);
      }
    });

    newSocket.on("whatsapp-qr", (qr) => {
      lastFreshWorkerStatusAtRef.current = Date.now();
      markEngineSocketRecovered();
      setQrCode(qr);
      setStatus("qr-ready");
      setConnectionRetry({ retryCount: 0, reason: "", detail: "", nextRetrySeconds: 0 });
      addLog("info", "QR Code ready for scan");
    });

    newSocket.on("whatsapp-lock-error", (data) => {
      const message = data?.message || "This WhatsApp number is locked to another account.";
      setQrCode(null);
      setStatus("error");
      setAppError(message);
      setTimeout(() => setAppError(null), 12000);
      addLog("error", message);
    });

    newSocket.on("whatsapp-message", (msg: IncomingMessage) => {
      setMessages((prev) => [...prev, msg].slice(-50));
      setBots((prev) => prev.map((bot) => (
        bot.id === selectedBotId || bot.$id === selectedBotId
          ? { ...bot, last_inbound_at: Math.floor(Date.now() / 1000), last_message_at: Math.floor(Date.now() / 1000) }
          : bot
      )));
    });

    newSocket.on("ai-replied", (data) => {
      addLog(
        "ai",
        `Replied to ${getCustomerDisplayContact({ customer_id: data.to })}: ${data.text.substring(0, 30)}...`,
      );
    });

    newSocket.on("order-saved", (data) => {
      const ref = data?.order?.order_id || data?.order?.order_data?.orderReferenceNumber || "new order";
      addLog("info", `Order log updated: ${ref}`);
      fetchOrders(true);
    });

    newSocket.on("system-log", (log) => {
      addLog(log.type, log.msg);
    });

    newSocket.on("live-audit-event", (event: LiveConsoleEvent) => {
      handleLiveConsoleEvent(event);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [selectedBotId]);

  const addLog = (type: Log["type"], msg: string) => {
    if (shouldHideNormalInstanceLog(msg)) return;
    setLogs((prev) =>
      [{ type, msg, timestamp: Date.now() }, ...prev].slice(0, 1000),
    );
  };

  function formatLiveEventLog(event: LiveConsoleEvent) {
    const parts = [
      `[${event.category || "System"}] ${event.title || event.type}`,
      event.message || "",
      event.reason ? `reason=${event.reason}` : "",
      event.status ? `status=${event.status}` : "",
    ].filter(Boolean);
    return parts.join(" - ");
  }

  function handleLiveConsoleEvent(event: LiveConsoleEvent) {
    if (!event?.id || seenLiveEventIdsRef.current.has(event.id)) return;
    seenLiveEventIdsRef.current.add(event.id);
    liveEventSinceRef.current = Math.max(liveEventSinceRef.current, Number(event.timestamp || 0));
    const type: Log["type"] = event.level === "error" ? "error" : event.category === "AI" ? "ai" : event.category === "System" ? "info" : "wa";
    addLog(type, formatLiveEventLog(event));
  }

  const saveConfig = async (silent = false, overrides: any = {}) => {
    if (!selectedBotId) return;
    const hasOverrides = overrides && Object.keys(overrides).filter(k => k !== "__force").length > 0;
    if (instanceConfigStatus === "LOADING" && !overrides?.__force) {
      console.warn("[BotConfig] Blocked save attempt: Instance configuration is still loading.");
      return;
    }
    const payload = hasOverrides ? buildPartialInstanceConfig(overrides) : buildInstanceConfig(overrides);
    if (Object.keys(payload).length === 0) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/bots/update-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId, botId: selectedBotId, config: payload }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save instance settings");
      }
      const data = await res.json().catch(() => ({}));
      const savedPayload = data.config || payload;
      setBots(prev => prev.map(bot => {
        if (bot.id === selectedBotId || bot.$id === selectedBotId) {
          let prevConfig: any = {};
          try {
            prevConfig = typeof bot.config_settings === "string" ? JSON.parse(bot.config_settings) : (bot.config_settings || {});
          } catch {}
          const mergedConfig = { ...prevConfig, ...savedPayload };
          return { ...bot, config_settings: JSON.stringify(mergedConfig) };
        }
        return bot;
      }));
      setCustomerDetailsConfigured(getCustomerDetailsConfiguredSignal(savedPayload));
      if (!silent) {
        if (data?.warning) {
          addLog("wa", `Saved: ${data.warning}`);
          setAppError(data.warning);
          setTimeout(() => setAppError(null), 8000);
        } else {
          addLog("info", "All instance settings synchronized and saved.");
          setAppSuccess("Settings saved successfully.");
          setTimeout(() => setAppSuccess(null), 3000);
        }
      }
    } catch (e: any) {
      if (!silent) addLog("error", e.message || "Failed to sync settings");
      throw e;
    } finally {
      setIsSaving(false);
    }
  };

  const confirmResetSession = async (targetBotId?: string) => {
    const botIdToReset = targetBotId || selectedBotId;
    if (!botIdToReset || !currentUser) return;
    addLog("info", "Requesting Login Reset...");
    try {
      const res = await fetch(`/api/bots/reset-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId, botId: botIdToReset }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedBotId(botIdToReset);
        setQrCode(null);
        setStatus("connecting");
        setConnectionRetry({ retryCount: 0, reason: "", detail: "", nextRetrySeconds: 0 });
        setAppSuccess("Session reset. Please scan QR again.");
        setTimeout(() => setAppSuccess(null), 5000);
        await fetchBots();
      } else {
        addLog("error", data.error || "Reset failed");
      }
    } catch (e) {
      addLog("error", "Reset failed");
    }
  };

  if (!currentUser || showLanding || isViewingPublicAuthPage) {
    return (
      <>
        <Auth 
          onLogin={(user) => {
            setCurrentUser(user);
            setShowLanding(false);
            if (isPublicAuthLocation(location.pathname, location.hash)) {
              const uId = user?.$id || user?.id || user?.userId;
              const storedPref = loadStoredGetStartedPreference(uId);
              const targetPath = resolveDefaultLoginPath({ isGetStartedVisible: storedPref !== false });
              navigate(targetPath);
            }
          }} 
          onBack={() => {
            if (currentUser) {
              setShowLanding(false);
              const storedPref = loadStoredGetStartedPreference(currentUserId);
              const targetPath = resolveDefaultLoginPath({ isGetStartedVisible: storedPref !== false });
              navigate(targetPath);
            }
          }}
          isLoggedIn={!!currentUser}
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
        />
        <Chatbot />
      </>
    );
  }

  if (currentUser && !isConfigLoaded) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-neutral-950 z-[9999] flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
        <div className="relative mb-8">
          <div className="w-20 h-20 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
             <img
               src={blackArrowIcon}
               alt="BlackArrow"
               className="h-11 w-11 animate-pulse rounded-2xl shadow-[0_12px_30px_rgba(37,211,102,0.24)]"
             />
          </div>
        </div>
        <h2 className="text-2xl font-black text-gray-900 dark:text-neutral-50 mb-2 tracking-tight">Synchronizing Infrastructure</h2>
        <div className="h-6 flex items-center justify-center">
           <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black uppercase tracking-[0.2em] animate-pulse">
              {['Booting Neural Engine...', 'Loading Database Connections...', 'Syncing Instance Keys...', 'Warming AI Cache...', 'Readying Real-time Pipeline...'][Math.floor(Date.now() / 2000) % 5]}
           </p>
        </div>
        <p className="text-sm text-gray-500 dark:text-neutral-500 max-w-sm font-medium mt-4">Please wait while we load your secure configurations, instance keys, and intelligence baseline.</p>
        
        <div className="mt-8 w-48 h-1.5 bg-gray-100 dark:bg-neutral-800 rounded-full overflow-hidden">
           <div className="h-full bg-emerald-500 animate-loading-bar shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
        </div>
        
        <style>{`
          @keyframes loading-bar {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
          @keyframes loading-bar-fast {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
          .animate-loading-bar {
            width: 100%;
            animation: loading-bar 2s linear infinite;
          }
          .animate-loading-bar-fast {
            width: 50%;
            animation: loading-bar-fast 1s linear infinite;
          }
        `}</style>
      </div>
    );
  }

  const selectedDashboardBot = selectedBotId
    ? bots.find((bot) => bot.id === selectedBotId || bot.$id === selectedBotId)
    : null;
  const selectedDashboardBotConfig = (() => {
    try {
      return typeof selectedDashboardBot?.config_settings === "string"
        ? JSON.parse(selectedDashboardBot.config_settings)
        : selectedDashboardBot?.config_settings || {};
    } catch {
      return {};
    }
  })();
  const selectedInstanceIdentity = buildInstanceIdentitySummary(selectedDashboardBot || {});
  const getInstanceIdentityById = (botId: any) => {
    const id = String(botId || "").trim();
    if (!id) return "";
    const bot = bots.find((row) => row.id === id || row.$id === id);
    return bot ? getInstanceShortIdentity(bot) : id;
  };
  const dashboardNotifications = filterDashboardNotificationsByPreferences(
    mergeDashboardNotifications(
      CRM_UI_ENABLED ? crmDashboardNotifications(crmDashboardAlerts) : [],
      applyDashboardNotificationState(
        systemDashboardNotifications({
          selectedBot: selectedDashboardBot,
          status,
          qrCode,
          walletBalance,
          billing: userBilling,
        }),
        dashboardNotificationState,
      ),
    ),
    alertPreferences,
  );

  const dashboardConnectionLabel =
    !selectedBotId
      ? "No WhatsApp number selected"
      : selectedDashboardBot?.jid && selectedDashboardBot?.is_active !== 0
        ? "WhatsApp linked"
      : selectedDashboardBot?.jid
          ? "WhatsApp paused"
          : status === "connected"
        ? "WhatsApp connected"
        : status === "qr-ready"
          ? "Scan QR Code"
        : status === "retrying"
            ? "Preparing WhatsApp connection"
          : status === "proxy-connecting"
            ? "Securing WhatsApp connection"
            : status === "error"
              ? "Connection issue"
              : status === "disconnected"
                ? "Disconnected"
              : "Connecting";
  const dashboardBillingLabel =
    userBilling.billing_access?.status === "paid"
      ? `${userBilling.plan?.name || "Paid"} plan active`
      : userBilling.billing_access?.status === "trial"
        ? "Trial active"
        : walletBalance > 0
          ? "Wallet funded"
          : "Billing setup needed";
  const dashboardConnectionTone = /\b(?:connected|linked)\b/i.test(dashboardConnectionLabel)
    ? "teal"
    : /scan qr|preparing|connecting/i.test(dashboardConnectionLabel)
      ? "amber"
      : /issue|disconnected|paused/i.test(dashboardConnectionLabel)
        ? "rose"
        : "neutral";

  const onboardingChecklist = buildClientOnboardingChecklist({
    currentUser,
    selectedBot: selectedDashboardBot,
    status,
    systemPrompt,
    botName,
    businessType,
    selectedBotLanguage,
    replyBehavior,
    products,
    syncGroups,
    followups,
    walletBalance,
    userBilling,
    customFields: Array.isArray(selectedDashboardBotConfig.customFields) ? selectedDashboardBotConfig.customFields : [],
    customerDetailsConfigured: getCustomerDetailsConfiguredSignal(selectedDashboardBotConfig),
    aiRepliesEnabled: isAutoReplyEnabled,
  });
  const filteredCustomers = getFilteredCustomers();
  const customerSourceSummary = Object.entries(summarizeCrmSources(allCustomers, getCustomerSourceLabelForUi))
    .sort((a: any, b: any) => Number(b[1]) - Number(a[1]))
    .slice(0, 6);

  const openOnboardingItem = (item: ClientOnboardingChecklistItem) => {
    const target = getOnboardingCtaTarget(item.cta);
    if (target.aiTab) setAiTab(target.aiTab as IntelligenceTab);
    if (target.billingTab) setBillingTab(target.billingTab as any);
    if (target.botTab === "sequences") setBotActiveTab("sequences");
    handleSetView(target.view as any);
  };

  const isGetStartedVisible = resolveGetStartedVisibility({
    isLaunchReady: onboardingChecklist.launchReady,
    preference: getStartedPreference,
  });

  const handleHideGetStarted = () => {
    setGetStartedPreference(false);
    saveStoredGetStartedPreference(currentUserId, false);
    if (currentUserId) {
      void fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showGetStarted: false }),
      }).catch(() => {});
    }
    notifyDashboard("info", "Get Started is now hidden. You can show it again from Settings.");
    handleSetView("global_dashboard");
  };

  const handleToggleShowGetStarted = (enabled: boolean) => {
    setGetStartedPreference(enabled);
    saveStoredGetStartedPreference(currentUserId, enabled);
    if (currentUserId) {
      void fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showGetStarted: enabled }),
      }).catch(() => {});
    }
  };

  const runCourierBroadcast = async (type: "booked" | "out-for-delivery" | "delivered") => {
    const activeBotId = selectedBotId;
    if (!activeBotId) {
      setAppError("Please select a WhatsApp instance first.");
      return;
    }
    const ids = parseCourierTrackingIds(trackingIdsInput);
    if (ids.length === 0) {
      setAppError("Please enter at least one tracking ID");
      return;
    }
    setIsBroadcasting(true);
    try {
      const data = await fetchJson<any>(
        `/api/bot/${activeBotId}/broadcast-by-ids`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trackingNumbers: ids,
            type,
            api: broadcastApi,
          }),
        },
        {
          context: "Courier broadcast API",
          nonJsonMessage: "Courier broadcast API did not return JSON. Please refresh/deploy backend or check worker route.",
        },
      );
      setAppSuccess(data.message || `Broadcast complete. Fresh sent: ${data.freshSent ?? data.sent ?? data.count ?? 0}, Duplicates: ${data.duplicate ?? 0}, Failed: ${data.failed ?? 0}, Skipped: ${data.skipped ?? 0}`);
      setTimeout(() => setAppSuccess(null), 5000);
      if (Array.isArray(data.results) && data.failed > 0) {
        const failedPreview = data.results
          .filter((item: any) => item?.status === "failed")
          .slice(0, 3)
          .map((item: any) => `${item.trackingId}: ${item.reason || "failed"}`)
          .join("; ");
        if (failedPreview) addLog("info", `Courier broadcast partial failures: ${failedPreview}`);
      }
    } catch (e: any) {
      setAppError(e.message);
      setTimeout(() => setAppError(null), 5000);
      addLog("error", `Broadcast failed: ${e.message}`);
    } finally {
      setIsBroadcasting(false);
    }
  };

  const activeShellTab =
    activeView === "ai"
      ? aiTab
      : activeView === "admin"
      ? adminTab
      : activeView === "analytics"
      ? analyticsTab
      : activeView === "billing"
      ? billingTab
      : activeView === "content_library"
      ? contentLibraryTab
      : activeView === "settings" || activeView === "team" || activeView === "security"
      ? settingsTab
      : undefined;

  return (
    <DashboardShell
      activeView={activeView}
      activeTab={activeShellTab}
      showGetStarted={isGetStartedVisible}
      onSetView={handleSetView}
      currentAccountName={currentUser?.name || currentUser?.businessName || currentUser?.workspaceName || 'Workspace'}
      selectedBotLabel={selectedInstanceIdentity.displayIdentity || ''}
      connectionStatus={dashboardConnectionLabel}
      onNavigateToInstanceHub={() => handleSetView('selector')}
      currentUser={currentUser}
      isAdmin={isAdmin}
      isDarkMode={isDarkMode}
      onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
      onSignOut={() => setCurrentUser(null)}
      notificationCenter={
        <DashboardNotificationCenter
          notifications={dashboardNotifications}
          onOpenLead={openDashboardNotificationLead}
          onApplySmartAction={applyDashboardSmartAction}
          onMarkRead={(item) => patchDashboardNotification(item, { read: true })}
          onMarkAllRead={(items) => bulkUpdateDashboardNotifications("mark_all_read", items)}
          onClearRead={(items) => bulkUpdateDashboardNotifications("clear_read", items)}
          onClearAll={(items) => bulkUpdateDashboardNotifications("clear_all", items)}
          onDone={(item) => patchDashboardNotification(item, { completed: true, read: true })}
          onGoToPage={(page) => handleSetView(page as any)}
          onToast={notifyDashboard}
          onOpenPreferences={() => handleSetView("notifications")}
        />
      }
    >

      {/* Main Content Area */}
      <div className="space-y-4">
        {(isSaving || isGroupSyncing || isLoadingList) && (
          <div className="absolute top-0 left-0 right-0 h-0.5 z-[60] pointer-events-none overflow-hidden">
            <div className="h-full bg-emerald-500 animate-loading-bar-fast"></div>
          </div>
        )}
        <div>
          {(INBOX_UI_ENABLED && ["dashboard", "customers"].includes(activeView)) && (
            <ClientSectionTabs label="Chats" tabs={[
              { label: "Inbox", active: activeView === "dashboard", path: "/inbox" },
              { label: "Customers", active: activeView === "customers", path: "/customers" },
            ]} />
          )}
          {(CRM_UI_ENABLED && ["crm", "departments"].includes(activeView)) && (
            <ClientSectionTabs label="Leads & Routing" tabs={[
              { label: "Leads", active: activeView === "crm", path: "/crm" },
              { label: "Departments", active: activeView === "departments", path: "/departments" },
            ]} />
          )}
          {(["products", "orders"].includes(activeView)) && (
            <ClientSectionTabs label="Sales & Orders" tabs={[
              { label: "Products & Services", active: activeView === "products", path: "/products" },
              { label: "Leads & Orders", active: activeView === "orders", path: "/orders" },
            ]} />
          )}
          {(["marketing", "contact_lists", "campaigns", "workspaces", "broadcast", "customer_updates", "content_library", "media", "sequences"].includes(activeView)) && (
            <ClientSectionTabs label="Automations" tabs={[
              {
                label: "Saved Replies & Flows",
                active: activeView === "content_library" || activeView === "media" || activeView === "sequences",
                path: "/content-library/saved-replies",
              },
              { label: "Follow-up Campaigns", active: activeView === "marketing", path: "/followups" },
              { label: "Contact Lists", active: activeView === "contact_lists", path: "/contact-lists" },
              { label: "Campaigns", active: activeView === "campaigns", path: "/campaigns" },
              { label: "AI Workspaces", active: activeView === "workspaces", path: "/workspaces" },
              { label: "Courier Broadcast", active: activeView === "broadcast", path: "/broadcasts" },
              { label: "Scheduled Updates", active: activeView === "customer_updates", path: "/customer-updates" },
            ]} />
          )}
          {(activeView === "selector" || activeView === "live_monitor" || activeView === "integrations" || (activeView === "ai" && aiTab === "integrations")) && (
            <ClientSectionTabs label="Connections" tabs={[
              { label: "WhatsApp Number", active: activeView === "selector", path: "/instances" },
              { label: "Live Monitor", active: activeView === "live_monitor", path: LIVE_MONITOR_PATH },
              { label: "Integrations", active: activeView === "integrations", path: DASHBOARD_INTEGRATIONS_PATH },
            ]} />
          )}
          {activeView === "global_dashboard" && (
          <div className="dashboard-topbar ca-workspace-bar mb-4 px-4 py-3 md:px-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="ca-eyebrow">BlackArrow workspace</p>
                <p className="mt-1 truncate text-sm text-[var(--ca-text-secondary)]">
                  Manage WhatsApp automation, billing, products, and customer operations.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className={`ca-workspace-chip ca-tone-${dashboardConnectionTone} px-3 py-2`}>
                  {dashboardConnectionLabel}
                </div>
                {selectedDashboardBot && (
                  <div className="ca-workspace-chip ca-tone-blue truncate px-3 py-2">
                    {selectedDashboardBot.name || "Selected instance"}
                  </div>
                )}
                <div className="ca-workspace-chip ca-tone-amber px-3 py-2">
                  Wallet ${Number(walletBalance || 0).toFixed(2)}
                </div>
                <div className="ca-workspace-chip ca-tone-violet px-3 py-2">
                  {userBilling.plan?.name || "Starter"}
                </div>
              </div>
            </div>
          </div>
          )}
          {appStatus?.status === 'MAINTENANCE' && isAdmin && (
            <div className="mb-4 w-full bg-amber-500 border border-amber-600 text-white rounded-xl p-4 shadow-sm flex items-center justify-between animate-in slide-in-from-top-4 duration-500 relative overflow-hidden">
               <div className="flex items-center gap-3 relative z-10">
                  <div className="w-10 h-10 bg-white dark:bg-neutral-900 rounded-xl flex items-center justify-center">
                     <MonitorPlay className="w-5 h-5 text-white animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-black tracking-tight text-lg leading-tight shadow-black/10">SYSTEM IN MAINTENANCE MODE</h3>
                    <p className="text-sm font-medium text-amber-100">Standard users are currently locked out. You are viewing this as an admin.</p>
                  </div>
               </div>
               <button onClick={() => handleSetView('admin')} className="relative z-10 px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg font-bold text-xs uppercase tracking-widest transition-colors shadow-sm">
                 Manager
               </button>
            </div>
          )}
          {profileOtpModal.isOpen && (
            <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
              <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm w-full max-w-sm p-6 relative animate-in fade-in zoom-in duration-200">
                <h3 className="text-xl font-black text-gray-900 dark:text-neutral-50 mb-2">Verify WhatsApp Number</h3>
                <p className="text-sm text-gray-500 dark:text-neutral-500 mb-6">Enter the 6-digit OTP sent to <span className="font-bold">{profileOtpModal.phone}</span> to confirm this change.</p>
                <input
                  type="text"
                  value={profileOtpModal.otp}
                  onChange={e => setProfileOtpModal(prev => ({...prev, otp: e.target.value}))}
                  placeholder="000 000"
                  className="w-full text-center text-2xl tracking-[0.5em] font-mono font-bold bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-800 rounded-xl p-4 mb-4 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <div className="flex gap-3">
                  <button
                    disabled={profileOtpModal.loading}
                    onClick={() => setProfileOtpModal({isOpen: false, phone: '', purpose: 'profile', loading: false, otp: ''})}
                    className="flex-1 px-4 py-3 bg-gray-100 dark:bg-neutral-800/50 hover:bg-gray-200 dark:bg-neutral-700 text-gray-700 dark:text-neutral-300 font-bold rounded-xl transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={profileOtpModal.loading || profileOtpModal.otp.length < 6}
                    onClick={verifyAndSaveFeaturePhone}
                    className="flex-1 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center gap-2 "
                  >
                    {profileOtpModal.loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Verify'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="fixed top-4 right-4 z-[500] flex flex-col gap-2 pointer-events-none">
            {appError && (
               <div className="pointer-events-auto w-80 bg-red-50 dark:bg-red-900/90 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-200 rounded-xl p-4 text-sm font-bold shadow-lg flex justify-between items-start animate-in slide-in-from-top-2 fade-in">
                   <span>{appError}</span>
                   <button onClick={() => setAppError(null)} className="text-red-400 hover:text-red-600 dark:text-red-300 leading-none">&times;</button>
               </div>
            )}
            {appSuccess && (
               <div className="pointer-events-auto w-80 bg-emerald-50 dark:bg-emerald-900/90 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-200 rounded-xl p-4 text-sm font-bold shadow-lg flex justify-between items-start animate-in slide-in-from-top-2 fade-in">
                   <span>{appSuccess}</span>
                   <button onClick={() => setAppSuccess(null)} className="text-emerald-400 hover:text-emerald-700 dark:text-emerald-300 leading-none">&times;</button>
               </div>
            )}
          </div>

          <main className="dashboard-main flex-1">
          {activeView === "get_started" && (
            <GetStartedPage
              checklist={onboardingChecklist}
              onOpenStep={openOnboardingItem}
              onHideGetStarted={handleHideGetStarted}
              onGoToDashboard={() => handleSetView("global_dashboard")}
            />
          )}

          {activeView === "business_assistant" && (
            <BusinessAssistantPage />
          )}

          {activeView === "personal_assistant" && (
            <PersonalAssistantHub />
          )}

          {activeView === "global_dashboard" && (
            <DashboardOverview
              currentUser={currentUser}
              userBilling={userBilling}
              selectedBot={bots.find(b => b.id === selectedBotId || b.jid === selectedBotId || b.bot_id === selectedBotId) || null}
              connectionStatus={dashboardConnectionLabel}
              isAutoReplyEnabled={isAutoReplyEnabled}
              walletBalance={walletBalance}
              customers={allCustomers}
              orders={allOrders}
              followups={followups}
              products={products}
              customFields={customFields}
              dashboardNotifications={dashboardNotifications}
              onboardingChecklist={onboardingChecklist}
              isAdmin={isAdmin}
              isLoading={isLoadingList}
              onRefresh={() => { fetchBots(); fetchOrders(); fetchCustomers(); }}
              onNavigateView={(view, aiTab, billingTab) => {
                if (aiTab) setAiTab(aiTab as any);
                if (billingTab) setBillingTab(billingTab as any);
                handleSetView(view as any);
              }}
              onOpenOnboardingItem={openOnboardingItem}
              onOpenInbox={() => handleSetView(INBOX_UI_ENABLED ? "dashboard" : "customers")}
            />
          )}

          {activeView === "analytics" && (
            <div className="flex flex-col gap-5">
              <DashboardPageHeader
                eyebrow="Analytics"
                title="Business & Usage Analytics"
                description="Review performance, charged usage categories, live AI usage charts, and daily transparency logs."
                icon={BarChart3}
              />

              <div className="flex gap-1 overflow-x-auto rounded-2xl border border-gray-200 bg-white/90 p-2 shadow-sm dark:border-white/10 dark:bg-neutral-900/88">
                {[
                  ["performance", "Business Overview"],
                  ["usage", "Usage Analytics"],
                  ["live", "Live Analytics"],
                  ["logs", "Daily Logs"],
                ].map(([key, label]) => (
                  <Link
                    key={key}
                    to={resolvePathByViewAndTab("analytics", key)}
                    className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition-all ${analyticsTab === key ? "bg-emerald-600 text-white shadow-sm" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-neutral-300 dark:hover:bg-neutral-800"}`}
                  >
                    {label}
                  </Link>
                ))}
              </div>

              <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-100 bg-white p-4 dark:border-neutral-800/50 dark:bg-neutral-900">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-neutral-600">From</label>
                  <input type="date" value={analyticsFromStr} onChange={e => setAnalyticsFromStr(e.target.value)} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-neutral-600">To</label>
                  <input type="date" value={analyticsToStr} onChange={e => setAnalyticsToStr(e.target.value)} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
                </div>
                <span className="text-xs font-bold text-gray-400 dark:text-neutral-600">Applies to all Analytics views.</span>
              </div>

              {analyticsTab === "performance" && (
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <MetricTile label="Messages Handled" value={getDashboardTotals().messagesHandled.toLocaleString()} icon={MessageSquare} tone="blue" />
                  <MetricTile label="New Leads / Orders" value={getDashboardTotals().ordersCount} icon={ShoppingCart} tone="blue" />
                  <MetricTile label="AI API Cost" value={formatAccountCurrency(getDashboardTotals().aiApiCostAccount, 2, true)} icon={Zap} tone="amber" />
                  <MetricTile label="AI Replies Sent" value={getDashboardTotals().aiRepliesSent.toLocaleString()} icon={Sparkles} tone="green" />
                </div>
              )}

              {analyticsTab === "usage" && (
                <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm dark:border-neutral-800/50 dark:bg-neutral-900">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-gray-800 dark:text-neutral-200">Usage Categories</h3>
                      <p className="mt-1 text-xs text-gray-500 dark:text-neutral-500">Charged usage only. Failed, skipped, and duplicate receipt attempts are excluded.</p>
                    </div>
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">Total {formatCurrency(usageCategoryTotalCost, 4)}</span>
                  </div>
                  {usageCategoryCards.length === 0 ? (
                    <div className="py-10 text-center text-sm italic text-gray-500 dark:text-neutral-500">No charged usage in selected date range.</div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {usageCategoryCards.map((item) => (
                        <div key={item.key} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-neutral-800/50 dark:bg-neutral-800">
                          <p className="text-xs font-black uppercase tracking-widest text-gray-400 dark:text-neutral-600">{item.label}</p>
                          <p className="mt-2 text-2xl font-black text-gray-900 dark:text-neutral-50">{item.amount}</p>
                          <div className="mt-2 flex justify-between gap-3 text-xs text-gray-500 dark:text-neutral-500">
                            <span>Total: {formatCurrency(item.cost, 4)}</span>
                            <span>Avg: {formatCurrency(item.averageCost, 4)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {analyticsTab === "live" && (
                <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm dark:border-neutral-800/50 dark:bg-neutral-900">
                  <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row">
                    <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-neutral-50">
                      <History className="h-5 w-5 text-gray-500 dark:text-neutral-500" /> API Usage Live Analytics
                    </h3>
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">Total {formatCurrency(usageCategoryTotalCost, 4)}</span>
                  </div>
                  {(() => {
                    const chartData = buildUsageDailySeries(analyticsData).map((row: any) => ({
                      ...row,
                      displayDate: format(new Date(row.timestamp * 1000), "MMM dd"),
                    }));
                    const categoryColors = ["#2563EB", "#DB2777", "#F59E0B", "#7C3AED", "#0D9488", "#DC2626", "#65A30D", "#0891B2"];
                    const categorySeries = usageCategoryCards.map((item, index) => ({
                      ...item,
                      dataKey: item.key || getUsageCategoryKey(item.label),
                      color: categoryColors[index % categoryColors.length],
                    }));
                    const visibleSeries = categorySeries.filter((item) => isBillingCategoryVisible(item.key));
                    if (chartData.length === 0) return <div className="py-10 text-center text-sm italic text-gray-500 dark:text-neutral-500">No data available for selected period.</div>;
                    return (
                      <div className="space-y-5">
                        <div className="flex flex-wrap gap-2">
                          {categorySeries.map((item) => (
                            <button
                              key={item.key}
                              onClick={() => toggleBillingCategory(item.key)}
                              className={`rounded-lg border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-colors ${isBillingCategoryVisible(item.key) ? "border-gray-200 bg-white text-gray-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100" : "border-transparent bg-gray-100 text-gray-400 dark:bg-neutral-800 dark:text-neutral-500"}`}
                            >
                              <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }}></span>
                              {item.label}
                            </button>
                          ))}
                        </div>
                        <div className="h-72 w-full text-xs">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-gray-100 dark:stroke-neutral-800" stroke="" />
                              <XAxis dataKey="displayDate" axisLine={false} tickLine={false} tick={{fill: "#9ca3af", fontSize: 12}} dy={10} />
                              <YAxis yAxisId="right" orientation="right" tickFormatter={(val) => formatCurrency(val, 2)} axisLine={false} tickLine={false} tick={{fill: "#10B981", fontSize: 12}} dx={10} />
                              <RechartsTooltip />
                              <Legend />
                              <Line yAxisId="right" type="monotone" dataKey="cost" name="All charged usage" stroke="#10B981" strokeWidth={3} dot={{r: 4}} />
                              {visibleSeries.map((item) => (
                                <Line key={item.key} yAxisId="right" type="monotone" dataKey={item.dataKey} name={item.label} stroke={item.color} strokeWidth={2} dot={false} />
                              ))}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {analyticsTab === "logs" && (
                <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm dark:border-neutral-800/50 dark:bg-neutral-900">
                  <h4 className="mb-2 flex items-center gap-2 font-bold text-gray-800 dark:text-neutral-200">
                    <Save className="h-4 w-4 text-emerald-500" /> Daily Transparency Logs
                  </h4>
                  <p className="mb-4 text-xs text-gray-500 dark:text-neutral-500">Download a detailed text log of every billing and usage event for a specific day.</p>
                  <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-neutral-800/50 dark:bg-neutral-800 sm:flex-row sm:items-end">
                    <div className="flex flex-1 flex-col gap-1">
                      <label className="text-xs font-black uppercase tracking-widest text-gray-500 dark:text-neutral-500">Select Date</label>
                      <input type="date" value={logSearchDate} onChange={e => setLogSearchDate(e.target.value)} className="rounded-lg border border-gray-200 bg-white p-2 text-sm font-bold text-gray-700 outline-none focus:border-emerald-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300" />
                    </div>
                    <button onClick={() => window.open(`/api/user/billing-logs/download?userId=${currentUserId}&date=${logSearchDate}&format=csv`, "_blank")} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-emerald-600">
                      <Save className="h-4 w-4" /> Download CSV
                    </button>
                    <button onClick={() => window.open(`/api/user/billing-logs/download?userId=${currentUserId}&date=${logSearchDate}`, "_blank")} className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-600 transition-all hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800">
                      <Download className="h-4 w-4" /> TXT
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeView === "selector" && (
            <InstanceHubPage
              instances={bots}
              selectedInstanceId={selectedBotId}
              connectionStatus={status}
              qrCode={qrCode}
              adminNumber={adminNumber}
              isSuperAdmin={currentUser?.role === 'super_admin'}
              onSelectInstance={(id) => selectBot(id, { navigateToDashboard: false })}
              onCreateInstance={async (name, providerType, instancePurpose, controlBusinessInstanceId) => {
                await executeCreateBot(name, { remainInSelector: true, providerType, instancePurpose, controlBusinessInstanceId });
              }}
              onToggleActive={(id, isActive, e) => toggleBot(id, isActive === 0 ? 1 : 0, e)}
              onRenameInstance={async (id, currentName, e) => {
                e.stopPropagation();
                const newName = prompt("Enter new instance name:", currentName);
                if (newName && newName !== currentName && currentUser) {
                  try {
                    await fetch('/api/bots/rename', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId: currentUserId, botId: id, name: newName })
                    });
                    fetchBots();
                  } catch(e) {}
                }
              }}
              onResetLogin={async (id) => {
                await confirmResetSession(id);
              }}
              onDeleteInstance={(id, e) => deleteBot(id, e)}
              onOpenAdminAlerts={() => handleSetView("settings", "alerts")}
              onOpenAiStudio={() => handleSetView("ai", "instructions")}
              onOpenInbox={() => handleSetView(INBOX_UI_ENABLED ? "dashboard" : "customers")}
            />
          )}

          {INBOX_UI_ENABLED && activeView === "dashboard" && !selectedBotId && (
            <DashboardEmptyState
              icon={Smartphone}
              title="Select a WhatsApp number first"
              body="Choose a connected WhatsApp number to open its connection tools, saved replies, and bot activity."
              action={
                <button
                  onClick={() => handleSetView("selector")}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white"
                >
                  <LayoutDashboard className="h-4 w-4" /> Go to WhatsApp Number
                </button>
              }
            />
          )}

          {INBOX_UI_ENABLED && activeView === "dashboard" && selectedBotId && (
            <ConversationInboxPage
              customers={allCustomers}
              messages={deduplicateMessages(messages.map((m: any, idx: number) => normalizeMessageItem(m, idx)))}
              selectedCustomerId={selectedCustomerId}
              activeBotName={selectedInstanceIdentity.displayIdentity}
              userId={currentUserId}
              onSelectCustomer={(id) => setSelectedCustomerId(id)}
              onSendMessage={async (text) => {
                if (!selectedCustomerId) return;
                const targetCustomer = allCustomers.find((c: any) => (c.$id || c.id || c.customer_id) === selectedCustomerId);
                const toPhone = targetCustomer?.phone || targetCustomer?.customer_id?.replace(/@.*$/, "") || selectedCustomerId;
                try {
                  const res = await fetch(`/api/bot/${selectedBotId}/send-message`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ to: toPhone, text }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    throw new Error(data.error || "Failed to send message");
                  }
                  const sentId = data.sentMessageId || data.id || data.messageId;
                  setMessages((prev: any[]) => [
                    ...prev,
                    normalizeMessageItem({
                      id: sentId,
                      sender: "user",
                      senderName: "You",
                      text,
                      timestamp: data.timestamp || Date.now(),
                      status: "sent",
                    }),
                  ]);
                } catch (e: any) {
                  setAppError(e.message || "Message send failed");
                  setTimeout(() => setAppError(null), 5000);
                }
              }}
              onSetAiControl={async (customerId, action) => {
                try {
                  const res = await fetch("/api/user/customers/reply-control", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ customerId, action }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(data.error || "Failed to update reply control");
                  fetchCustomers();
                  setAppSuccess(`AI reply control updated: ${action}`);
                  setTimeout(() => setAppSuccess(null), 3000);
                } catch (e: any) {
                  setAppError(e.message || "Failed to update reply control");
                  setTimeout(() => setAppError(null), 5000);
                }
              }}
              onCustomerSaved={() => {
                fetchCustomers();
              }}
              onOpenSelector={() => handleSetView("selector")}
              formatTimestamp={(ts) => formatDatePK(ts, true)}
            />
          )}



          {activeView === "ai" && (
            <PageShell maxWidth={aiPageMeta[aiTab]?.widthClass || "max-w-5xl"}>
              <AiStudioV2Page
                statusInput={{
                  botName,
                  businessType,
                  instructions: systemPrompt,
                  learnedKnowledge: learnedInstructions,
                  products,
                  syncGroups,
                  clientGeminiStatus,
                  cacheBoostEnabled: clientGeminiCacheBoostEnabled,
                  customerIntelligenceEnabled: customerIntelligenceScanEnabled,
                  smartSalesEnabled: smartSalesEngineEnabled,
                  usage: clientGeminiUsage,
                  whatsappConnected: status === "connected",
                  aiRepliesEnabled: isAutoReplyEnabled,
                }}
                title={aiTab === "integrations" ? "Connections" : "Bot Setup"}
                description={aiTab === "integrations"
                  ? "Manage WhatsApp and business integrations."
                  : "Control how your bot replies, what it knows, and what customer information it collects."}
              >
                {aiTab !== "integrations" && (
                  <>
                    <nav className="custom-scrollbar flex gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900" aria-label="Bot Setup tabs">
                      {([
                        ["instructions", "Basics"],
                        ["learned", "Knowledge"],
                        ["fields", "Customer Details"],
                        ["calls", "Reply Rules"],
                        ["smart_sales", "Advanced"],
                      ] as Array<[IntelligenceTab, string]>).map(([key, label]) => (
                        <Link key={key} to={resolvePathByViewAndTab("ai", key)} className={`shrink-0 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${aiTab === key ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-neutral-800"}`}>{label}</Link>
                      ))}
                    </nav>
                    <div className="pt-1">
                      <h2 className="text-xl font-black text-gray-950 dark:text-neutral-50">{({ instructions: "Basic bot behavior", learned: "What your bot knows", fields: "What the bot should collect", calls: "How the bot should respond", smart_sales: "Advanced controls" } as Record<string, string>)[aiTab]}</h2>
                      <p className="mt-1 text-sm text-gray-600 dark:text-neutral-300">{({ instructions: "Set the bot’s identity, language, and main instructions.", learned: "Add the information your bot needs to answer customers correctly.", fields: "Choose the details needed before confirming a lead, booking, or order.", calls: "Control text, voice, calls, handoff, and reply behavior.", smart_sales: "Optional settings for experienced users." } as Record<string, string>)[aiTab]}</p>
                    </div>
                  </>
                )}
                {instanceConfigStatus === "LOADING" && aiTab !== "integrations" ? (
                  <div className="flex flex-col gap-6 animate-pulse py-6" aria-label="Loading bot configuration...">
                    <div className="h-28 rounded-2xl bg-gray-100 dark:bg-neutral-800/60" />
                    <div className="h-56 rounded-2xl bg-gray-100 dark:bg-neutral-800/60" />
                    <div className="h-40 rounded-2xl bg-gray-100 dark:bg-neutral-800/60" />
                  </div>
                ) : (
                <div className={`flex flex-col ${aiTab === "integrations" ? "gap-5" : ""}`}>
                  <div className="grid grid-cols-1 gap-5">
                  {aiTab === 'smart_sales' && (
                    <SmartSalesSettingsPage>
                    <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl p-5 border border-emerald-100 dark:border-emerald-900">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                          <h4 className="font-bold text-emerald-900 dark:text-emerald-100 text-sm flex items-center gap-2">
                            <Sparkles className="w-4 h-4" /> Smart Sales Settings
                          </h4>
                          <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1 font-medium">
                            Helps your AI understand buying intent, guide customers, handle objections, and move chats toward orders or bookings.
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black text-emerald-700 dark:text-emerald-300">$0.001 / successful AI text reply</span>
                          <button
                            type="button"
                            onClick={async () => {
                              const next = !smartSalesEngineEnabled;
                              setSmartSalesEngineEnabled(next);
                              await saveUserConfig({
                                smartSalesEngineEnabled: next ? 1 : 0,
                                smartSalesExtraCharge: 0.001,
                                smartSalesPromptVersion: "v1",
                              });
                            }}
                            className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${smartSalesEngineEnabled ? "bg-emerald-500" : "bg-gray-200 dark:bg-neutral-700"}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 bg-white dark:bg-neutral-900 rounded-full transition-all ${smartSalesEngineEnabled ? "left-7" : "left-1"}`} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 rounded-xl border border-emerald-100 dark:border-emerald-900 bg-white dark:bg-neutral-900 p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-300 mb-2">How it works</p>
                        <p className="text-xs text-gray-600 dark:text-neutral-400 font-medium leading-relaxed">
                          Uses BlackArrow sales intelligence together with this instance's business instructions, products, services, policies, learned knowledge, and customer context. It improves customer replies while staying under your saved business rules and safety controls.
                        </p>
                      </div>
                      <div className="mt-4 rounded-xl border border-blue-100 dark:border-blue-900 bg-white dark:bg-neutral-900 p-4">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                          <div>
                            <p className="text-xs font-black uppercase tracking-widest text-blue-700 dark:text-blue-300">Customer Intelligence Scan</p>
                            <p className="mt-1 text-xs text-gray-600 dark:text-neutral-400 font-medium leading-relaxed">
                              Fetch visible WhatsApp business profile/catalog info to help AI understand customers faster.
                            </p>
                            <p className="mt-1 text-[11px] text-gray-500 dark:text-neutral-500 font-medium">
                              $0.001 per successful new/refreshed customer profile scan.
                            </p>
                            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300 font-bold">
                              Uses only visible WhatsApp profile/catalog data. Delivery/order details still require customer confirmation.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              const next = !customerIntelligenceScanEnabled;
                              setCustomerIntelligenceScanEnabled(next);
                              await saveConfig(true, { customerIntelligenceScanEnabled: next ? 1 : 0 });
                            }}
                            className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${customerIntelligenceScanEnabled ? "bg-blue-600" : "bg-gray-200 dark:bg-neutral-700"}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 bg-white dark:bg-neutral-900 rounded-full transition-all ${customerIntelligenceScanEnabled ? "left-7" : "left-1"}`} />
                          </button>
                        </div>
                      </div>
                    </div>
                    </SmartSalesSettingsPage>
                  )}

                  {aiTab === 'instructions' && (
                    <AIInstructionsPage>
                    <div className="flex flex-col gap-6">
                      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-black text-gray-900 dark:text-neutral-100">AI Chat Replies</h3>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${isAutoReplyEnabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-gray-200 text-gray-700 dark:bg-neutral-800 dark:text-neutral-300"}`}>
                                {isAutoReplyEnabled ? "On" : "Off"}
                              </span>
                            </div>
                            <p className="mt-1 text-xs font-bold text-gray-500 dark:text-neutral-400">Instance: {selectedDashboardBot?.name || selectedInstanceIdentity.displayIdentity || "Selected WhatsApp instance"}</p>
                            <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-neutral-300">
                              {isAutoReplyEnabled
                                ? "BlackArrow answers incoming customer messages with AI and captures leads or orders as configured."
                                : "BlackArrow stays silent for normal incoming messages. Saved sequences, shortcuts, and scheduled follow-ups continue."}
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label="Toggle AI Chat Replies"
                            onClick={async () => {
                              if (isAutoReplyEnabled) {
                                setShowAiRepliesOffConfirm(true);
                                return;
                              }
                              try {
                                await saveConfig(true, { ai_chat_replies_enabled: true, isAutoReply: true });
                                setIsAutoReplyEnabled(true);
                                setAppSuccess("AI replies will apply to new incoming messages only.");
                              } catch (error: any) {
                                setAppError(error?.message || "Failed to turn on AI Chat Replies.");
                              }
                            }}
                            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${isAutoReplyEnabled ? "bg-emerald-500" : "bg-gray-300 dark:bg-neutral-700"}`}
                          >
                            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${isAutoReplyEnabled ? "left-7" : "left-1"}`} />
                          </button>
                        </div>
                      </section>
                      {showAiRepliesOffConfirm && (
                        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/50 p-4">
                          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-neutral-900">
                            <h3 className="text-lg font-black text-gray-900 dark:text-neutral-100">Turn off AI Chat Replies?</h3>
                            <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-neutral-300">
                              Incoming customer messages will remain visible, but BlackArrow will not answer them with AI or capture leads/orders. Saved sequences, shortcuts, scheduled follow-ups, broadcasts, and manual replies will continue.
                            </p>
                            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                              <button type="button" onClick={() => setShowAiRepliesOffConfirm(false)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold dark:border-neutral-700">Keep AI Replies On</button>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await saveConfig(true, { ai_chat_replies_enabled: false, isAutoReply: false });
                                    setIsAutoReplyEnabled(false);
                                    setShowAiRepliesOffConfirm(false);
                                  } catch (error: any) {
                                    setAppError(error?.message || "Failed to turn off AI Chat Replies.");
                                  }
                                }}
                                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700"
                              >
                                Turn Off AI Replies
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-blue-50 dark:bg-blue-950/50 p-4 rounded-xl border border-blue-100 dark:border-blue-900">
                        <div>
                          <label className="text-xs font-black uppercase text-blue-900 dark:text-blue-200 tracking-widest flex items-center gap-2 mb-2">
                             Bot Name
                          </label>
                          <input 
                              type="text" 
                              value={botName}
                              onChange={e => setBotName(e.target.value)}
                              maxLength={BOT_NAME_MAX_CHARS}
                              placeholder="e.g. Black Arrow"
                              className="w-full bg-white dark:bg-neutral-900 border border-blue-200 dark:border-blue-800 rounded-lg p-2.5 text-sm font-bold text-gray-700 dark:text-neutral-300 outline-none focus:border-blue-500 shadow-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-black uppercase text-blue-900 dark:text-blue-200 tracking-widest flex items-center gap-2 mb-2">
                             Preferred Language
                          </label>
                          <input
                            type="text"
                            value={selectedBotLanguage}
                            onChange={(e) => setSelectedBotLanguage(e.target.value)}
                            onBlur={async () => {
                              if (!selectedBotId) return;
                              await saveConfig(true, { selectedBotLanguage });
                            }}
                            placeholder="e.g. English, Spanish, French"
                            className="w-full bg-white dark:bg-neutral-900 border border-blue-200 dark:border-blue-800 rounded-lg p-2.5 text-sm font-bold text-gray-700 dark:text-neutral-300 outline-none focus:border-blue-500 shadow-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-black uppercase text-blue-900 dark:text-blue-200 tracking-widest flex items-center gap-2 mb-2">
                             Bot Gender
                          </label>
                          <select 
                             value={botGender} 
                             onChange={e => setBotGender(e.target.value)}
                             className="w-full bg-white dark:bg-neutral-900 border border-blue-200 dark:border-blue-800 rounded-lg p-2.5 text-sm font-bold text-gray-700 dark:text-neutral-300 outline-none focus:border-blue-500 shadow-sm"
                          >
                             <option value="male">Male</option>
                             <option value="female">Female</option>
                             <option value="bot">Bot / Neutral</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-black uppercase text-blue-900 dark:text-blue-200 tracking-widest flex items-center gap-2 mb-2">
                             Voice (Audio Messages)
                          </label>
                          <select 
                             value={botVoice} 
                             onChange={e => setBotVoice(e.target.value)}
                             className="w-full bg-white dark:bg-neutral-900 border border-blue-200 dark:border-blue-800 rounded-lg p-2.5 text-sm font-bold text-gray-700 dark:text-neutral-300 outline-none focus:border-blue-500 shadow-sm"
                          >
                             <option value="Aoede">Aoede (Female)</option>
                             <option value="Kore">Kore (Female)</option>
                             <option value="Charon">Charon (Male)</option>
                             <option value="Fenrir">Fenrir (Male)</option>
                             <option value="Puck">Puck (Male)</option>
                          </select>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-purple-50/50 dark:bg-neutral-950/70 p-4 rounded-xl border border-purple-100 dark:border-purple-900/50">
                        <div>
                          <label className="text-xs font-black uppercase text-purple-900 dark:text-white tracking-widest flex items-center gap-2 mb-2">
                             Business Type
                          </label>
                          <select 
                             value={businessType} 
                             onChange={e => setBusinessType(e.target.value)}
                             className="w-full bg-white dark:bg-neutral-950 border border-purple-200 dark:border-purple-800 rounded-lg p-2.5 text-sm font-bold text-gray-700 dark:text-white outline-none focus:border-purple-500 shadow-sm"
                          >
                             <option value="product">Product Based Business</option>
                             <option value="service">Service Based Business</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3">
                        <label className="text-xs font-black uppercase text-gray-400 dark:text-neutral-600 tracking-widest flex items-center gap-2 mb-1">
                          Shared AI Instructions
                        </label>
                        <p className="text-xs text-gray-500 dark:text-neutral-500 font-medium mb-2">
                           Define what this connected WhatsApp instance should know: prices, delivery times, return policies, how to talk, and company background.
                        </p>
                        <textarea
                          value={systemPrompt}
                          onChange={(e) => setSystemPrompt(e.target.value)}
                          className="w-full min-h-[400px] bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-800 rounded-xl p-3 text-sm font-medium leading-relaxed outline-none focus:border-blue-300 text-gray-700 dark:text-neutral-300 custom-scrollbar resize-none shadow-inner"
                          placeholder="Example: We are an electronics store in Karachi. We offer 1-day delivery. If a customer asks about a warranty, politely explain that 1-year basic warranty is included on all products..."
                        />
                      </div>
                    </div>
                    </AIInstructionsPage>
                  )}
                  
                  {aiTab === 'learned' && (
                    <LearnedKnowledgePage>
                    <div className="flex flex-col gap-4">
                      <KnowledgeSourceList rows={[
                        { name: "Products & Services", status: `${products.length} items`, actionLabel: "Manage", onAction: () => handleSetView("products") },
                        { name: "Website Knowledge", status: "Optional", actionLabel: "Manage", onAction: () => handleSetView("knowledge") },
                        { name: "Media Library", status: `${syncGroups.filter(g => (g.purpose || "").toLowerCase() === "media").length} groups`, actionLabel: "Manage", onAction: () => handleSetView("content_library", "media") },
                        { name: "Saved Replies & Flows", status: "Available", actionLabel: "Manage", onAction: () => handleSetView("content_library", "saved_replies") },
                        { name: "Sequence Groups", status: `${syncGroups.filter(g => (g.purpose || "").toLowerCase() === "sequence").length} groups`, actionLabel: "Manage", onAction: () => handleSetView("content_library", "sequences") },
                        { name: "Learned Information", status: `${learnedInstructions.split(/\r?\n/).filter((line) => line.trim()).length} saved facts`, actionLabel: "Review", onAction: () => document.getElementById("learned-information-details")?.scrollIntoView({ behavior: "smooth" }) },
                        { name: "Customer Knowledge", status: "Available", actionLabel: "Review", onAction: () => handleSetView("customers") },
                      ]} />
                      <details id="learned-information-details" className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                        <summary className="cursor-pointer text-sm font-bold text-emerald-700 dark:text-emerald-300">View details</summary>
                      <div className="bg-emerald-50 dark:bg-emerald-900/40 p-4 rounded-xl border border-emerald-100 dark:border-emerald-900">
                        <label className="text-xs font-black uppercase text-emerald-600/70 tracking-widest flex items-center gap-2 mb-3">
                           AI Self Learned Instructions
                        </label>
                        <p className="text-xs text-emerald-700 dark:text-emerald-300/60 mb-4 font-medium tracking-tight">
                          These instructions are automatically extracted by AI when you manually reply to customers on WhatsApp. You can also edit these learnings directly to fine-tune the AI's behavior. Once updated, save this tab.
                        </p>
                        <textarea
                          value={learnedInstructions}
                          onChange={(e) => setLearnedInstructions(e.target.value)}
                          className="w-full min-h-[300px] bg-white dark:bg-neutral-900 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 text-sm font-medium leading-relaxed outline-none focus:border-emerald-400 text-gray-700 dark:text-neutral-300 custom-scrollbar resize-none shadow-inner"
                          placeholder="Learned responses will appear here..."
                        />
                        <div className="mt-4 flex items-start gap-3 p-3 bg-white dark:bg-neutral-900/60 rounded-xl border border-emerald-100 dark:border-emerald-900">
                           <AlertCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                           <p className="text-[10px] text-emerald-700 dark:text-emerald-300 font-medium leading-tight">
                              <strong>Guide:</strong> If you spot any incorrect information learned by the AI, simply delete or rewrite that sentence here. This serves as the system's dynamic quick-correction memory.
                           </p>
                        </div>
                      </div>
                      </details>
                    </div>
                    </LearnedKnowledgePage>
                  )}

                  {aiTab === 'fields' && (
                    <ConfirmationFieldsPage>
                    <div className="flex flex-col gap-5">
                       <div className="bg-amber-50 dark:bg-amber-900/40 p-5 rounded-2xl border border-amber-100 dark:border-amber-900">
                          <div className="flex items-center gap-3 mb-4">
                             <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/60 rounded-lg flex items-center justify-center">
                                <Puzzle className="w-5 h-5 text-amber-600" />
                             </div>
                             <div>
                                <h4 className="font-bold text-amber-900 dark:text-amber-200 text-sm">Custom Confirmation Fields</h4>
                                <p className="text-[10px] text-amber-700 dark:text-amber-300 font-medium">Define additional details your AI must confirm from customers before completing an order.</p>
                             </div>
                          </div>
                          
                          <div className="space-y-3">
                             {customFields.length === 0 && (
                                <div className="text-center py-8 bg-white dark:bg-neutral-900/50 rounded-xl border border-dashed border-amber-200 dark:border-amber-800">
                                   <p className="text-xs text-amber-600 font-bold">No custom fields defined yet.</p>
                                   <p className="text-[10px] text-amber-500 mt-1">Add fields like 'Color', 'Size', or 'Email' below.</p>
                                </div>
                             )}
                             {customFields.map((f, i) => (
                                <div
                                   key={`${i}-${f.name}`}
                                   draggable
                                   onDragStart={() => setDraggedCustomFieldIndex(i)}
                                   onDragOver={(e) => e.preventDefault()}
                                   onDragEnd={() => setDraggedCustomFieldIndex(null)}
                                   onDrop={async () => {
                                      if (draggedCustomFieldIndex === null || draggedCustomFieldIndex === i) {
                                        setDraggedCustomFieldIndex(null);
                                        return;
                                      }
                                      const reorderedFields = [...customFields];
                                      const [movedField] = reorderedFields.splice(draggedCustomFieldIndex, 1);
                                      reorderedFields.splice(i, 0, movedField);
                                      setDraggedCustomFieldIndex(null);
                                      setCustomFields(reorderedFields);
                                      await saveUserConfig({ customFields: reorderedFields });
                                   }}
                                   className={`flex gap-2 items-start bg-white dark:bg-neutral-900 p-3 rounded-xl border shadow-sm transition-colors ${
                                     draggedCustomFieldIndex === i
                                       ? "border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/20"
                                       : "border-amber-100 dark:border-amber-900"
                                   }`}
                                >
                                   <button
                                      type="button"
                                      onMouseDown={(e) => e.preventDefault()}
                                      className="mt-1 p-2 text-amber-500 dark:text-amber-400 cursor-grab active:cursor-grabbing"
                                      title="Drag to reorder"
                                   >
                                      <GripVertical className="w-4 h-4" />
                                   </button>
                                   <div className="flex-1 space-y-2">
                                      <input 
                                         type="text" 
                                         value={f.name}
                                         onChange={e => {
                                            const newFields = [...customFields];
                                            newFields[i].name = e.target.value;
                                            setCustomFields(newFields);
                                         }}
                                         onBlur={async (e) => {
                                            const newFields = [...customFields];
                                            newFields[i] = { ...newFields[i], name: e.currentTarget.value };
                                            await saveUserConfig({ customFields: newFields });
                                         }}
                                         placeholder="Field Name (e.g. Color)"
                                         className="w-full bg-gray-50 dark:bg-neutral-800 border border-gray-100 dark:border-neutral-800/50 rounded-lg p-2 text-xs font-bold text-gray-700 dark:text-neutral-300 outline-none focus:border-amber-400"
                                      />
                                      <textarea 
                                         value={f.instructions}
                                         onChange={e => {
                                            const newFields = [...customFields];
                                            newFields[i].instructions = e.target.value;
                                            setCustomFields(newFields);
                                         }}
                                         onBlur={async (e) => {
                                            const newFields = [...customFields];
                                            newFields[i] = { ...newFields[i], instructions: e.currentTarget.value };
                                            await saveUserConfig({ customFields: newFields });
                                         }}
                                         placeholder="AI Instructions: Tell the AI what to confirm. (e.g. Ask for preferred color from Red, Blue, Green)"
                                         className="w-full bg-gray-50 dark:bg-neutral-800 border border-gray-100 dark:border-neutral-800/50 rounded-lg p-2 text-xs font-medium text-gray-600 dark:text-neutral-400 outline-none focus:border-amber-400 resize-none"
                                         rows={2}
                                      />
                                   </div>
                                   <button 
                                      onClick={async () => {
                                         const newFields = customFields.filter((_, idx) => idx !== i);
                                         setCustomFields(newFields);
                                         await saveUserConfig({ customFields: newFields });
                                      }}
                                      className="p-2 text-gray-400 dark:text-neutral-600 hover:text-red-500 dark:text-red-500 transition-colors"
                                   >
                                      <Trash2 className="w-4 h-4" />
                                   </button>
                                </div>
                             ))}
                          </div>

                           <button 
                              onClick={async () => {
                                 const newFields = [...customFields, { name: "", instructions: "" }];
                                 setCustomFields(newFields);
                                 await saveUserConfig({ customFields: newFields });
                             }}
                             className="mt-4 w-full py-3 border-2 border-dashed border-amber-200 dark:border-amber-800 rounded-xl text-amber-600 text-xs font-bold hover:bg-amber-50 dark:bg-amber-900/40 transition-all flex items-center justify-center gap-2"
                           >
                              <Plus className="w-4 h-4" /> Add Custom Field
                           </button>

                        </div>
                     </div>
                     </ConfirmationFieldsPage>
                 )}
                  {aiTab === 'calls' && (
                    <ReplyCallRulesPage>
                    <div className="flex flex-col gap-6">
                      <div className="bg-rose-50/30 dark:bg-rose-950/20 p-5 rounded-2xl border border-rose-100 dark:border-rose-900/40">
                        <div className="flex items-start justify-between mb-4">
                           <div>
                             <h4 className="font-black text-rose-900 dark:text-rose-300 text-sm flex items-center gap-2">
                               Call Rejection Mode
                             </h4>
                             <p className="text-[11px] text-rose-700/70 dark:text-rose-400/80 font-bold mt-1">
                               Reject incoming voice/video calls and send a polite chat redirect.
                             </p>
                           </div>
                           <button 
                             onClick={async () => {
                               const val = rejectCalls === 1 ? 0 : 1;
                               setRejectCalls(val);
                               await saveUserConfig({ rejectCalls: val });
                             }}
                             className={`w-12 h-6 rounded-full transition-all relative ${rejectCalls === 1 ? "bg-rose-500" : "bg-gray-200 dark:bg-neutral-700"}`}
                           >
                             <div className={`absolute top-1 w-4 h-4 bg-white dark:bg-neutral-900 rounded-full transition-all ${rejectCalls === 1 ? "left-7" : "left-1"}`} />
                           </button>
                        </div>
                        <div className="bg-white dark:bg-neutral-900/60 p-3 rounded-xl border border-rose-100/50 dark:border-rose-900/30">
                           <p className="text-[10px] text-rose-800 dark:text-rose-200 font-medium leading-relaxed italic">
                             "I'm sorry, I can't receive calls right now. If you have any questions, please reply here. You can also send a voice message if you prefer." (Translated to the customer's selected language when configured)
                           </p>
                        </div>
                        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-100 dark:border-blue-900/60 flex items-start gap-3">
                           <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                           <p className="text-[10px] text-blue-700 dark:text-blue-300 font-medium leading-tight">
                              <strong>Guide:</strong> Enabling this ensures your WhatsApp instance stays dedicated to text/voice chat automation. Incoming calls often disrupt AI flows; this feature politely redirects callers to chat.
                           </p>
                        </div>
                      </div>

                      {/* Muted Numbers (Bot Blacklist) */}
                      <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-gray-100 dark:border-neutral-800/50 shadow-sm">
                         <div className="flex items-center gap-3 mb-4">
                           <div className="w-8 h-8 bg-rose-50 dark:bg-rose-950/30 rounded-lg flex items-center justify-center text-rose-500">
                             <UserX className="w-5 h-5" />
                           </div>
                           <div>
                              <h4 className="font-black text-gray-900 dark:text-neutral-50 text-sm">Muted Numbers (Bot Blacklist)</h4>
                              <p className="text-[10px] text-gray-500 dark:text-neutral-500 font-medium">Add numbers for which the bot will NEVER auto-reply. (System messages like OTPs will still work).</p>
                           </div>
                         </div>

                         <div className="flex gap-2 mb-4">
                            <input 
                              type="text" 
                              value={newMutedNumber}
                              onChange={(e) => setNewMutedNumber(e.target.value)}
                              onKeyDown={async (e) => {
                                if (e.key === 'Enter' && newMutedNumber.trim()) {
                                   const cleaned = newMutedNumber.replace(/[^0-9]/g, '');
                                   if (cleaned && !mutedNumbers.includes(cleaned)) {
                                      const newMuted = [...mutedNumbers, cleaned];
                                      setMutedNumbers(newMuted);
                                      setNewMutedNumber("");
                                      await saveUserConfig({ muted_numbers: newMuted });
                                   }
                                }
                              }}
                              className="flex-1 bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-800 rounded-xl px-4 py-2 text-xs outline-none focus:border-rose-300 transition-all font-bold"
                              placeholder="Enter number (e.g. 923136923129)..."
                            />
                            <button 
                              onClick={async () => {
                                 if (!newMutedNumber.trim()) return;
                                 const cleaned = newMutedNumber.replace(/[^0-9]/g, '');
                                 if (cleaned && !mutedNumbers.includes(cleaned)) {
                                    const newMuted = [...mutedNumbers, cleaned];
                                    setMutedNumbers(newMuted);
                                    setNewMutedNumber("");
                                    await saveUserConfig({ muted_numbers: newMuted });
                                 }
                              }}
                              className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-sm shadow-rose-200 dark:shadow-none"
                            >
                               <PlusCircle className="w-4 h-4" /> Add to Blacklist
                            </button>
                         </div>

                         <div className="flex flex-wrap gap-2">
                            {mutedNumbers.length === 0 ? (
                               <p className="text-[10px] text-gray-400 dark:text-neutral-600 font-medium italic">No muted numbers added yet.</p>
                            ) : (
                              mutedNumbers.map((num, i) => (
                                <div key={i} className="flex items-center gap-2 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 px-3 py-1.5 rounded-full border border-rose-100 dark:border-rose-900/50 text-[11px] font-black group transition-all hover:pr-2">
                                   <span>{num}</span>
                                   <button 
                                     onClick={async () => {
                                        const newMuted = mutedNumbers.filter((_, idx) => idx !== i);
                                        setMutedNumbers(newMuted);
                                        await saveUserConfig({ muted_numbers: newMuted });
                                      }}
                                     className="hover:text-rose-700 dark:hover:text-rose-300 ml-1"
                                   >
                                      <MinusCircle className="w-3.5 h-3.5" />
                                   </button>
                                </div>
                              ))
                            )}
                         </div>
                      </div>

                      <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-gray-100 dark:border-neutral-800/50 shadow-sm">
                         <div className="flex items-center gap-3 mb-4">
                           <div className="w-8 h-8 bg-amber-50 dark:bg-amber-950/30 rounded-lg flex items-center justify-center text-amber-500">
                             <ShieldAlert className="w-5 h-5" />
                           </div>
                           <div>
                              <h4 className="font-black text-gray-900 dark:text-neutral-50 text-sm">Difficult Customer Handling</h4>
                              <p className="text-[10px] text-gray-500 dark:text-neutral-500 font-medium">Choose whether AI should keep full control or hand repeated/tough customers to admin and pause.</p>
                           </div>
                         </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {[
                             { id: "admin_pause", name: "Admin Handoff + Pause", desc: "Alert admin early for repeated, risky, or hard pricing chats. AI stops replying until you manually message the customer." },
                             { id: "ai_control", name: "AI Total Control", desc: "AI handles difficult chats itself. No admin alert and no customer-level auto pause." },
                           ].map((mode) => (
                             <button
                               key={mode.id}
                               onClick={async () => {
                                 setDifficultCustomerMode(mode.id);
                                 await saveUserConfig({ difficultCustomerMode: mode.id });
                               }}
                               className={`p-4 rounded-xl border text-left transition-all ${difficultCustomerMode === mode.id ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-500' : 'bg-gray-50 dark:bg-neutral-800 border-gray-100 dark:border-neutral-800/50 hover:border-gray-200 dark:border-neutral-800'}`}
                             >
                               <div className="flex items-center justify-between mb-1">
                                 <span className={`text-[11px] font-black uppercase tracking-widest ${difficultCustomerMode === mode.id ? 'text-amber-700 dark:text-amber-300' : 'text-gray-400 dark:text-neutral-600'}`}>{mode.name}</span>
                                 {difficultCustomerMode === mode.id && <CheckCircle2 className="w-4 h-4 text-amber-500" />}
                               </div>
                               <p className="text-[10px] text-gray-500 dark:text-neutral-500 font-medium leading-tight">{mode.desc}</p>
                             </button>
                           ))}
                         </div>
                      </div>

                      <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-gray-100 dark:border-neutral-800/50 shadow-sm">
                         <h4 className="font-black text-gray-900 dark:text-neutral-50 text-sm mb-4">AI Reply Behavior</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[
                               { id: 'text_only', name: 'Always Text', desc: 'AI will only reply using text messages, never audio.' },
                               { id: 'preference', name: 'Customer Preference', desc: 'AI matches customer: Text for text, Voice for voice messages.' },
                               { id: 'voice_only', name: 'Always Voice', desc: 'AI will only reply using voice messages (Audio).' },
                               { id: 'text_preferred', name: 'Text Preferred', desc: 'AI uses text unless customer explicitly asks for voice or has a valid reason (driving, etc).' }
                            ].map(mode => (
                               <button 
                                 key={mode.id}
                                 onClick={async () => {
                                   setReplyBehavior(mode.id);
                                   await saveUserConfig({ replyBehavior: mode.id });
                                 }}
                                 className={`p-4 rounded-xl border text-left transition-all ${replyBehavior === mode.id ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500' : 'bg-gray-50 dark:bg-neutral-800 border-gray-100 dark:border-neutral-800/50 hover:border-gray-200 dark:border-neutral-800'}`}
                               >
                                  <div className="flex items-center justify-between mb-1">
                                     <span className={`text-[11px] font-black uppercase tracking-widest ${replyBehavior === mode.id ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-400 dark:text-neutral-600'}`}>{mode.name}</span>
                                     {replyBehavior === mode.id && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                  </div>
                                  <p className="text-[10px] text-gray-500 dark:text-neutral-500 font-medium leading-tight">{mode.desc}</p>
                               </button>
                            ))}
                         </div>
                         <div className="mt-6 p-4 bg-gray-50 dark:bg-neutral-800 rounded-xl border border-gray-100 dark:border-neutral-800/50">
                            <h6 className="text-[10px] font-black text-gray-400 dark:text-neutral-600 uppercase tracking-widest mb-2">Group Reply Policy</h6>
                            <div className="flex items-center justify-between">
                               <div>
                                  <p className="text-xs font-bold text-gray-700 dark:text-neutral-300">Reply in WhatsApp Groups</p>
                                  <p className="text-[10px] text-gray-500 dark:text-neutral-500 font-medium">Allow AI to respond to messages in groups you are a member of.</p>
                               </div>
                               <button 
                                 onClick={async () => {
                                   const val = replyInGroups === 1 ? 0 : 1;
                                   setReplyInGroups(val);
                                   await saveUserConfig({ replyInGroups: val });
                                 }}
                                 className={`w-12 h-6 rounded-full transition-all relative ${replyInGroups === 1 ? "bg-emerald-500" : "bg-gray-200 dark:bg-neutral-700"}`}
                               >
                                 <div className={`absolute top-1 w-4 h-4 bg-white dark:bg-neutral-900 rounded-full transition-all ${replyInGroups === 1 ? "left-7" : "left-1"}`} />
                               </button>
                            </div>
                         </div>
                         <div className="mt-4 p-4 bg-gray-50 dark:bg-neutral-800 rounded-xl border border-gray-100 dark:border-neutral-800/50">
                            <h6 className="text-[10px] font-black text-gray-400 dark:text-neutral-600 uppercase tracking-widest mb-2">Voice Engine</h6>
                            <div className="flex items-center justify-between gap-4">
                               <div className="flex items-center gap-3">
                                  <Mic className="w-4 h-4 text-emerald-500 shrink-0" />
                                  <div>
                                     <p className="text-xs font-bold text-gray-700 dark:text-neutral-300">Voice Simulation Replies</p>
                                     <p className="text-[10px] text-gray-500 dark:text-neutral-500 font-medium">Allow AI reply modes to send generated WhatsApp voice notes.</p>
                                  </div>
                               </div>
                               <button
                                 onClick={async () => {
                                   const val = voiceSimulationEnabled === 1 ? 0 : 1;
                                   setVoiceSimulationEnabled(val);
                                   await saveUserConfig({ voiceSimulationEnabled: val });
                                 }}
                                 className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${voiceSimulationEnabled === 1 ? "bg-emerald-500" : "bg-gray-200 dark:bg-neutral-700"}`}
                               >
                                 <div className={`absolute top-1 w-4 h-4 bg-white dark:bg-neutral-900 rounded-full transition-all ${voiceSimulationEnabled === 1 ? "left-7" : "left-1"}`} />
                               </button>
                            </div>
                         </div>
                         <div className="mt-4 p-4 bg-gray-50 dark:bg-neutral-800 rounded-xl border border-gray-100 dark:border-neutral-800/50">
                             <h6 className="text-[10px] font-black text-gray-400 dark:text-neutral-600 uppercase tracking-widest mb-2">Read Receipts</h6>
                             <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                   <Clock className="w-4 h-4 text-emerald-500 shrink-0" />
                                   <div>
                                      <p className="text-xs font-bold text-gray-700 dark:text-neutral-300">Delayed Read Receipts</p>
                                      <p className="text-[10px] text-gray-500 dark:text-neutral-500 font-medium">
                                        Delays WhatsApp read receipts so incoming messages remain unread briefly on linked devices. Message processing can still happen immediately.
                                      </p>
                                   </div>
                                </div>
                                <button
                                  type="button"
                                  id="delayed-read-receipts-toggle"
                                  onClick={async () => {
                                    const val = delayedReadReceiptsEnabled === 1 ? 0 : 1;
                                    setDelayedReadReceiptsEnabled(val);
                                    await saveUserConfig({ delayedReadReceiptsEnabled: val, delayed_read_receipts_enabled: val });
                                  }}
                                  className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${delayedReadReceiptsEnabled === 1 ? "bg-emerald-500" : "bg-gray-200 dark:bg-neutral-700"}`}
                                  aria-label="Toggle Delayed Read Receipts"
                                >
                                  <div className={`absolute top-1 w-4 h-4 bg-white dark:bg-neutral-900 rounded-full transition-all ${delayedReadReceiptsEnabled === 1 ? "left-7" : "left-1"}`} />
                                </button>
                             </div>
                             {delayedReadReceiptsEnabled === 1 && (
                               <div className="mt-3 pt-3 border-t border-gray-200 dark:border-neutral-700/60 flex items-center justify-between gap-4">
                                 <div>
                                   <label htmlFor="read-receipt-delay-input" className="text-xs font-bold text-gray-700 dark:text-neutral-300">Read messages after</label>
                                   <p className="text-[10px] text-gray-500 dark:text-neutral-500 font-medium">Delay in seconds before sending WhatsApp blue ticks / read acknowledgement.</p>
                                 </div>
                                 <div className="flex items-center gap-2">
                                   <input
                                     id="read-receipt-delay-input"
                                     type="number"
                                     min={1}
                                     max={300}
                                     value={readReceiptDelaySeconds}
                                     onChange={(e) => {
                                       const val = Math.max(1, Math.min(300, Number(e.target.value) || 1));
                                       setReadReceiptDelaySeconds(val);
                                     }}
                                     onBlur={async () => {
                                       await saveUserConfig({ readReceiptDelaySeconds, read_receipt_delay_seconds: readReceiptDelaySeconds });
                                     }}
                                     className="w-20 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-900 outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white text-center"
                                   />
                                   <span className="text-xs font-medium text-gray-500 dark:text-neutral-400">sec</span>
                                 </div>
                               </div>
                             )}
                          </div>
                      </div>
                    </div>
                    </ReplyCallRulesPage>
                  )}

                  {aiTab === 'integrations' && (
                    <IntegrationsPage>
                    <div className="grid grid-cols-1 gap-5">
                      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-gray-200 bg-gray-50 p-1 dark:border-neutral-800 dark:bg-neutral-950/50">
                        {[
                          ["courier", "Courier APIs"],
                          ["gemini", "Gemini / AI Provider"],
                          ["dhl", "DHL Tracking"],
                          ["commerce", "WooCommerce"],
                          ["knowledge", "Website Knowledge"],
                          ["api", "API Keys"],
                          ["webhooks", "Webhooks"],
                          ["alerts", "Admin Alerts"],
                        ].map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setIntegrationTab(key as any)}
                            className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black transition-all ${integrationTab === key ? "bg-white text-emerald-700 shadow-sm dark:bg-neutral-900 dark:text-emerald-300" : "text-gray-500 hover:bg-white/70 dark:text-neutral-400 dark:hover:bg-neutral-900/70"}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="contents">
                        <h4 className="sr-only">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-300" /> API & Integrations
                        </h4>
                        <div className="grid grid-cols-1 gap-5">
                          {integrationTab === "courier" && (
                          <IntegrationSectionCard
                            title="Courier APIs"
                            description="PostEx and Leopards credentials stay connected to the existing booking flows."
                          >
                            <label className="text-xs font-semibold text-gray-500 dark:text-neutral-500 block mb-2 px-1">
                              PostEx API Token
                            </label>
                            <input
                              type="password"
                              value={postexApiKey}
                              onChange={(e) => setPostexApiKey(e.target.value)}
                              className="w-full max-w-lg bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-3 text-sm font-medium text-gray-900 dark:text-neutral-50 outline-none focus:border-blue-300 shadow-sm"
                              placeholder="Enter your PostEx token..."
                            />
                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-semibold text-gray-500 dark:text-neutral-500 block mb-2 px-1">
                                Leopards Courier API Key
                              </label>
                              <input
                                type="password"
                                value={leopardsApiKey}
                                onChange={(e) => setLeopardsApiKey(e.target.value)}
                                className="w-full bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-3 text-sm font-medium text-gray-900 dark:text-neutral-50 outline-none focus:border-orange-300 shadow-sm"
                                placeholder="Enter Leopards API Key..."
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-gray-500 dark:text-neutral-500 block mb-2 px-1">
                                Leopards API Password
                              </label>
                              <input
                                type="password"
                                value={leopardsApiPassword}
                                onChange={(e) => setLeopardsApiPassword(e.target.value)}
                                className="w-full bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-3 text-sm font-medium text-gray-900 dark:text-neutral-50 outline-none focus:border-orange-300 shadow-sm"
                                placeholder="Enter Leopards API Password..."
                              />
                            </div>
                          </div>
                          </IntegrationSectionCard>
                          )}
                          {integrationTab === "gemini" && (
                          <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-2xl p-5 space-y-4 shadow-sm">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-sm font-black text-gray-900 dark:text-neutral-50">Gemini API</p>
                                <h5 className="text-sm font-black text-gray-900 dark:text-neutral-50 mt-1">Google AI Studio Gemini API key</h5>
                                <p className="text-[11px] text-gray-500 dark:text-neutral-500 mt-1 font-medium">
                                  {clientGeminiStatus?.hasKey ? `Current key: ${clientGeminiStatus.maskedKey || "****"}` : "No custom Gemini key saved."}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setClientGeminiEnabled(!clientGeminiEnabled)}
                                className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${clientGeminiEnabled ? "bg-emerald-500" : "bg-gray-200 dark:bg-neutral-700"}`}
                              >
                                <div className={`absolute top-1 w-4 h-4 bg-white dark:bg-neutral-900 rounded-full transition-all ${clientGeminiEnabled ? "left-7" : "left-1"}`} />
                              </button>
                            </div>
                            <div>
                              <label className="text-xs font-black uppercase text-gray-400 dark:text-neutral-600 tracking-widest block mb-2 px-1">
                                Google AI Studio Gemini API key
                              </label>
                              <input
                                type="password"
                                value={clientGeminiApiKey}
                                onChange={(e) => setClientGeminiApiKey(e.target.value)}
                                className="w-full bg-white dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-xl p-3 text-sm font-medium text-gray-900 dark:text-neutral-50 outline-none focus:border-emerald-300 shadow-sm"
                                placeholder={clientGeminiStatus?.hasKey ? "Leave blank to keep current key" : "Paste Google AI Studio Gemini API key"}
                              />
                              <p className="mt-2 px-1 text-[11px] font-medium text-gray-500 dark:text-neutral-500">
                                Paste your Gemini API key from Google AI Studio. Vertex AI / service account credentials are not supported for client custom keys.
                              </p>
                            </div>
                            <div className="rounded-xl border border-blue-100 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 px-3 py-3">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="text-sm font-black text-gray-900 dark:text-neutral-50">Cache Boost metrics</p>
                                  <p className="mt-1 text-[11px] font-medium text-blue-800 dark:text-blue-200">
                                    Optional premium cache feature for Gemini. When successfully used, it can reduce Gemini API cost by up to 50% in some cases.
                                  </p>
                                  <p className="mt-1 text-[11px] font-black text-blue-900 dark:text-blue-100">
                                    Custom Gemini billing: $0.001 per successful customer message or AI cycle. Extra BlackArrow charge: +$0.001 only when Cache Boost is ON and Google reports cached content tokens.
                                  </p>
                                  {!clientGeminiStatus?.hasKey && (
                                    <p className="mt-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">Requires an active custom Gemini key.</p>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setClientGeminiCacheBoostEnabled(!clientGeminiCacheBoostEnabled)}
                                  disabled={!clientGeminiStatus?.hasKey && !clientGeminiApiKey}
                                  className={`w-12 h-6 rounded-full transition-all relative shrink-0 disabled:opacity-50 ${clientGeminiCacheBoostEnabled ? "bg-blue-600" : "bg-gray-200 dark:bg-neutral-700"}`}
                                >
                                  <div className={`absolute top-1 w-4 h-4 bg-white dark:bg-neutral-900 rounded-full transition-all ${clientGeminiCacheBoostEnabled ? "left-7" : "left-1"}`} />
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                              <div className="rounded-xl border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-950/60 px-3 py-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-neutral-600">Total Gemini cycles</p>
                                <p className="mt-1 text-sm font-black text-gray-900 dark:text-neutral-50">{clientGeminiUsage?.total?.customGeminiCycles || clientGeminiUsage?.total?.customGeminiRequests || 0}</p>
                                <p className="text-[11px] font-medium text-gray-500 dark:text-neutral-500">{formatCurrency(clientGeminiUsage?.total?.customGeminiCost || 0, 3)}</p>
                              </div>
                              <div className="rounded-xl border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-950/60 px-3 py-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-neutral-600">Last 7 days</p>
                                <p className="mt-1 text-sm font-black text-gray-900 dark:text-neutral-50">{clientGeminiUsage?.last7Days?.customGeminiCycles || clientGeminiUsage?.last7Days?.customGeminiRequests || 0} cycles</p>
                                <p className="text-[11px] font-medium text-gray-500 dark:text-neutral-500">Today: {clientGeminiUsage?.today?.customGeminiCycles || clientGeminiUsage?.today?.customGeminiRequests || 0}</p>
                              </div>
                              <div className="rounded-xl border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-950/60 px-3 py-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-neutral-600">Cache Boost charges</p>
                                <p className="mt-1 text-sm font-black text-gray-900 dark:text-neutral-50">{clientGeminiUsage?.total?.cacheBoostCharges || 0}</p>
                                <p className="text-[11px] font-medium text-gray-500 dark:text-neutral-500">{formatCurrency(clientGeminiUsage?.total?.cacheBoostCost || 0, 3)}</p>
                              </div>
                              <div className="rounded-xl border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-950/60 px-3 py-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-neutral-600">Cache Boost status</p>
                                <p className={`mt-1 text-sm font-black ${clientGeminiCacheBoostEnabled ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-neutral-300"}`}>
                                  {clientGeminiCacheBoostEnabled ? "ON" : "OFF"}
                                </p>
                                <p className="text-[11px] font-medium text-gray-500 dark:text-neutral-500">Charged only when cached tokens are reported.</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                              {(() => {
                                const stats = clientGeminiUsage?.cacheBoostStats?.total || {};
                                const skipped = Object.entries(stats.skippedReasons || {})
                                  .sort((a: any, b: any) => Number(b[1] || 0) - Number(a[1] || 0))
                                  .slice(0, 2)
                                  .map(([reason, count]) => `${String(reason).replace(/_/g, " ")}: ${count}`)
                                  .join(", ");
                                return [
                                  ["Cache eligible", stats.eligible || 0],
                                  ["Cache attempts", stats.attempts || 0],
                                  ["Cache attached", stats.attached || 0],
                                  ["Cache hits", stats.hits || 0],
                                  ["Cache misses", stats.misses || 0],
                                  ["Small-context skips", stats.skippedSmallContext || 0],
                                  ["Cached tokens", stats.cachedTokens || 0],
                                  ["Uncached tokens", stats.uncachedTokens || 0, skipped || "Zero cached tokens are treated as misses."],
                                ].map(([label, value, note]) => (
                                  <div key={String(label)} className="rounded-xl border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-950/60 px-3 py-2">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-neutral-600">{String(label)}</p>
                                    <p className="mt-1 text-sm font-black text-gray-900 dark:text-neutral-50">{Number(value || 0).toLocaleString()}</p>
                                    {note ? <p className="text-[10px] font-medium text-gray-500 dark:text-neutral-500">{String(note)}</p> : null}
                                  </div>
                                ));
                              })()}
                            </div>
                            {clientGeminiCacheBoostEnabled && Number(clientGeminiUsage?.cacheBoostStats?.total?.hits || 0) === 0 && Number(clientGeminiUsage?.cacheBoostStats?.total?.attempts || 0) > 0 ? (
                              <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] font-bold text-amber-800 dark:text-amber-200">
                                Cache Boost is ON, but Google has not reported cached content tokens yet. Zero cached tokens are treated as misses and are not charged.
                              </div>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={saveClientGemini}
                                disabled={isSavingClientGemini}
                                className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 font-bold text-sm hover:bg-emerald-700 transition-all disabled:opacity-60"
                              >
                                {isSavingClientGemini ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                                Save key
                              </button>
                              <button
                                type="button"
                                onClick={testClientGemini}
                                disabled={isTestingClientGemini || (!clientGeminiApiKey && !clientGeminiStatus?.hasKey)}
                                className="bg-blue-600 text-white px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 font-bold text-sm hover:bg-blue-700 transition-all disabled:opacity-60"
                              >
                                {isTestingClientGemini ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                Test key
                              </button>
                              <button
                                type="button"
                                onClick={removeClientGemini}
                                disabled={isSavingClientGemini || !clientGeminiStatus?.hasKey}
                                className="bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 border border-red-100 dark:border-red-900 px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 font-bold text-sm hover:bg-red-100 dark:hover:bg-red-950 transition-all disabled:opacity-60"
                              >
                                <Trash2 className="w-4 h-4" />
                                Remove key
                              </button>
                            </div>
                            <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-950/60 px-3 py-2 text-[11px] font-medium text-gray-600 dark:text-neutral-300">
                              When enabled, BlackArrow uses only this account's Google AI Studio Gemini API key for AI requests. Standard custom Gemini API billing is $0.001 per successful customer message or AI cycle. Vertex AI and service account credentials are not supported here.
                            </div>
                          </div>
                          )}
                          {integrationTab === "dhl" && (
                          <>
                          <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-2xl p-5 space-y-4 shadow-sm">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-sm font-black text-gray-900 dark:text-neutral-50">DHL tracking</p>
                                <h5 className="text-sm font-black text-gray-900 dark:text-neutral-50 mt-1">Tracking-only DHL integration</h5>
                                <p className="text-[11px] text-gray-500 dark:text-neutral-500 mt-1 font-medium">Use DHL Shipment Tracking - Unified API for status syncs and customer tracking replies. Booking, rates, billing import, and invoices stay unchanged.</p>
                              </div>
                              <button
                                type="button"
                                onClick={async () => {
                                  const nextValue = !dhlEnabled;
                                  setDhlEnabled(nextValue);
                                  await saveUserConfig({ dhlEnabled: nextValue });
                                }}
                                className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${dhlEnabled ? "bg-emerald-500" : "bg-gray-200 dark:bg-neutral-700"}`}
                              >
                                <div className={`absolute top-1 w-4 h-4 bg-white dark:bg-neutral-900 rounded-full transition-all ${dhlEnabled ? "left-7" : "left-1"}`} />
                              </button>
                            </div>
                            <div>
                              <label className="text-xs font-black uppercase text-gray-400 dark:text-neutral-600 tracking-widest block mb-2 px-1">
                                DHL API Key
                              </label>
                              <input
                                type="password"
                                value={dhlApiKey}
                                onChange={(e) => setDhlApiKey(e.target.value)}
                                className="w-full bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-3 text-sm font-medium text-gray-900 dark:text-neutral-50 outline-none focus:border-yellow-300 shadow-sm"
                                placeholder="Enter DHL API key..."
                              />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="text-xs font-black uppercase text-gray-400 dark:text-neutral-600 tracking-widest block mb-2 px-1">
                                  Service
                                </label>
                                <input
                                  type="text"
                                  value={dhlService}
                                  onChange={(e) => setDhlService(e.target.value)}
                                  className="w-full bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-3 text-sm font-medium text-gray-900 dark:text-neutral-50 outline-none focus:border-yellow-300 shadow-sm"
                                  placeholder="express"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-black uppercase text-gray-400 dark:text-neutral-600 tracking-widest block mb-2 px-1">
                                  Language
                                </label>
                                <input
                                  type="text"
                                  value={dhlLanguage}
                                  onChange={(e) => setDhlLanguage(e.target.value)}
                                  className="w-full bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-3 text-sm font-medium text-gray-900 dark:text-neutral-50 outline-none focus:border-yellow-300 shadow-sm"
                                  placeholder="en"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-black uppercase text-gray-400 dark:text-neutral-600 tracking-widest block mb-2 px-1">
                                  Requester Country Code
                                </label>
                                <input
                                  type="text"
                                  value={dhlRequesterCountryCode}
                                  onChange={(e) => setDhlRequesterCountryCode(e.target.value.toUpperCase())}
                                  className="w-full bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-3 text-sm font-medium text-gray-900 dark:text-neutral-50 outline-none focus:border-yellow-300 shadow-sm"
                                  placeholder="PK"
                                  maxLength={2}
                                />
                              </div>
                              <div>
                                <label className="text-xs font-black uppercase text-gray-400 dark:text-neutral-600 tracking-widest block mb-2 px-1">
                                  Origin Country Code
                                </label>
                                <input
                                  type="text"
                                  value={dhlOriginCountryCode}
                                  onChange={(e) => setDhlOriginCountryCode(e.target.value.toUpperCase())}
                                  className="w-full bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-3 text-sm font-medium text-gray-900 dark:text-neutral-50 outline-none focus:border-yellow-300 shadow-sm"
                                  placeholder="PK"
                                  maxLength={2}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                              <div>
                                <label className="text-xs font-black uppercase text-gray-400 dark:text-neutral-600 tracking-widest block mb-2 px-1">
                                  Test Tracking ID
                                </label>
                                <input
                                  type="text"
                                  value={dhlTestTrackingId}
                                  onChange={(e) => setDhlTestTrackingId(e.target.value)}
                                  className="w-full bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-3 text-sm font-medium text-gray-900 dark:text-neutral-50 outline-none focus:border-yellow-300 shadow-sm"
                                  placeholder="Enter a DHL tracking ID for a live connection test"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={testDhlConnection}
                                disabled={isTestingDhl}
                                className="bg-yellow-500 text-white px-4 py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-sm hover:bg-yellow-600 transition-all disabled:opacity-60"
                              >
                                {isTestingDhl ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                Test DHL Connection
                              </button>
                            </div>
                            <div className="rounded-xl border border-amber-100 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                              Delivered by Deutsche Post DHL Group
                            </div>
                          </div>
                          <div className="mt-2 flex items-start gap-3 p-3 bg-gray-50 dark:bg-neutral-950/60 rounded-xl border border-gray-200 dark:border-neutral-800">
                             <Sparkles className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                             <p className="text-[11px] text-gray-600 dark:text-neutral-300 font-medium leading-relaxed">
                                <strong>Guide:</strong> Black Arrow keeps courier credentials private, supports PostEx and Leopards booking flows as before, and can now sync DHL Express tracking updates through DHL's unified tracking API.
                             </p>
                           </div>
                          </>
                          )}
                          {integrationTab === "commerce" && (
                            <Suspense fallback={<RouteLoadingFallback label="Loading Commerce Integration..." />}>
                              <RouteErrorBoundary routeName="Commerce Integration">
                                <LazyIntegrationFoundationPage section="commerce" />
                              </RouteErrorBoundary>
                            </Suspense>
                          )}
                          {integrationTab === "knowledge" && (
                            <WebsiteKnowledgePanel />
                          )}
                          {integrationTab === "api" && (
                            <Suspense fallback={<RouteLoadingFallback label="Loading API Integration..." />}>
                              <RouteErrorBoundary routeName="API Integration">
                                <LazyIntegrationFoundationPage section="api" />
                              </RouteErrorBoundary>
                            </Suspense>
                          )}
                          {integrationTab === "webhooks" && (
                            <Suspense fallback={<RouteLoadingFallback label="Loading Webhooks Integration..." />}>
                              <RouteErrorBoundary routeName="Webhooks Integration">
                                <LazyIntegrationFoundationPage section="webhooks" />
                              </RouteErrorBoundary>
                            </Suspense>
                          )}

                          {integrationTab === "alerts" && (
                          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                            <p className="mb-1 text-sm font-black text-gray-900 dark:text-neutral-50">Admin Alerts</p>
                            <p className="mb-4 text-xs font-medium text-gray-500 dark:text-neutral-500">Set the verified WhatsApp number used for operational and fallback alerts.</p>
                            <label className="text-xs font-semibold text-gray-500 dark:text-neutral-500 block mb-2 px-1">
                              Admin WhatsApp Number
                            </label>
                            <input
                              type="text"
                              value={adminNumber}
                              onChange={(e) => setAdminNumber(e.target.value)}
                              className="w-full max-w-lg bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-3 text-sm font-medium text-gray-900 dark:text-neutral-50 outline-none focus:border-blue-300 shadow-sm"
                              placeholder="e.g. 923001234567"
                            />
                            <p className="text-xs text-gray-500 dark:text-neutral-500 mt-2 font-medium">All billing alerts, unseen queries (bot fallback), and system errors will be automatically sent to this admin WhatsApp number.</p>
                          </div>
                          )}
                        </div>
                      </div>
                    </div>
                    </IntegrationsPage>
                  )}
                  </div>

                <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-neutral-800/50">
                  <button
                    onClick={() => saveIntelligenceTab(aiTab)}
                    disabled={isSaving || isIntelligenceTabSaving(aiTab, intelligenceSavingTab) || (instanceConfigStatus === "LOADING" && aiTab !== "integrations")}
                    className="bg-[#111B21] text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-sm hover:bg-gray-800 transition-all active:scale-95 disabled:opacity-50 shadow-md shadow-gray-200"
                  >
                    {isIntelligenceTabSaving(aiTab, intelligenceSavingTab) ? (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {getIntelligenceSaveButtonLabel(aiTab)}
                  </button>
                </div>
              </div>
            )}
              </AiStudioV2Page>
            </PageShell>
          )}

          {activeView === "departments" && (
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
              <LeadRoutingSettingsSection />
            </div>
          )}

          {activeView === "crm" && (
            CRM_UI_ENABLED ? (
              <CrmFoundationPage
                initialLeadId={crmOpenLeadRequest.leadId}
                openLeadToken={crmOpenLeadRequest.token}
                walletBalance={walletBalance}
                onCrmNotificationsChange={setCrmDashboardAlerts}
              />
            ) : (
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-[1.75rem] border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/50 dark:bg-amber-950/20">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">Paused</p>
                <h2 className="text-2xl font-black text-gray-950 dark:text-white">CRM is currently paused</h2>
                <p className="text-sm font-medium leading-6 text-gray-700 dark:text-neutral-300">{CRM_UI_PAUSED_MESSAGE}</p>
              </div>
            )
          )}

          {activeView === "customers" && (
            <CustomersPage
              customers={allCustomers}
              userId={currentUserId}
              isGlobalAiEnabled={isAutoReplyEnabled}
              onSelectCustomer={(c) => setSelectedCustomerDetail(c)}
              onRefreshCustomers={fetchCustomers}
              onDownloadCsv={downloadCustomersCSV}
              onSuccess={(msg) => {
                setAppSuccess(msg);
                setTimeout(() => setAppSuccess(null), 3000);
              }}
              onError={(msg) => {
                setAppError(msg);
                setTimeout(() => setAppError(null), 5000);
              }}
              formatDate={(ts) => formatDatePK(ts, true)}
            />
          )}

          <CustomerDetailDrawer
            customer={selectedCustomerDetail}
            userId={currentUserId}
            isOpen={Boolean(selectedCustomerDetail)}
            onClose={() => setSelectedCustomerDetail(null)}
            formatDate={formatDatePK}
            onSummaryRefreshQueued={scheduleCustomerSummaryRefetch}
            onSaved={(customer, profile) => {
              setAllCustomers(prev => prev.map((item: any) => (
                (item.$id || item.id || item.customer_id) === (customer.$id || customer.id || customer.customer_id)
                  ? { ...item, profile: { ...(item.profile || {}), ...profile } }
                  : item
              )));
              setSelectedCustomerDetail((current: any) => current && (current.$id || current.id || current.customer_id) === (customer.$id || customer.id || customer.customer_id)
                ? { ...current, profile: { ...(current.profile || {}), ...profile } }
                : current);
            }}
          />

          {activeView === "orders" && (
            <OrdersPage
              orders={allOrders}
              onUpdateOrder={handleUpdateOrder}
              onSyncTracking={syncOrderPostexTracking}
              onCancelOrder={cancelOrder}
              onDeleteOrder={deleteOrder}
              onBookPostexOrder={bookOrderWithPostex}
              dynamicColumns={getDynamicCustomColumns ? getDynamicCustomColumns() : []}
              formatCurrency={(amt) => formatAccountCurrency(amt)}
              formatDate={(ts) => formatDatePK(ts, true)}
            />
          )}

          {activeView === "knowledge" && (
            <WebsiteKnowledgePanel />
          )}

          {activeView === "products" && (
            <ProductsPage
              products={products}
              formatCurrency={(amt) => formatAccountCurrency(amt)}
              onAddProduct={async (data) => {
                await saveProduct(data);
              }}
              onEditProduct={async (data) => {
                await saveProduct(data);
              }}
              onDeleteProduct={async (productId) => {
                await confirmDeleteProduct(productId);
              }}
            />
          )}

          {(activeView === "content_library" || activeView === "sequences" || activeView === "media" || activeView === "welcome") && (
            <ContentLibraryPage
              activeTab={contentLibraryTab as any}
              selectedBotId={selectedBotId || undefined}
              sequenceGroupLimit={buildAccountLimits(currentUser, currentUser?.subscriptions || [])?.sequenceGroupLimit}
              mediaGroups={buildMediaGroupItems(syncGroups, contentLibraryTemplateDetails)}
              mediaItems={buildMediaLibraryItems(contentLibraryTemplateDetails, selectedBotId || undefined)}
              sequences={buildSequenceGroupItems(syncGroups, contentLibraryTemplateDetails)}
              savedReplies={buildSavedReplyItems(syncGroups, contentLibraryTemplateDetails)}
              welcomeConfig={buildWelcomeSequenceConfig(syncGroups, contentLibraryTemplateDetails)}
              onTabChange={(tab) => handleSetView("content_library", tab)}
              onSaveMediaGroup={async (groupData) => {
                if (!selectedBotId) {
                  const msg = "Select a WhatsApp instance first to manage Media Groups.";
                  setAppError(msg);
                  setTimeout(() => setAppError(null), 5000);
                  throw new Error(msg);
                }
                const operationBotId = selectedBotId;
                const currentList = [...syncGroups];
                const mediaGroupLimit = buildAccountLimits(currentUser, currentUser?.subscriptions || [])?.mediaGroupLimit;
                let updatedList: any[];

                try {
                  if (groupData.id) {
                    updatedList = buildEditedSyncGroups(currentList, groupData, "media");
                  } else {
                    updatedList = buildAddedSyncGroups(currentList, groupData, "media", mediaGroupLimit);
                  }
                } catch (err: any) {
                  setAppError(err?.message || "Failed to save media group.");
                  setTimeout(() => setAppError(null), 5000);
                  throw err;
                }

                if (selectedBotIdRef.current === operationBotId) setSyncGroups(updatedList);
                try {
                  const saveRes = await fetch(`/api/bots/update-config`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: currentUserId, botId: operationBotId, config: buildInstanceConfig({ syncGroups: updatedList }) }),
                  });
                  if (!saveRes.ok) {
                    const data = await saveRes.json().catch(() => ({}));
                    throw new Error(data.error || "Failed to save media group configuration.");
                  }
                  if (selectedBotIdRef.current === operationBotId) {
                    await loadContentLibraryTemplateDetails(operationBotId, { throwOnError: true });
                    setAppSuccess("Media group saved.");
                    setTimeout(() => setAppSuccess(null), 3000);
                  }
                } catch (err: any) {
                  if (selectedBotIdRef.current === operationBotId) {
                    setSyncGroups(currentList);
                    setAppError(err?.message || "Failed to save media group.");
                    setTimeout(() => setAppError(null), 5000);
                  }
                  throw err;
                }
              }}
              onToggleMediaGroup={async (groupId, enabled) => {
                if (!selectedBotId) return;
                const operationBotId = selectedBotId;
                const currentList = [...syncGroups];
                const updatedList = buildToggledSyncGroups(currentList, groupId, enabled, "media");

                if (selectedBotIdRef.current === operationBotId) setSyncGroups(updatedList);
                try {
                  const saveRes = await fetch(`/api/bots/update-config`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: currentUserId, botId: operationBotId, config: buildInstanceConfig({ syncGroups: updatedList }) }),
                  });
                  if (!saveRes.ok) {
                    const data = await saveRes.json().catch(() => ({}));
                    throw new Error(data.error || "Failed to toggle media group.");
                  }
                } catch (err: any) {
                  if (selectedBotIdRef.current === operationBotId) {
                    setSyncGroups(currentList);
                    setAppError(err?.message || "Failed to toggle media group.");
                    setTimeout(() => setAppError(null), 5000);
                  }
                  throw err;
                }
              }}
              onUnlinkMediaGroup={async (groupId) => {
                if (!selectedBotId) return;
                const operationBotId = selectedBotId;
                const currentList = [...syncGroups];
                const updatedList = buildUnlinkedSyncGroups(currentList, groupId, "media");

                if (selectedBotIdRef.current === operationBotId) setSyncGroups(updatedList);
                try {
                  const saveRes = await fetch(`/api/bots/update-config`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: currentUserId, botId: operationBotId, config: buildInstanceConfig({ syncGroups: updatedList }) }),
                  });
                  if (!saveRes.ok) {
                    const data = await saveRes.json().catch(() => ({}));
                    throw new Error(data.error || "Failed to unlink media group.");
                  }
                  if (selectedBotIdRef.current === operationBotId) {
                    setAppSuccess("Media group unlinked.");
                    setTimeout(() => setAppSuccess(null), 3000);
                  }
                } catch (err: any) {
                  if (selectedBotIdRef.current === operationBotId) {
                    setSyncGroups(currentList);
                    setAppError(err?.message || "Failed to unlink media group.");
                    setTimeout(() => setAppError(null), 5000);
                  }
                  throw err;
                }
              }}
              onSaveWelcomeGroup={async (groupData) => {
                if (!selectedBotId) {
                  const msg = "Select a WhatsApp instance first to manage Welcome Sequence.";
                  setAppError(msg);
                  setTimeout(() => setAppError(null), 5000);
                  throw new Error(msg);
                }
                const operationBotId = selectedBotId;
                const currentList = [...syncGroups];
                const hasExistingWelcome = currentList.some((g) => normalizeSequenceGroupPurpose(g) === "welcome");
                let updatedList: any[];

                try {
                  if (hasExistingWelcome) {
                    updatedList = buildEditedSyncGroups(currentList, groupData, "welcome");
                  } else {
                    updatedList = buildAddedSyncGroups(currentList, groupData, "welcome", 1);
                  }
                } catch (err: any) {
                  setAppError(err?.message || "Failed to save welcome sequence.");
                  setTimeout(() => setAppError(null), 5000);
                  throw err;
                }

                if (selectedBotIdRef.current === operationBotId) setSyncGroups(updatedList);
                try {
                  const saveRes = await fetch(`/api/bots/update-config`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: currentUserId, botId: operationBotId, config: buildInstanceConfig({ syncGroups: updatedList }) }),
                  });
                  if (!saveRes.ok) {
                    const data = await saveRes.json().catch(() => ({}));
                    throw new Error(data.error || "Failed to save welcome sequence configuration.");
                  }
                  if (selectedBotIdRef.current === operationBotId) {
                    await loadContentLibraryTemplateDetails(operationBotId, { throwOnError: true });
                    setAppSuccess("Welcome sequence configuration saved.");
                    setTimeout(() => setAppSuccess(null), 3000);
                  }
                } catch (err: any) {
                  if (selectedBotIdRef.current === operationBotId) {
                    setSyncGroups(currentList);
                    setAppError(err?.message || "Failed to save welcome sequence.");
                    setTimeout(() => setAppError(null), 5000);
                  }
                  throw err;
                }
              }}
              onToggleWelcome={async (enabled) => {
                if (!selectedBotId) return;
                const operationBotId = selectedBotId;
                const currentList = [...syncGroups];
                const welcomeGroup = currentList.find((g) => normalizeSequenceGroupPurpose(g) === "welcome");
                if (!welcomeGroup) {
                  return;
                }
                const targetId = welcomeGroup.id || welcomeGroup.jid || welcomeGroup.name || "welcome";
                const updatedList = buildToggledSyncGroups(currentList, targetId, enabled, "welcome");

                if (selectedBotIdRef.current === operationBotId) setSyncGroups(updatedList);
                try {
                  const saveRes = await fetch(`/api/bots/update-config`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: currentUserId, botId: operationBotId, config: buildInstanceConfig({ syncGroups: updatedList }) }),
                  });
                  if (!saveRes.ok) {
                    const data = await saveRes.json().catch(() => ({}));
                    throw new Error(data.error || "Failed to update welcome sequence toggle.");
                  }
                  if (selectedBotIdRef.current === operationBotId) {
                    setAppSuccess(`Welcome sequence ${enabled ? "enabled" : "disabled"}.`);
                    setTimeout(() => setAppSuccess(null), 3000);
                  }
                } catch (err: any) {
                  if (selectedBotIdRef.current === operationBotId) {
                    setSyncGroups(currentList);
                    setAppError(err?.message || "Failed to toggle welcome sequence.");
                    setTimeout(() => setAppError(null), 5000);
                  }
                  throw err;
                }
              }}
              onUnlinkWelcomeGroup={async (groupId) => {
                if (!selectedBotId) return;
                const operationBotId = selectedBotId;
                const currentList = [...syncGroups];
                const updatedList = buildUnlinkedSyncGroups(currentList, groupId, "welcome");

                if (selectedBotIdRef.current === operationBotId) setSyncGroups(updatedList);
                try {
                  const saveRes = await fetch(`/api/bots/update-config`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: currentUserId, botId: operationBotId, config: buildInstanceConfig({ syncGroups: updatedList }) }),
                  });
                  if (!saveRes.ok) {
                    const data = await saveRes.json().catch(() => ({}));
                    throw new Error(data.error || "Failed to unlink welcome group.");
                  }
                  if (selectedBotIdRef.current === operationBotId) {
                    setAppSuccess("Welcome group unlinked.");
                    setTimeout(() => setAppSuccess(null), 3000);
                  }
                } catch (err: any) {
                  if (selectedBotIdRef.current === operationBotId) {
                    setSyncGroups(currentList);
                    setAppError(err?.message || "Failed to unlink welcome group.");
                    setTimeout(() => setAppError(null), 5000);
                  }
                  throw err;
                }
              }}
              onSaveReplyShortcut={async (replyData) => {
                if (!selectedBotId) return;
                const operationBotId = selectedBotId;
                const currentList = [...syncGroups];
                const updatedList = buildSavedReplyEditedSyncGroups(currentList, replyData);

                if (selectedBotIdRef.current === operationBotId) setSyncGroups(updatedList);
                try {
                  const saveRes = await fetch(`/api/bots/update-config`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: currentUserId, botId: operationBotId, config: buildInstanceConfig({ syncGroups: updatedList }) }),
                  });
                  if (!saveRes.ok) {
                    const data = await saveRes.json().catch(() => ({}));
                    throw new Error(data.error || "Failed to save shortcut reply.");
                  }
                  if (selectedBotIdRef.current === operationBotId) {
                    await loadContentLibraryTemplateDetails(operationBotId, { throwOnError: true });
                    setAppSuccess("Saved reply shortcut updated.");
                    setTimeout(() => setAppSuccess(null), 3000);
                  }
                } catch (err: any) {
                  if (selectedBotIdRef.current === operationBotId) {
                    setSyncGroups(currentList);
                    setAppError(err?.message || "Failed to save shortcut reply.");
                    setTimeout(() => setAppError(null), 5000);
                  }
                  throw err;
                }
              }}
              onDeleteReplyShortcut={async (syncGroupId) => {
                if (!selectedBotId) return;
                const operationBotId = selectedBotId;
                const currentList = [...syncGroups];
                const updatedList = buildSavedReplyClearedSyncGroups(currentList, syncGroupId);

                if (selectedBotIdRef.current === operationBotId) setSyncGroups(updatedList);
                try {
                  const saveRes = await fetch(`/api/bots/update-config`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: currentUserId, botId: operationBotId, config: buildInstanceConfig({ syncGroups: updatedList }) }),
                  });
                  if (!saveRes.ok) {
                    const data = await saveRes.json().catch(() => ({}));
                    throw new Error(data.error || "Failed to clear shortcut code.");
                  }
                  if (selectedBotIdRef.current === operationBotId) {
                    setAppSuccess("Shortcut code removed from flow.");
                    setTimeout(() => setAppSuccess(null), 3000);
                  }
                } catch (err: any) {
                  if (selectedBotIdRef.current === operationBotId) {
                    setSyncGroups(currentList);
                    setAppError(err?.message || "Failed to remove shortcut code.");
                    setTimeout(() => setAppError(null), 5000);
                  }
                  throw err;
                }
              }}
              onSaveSequenceGroup={async (groupData) => {
                if (!selectedBotId) {
                  const msg = "Select a WhatsApp instance first to manage Sequence Groups.";
                  setAppError(msg);
                  setTimeout(() => setAppError(null), 5000);
                  throw new Error(msg);
                }
                const operationBotId = selectedBotId;
                const sequenceGroupLimit = buildAccountLimits(currentUser, currentUser?.subscriptions || [])?.sequenceGroupLimit;
                const currentList = [...syncGroups];
                let updatedList: any[];

                try {
                  if (groupData.id) {
                    updatedList = buildEditedSequenceGroups(currentList, groupData.id, groupData);
                  } else {
                    updatedList = buildAddedSequenceGroups(currentList, groupData, sequenceGroupLimit);
                  }
                } catch (err: any) {
                  setAppError(err?.message || "Failed to validate sequence group.");
                  setTimeout(() => setAppError(null), 5000);
                  throw err;
                }

                if (selectedBotIdRef.current === operationBotId) setSyncGroups(updatedList);
                try {
                  const saveRes = await fetch(`/api/bots/update-config`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: currentUserId, botId: operationBotId, config: buildInstanceConfig({ syncGroups: updatedList }) }),
                  });
                  if (!saveRes.ok) {
                    const data = await saveRes.json().catch(() => ({}));
                    throw new Error(data.error || "Failed to save sequence group configuration.");
                  }
                  if (selectedBotIdRef.current === operationBotId) {
                    await loadContentLibraryTemplateDetails(operationBotId, { throwOnError: true });
                    setAppSuccess("Sequence group saved.");
                    setTimeout(() => setAppSuccess(null), 3000);
                  }
                } catch (err: any) {
                  if (selectedBotIdRef.current === operationBotId) {
                    setSyncGroups(currentList);
                    setAppError(err?.message || "Failed to save sequence group.");
                    setTimeout(() => setAppError(null), 5000);
                  }
                  throw err;
                }
              }}
              onToggleSequence={async (seqId, enabled) => {
                if (!selectedBotId) {
                  const msg = "Select a WhatsApp instance first to manage Sequence Groups.";
                  setAppError(msg);
                  setTimeout(() => setAppError(null), 5000);
                  throw new Error(msg);
                }
                const operationBotId = selectedBotId;
                const currentList = [...syncGroups];
                let updatedList: any[];

                try {
                  updatedList = buildToggledSequenceGroups(currentList, seqId, enabled);
                } catch (err: any) {
                  setAppError(err?.message || "Failed to toggle sequence group.");
                  setTimeout(() => setAppError(null), 5000);
                  throw err;
                }

                if (selectedBotIdRef.current === operationBotId) setSyncGroups(updatedList);
                try {
                  const saveRes = await fetch(`/api/bots/update-config`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: currentUserId, botId: operationBotId, config: buildInstanceConfig({ syncGroups: updatedList }) }),
                  });
                  if (!saveRes.ok) {
                    const data = await saveRes.json().catch(() => ({}));
                    throw new Error(data.error || "Failed to update sequence toggle status.");
                  }
                } catch (err: any) {
                  if (selectedBotIdRef.current === operationBotId) {
                    setSyncGroups(currentList);
                    setAppError(err?.message || "Failed to toggle sequence group.");
                    setTimeout(() => setAppError(null), 5000);
                  }
                  throw err;
                }
              }}
              onUnlinkGroup={async (groupId) => {
                if (!selectedBotId) {
                  const msg = "Select a WhatsApp instance first to manage Sequence Groups.";
                  setAppError(msg);
                  setTimeout(() => setAppError(null), 5000);
                  throw new Error(msg);
                }
                const operationBotId = selectedBotId;
                const currentList = [...syncGroups];
                let updatedList: any[];

                try {
                  updatedList = buildUnlinkedSequenceGroups(currentList, groupId);
                } catch (err: any) {
                  setAppError(err?.message || "Failed to unlink sequence group.");
                  setTimeout(() => setAppError(null), 5000);
                  throw err;
                }

                if (selectedBotIdRef.current === operationBotId) setSyncGroups(updatedList);
                try {
                  const saveRes = await fetch(`/api/bots/update-config`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: currentUserId, botId: operationBotId, config: buildInstanceConfig({ syncGroups: updatedList }) }),
                  });
                  if (!saveRes.ok) {
                    const data = await saveRes.json().catch(() => ({}));
                    throw new Error(data.error || "Failed to unlink sequence group.");
                  }
                  if (selectedBotIdRef.current === operationBotId) {
                    setAppSuccess("Sequence group unlinked.");
                    setTimeout(() => setAppSuccess(null), 3000);
                  }
                } catch (err: any) {
                  if (selectedBotIdRef.current === operationBotId) {
                    setSyncGroups(currentList);
                    setAppError(err?.message || "Failed to unlink sequence group.");
                    setTimeout(() => setAppError(null), 5000);
                  }
                  throw err;
                }
              }}
              onRefreshGroup={async () => {
                if (!selectedBotId) return;
                const operationBotId = selectedBotId;
                try {
                  const res = await fetch(`/api/bot/${operationBotId}/templates/reload`, { method: "POST" });
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || "Template reload failed.");
                  }
                  if (selectedBotIdRef.current !== operationBotId) return;
                  try {
                    await loadContentLibraryTemplateDetails(operationBotId, { throwOnError: true });
                    await fetchBots();
                    if (selectedBotIdRef.current === operationBotId) {
                      setAppSuccess("Templates reloaded.");
                      setTimeout(() => setAppSuccess(null), 3000);
                    }
                  } catch (refetchErr: any) {
                    if (selectedBotIdRef.current === operationBotId) {
                      const errMsg = "Templates reloaded, but latest details could not be refreshed. Please retry.";
                      setAppError(errMsg);
                      setTimeout(() => setAppError(null), 5000);
                      throw new Error(errMsg);
                    }
                  }
                } catch (err: any) {
                  if (selectedBotIdRef.current === operationBotId && !err?.message?.includes("could not be refreshed")) {
                    setAppError(err?.message || "Template reload failed.");
                    setTimeout(() => setAppError(null), 5000);
                  }
                  throw err;
                }
              }}
              onResetGroup={async (groupId: string, purpose?: "media" | "sequence" | "welcome") => {
                if (!selectedBotId) return;
                const operationBotId = selectedBotId;
                const targetGroup = syncGroups.find(g => g.id === groupId || g.jid === groupId || (purpose === "welcome" && g.purpose === "welcome"));
                const groupJid = targetGroup?.jid || (groupId.endsWith("@g.us") ? groupId : "");
                const resolvedPurpose = purpose || targetGroup?.purpose || "media";
                try {
                  const res = await fetch(`/api/user/content-library/groups/reset`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      botId: operationBotId,
                      groupId,
                      groupJid,
                      purpose: resolvedPurpose,
                    }),
                  });
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || "Group templates reset failed.");
                  }
                  if (selectedBotIdRef.current !== operationBotId) return;
                  await loadContentLibraryTemplateDetails(operationBotId, { throwOnError: true });
                  await fetchBots();
                  if (selectedBotIdRef.current === operationBotId) {
                    setAppSuccess("Group templates reset successfully.");
                    setTimeout(() => setAppSuccess(null), 3000);
                  }
                } catch (err: any) {
                  if (selectedBotIdRef.current === operationBotId) {
                    setAppError(err?.message || "Group templates reset failed.");
                    setTimeout(() => setAppError(null), 5000);
                  }
                  throw err;
                }
              }}
              formatDate={(ts) => formatDatePK(ts, true)}
            />
          )}

          {activeView === "marketing" && (
            <FollowupCenter
              followups={followups}
              marketingStats={marketingStats}
              selectedBotId={selectedBotId}
              autoFollowupEnabled={Boolean(autoFollowupEnabled)}
              autoFollowupSchedules={autoFollowupSchedules}
              onToggleAutoFollowup={async (enabled) => {
                const nextVal = enabled ? 1 : 0;
                setAutoFollowupEnabled(nextVal);
                try {
                  await saveConfig(true, { auto_followup_enabled: nextVal });
                } catch (err: any) {
                  setAutoFollowupEnabled(autoFollowupEnabled);
                  throw err;
                }
              }}
              onSaveCampaign={async (data) => {
                const previous = followups || [];
                const exists = previous.some((c: any) => c.id === data.id);
                const updated = exists
                  ? previous.map((c: any) => (c.id === data.id ? { ...c, ...data } : c))
                  : [...previous, data];
                setFollowups(updated);
                try {
                  await saveFollowupCenterConfig(updated);
                } catch (err: any) {
                  setFollowups(previous);
                  setAppError(err.message || "Failed to save follow-up campaign.");
                  setTimeout(() => setAppError(null), 5000);
                  throw err;
                }
              }}
              onDeleteCampaign={async (campaignId) => {
                const previous = followups || [];
                const updated = previous.filter((c: any) => c.id !== campaignId);
                setFollowups(updated);
                try {
                  await saveFollowupCenterConfig(updated);
                } catch (err: any) {
                  setFollowups(previous);
                  setAppError(err.message || "Failed to delete follow-up campaign.");
                  setTimeout(() => setAppError(null), 5000);
                  throw err;
                }
              }}
              onRefresh={loadMarketingStats}
              formatDate={(ts) => formatDatePK(ts, true)}
            />
          )}

          {activeView === "contact_lists" && (
            <RouteErrorBoundary>
              <Suspense fallback={<RouteLoadingFallback />}>
                <LazyContactListsPage />
              </Suspense>
            </RouteErrorBoundary>
          )}

          {activeView === "campaigns" && (
            <RouteErrorBoundary>
              <Suspense fallback={<RouteLoadingFallback />}>
                <LazyCampaignsPage />
              </Suspense>
            </RouteErrorBoundary>
          )}

          {activeView === "workspaces" && (
            <RouteErrorBoundary>
              <Suspense fallback={<RouteLoadingFallback />}>
                <LazyWorkspacesPage />
              </Suspense>
            </RouteErrorBoundary>
          )}

          {activeView === "broadcast" && (
            <BroadcastPage
              history={Array.isArray(broadcastHistory) ? broadcastHistory : []}
              bots={bots}
              selectedBotId={selectedBotId}
              onSendBroadcast={async (payload) => {
                if (!selectedBotId) {
                  setAppError("Please select a WhatsApp instance first.");
                  return;
                }
                const trackingNumbers = (payload.trackingNumbers || []).filter((id: string) => Boolean(id) && !id.includes("@"));
                if (trackingNumbers.length === 0) {
                  setAppError("Please provide valid Courier tracking/AWB numbers for broadcast.");
                  return;
                }
                const res = await fetch(`/api/bot/${selectedBotId}/broadcast-by-ids`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    trackingNumbers,
                    type: payload.type || "booked",
                    message: payload.message,
                    title: payload.title,
                  }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || "Courier broadcast failed");
                setAppSuccess(data.message || `Courier broadcast dispatched to ${trackingNumbers.length} tracking IDs.`);
                setTimeout(() => setAppSuccess(null), 5000);
              }}
              formatDate={(ts) => formatDatePK(ts, true)}
            />
          )}

          {activeView === "customer_updates" && (
            <CustomerUpdatesPage
              updates={Array.isArray(customerUpdates) ? customerUpdates : []}
              recipientLists={Array.isArray(recipientLists) ? recipientLists : []}
              customers={allCustomers}
              bots={bots}
              selectedBotId={selectedBotId}
              onSaveUpdate={async (data) => {
                const isEdit = Boolean(data.id);
                const url = isEdit
                  ? `/api/user/customer-updates/${data.type || "planned"}/${encodeURIComponent(data.id)}`
                  : "/api/user/customer-updates";
                const method = isEdit ? "PUT" : "POST";
                const res = await fetch(url, {
                  method,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userId: currentUserId, ...data }),
                });
                const responseData = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(responseData.error || "Failed to save customer update");
                const savedItem = responseData.data || data;
                setCustomerUpdates((prev) => [...prev.filter((u) => u.id !== savedItem.id), savedItem]);
                setAppSuccess(isEdit ? "Customer update updated." : "Customer update scheduled.");
                setTimeout(() => setAppSuccess(null), 5000);
              }}
              onDeleteUpdate={async (updateId) => {
                const target = customerUpdates.find((u) => u.id === updateId);
                const updateType = target?.type || "planned";
                const res = await fetch(`/api/user/customer-updates/${updateType}/${encodeURIComponent(updateId)}`, {
                  method: "DELETE",
                });
                const responseData = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(responseData.error || "Failed to remove customer update");
                setCustomerUpdates((prev) => prev.filter((u) => u.id !== updateId));
                setAppSuccess("Customer update removed.");
                setTimeout(() => setAppSuccess(null), 3000);
              }}
              formatDate={(ts) => formatDatePK(ts, true)}
            />
          )}

          {(activeView === "live_monitor" || activeView === "terminal") && (
            <Suspense fallback={<RouteLoadingFallback label="Loading Live Monitor..." />}>
              <RouteErrorBoundary routeName="Live Monitor">
                <LazyLiveMonitorPage
                  selectedBotId={selectedBotId}
                  selectedBot={selectedDashboardBot}
                  bots={bots}
                  onSelectBot={setSelectedBotId}
                  connectionStatus={status}
                  connectionRetry={connectionRetry}
                  isAutoReplyEnabled={isAutoReplyEnabled}
                  walletBalance={walletBalance}
                  billingAccess={getBillingAccess(currentUser)}
                  logs={logs}
                  onClearLogs={() => setLogs([])}
                  formatDate={(ts, incTime) => formatDatePK(ts, incTime ?? true)}
                />
              </RouteErrorBoundary>
            </Suspense>
          )}

          {activeView === "integrations" && (
            <Suspense fallback={<RouteLoadingFallback label="Loading Integrations..." />}>
              <RouteErrorBoundary routeName="Integrations">
                <LazyIntegrationFoundationPage section="all" />
              </RouteErrorBoundary>
            </Suspense>
          )}

          {activeView === "billing" && (
            <BillingPage
              activeTab={billingTab as any}
              onTabChange={(tab) => handleSetView("billing", tab)}
              transactions={buildBillingTransactionItems(transactions)}
              usageRecords={buildUsageRecordItems(analyticsData)}
              usageLimit={usageLimit}
              onUsageLimitChange={handleUsageLimitChange}
              wallet={{
                balanceUsd: walletBalance,
                balanceFormatted: formatAccountCurrency(walletBalance),
                currency: "USD",
                planId: currentUser?.plan_id,
                planName: currentUser?.plan_name || (currentUser?.plan_id && (BILLING_PLAN_DETAILS as any)[currentUser.plan_id]?.name) || (getBillingAccess(currentUser).trialActive ? "7-Day Free Trial" : ""),
                planExpiry: currentUser?.plan_expiry,
                accountStatus: mapBillingAccessToAccountStatus(getBillingAccess(currentUser).status, currentUser),
              }}
              accountSettings={{
                businessName: currentUser?.business_name || currentUser?.name,
                billingEmail: currentUser?.email,
                currency: "USD",
                timezone: currentUser?.timezone,
              }}
              walletBillingPurchasesEnabled={walletBillingPurchasesEnabled}
              onTopUp={async (amountUsd) => {
                await startCreemCheckout({ type: "wallet_topup", amount: amountUsd });
                return { success: true };
              }}
              onPurchasePlanWithCard={async (planId, billingCycle = "monthly") => {
                await startCreemCheckout({ type: "plan", planId, billingCycle: billingCycle as "monthly" | "annual" });
              }}
              onPurchasePlanWithWallet={async (planId, billingCycle = "monthly") => {
                await changePlanWithWallet(planId, billingCycle as "monthly" | "annual");
                return { success: true, message: `Plan updated to ${PLANS[planId]?.name || "selected plan"} using wallet balance.` };
              }}
              onPurchasePlan={async (planId) => {
                if (walletBillingPurchasesEnabled) {
                  await changePlanWithWallet(planId, "monthly");
                  return { success: true, message: `Plan updated to ${PLANS[planId]?.name || "selected plan"} using wallet balance.` };
                } else {
                  await startCreemCheckout({ type: "plan", planId, billingCycle: "monthly" });
                  return { success: true };
                }
              }}
              onPurchaseAddonWithCard={async (addonKey, quantity = 1) => {
                await startCreemCheckout({ type: "addon", addonType: addonKey, quantity });
              }}
              onPurchaseAddonWithWallet={async (addonKey, quantity = 1) => {
                await buyAddonWithWallet(addonKey, quantity);
                return { success: true, message: "Add-on purchased using wallet balance." };
              }}
              onPurchaseAddon={async (addonKey) => {
                if (walletBillingPurchasesEnabled) {
                  await buyAddonWithWallet(addonKey, 1);
                  return { success: true, message: "Add-on purchased using wallet balance." };
                } else {
                  await startCreemCheckout({ type: "addon", addonType: addonKey, quantity: 1 });
                  return { success: true };
                }
              }}
              fromDate={analyticsFromStr}
              toDate={analyticsToStr}
              onFromDateChange={setAnalyticsFromStr}
              onToDateChange={setAnalyticsToStr}
              onDownloadStatementCSV={downloadAccountStatementCSV}
              formatDate={(ts) => formatDatePK(ts, true)}
            />
          )}

          {(activeView === "settings" || activeView === "team" || activeView === "security" || activeView === "notifications") && (
            <SettingsPage
              activeTab={settingsTab}
              onTabChange={(tab) => handleSetView(tab === "team" ? "team" : tab === "security" ? "security" : "settings", tab)}
              showGetStarted={isGetStartedVisible}
              onToggleShowGetStarted={handleToggleShowGetStarted}
              members={[
                {
                  id: currentUserId || "user",
                  name: currentUser?.name || currentUser?.business_name || "User",
                  email: currentUser?.email || "No email recorded",
                  role: currentUser?.role,
                  roleLabel: currentUser?.role || "Unknown",
                  status: currentUser?.status,
                  joinedAt: currentUser?.created_at,
                },
              ]}
              accountSettings={{
                businessName: currentUser?.business_name || currentUser?.name,
                billingEmail: currentUser?.email,
                currency: "USD",
                timezone: currentUser?.timezone,
              }}
              securityConfig={{
                isTwoFaEnabled:
                  typeof currentUser?.two_factor_enabled === "boolean"
                    ? currentUser.two_factor_enabled
                    : typeof currentUser?.has_2fa_enabled === "number"
                    ? currentUser.has_2fa_enabled === 1
                    : undefined,
                lastPasswordChange: undefined,
              }}
              alertConfig={{
                adminPhone: adminNumber,
                isAlertsEnabled: billingAlertsEnabled,
                isBusinessAssistantEnabled: businessAssistantEnabled,
                isVerified: adminNumberVerified,
                alertTypes: {
                  lowBalance: billingAlertsEnabled,
                  instanceDisconnected: systemAlertsEnabled,
                  humanEscalation: proxyAlertsEnabled,
                  failedOrders: orderAlertsEnabled,
                },
                proactiveAlerts,
                proactiveLeadAlerts,
              }}
              onSaveAlertConfig={async (nextAlertConfig) => {
                const phone = (nextAlertConfig.adminPhone || "").trim();
                const alertsEnabled = nextAlertConfig.isAlertsEnabled;
                const assistantEnabled = nextAlertConfig.isBusinessAssistantEnabled === true;
                const types = nextAlertConfig.alertTypes || {};
                setAdminNumber(phone);
                setBusinessAssistantEnabled(assistantEnabled);
                setBillingAlertsEnabled(alertsEnabled && types.lowBalance !== false);
                setSystemAlertsEnabled(alertsEnabled && types.instanceDisconnected !== false);
                setProxyAlertsEnabled(alertsEnabled && types.humanEscalation !== false);
                setOrderAlertsEnabled(alertsEnabled && types.failedOrders !== false);
                if (nextAlertConfig.proactiveAlerts) setProactiveAlerts(nextAlertConfig.proactiveAlerts);
                if (nextAlertConfig.proactiveLeadAlerts) setProactiveLeadAlerts(nextAlertConfig.proactiveLeadAlerts);
                const res = await fetch("/api/admin-alerts/settings", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    adminPhone: phone,
                    isAlertsEnabled: alertsEnabled,
                    isBusinessAssistantEnabled: assistantEnabled,
                    alertTypes: types,
                    proactiveAlerts: nextAlertConfig.proactiveAlerts,
                    proactiveLeadAlerts: nextAlertConfig.proactiveLeadAlerts,
                  }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || "Failed to save alert settings.");
                if (data.config?.isVerified !== undefined) {
                  setAdminNumberVerified(Boolean(data.config.isVerified));
                }
                setAppSuccess("Admin WhatsApp alert settings saved successfully.");
                setTimeout(() => setAppSuccess(null), 4000);
              }}
              onTestAlert={async (phone) => {
                if (!phone) return { success: false, message: "Admin WhatsApp phone number is required." };
                try {
                  const res = await fetch("/api/admin-alerts/test", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phone }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) return { success: false, message: data.error || "Test alert failed." };
                  return { success: true, message: data.message || "Test alert sent successfully." };
                } catch (err: any) {
                  return { success: false, message: err?.message || "Test alert failed." };
                }
              }}
              onChangePassword={async (oldPass, newPass) => {
                const res = await fetch("/api/auth/change-password", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) return { success: false, message: data.error || "Failed to update password." };
                return { success: true, message: "Password updated successfully." };
              }}
              onToggle2FA={async () => {
                const res = await fetch("/api/auth/setup-2fa", { method: "POST" });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || "Failed to generate 2FA secret");
                return { success: true, secret: data.secret, qrCodeUrl: data.qrCodeUrl };
              }}
              onVerify2FA={async (otp, enable) => {
                const res = await fetch("/api/auth/verify-2fa", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ otp, enable }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) return { success: false, message: data.error || "Invalid OTP code" };

                // Refresh authoritative 2FA status from server
                try {
                  const statusRes = await fetch("/api/auth/2fa-status");
                  if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    setCurrentUser((prev: any) =>
                      prev ? { ...prev, two_factor_enabled: statusData.enabled, has_2fa_enabled: statusData.enabled ? 1 : 0 } : prev
                    );
                  }
                } catch {
                  // status refresh fallback
                }

                return { success: true };
              }}
              formatDate={(ts) => formatDatePK(ts, true)}
            />
          )}

          {activeView === "admin" && isAdmin && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  {(() => {
                    const AdminIcon = adminPageMeta[adminTab]?.icon || Shield;
                    return (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <AdminIcon className="h-5 w-5" />
                      </div>
                    );
                  })()}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-300">Admin</p>
                    <h2 className="mt-1 text-2xl font-black text-gray-900 dark:text-neutral-50 tracking-tight">{adminPageMeta[adminTab]?.title || "Admin Dashboard"}</h2>
                    <p className="mt-1 text-sm font-bold text-gray-400 dark:text-neutral-600">{adminPageMeta[adminTab]?.description || "Manage clients and accounts"}</p>
                  </div>
                  <DBBadge />
                </div>
                {(adminTab === "dashboard" || adminTab === "users") && (
                  <button onClick={loadAdminUsers} className="flex items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-2 rounded-xl text-sm font-bold text-gray-600 dark:text-neutral-400 shadow-sm border border-gray-200 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800">
                    <RefreshCw className="w-4 h-4" /> Refresh Data
                  </button>
                )}
              </div>

              {adminTab === 'directory' && (
                <SharedDirectoryPage>
                  <Suspense fallback={<RouteLoadingFallback label="Loading Directory Admin..." />}>
                    <RouteErrorBoundary routeName="Directory Admin">
                      <LazySharedPhoneDirectoryAdminPanel
                        requesterId={currentUserId}
                        onSuccess={(message) => {
                          setAppSuccess(message);
                          setTimeout(() => setAppSuccess(null), 5000);
                        }}
                        onError={(message) => {
                          setAppError(message);
                          setTimeout(() => setAppError(null), 5000);
                        }}
                      />
                    </RouteErrorBoundary>
                  </Suspense>
                </SharedDirectoryPage>
              )}


              {adminTab === 'smart_sales' && (
                <AdminSmartSalesPage>
                <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800/50 p-6">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-5">
                    <div>
                      <h3 className="font-black text-gray-900 dark:text-neutral-50 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-emerald-500" /> Smart Sales Global Control
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-neutral-500 mt-1 font-medium">
                        Manage the global Smart Sales behavior used by enabled accounts. Per-bot settings control whether the engine is active and billed.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={loadSmartSalesPromptConfig}
                        disabled={isSmartSalesPromptLoading}
                        className="px-4 py-2 rounded-xl border border-gray-200 dark:border-neutral-700 text-xs font-black text-gray-600 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800 disabled:opacity-50 flex items-center gap-2"
                      >
                        <RefreshCw className={`w-4 h-4 ${isSmartSalesPromptLoading ? "animate-spin" : ""}`} /> Reload
                      </button>
                      <button
                        onClick={saveSmartSalesPromptConfig}
                        disabled={isSmartSalesPromptSaving || !smartSalesPromptText.trim()}
                        className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs font-black hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-2"
                      >
                        {isSmartSalesPromptSaving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Engine Settings
                      </button>
                    </div>
                  </div>
                  <div className="mb-4">
                    <div className="text-xs text-gray-500 dark:text-neutral-500 font-medium">
                      {smartSalesPromptUpdatedAt ? `Last updated: ${formatDatePK(smartSalesPromptUpdatedAt)}` : "Using built-in Engine Guidance until saved."}
                    </div>
                  </div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-neutral-600 block mb-2">Engine Guidance</label>
                  <textarea
                    value={smartSalesPromptText}
                    onChange={(e) => setSmartSalesPromptText(e.target.value)}
                    className="w-full min-h-[420px] bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-xl p-4 text-sm font-medium leading-relaxed outline-none focus:border-emerald-400 text-gray-800 dark:text-neutral-200 custom-scrollbar resize-y"
                  />
                  <div className="mt-4 rounded-xl border border-emerald-100 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-[11px] font-medium text-emerald-800 dark:text-emerald-200">
                    Billing is separate: enabled instances add $0.001 only after a successful AI text reply send. Failed sends, skipped replies, and guard-blocked replies are not charged.
                  </div>
                </div>
                </AdminSmartSalesPage>
              )}

              {adminTab === 'accounting' && (
                accountingIsLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 bg-emerald-50 dark:bg-emerald-900/40 rounded-2xl border border-emerald-100 dark:border-emerald-900 animate-pulse">
                    <RefreshCw className="w-10 h-10 mb-4 animate-spin text-emerald-500 opacity-50" />
                    <p className="text-emerald-900 dark:text-emerald-200 font-bold">Summing up financial data...</p>
                    <p className="text-xs text-emerald-600 mt-1 italic">This may take a moment depending on transaction volume.</p>
                  </div>
                ) : accountingError ? (
                  <div className="flex flex-col items-center justify-center py-20 bg-red-50 dark:bg-red-900/40 rounded-2xl border border-red-100 dark:border-red-900">
                    <AlertCircle className="w-10 h-10 mb-4 text-red-500 dark:text-red-500" />
                    <p className="text-red-900 dark:text-red-100 font-bold">Failed to load accounting data</p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{accountingError}</p>
                    <button onClick={fetchAccounting} className="mt-4 bg-white dark:bg-neutral-900 px-4 py-2 rounded-lg text-sm font-bold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:bg-red-900/40 transition-all">
                      Try Again
                    </button>
                  </div>
                ) : !accountingData ? (
                   <div className="flex flex-col items-center justify-center py-20 bg-gray-50 dark:bg-neutral-800 rounded-2xl border border-gray-100 dark:border-neutral-800/50">
                     <p className="text-gray-500 dark:text-neutral-500 font-bold">No accounting data available for this range.</p>
                     <p className="text-xs text-gray-400 dark:text-neutral-600 mt-1">Try selecting a different date range or top up your wallet.</p>
                   </div>
                ) : (() => {
                  const summary = accountingData.summary || {};
                  const dailyRows = accountingData.dailyRows || [];
                  const usageByCategory = accountingData.usageByCategory || accountingData.usage || [];
                  const topClients = accountingData.topClients || [];
                  const freeClients = accountingData.topFreeCreditClients || [];
                  const paymentErrors = accountingData.paymentErrors || [];
                  const revenueBySource = accountingData.revenueBySource || {};
                  const usageConsumption = accountingData.usageConsumptionBySource || {
                    paidWallet: summary.paidWalletUsage,
                    freeCredit: summary.freeCreditUsage,
                    totalUsageCharges: summary.totalUsageCharges,
                  };
                  const cacheCoverageByPurpose = accountingData.cacheBoostTelemetryStats?.coverageByPurpose || [];
                  const freeVsPaidUsage = accountingData.freeVsPaidUsage || [];
                  const providerCost = accountingData.providerCost || {};
                  const providerCostAvailable = summary.providerCostUnavailable !== true && summary.estimatedProviderCost !== null && summary.estimatedProviderCost !== undefined;
                  const providerCostDiagnostics = summary.providerCostDiagnostics || providerCost.diagnostics || {};
                  const providerCostBreakdown = providerCost.serviceSkuBreakdown || providerCost.providerCostBreakdown || providerCostDiagnostics.topRows || [];
                  const providerReliability = summary.providerCostReliabilityStatus || providerCost.reliabilityStatus || (providerCostAvailable ? "current" : "incomplete_estimate");
                  const aiLedgerDiagnostics = accountingData.aiProviderCallLedgerDiagnostics || {};
                  const displayLabels = aiLedgerDiagnostics.displayLabels || {};
                  const ownerSummary = aiLedgerDiagnostics.ownerSummary || {};
                  const money = (value: any) => `$${Number(value || 0).toFixed(2)}`;
                  const moneyOrDash = (value: any) => value === null || value === undefined ? "-" : money(value);
                  const percent = (value: any) => `${(Number(value || 0) * 100).toFixed(1)}%`;
                  const labelize = (value: any) => String(value || "unknown").replace(/_/g, " ");
                  const totalGoogleCost = summary.googleCloudCostUsd ?? null;
                  const totalProviderCost = summary.totalProviderCostUsd ?? null;
                  const cashProfit = summary.cashProfitLossUsd ?? null;
                  const usagePricingMargin = summary.usagePricingMarginUsd ?? null;
                  const deepinfraActualCost = summary.deepinfraBillingCostNormalizationVerified && summary.deepinfraBillingTotalCostUsd !== null
                    ? Number(summary.deepinfraBillingTotalCostUsd)
                    : null;
                  const costStatus = !providerCostAvailable
                    ? {
                        title: "Provider cost unavailable",
                        body: "Google Billing export is not available for this range.",
                        className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
                      }
                    : Number(cashProfit || 0) < 0
                      ? {
                          title: "Losing money in this range",
                          body: "Provider cost is higher than cash received. Review helper/internal AI usage before scaling.",
                          className: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200",
                        }
                      : {
                          title: "Profitable in this range",
                          body: "Cash received is higher than combined provider cost for this range.",
                          className: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200",
                        };
                  const ownerCards = [
                    ["Cash received", summary.grossRevenue],
                    ["Paid wallet usage", summary.paidWalletUsage],
                    ["Free credit usage", summary.freeCreditUsage],
                    ["Total usage charges", summary.totalUsageCharges],
                    ["Google Cloud cost", totalGoogleCost],
                    [summary.deepinfraSpendLabel || "DeepInfra spend", deepinfraActualCost],
                    ["Total provider cost", totalProviderCost],
                    ["Cash profit/loss", cashProfit],
                    ["Usage pricing margin", usagePricingMargin],
                  ];
                  const ledgerCards = [
                    ["Total AI provider calls", aiLedgerDiagnostics.totalProviderCallLedgerCount],
                    ["Successful calls", aiLedgerDiagnostics.successCount],
                    ["Failed calls", aiLedgerDiagnostics.failureCount],
                    ["HTTP 499 calls", aiLedgerDiagnostics.http499Count],
                    ["Timeout / aborted", Number(aiLedgerDiagnostics.timeoutCount || 0) + Number(aiLedgerDiagnostics.abortCount || 0)],
                    ["Input tokens", aiLedgerDiagnostics.inputTokens],
                    ["Cached input tokens", aiLedgerDiagnostics.cachedTokens],
                    ["Output tokens", aiLedgerDiagnostics.outputTokens],
                    [displayLabels.helperBackgroundCalls || "Internal AI work", aiLedgerDiagnostics.internalAiWorkCallCount ?? aiLedgerDiagnostics.helperBackgroundCallCount],
                    ["Customer-visible calls", aiLedgerDiagnostics.customerVisibleCallCount],
                    [displayLabels.noSendFailedCalls || "No customer message / failed send", aiLedgerDiagnostics.backgroundNoCustomerMessageCallCount ?? aiLedgerDiagnostics.noSendFailedCallCount],
                    ["Customer-visible failed or blocked", aiLedgerDiagnostics.customerVisibleFailedOrBlockedCallCount],
                    ["Charged calls", aiLedgerDiagnostics.chargedCallCount],
                    [displayLabels.noChargeCalls || "Unreconciled or legacy calls", aiLedgerDiagnostics.unreconciledOrLegacyCallCount ?? aiLedgerDiagnostics.noChargeUnknownCallCount],
                    ...(Number(aiLedgerDiagnostics.confirmedSentWithoutMatchedChargeCount || 0) > 0
                      ? [["Confirmed sent without matched charge", aiLedgerDiagnostics.confirmedSentWithoutMatchedChargeCount]]
                      : []),
                  ];
                  const renderLedgerTable = (title: string, rows: any[], primaryKey: string, primaryLabel: string) => (
                    <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-950/50 overflow-x-auto">
                      <h4 className="mb-3 text-sm font-black text-gray-900 dark:text-neutral-100">{title}</h4>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-[10px] uppercase tracking-widest text-gray-400">
                            <th className="py-2">{primaryLabel}</th>
                            <th>Calls</th>
                            <th>Internal AI</th>
                            <th>No customer message / failed send</th>
                            <th>Charged</th>
                            <th>Unreconciled / legacy</th>
                            <th>Expected wallet value</th>
                          </tr>
                        </thead>
                        <tbody>{(rows || []).slice(0, 8).length === 0 ? (
                          <tr className="border-t border-gray-100 dark:border-neutral-800">
                            <td colSpan={7} className="py-3 font-bold text-gray-500 dark:text-neutral-400">No ledger rows for this range.</td>
                          </tr>
                        ) : (rows || []).slice(0, 8).map((row: any, index: number) => (
                          <tr key={`${title}-${row[primaryKey] || row.key || index}`} className="border-t border-gray-100 dark:border-neutral-800">
                            <td className="py-2 font-bold">{labelize(row[primaryKey] || row.name || row.email || row.accountId || row.key)}</td>
                            <td>{formatCompactCount(row.count)}</td>
                            <td>{formatCompactCount(row.helperBackgroundCalls)}</td>
                            <td>{formatCompactCount(row.noSendFailedCalls)}</td>
                            <td>{formatCompactCount(row.chargedCalls)}</td>
                            <td>{formatCompactCount(row.noChargeCalls)}</td>
                            <td>{money(row.expectedWalletCharge)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  );
                  
                  return (
                    <div className="admin-accounting-view space-y-5">
                       <div className="rounded-2xl border border-gray-200 bg-white/92 p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900/88">
                          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-300">Platform Accounting</p>
                              <h3 className="mt-1 text-xl font-black text-gray-950 dark:text-neutral-50">Financial Summary</h3>
                              <p className="mt-1 max-w-3xl text-xs font-medium text-gray-500 dark:text-neutral-400">
                                USD only. Admin accounts are excluded. Cash profit/loss uses cash received minus combined provider cost for the selected range.
                              </p>
                              <p className="mt-1 max-w-3xl text-[11px] font-medium text-gray-500 dark:text-neutral-500">
                                Manual/legacy active accounts have access but no linked paid payment record.
                              </p>
                              <p className="mt-1 max-w-3xl text-[11px] font-medium text-gray-500 dark:text-neutral-500">
                                Usage pricing margin compares usage charges with AI provider cost; it is not cash profit.
                              </p>
                              <p className="mt-1 max-w-3xl text-[11px] font-medium text-gray-500 dark:text-neutral-500">
                                DeepInfra import: {labelize(summary.deepinfraBillingStatus)} / {labelize(summary.deepinfraBillingSource)} / period {summary.deepinfraBillingSelectedPeriod?.from || "-"} to {summary.deepinfraBillingSelectedPeriod?.to || "current"}
                              </p>
                              <p className="mt-1 max-w-3xl text-[11px] font-medium text-gray-500 dark:text-neutral-500">
                                Imported from DeepInfra account usage. Monthly provider total for the selected months.
                              </p>
                            </div>
                          <div className="flex flex-wrap items-end gap-3">
                            <div>
                               <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 dark:text-neutral-600 mb-1">From Date</label>
                               <input type="date" value={accountingFrom} onChange={e => setAccountingFrom(e.target.value)} className="border border-gray-200 dark:border-neutral-800 rounded-lg p-2 text-sm font-bold" />
                            </div>
                            <div>
                               <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 dark:text-neutral-600 mb-1">To Date</label>
                               <input type="date" value={accountingTo} onChange={e => setAccountingTo(e.target.value)} className="border border-gray-200 dark:border-neutral-800 rounded-lg p-2 text-sm font-bold" />
                            </div>
                          </div>
                          </div>
                          
                           <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-bold ${costStatus.className}`}>
                             <div className="text-base font-black">{costStatus.title}</div>
                             <div className="mt-1 text-xs font-semibold">{costStatus.body}</div>
                           </div>

                           <div className="accounting-kpi-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                             {ownerCards.map(([label, value]) => (
                               <div key={String(label)} className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-950/50">
                                 <div className="mb-1 text-[11px] font-semibold leading-snug text-gray-500 dark:text-neutral-400">{String(label)}</div>
                                 <div className={`text-xl font-black ${String(label).includes("profit") || String(label).includes("margin") ? Number(value || 0) < 0 ? "text-red-600 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300" : "text-gray-900 dark:text-neutral-100"}`}>{moneyOrDash(value)}</div>
                               </div>
                             ))}
                          </div>
                       </div>

                       <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-neutral-800/50">
                         <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
                           <div>
                             <h3 className="font-black text-gray-900 dark:text-neutral-100">Provider Cost / Profit</h3>
                             <p className="text-xs font-bold text-gray-500 dark:text-neutral-400 mt-1">
                               Source: {String(summary.providerCostSource || "google_cloud_billing_bigquery").replace(/_/g, " ")} / {summary.providerCostStatus || "unavailable"} / reliability: {String(providerReliability).replace(/_/g, " ")}
                             </p>
                             <p className="text-[11px] font-medium text-gray-500 dark:text-neutral-500 mt-1">
                               Provider AI/Gemini cost is imported from Google Cloud and may include helper/background AI, summaries, retries, repairs, image extraction, Smart Brain, and failed or skipped no-send attempts that do not create separate wallet revenue.
                             </p>
                             <p className="text-[11px] font-medium text-gray-500 dark:text-neutral-500 mt-1">
                               Active export table: {summary.providerCostActiveExportTable || providerCost.activeExportTable || "-"} ({summary.providerCostExportType || providerCost.exportType || "unknown"})
                             </p>
                             {(summary.providerCostLastImportedAt || summary.providerCostCachedAt) ? (
                               <p className="text-[11px] font-medium text-gray-500 dark:text-neutral-500 mt-1">
                                 Last imported/cache: {formatDatePK(Number(summary.providerCostLastImportedAt || summary.providerCostCachedAt), true)}
                               </p>
                             ) : null}
                             {providerCostDiagnostics.rowCount !== undefined ? (
                               <p className="text-[11px] font-medium text-gray-500 dark:text-neutral-500 mt-1">
                                 BigQuery rows: {Number(providerCostDiagnostics.rowCount || 0).toLocaleString()} / Selected-range rows: {Number(summary.providerCostSelectedRangeRows ?? providerCostDiagnostics.selectedRangeRows ?? 0).toLocaleString()} / Usage range: {providerCostDiagnostics.minUsageStartTime || "-"} to {providerCostDiagnostics.maxUsageStartTime || "-"}
                               </p>
                             ) : null}
                             {(summary.providerCostStandardTableStatus || summary.providerCostDetailedTableStatus) ? (
                               <p className="text-[11px] font-medium text-gray-500 dark:text-neutral-500 mt-1">
                                 Detailed: {summary.providerCostDetailedTableStatus || "-"} / Standard: {summary.providerCostStandardTableStatus || "-"}
                               </p>
                             ) : null}
                           </div>
                           {!providerCostAvailable ? (
                             <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs font-bold text-amber-800 dark:text-amber-200">
                               {providerReliability === "stale_or_backfilling" ? "Provider export exists but has no rows in the selected range yet; BigQuery may still be backfilling." : "Provider cost unavailable or incomplete for the selected range."}
                             </div>
                           ) : null}
                           {summary.providerCostClassifierWarning ? (
                             <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs font-bold text-amber-800 dark:text-amber-200">
                               {summary.providerCostClassifierWarning}
                             </div>
                           ) : null}
                           {summary.providerCostProjectFilterWarning ? (
                             <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs font-bold text-red-800 dark:text-red-200">
                               {summary.providerCostProjectFilterWarning}
                             </div>
                           ) : null}
                         </div>
                         <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
                           <div className="bg-gray-50 dark:bg-neutral-950 border border-gray-100 dark:border-neutral-800 rounded-xl p-4">
                             <div className="text-gray-500 dark:text-neutral-400 font-bold text-[10px] uppercase tracking-widest mb-1">Gross revenue</div>
                             <div className="text-gray-900 dark:text-neutral-100 font-black text-2xl">{money(summary.grossRevenue)}</div>
                           </div>
                           <div className="bg-gray-50 dark:bg-neutral-950 border border-gray-100 dark:border-neutral-800 rounded-xl p-4">
                             <div className="text-gray-500 dark:text-neutral-400 font-bold text-[10px] uppercase tracking-widest mb-1">Total Google Cloud</div>
                             <div className="text-gray-900 dark:text-neutral-100 font-black text-2xl">{providerCostAvailable ? money(summary.totalGoogleCloudNetCost) : "-"}</div>
                           </div>
                           <div className="bg-gray-50 dark:bg-neutral-950 border border-gray-100 dark:border-neutral-800 rounded-xl p-4">
                             <div className="text-gray-500 dark:text-neutral-400 font-bold text-[10px] uppercase tracking-widest mb-1">AI/Gemini cost</div>
                             <div className="text-gray-900 dark:text-neutral-100 font-black text-2xl">{providerCostAvailable ? money(summary.estimatedProviderCost) : "-"}</div>
                           </div>
                           <div className="bg-gray-50 dark:bg-neutral-950 border border-gray-100 dark:border-neutral-800 rounded-xl p-4">
                             <div className="text-gray-500 dark:text-neutral-400 font-bold text-[10px] uppercase tracking-widest mb-1">Other/unclassified</div>
                             <div className="text-gray-900 dark:text-neutral-100 font-black text-2xl">{providerCostAvailable ? money(Number(summary.otherGoogleCloudCost || 0) + Number(summary.unclassifiedGoogleCost || 0)) : "-"}</div>
                           </div>
                           <div className="bg-gray-50 dark:bg-neutral-950 border border-gray-100 dark:border-neutral-800 rounded-xl p-4">
                             <div className="text-gray-500 dark:text-neutral-400 font-bold text-[10px] uppercase tracking-widest mb-1">Estimated profit/loss</div>
                             <div className={`font-black text-2xl ${Number(cashProfit || 0) < 0 ? "text-red-600 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}`}>
                               {moneyOrDash(cashProfit)}
                             </div>
                           </div>
                         </div>
                       </div>

                       <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-neutral-800/50">
                         <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                           <div>
                             <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-600 dark:text-amber-300">Diagnostic / estimated</p>
                             <h3 className="font-black text-gray-900 dark:text-neutral-100">AI Cost Leakage Diagnostics</h3>
                             <p className="mt-1 max-w-3xl text-xs font-medium text-gray-500 dark:text-neutral-400">
                               Diagnostic counts only. Not exact Google invoice cost or wallet revenue.
                             </p>
                           </div>
                           <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                             Internal AI share: {percent(aiLedgerDiagnostics.internalAiWorkShare ?? aiLedgerDiagnostics.helperBackgroundShare)} / Customer-visible failed or blocked: {percent(aiLedgerDiagnostics.customerVisibleProblemShare ?? aiLedgerDiagnostics.noSendFailedShare)}
                           </div>
                         </div>
                         <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                           {ledgerCards.map(([label, value]) => (
                             <div key={String(label)} className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-950/50">
                               <div className="mb-1 text-[11px] font-semibold leading-snug text-gray-500 dark:text-neutral-400">{String(label)}</div>
                               <div className="text-xl font-black text-gray-900 dark:text-neutral-100">{formatCompactCount(value)}</div>
                             </div>
                           ))}
                         </div>
                         <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
                           <h4 className="font-black text-blue-900 dark:text-blue-100">What this means</h4>
                           <p className="mt-1 text-xs font-semibold text-blue-800 dark:text-blue-200">
                             {aiLedgerDiagnostics.ownerFriendlyNote || "Most AI activity in this range is internal work such as summaries, learning, repairs, or background analysis. This is normal, but it still creates provider cost. Customer-visible failed or blocked AI calls are the real leakage risk."}
                           </p>
                           <p className="mt-2 text-xs font-semibold text-blue-800 dark:text-blue-200">{aiLedgerDiagnostics.reconciliationHelpText}</p>
                           <p className="mt-2 text-xs font-semibold text-blue-800 dark:text-blue-200">{aiLedgerDiagnostics.ledgerLimitationNote}</p>
                           {(ownerSummary.insights || []).length > 0 ? (
                             <ul className="mt-2 space-y-1 text-xs font-medium text-blue-800 dark:text-blue-200">
                               {ownerSummary.insights.map((insight: string) => <li key={insight}>{insight}</li>)}
                             </ul>
                           ) : null}
                         </div>
                         <div className="mt-5">
                           <h4 className="font-black text-gray-900 dark:text-neutral-100">Advanced technical diagnostics</h4>
                           <p className="mt-1 text-xs font-medium text-gray-500 dark:text-neutral-400">These tables are diagnostic/estimated ledger breakdowns for engineering review.</p>
                         </div>
                         <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
                           {renderLedgerTable("Top purposes", aiLedgerDiagnostics.topPurposesByCallCount, "purpose", "Purpose")}
                           {renderLedgerTable("Top categories", aiLedgerDiagnostics.topCategoriesByCallCount, "category", "Category")}
                           {renderLedgerTable("Top internal AI accounts", aiLedgerDiagnostics.topHelperBackgroundAccounts, "name", "Account")}
                           {renderLedgerTable("Customer-visible failed/blocked or internal no-message accounts", aiLedgerDiagnostics.topNoSendFailedAccounts, "name", "Account")}
                           {renderLedgerTable("Charge outcomes", aiLedgerDiagnostics.chargeOutcomeBreakdown, "chargeOutcome", "Outcome")}
                           {renderLedgerTable("Send outcomes", aiLedgerDiagnostics.finalSendOutcomeBreakdown, "finalSendOutcome", "Outcome")}
                           {renderLedgerTable("Wallet charge categories", aiLedgerDiagnostics.walletChargeCategoryBreakdown, "walletChargeCategory", "Wallet category")}
                         </div>
                         <p className="mt-3 text-[11px] font-medium text-gray-500 dark:text-neutral-500">
                           Expected wallet total in this section is diagnostic context from ledger metadata only: {money(aiLedgerDiagnostics.expectedWalletChargeTotal)}.
                         </p>
                       </div>
                       
                       <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-neutral-800/50">
                         <div className="flex items-center justify-between mb-4">
                           <h3 className="font-black text-gray-900 dark:text-neutral-100">Daily Accounting Summary</h3>
                           <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Revenue, usage, free credit</span>
                         </div>
                         <div className="h-72">
                           <ResponsiveContainer width="100%" height="100%">
                             <LineChart data={dailyRows}>
                               <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                               <XAxis dataKey="date" tick={{fontSize: 11}} />
                               <YAxis tick={{fontSize: 11}} />
                               <RechartsTooltip formatter={(value: any) => money(value)} />
                               <Legend />
                               <Line type="monotone" dataKey="grossRevenue" name="Gross revenue" stroke="#059669" strokeWidth={3} dot={false} />
                               <Line type="monotone" dataKey="providerCost" name="Provider cost" stroke="#dc2626" strokeWidth={2} dot={false} />
                               <Line type="monotone" dataKey="estimatedProfit" name="Estimated profit/loss" stroke="#0f766e" strokeWidth={2} dot={false} />
                               <Line type="monotone" dataKey="paidWalletUsage" name="Paid wallet usage" stroke="#2563eb" strokeWidth={2} dot={false} />
                               <Line type="monotone" dataKey="freeCreditUsage" name="Free credit usage" stroke="#f97316" strokeWidth={2} dot={false} />
                               <Line type="monotone" dataKey="totalUsageCharges" name="Total usage charges" stroke="#7c3aed" strokeWidth={2} dot={false} />
                             </LineChart>
                           </ResponsiveContainer>
                         </div>
                       </div>

                       {providerCostBreakdown.length > 0 ? (
                         <div className="accounting-table-card bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-gray-100 dark:border-neutral-800/50 overflow-x-auto">
                           <h3 className="font-black mb-3">Provider Cost Breakdown by Service/SKU</h3>
                           <table className="w-full text-sm">
                             <thead><tr className="text-left text-[10px] uppercase tracking-widest text-gray-400"><th className="py-2">Project</th><th>Service</th><th>SKU</th><th>Category</th><th>Gross</th><th>Credits</th><th>Net</th></tr></thead>
                             <tbody>{providerCostBreakdown.slice(0, 15).map((row: any, index: number) => (
                               <tr key={`${row.serviceDescription}-${row.skuDescription}-${index}`} className="border-t border-gray-100 dark:border-neutral-800">
                                 <td className="py-2 text-xs font-bold text-gray-500 dark:text-neutral-400">{row.projectId || "-"}</td>
                                 <td className="font-bold">{row.serviceDescription || "Google AI"}</td>
                                 <td className="text-xs text-gray-500 dark:text-neutral-400">{row.skuDescription || "-"}</td>
                                 <td className="text-xs font-bold text-gray-500 dark:text-neutral-400">{String(row.matchedCategory || "unclassified_google").replace(/_/g, " ")}</td>
                                 <td>{money(row.grossProviderCost)}</td>
                                 <td>{money(row.credits)}</td>
                                 <td className="font-black">{money(row.netProviderCost)}</td>
                               </tr>
                             ))}</tbody>
                           </table>
                         </div>
                       ) : null}

                       <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                         <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-gray-100 dark:border-neutral-800/50">
                           <h3 className="font-black mb-3">Cash Revenue By Source</h3>
                           {Object.entries(revenueBySource).map(([key, value]) => (
                             <div key={key} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-neutral-800 last:border-0">
                               <span className="text-sm font-bold text-gray-600 dark:text-neutral-300">{key.replace(/([A-Z])/g, " $1")}</span>
                               <span className="font-black">{money(value)}</span>
                             </div>
                           ))}
                         </div>
                         <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-gray-100 dark:border-neutral-800/50">
                           <h3 className="font-black mb-3">Usage Consumption</h3>
                           {[
                             ["Paid wallet usage consumed", usageConsumption.paidWallet],
                             ["Free credit usage consumed", usageConsumption.freeCredit],
                             ["Total usage charges", usageConsumption.totalUsageCharges],
                           ].map(([label, value]) => (
                             <div key={String(label)} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-neutral-800 last:border-0">
                               <span className="text-sm font-bold text-gray-600 dark:text-neutral-300">{String(label)}</span>
                               <span className="font-black">{money(value)}</span>
                             </div>
                           ))}
                           {freeVsPaidUsage.length > 0 ? (
                             <p className="pt-2 text-[10px] font-bold text-amber-600 dark:text-amber-300 uppercase tracking-widest">Source split is estimated for historical mixed balances.</p>
                           ) : null}
                         </div>
                         <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-gray-100 dark:border-neutral-800/50">
                           <h3 className="font-black mb-3">Reconciliation Warnings</h3>
                           {(accountingData.reconciliationWarnings || []).map((warning: string) => (
                             <div key={warning} className="text-xs font-medium text-amber-700 dark:text-amber-300 py-1">{warning}</div>
                           ))}
                         </div>
                       </div>

                       <div className="accounting-table-card bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-gray-100 dark:border-neutral-800/50 overflow-x-auto">
                         <h3 className="font-black mb-3">Cache Coverage by AI Path</h3>
                         <table className="w-full text-sm">
                           <thead><tr className="text-left text-[10px] uppercase tracking-widest text-gray-400"><th className="py-2">Purpose/path</th><th>Model</th><th>Provider</th><th>Calls</th><th>Eligible</th><th>Attempted</th><th>Attached</th><th>Hits</th><th>Misses</th><th>Cached tokens</th><th>Input</th><th>Output</th><th>Skipped reason</th><th>Last used</th></tr></thead>
                           <tbody>{cacheCoverageByPurpose.length === 0 ? (
                             <tr className="border-t border-gray-100 dark:border-neutral-800">
                               <td colSpan={14} className="py-4 text-sm font-bold text-gray-500 dark:text-neutral-400">No cache-aware AI calls recorded for this date range yet.</td>
                             </tr>
                           ) : cacheCoverageByPurpose.slice(0, 12).map((row: any) => {
                             const skippedReason = Object.entries(row.skippedReasons || {}).sort((a: any, b: any) => Number(b[1] || 0) - Number(a[1] || 0))[0];
                             return (
                               <tr key={`${row.path || row.purpose}-${row.provider}-${row.model}`} className="border-t border-gray-100 dark:border-neutral-800">
                                 <td className="py-2 font-bold">{String(row.path || row.purpose || "unknown").replace(/_/g, " ")}</td>
                                 <td className="text-xs text-gray-500 dark:text-neutral-400">{row.model || "-"}</td>
                                 <td className="text-xs text-gray-500 dark:text-neutral-400">{String(row.provider || "-").replace(/_/g, " ")}</td>
                                 <td title={Number(row.calls || 0).toLocaleString()}>{formatCompactCount(row.calls)}</td>
                                 <td title={Number(row.eligible || 0).toLocaleString()}>{formatCompactCount(row.eligible)}</td>
                                 <td title={Number(row.attempted || 0).toLocaleString()}>{formatCompactCount(row.attempted)}</td>
                                 <td title={Number(row.attached || 0).toLocaleString()}>{formatCompactCount(row.attached)}</td>
                                 <td title={Number(row.hits || 0).toLocaleString()}>{formatCompactCount(row.hits)}</td>
                                 <td title={Number(row.misses || 0).toLocaleString()}>{formatCompactCount(row.misses)}</td>
                                 <td title={Number(row.cachedTokens || 0).toLocaleString()}>{formatCompactCount(row.cachedTokens)}</td>
                                 <td title={Number(row.inputTokens || 0).toLocaleString()}>{formatCompactCount(row.inputTokens)}</td>
                                 <td title={Number(row.outputTokens || 0).toLocaleString()}>{formatCompactCount(row.outputTokens)}</td>
                                 <td className="text-xs text-gray-500 dark:text-neutral-400">{skippedReason ? `${String(skippedReason[0]).replace(/_/g, " ")} (${skippedReason[1]})` : "-"}</td>
                                 <td className="text-xs text-gray-500 dark:text-neutral-400">{row.lastUsedAt ? formatDatePK(Number(row.lastUsedAt), true) : "-"}</td>
                               </tr>
                             );
                           })}</tbody>
                         </table>
                       </div>

                       <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                         <div className="accounting-table-card bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-gray-100 dark:border-neutral-800/50 overflow-x-auto">
                           <h3 className="font-black mb-3">Top Spending Clients</h3>
                           <table className="w-full text-sm">
                             <thead><tr className="text-left text-[10px] uppercase tracking-widest text-gray-400"><th className="py-2">Client</th><th>Paid</th><th>Free</th><th>Total</th></tr></thead>
                             <tbody>{topClients.slice(0, 10).map((client: any) => (
                               <tr key={client.userId} className="border-t border-gray-100 dark:border-neutral-800">
                                 <td className="py-2 font-bold">{client.name || client.email || client.userId}{client.internalTest ? <span className="ml-2 text-[9px] text-amber-500">TEST</span> : null}</td>
                                 <td>{money(client.paidWalletUsage)}</td>
                                 <td>{money(client.freeCreditUsage)}</td>
                                 <td className="font-black">{money(client.totalUsageCharges)}</td>
                               </tr>
                             ))}</tbody>
                           </table>
                         </div>
                         <div className="accounting-table-card bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-gray-100 dark:border-neutral-800/50 overflow-x-auto">
                             <h3 className="font-black mb-3">Usage Category Breakdown</h3>
                           <table className="w-full text-sm">
                             <thead><tr className="text-left text-[10px] uppercase tracking-widest text-gray-400"><th className="py-2">Category</th><th>Units</th><th>Cost</th></tr></thead>
                             <tbody>{usageByCategory.slice(0, 12).map((row: any) => (
                               <tr key={row.category || row.type} className="border-t border-gray-100 dark:border-neutral-800">
                                 <td className="py-2">
                                   <div className="font-bold">{row.category || row.type}</div>
                                   {(() => {
                                     const usageAction = resolveUsageBillingAction(row.category || row.type);
                                     if (!usageAction) return null;
                                     return (
                                       <div className="mt-1 text-[10px] font-bold text-amber-600 dark:text-amber-300">
                                         {[buildUsageCompactChargeLabel(usageAction), buildUsageSavingsLabel(usageAction)].filter(Boolean).join(" · ")}
                                       </div>
                                     );
                                   })()}
                                 </td>
                                 <td>{Number(row.amount || 0)}</td>
                                 <td className="font-black">{money(row.cost)}</td>
                               </tr>
                             ))}</tbody>
                           </table>
                         </div>
                         <div className="accounting-table-card bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-gray-100 dark:border-neutral-800/50 overflow-x-auto">
                           <h3 className="font-black mb-3">Free Credit Usage By Client</h3>
                           <table className="w-full text-sm">
                             <thead><tr className="text-left text-[10px] uppercase tracking-widest text-gray-400"><th className="py-2">Client</th><th>Free Credit</th><th>Status</th></tr></thead>
                             <tbody>{freeClients.slice(0, 10).map((client: any) => (
                               <tr key={client.userId} className="border-t border-gray-100 dark:border-neutral-800">
                                 <td className="py-2 font-bold">{client.name || client.email || client.userId}</td>
                                 <td>{money(client.freeCreditUsage)}</td>
                                 <td className="text-amber-500 text-[10px] uppercase font-black">{client.splitStatus}</td>
                               </tr>
                             ))}</tbody>
                           </table>
                         </div>
                         <div className="accounting-table-card bg-red-50/70 dark:bg-red-950/20 p-5 rounded-2xl border border-red-100 dark:border-red-900/60 overflow-x-auto">
                           <h3 className="font-black mb-1 text-red-800 dark:text-red-200">Payment / Subscription Errors</h3>
                           <p className="mb-3 text-xs font-medium text-red-700 dark:text-red-300">Payment warnings are separated from revenue and usage tables for faster review.</p>
                           <table className="w-full text-sm">
                             <thead><tr className="text-left text-[10px] uppercase tracking-widest text-gray-400"><th className="py-2">Account</th><th>Type</th><th>Latest description</th><th>First</th><th>Last</th><th>Count</th></tr></thead>
                             <tbody>{paymentErrors.slice(0, 10).map((row: any, index: number) => (
                               <tr key={`${row.userId || row.timestamp}-${row.type}-${row.date}-${index}`} className="border-t border-gray-100 dark:border-neutral-800">
                                 <td className="py-2 font-bold">{row.account || row.email || row.userId || row.date}</td>
                                 <td className="font-bold">{row.type}</td>
                                 <td className="text-xs text-gray-500 dark:text-neutral-400">{row.latestDescription || row.description}</td>
                                 <td>{row.firstSeen ? new Date(Number(row.firstSeen) * 1000).toISOString().slice(0, 10) : row.date}</td>
                                 <td>{row.lastSeen ? new Date(Number(row.lastSeen) * 1000).toISOString().slice(0, 10) : row.date}</td>
                                 <td className="font-black">{Number(row.count || 1)}</td>
                               </tr>
                             ))}</tbody>
                           </table>
                         </div>
                       </div>
                    </div>
                  );
                })()
              )}

              {adminTab === 'dashboard' && (() => {
                const clients = (adminUsers || []).filter(isRegularClientAccount);
                const totalWallet = clients.reduce((sum, u) => sum + getRealCustomerWalletBalance(u), 0);
                const totalUsage = clients.reduce((sum, u) => sum + getRealCustomerUsageRevenue(u), 0);
                const totalBots = clients.reduce((sum, u) => sum + (u.botCount || 0), 0);

                return (
                 <div className="flex flex-col gap-4">
                  {isSuperAdmin && (
                    <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-amber-200 dark:border-amber-800 shadow-md mb-2 overflow-hidden relative">
                      <div className="absolute top-0 right-0 p-2">
                                <div className={`text-[8px] font-black px-2 py-0.5 rounded-full ${appStatus?.environment === 'PRODUCTION' ? 'bg-red-900 text-white' : 'bg-gray-100 dark:bg-neutral-800/50 text-gray-400 dark:text-neutral-600'}`}>
                                   ENVIRONMENT: {appStatus?.environment || '...'}
                                </div>
                      </div>
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${appStatus?.status === 'LIVE' ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600' : 'bg-amber-50 dark:bg-amber-950/50 text-amber-600'}`}>
                          {appStatus?.status === 'LIVE' ? <Zap className="w-6 h-6" /> : <MonitorPlay className="w-6 h-6" />}
                        </div>
                        <div>
                          <h3 className="font-black text-gray-900 dark:text-neutral-50 tracking-tight">System Operational Status: {appStatus?.status === 'LIVE' ? 'ONLINE' : 'MAINTENANCE'}</h3>
                          <p className="text-[10px] font-bold text-gray-400 dark:text-neutral-600 uppercase tracking-widest">
                            Connected DB: <span className="text-amber-600 font-black">{appStatus?.databaseId || '...'}</span>
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-neutral-800 rounded-xl border border-gray-100 dark:border-neutral-800/50">
                           <div>
                              <div className="text-sm font-black text-gray-800 dark:text-neutral-200">Operational Mode Toggle</div>
                              <div className="text-[10px] text-gray-500 dark:text-neutral-500 font-medium italic">Flipping to LIVE triggers a schema sync from DEV to verification.</div>
                           </div>
                           <div className="flex gap-2">
                             <button
                               onClick={async () => {
                                 try {
                                   setAppSuccess("Starting manual schema sync...");
                                   const reqId = currentUserId;
                                   if (!reqId) throw new Error("Requester identity not found. Please refresh.");

                                   const res = await fetch("/api/admin/sync-schema", { 
                                     method: "POST", 
                                     headers: {"Content-Type": "application/json"}, 
                                     body: JSON.stringify({ requesterId: reqId }) 
                                   });
                                   const data = await res.json();
                                   if (res.ok) setAppSuccess("Schema successfully synced to LIVE database.");
                                   else setAppError(data.error || "Sync failed.");
                                 } catch(e: any) {
                                   setAppError("Sync request failed: " + e.message);
                                 }
                                 setTimeout(() => { setAppSuccess(null); setAppError(null); }, 5000);
                               }}
                               className="px-4 py-2 rounded-lg text-xs font-black uppercase bg-white dark:bg-neutral-900 text-emerald-600 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:bg-emerald-950/50 flex items-center gap-2"
                             >
                               <RefreshCw className="w-3 h-3" />
                               Sync Schema
                             </button>
                           </div>
                        </div>
                        
                        {appStatus?.status === 'MAINTENANCE' && (
                           <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium bg-amber-50 dark:bg-amber-950/50 p-3 rounded-lg flex items-start gap-2">
                             <AlertTriangle className="w-4 h-4 shrink-0" />
                             Note: The app is currently connected to the STAGING database. Production data is hidden.
                           </p>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-indigo-100 shadow-sm">
                      <div className="text-3xl font-black text-indigo-900">{clients.length}</div>
                      <div className="text-xs font-bold text-indigo-600 uppercase tracking-widest mt-1">Total Clients</div>
                    </div>
                    <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-emerald-100 dark:border-emerald-900 shadow-sm">
                      <div className="text-3xl font-black text-emerald-900 dark:text-emerald-200">${totalUsage.toFixed(2)}</div>
                      <div className="text-xs font-bold text-emerald-600 uppercase tracking-widest mt-1">Billed Usage Revenue</div>
                    </div>
                    <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-blue-100 dark:border-blue-900 shadow-sm">
                      <div className="text-3xl font-black text-blue-900 dark:text-blue-200">${totalWallet.toFixed(2)}</div>
                      <div className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest mt-1">Paid Customer Wallets</div>
                    </div>
                    <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-amber-100 dark:border-amber-900 shadow-sm">
                      <div className="text-3xl font-black text-amber-900 dark:text-amber-200">{totalBots}</div>
                      <div className="text-xs font-bold text-amber-600 uppercase tracking-widest mt-1">Client Bots Running</div>
                    </div>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-950/50 rounded-xl p-5 border border-emerald-200 dark:border-emerald-800">
                    <h3 className="font-bold text-emerald-800 dark:text-emerald-200 mb-2">Accounting Summary</h3>
                    <p className="text-sm text-emerald-700 dark:text-emerald-300">Real Customer Dollars: <strong>${(totalUsage + totalWallet).toFixed(2)}</strong></p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">* Excludes admin accounts and removes setup free credit from usage and wallet totals.</p>
                  </div>
                 </div>
                );
              })()}

              {adminTab === 'users' && (
                <AdminUsersPage>
                <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800/50 overflow-hidden">
                  <div className="p-4 border-b border-gray-100 dark:border-neutral-800/50 bg-gray-50 dark:bg-neutral-800 flex items-center justify-between">
                    <input 
                      type="text" 
                      placeholder="Search accounts by name or email..." 
                      value={adminSearchQuery}
                      onChange={(e) => setAdminSearchQuery(e.target.value)}
                      className="w-full max-w-md bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 p-2.5 rounded-xl text-sm font-medium text-gray-900 dark:text-neutral-50 outline-none focus:border-emerald-300 transition-colors shadow-sm"
                    />
                  </div>
                  {isAdminLoading ? (
                    <div className="p-8 text-center text-gray-400 dark:text-neutral-600 font-medium">Loading user data...</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-neutral-800 border-b border-gray-100 dark:border-neutral-800/50 text-[10px] uppercase tracking-widest text-gray-500 dark:text-neutral-500 font-black">
                            <th className="p-4">User</th>
                            {isSuperAdmin && <th className="p-4">Role</th>}
                            <th className="p-4">Wallet & Setup</th>
                            <th className="p-4">Bots running</th>
                            <th className="p-4 relative">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {adminUsers.filter((u: any) => 
                            (u.name && u.name.toLowerCase().includes(adminSearchQuery.toLowerCase())) || 
                            (u.email && u.email.toLowerCase().includes(adminSearchQuery.toLowerCase()))
                          ).map((u: any) => (
                            <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-neutral-800/80 transition-colors">
                              <td className="p-4">
                                <div className="font-bold text-gray-900 dark:text-neutral-50 text-sm">{u.name}</div>
                                <div className="text-xs text-gray-500 dark:text-neutral-500">{u.email}</div>
                                <div className="text-[10px] text-gray-400 dark:text-neutral-600 mt-1">Joined: {formatDatePK(u.created_at)}</div>
                              </td>
                              {isSuperAdmin && (
                                <td className="p-4">
                                  <select 
                                    value={u.role || 'user'}
                                    onChange={async (e) => {
                                        await fetch('/api/admin/roles/update', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ requesterId: currentUserId, targetUserId: u.id, newRole: e.target.value })
                                        });
                                        loadAdminUsers();
                                    }}
                                    className="text-xs border border-gray-200 dark:border-neutral-800 rounded px-2 py-1 bg-gray-50 dark:bg-neutral-800 text-gray-700 dark:text-neutral-300 outline-none focus:border-blue-500"
                                  >
                                    <option value="user">User</option>
                                    <option value="admin">Admin</option>
                                    <option value="super_admin">Super Admin</option>
                                  </select>
                                </td>
                              )}
                              <td className="p-4">
                                <div className="flex flex-col gap-1 mb-3">
                                   <div className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded w-max">
                                      Plan: {PLANS[u.plan_id || 'starter_plan']?.name}
                                   </div>
                                   {u.plan_expiry ? (
                                     <span className={`text-[10px] ${normalizeTime(u.plan_expiry) > now() ? 'text-green-500' : 'text-red-500 dark:text-red-500 font-bold'}`}>
                                       Plan exp: {formatDatePK(u.plan_expiry)}
                                     </span>
                                   ) : (
                                     <span className="text-[10px] text-gray-400 dark:text-neutral-600">No active paid plan</span>
                                   )}
                                   {u.trial_expires_at ? (
                                     <span className={`text-[10px] ${normalizeTime(u.trial_expires_at) > now() ? 'text-green-500' : 'text-red-500 dark:text-red-500 font-bold'}`}>
                                       Trial exp: {formatDatePK(u.trial_expires_at)}
                                     </span>
                                   ) : (
                                     <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">Trial expiry missing</span>
                                   )}
                                </div>
                                <div className="flex items-center gap-2 mb-2 font-mono text-sm font-bold text-gray-700 dark:text-neutral-300">
                                  <span className="w-20">W: ${(u.wallet_balance || 0).toFixed(2)}</span>
                                  <button className="text-[10px] text-blue-500 underline" onClick={() => {
                                    setAdminPromptValue((u.wallet_balance || 0).toString());
                                    setAdminEditPrompt({ type: 'wallet', userId: u.id, currentValue: (u.wallet_balance || 0).toString(), userName: u.name });
                                  }}>Edit</button>
                                </div>
                                {isSuperAdmin && (
                                  <div className="mt-2 rounded-lg border border-blue-100 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/20 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="text-[11px] font-black uppercase tracking-widest text-blue-700 dark:text-blue-300">Wallet billing:</div>
                                        <div className="text-xs font-semibold text-blue-900 dark:text-blue-100 mt-1">
                                          {u.wallet_billing_purchases_enabled ? "Enabled" : "Disabled"}
                                        </div>
                                        <p className="mt-1 text-[11px] leading-5 text-blue-700/90 dark:text-blue-200/90">
                                          Allow this account to pay for plans, renewals, add-ons, and setup from wallet balance.
                                        </p>
                                      </div>
                                      <button
                                        onClick={() => toggleWalletBillingPurchases(String(u.id || u.$id || ""), !Boolean(u.wallet_billing_purchases_enabled))}
                                        disabled={isSaving}
                                        className={`shrink-0 px-3 py-2 rounded-lg text-xs font-black transition-colors ${u.wallet_billing_purchases_enabled ? "bg-blue-600 text-white hover:bg-blue-700" : "border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/40"}`}
                                      >
                                        {u.wallet_billing_purchases_enabled ? "Enabled" : "Disabled"}
                                      </button>
                                    </div>
                                  </div>
                                )}
                                <div className="flex flex-col gap-1 mt-2 text-xs text-gray-500 dark:text-neutral-500">
                                  <div>
                                    Products: {u.extra_product_bundles || 0}
                                    {u.product_subscription_expiry && normalizeTime(u.product_subscription_expiry) > now() ? 
                                      <span className="text-[10px] text-green-500 block">Exp: {formatDatePK(u.product_subscription_expiry)}</span>
                                      : <span className="text-[10px] text-red-500 dark:text-red-500 block">None / Expired</span>}
                                  </div>
                                  <div>
                                    Instances: {u.extra_instances || 0}
                                    {u.instance_subscription_expiry && normalizeTime(u.instance_subscription_expiry) > now() ? 
                                      <span className="text-[10px] text-green-500 block">Exp: {formatDatePK(u.instance_subscription_expiry)}</span>
                                      : <span className="text-[10px] text-red-500 dark:text-red-500 block">None / Expired</span>}
                                  </div>
                                </div>
                              </td>
                              <td className="p-4 text-sm font-medium text-gray-600 dark:text-neutral-400">
                                <div className="flex items-center gap-2 mb-2">
                                  <Bot className="w-4 h-4 text-gray-400 dark:text-neutral-600" /> {u.botCount || 0} instances
                                </div>
                                <div className="flex flex-col gap-1">
                                  {u.bots?.map((b: any, i: number) => (
                                    <div key={b.$id || b.id || i} className="flex items-center justify-between bg-gray-50 dark:bg-neutral-800 border border-gray-100 dark:border-neutral-800/50 rounded px-2 py-1 text-xs">
                                      <span className="font-mono text-gray-500 dark:text-neutral-500">{b.jid ? b.jid.split("@")[0] : 'Scanning...'}</span>
                                      <button 
                                        onClick={() => setAdminConfirmAction({ type: 'delink', userId: u.id, botId: b.id, identifier: b.jid || b.id })}
                                        className="text-red-500 dark:text-red-500 hover:text-red-600 dark:text-red-400 ml-2"
                                        title="Delink Number"
                                      >
                                        &times;
                                      </button>
                                    </div>
                                  ))}
                                  {u.config?.proxy_url && u.config?.use_dedicated_proxy !== 1 && (
                                    <div className="mt-1 p-2 bg-gray-50 dark:bg-neutral-800 border border-gray-100 dark:border-neutral-800/50 rounded-lg">
                                       <div className="text-[8px] font-bold text-gray-400 dark:text-neutral-400 uppercase mb-1">Custom Proxy</div>
                                       <div className="text-[9px] font-mono text-gray-500 dark:text-neutral-400 break-all">{u.config.proxy_url.replace(/:[^:@]+@/, ':***@')}</div>
                                    </div>
                                  )}
                                  {u.assigned_proxy_url && u.config?.use_dedicated_proxy === 1 && (
                                    <div className="mt-1 p-2 bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900 rounded-lg">
                                       <div className="text-[8px] font-bold text-blue-600 dark:text-blue-400 dark:text-blue-300 uppercase mb-1">System Proxy</div>
                                       <div className="text-[9px] font-mono text-blue-600 dark:text-blue-400 dark:text-blue-300 break-all">{u.assigned_proxy_url.replace(/:[^:@]+@/, ':***@')}</div>
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="p-4">
                                <details className="relative">
                                  <summary className="flex cursor-pointer list-none items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-black text-gray-700 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
                                    Manage
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </summary>
                                  <div className="mt-2 flex min-w-44 flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2 dark:border-neutral-800 dark:bg-neutral-950">
                                    <button
                                      onClick={() => {
                                        setAdminConfirmAction({ type: 'loginAs', userId: u.id, identifier: u.email, user: u });
                                      }}
                                      className="w-full flex items-center justify-center gap-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 border border-emerald-100 dark:border-emerald-900 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-100 dark:bg-emerald-900/60 transition-colors"
                                    >
                                      <Shield className="w-3.5 h-3.5" /> Access
                                    </button>
                                    <button
                                      onClick={() => extendTrialForUser(u.id)}
                                      disabled={Boolean(u.trial_extension_used)}
                                      title={u.trial_extension_used ? "Trial extension already used (one-time lifetime limit)" : "Extend Trial (30 Days)"}
                                      className={`w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                        u.trial_extension_used
                                          ? "bg-gray-100 dark:bg-neutral-800 text-gray-400 dark:text-neutral-500 border border-gray-200 dark:border-neutral-700 cursor-not-allowed"
                                          : "bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-300 border border-blue-100 dark:border-blue-900 hover:bg-blue-100 dark:hover:bg-blue-900/60"
                                      }`}
                                    >
                                      <Clock className="w-3.5 h-3.5" /> {u.trial_extension_used ? "Extension Used" : "Extend Trial"}
                                    </button>
                                  </div>
                                </details>
                              </td>
                            </tr>
                          ))}
                          {adminUsers.filter((u: any) => 
                            (u.name && u.name.toLowerCase().includes(adminSearchQuery.toLowerCase())) || 
                            (u.email && u.email.toLowerCase().includes(adminSearchQuery.toLowerCase()))
                          ).length === 0 && (
                            <tr>
                              <td colSpan={isSuperAdmin ? 5 : 4} className="p-8 text-center text-gray-500 dark:text-neutral-500 text-sm font-medium">No users found match your search.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                </AdminUsersPage>
              )}

              {adminTab === 'logs' && (
                <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800/50 overflow-hidden">
                  <div className="p-5 border-b border-gray-100 dark:border-neutral-800/50 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-gray-800 dark:text-neutral-200 flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-amber-500" /> Admin Action Logs
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-neutral-500 mt-1">Showing daily log files of all administrative actions (Last 10 days).</p>
                    </div>
                    <button onClick={loadAdminLogs} className="p-2 text-gray-400 dark:text-neutral-600 hover:text-emerald-500 transition-colors">
                      <RefreshCw className={`w-5 h-5 ${isLogsLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  
                  {isLogsLoading ? (
                    <div className="p-20 flex justify-center items-center">
                      <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
                    </div>
                  ) : adminLogs.length === 0 ? (
                    <div className="p-20 text-center flex flex-col items-center gap-3">
                      <FileX className="w-12 h-12 text-gray-200" />
                      <div className="text-gray-400 dark:text-neutral-600 font-bold">No admin logs recorded yet</div>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {adminLogs.map((file) => (
                        <div key={file.name} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-amber-50 dark:bg-amber-950/50 rounded-lg flex items-center justify-center text-amber-600">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="font-bold text-sm text-gray-800 dark:text-neutral-200">{file.date}</div>
                              <div className="text-[10px] uppercase font-black tracking-widest text-gray-400 dark:text-neutral-600">{(file.size / 1024).toFixed(1)} KB • Action Log</div>
                            </div>
                          </div>
                          <button 
                            onClick={() => window.open(`/api/admin/logs/download/${file.date}`, '_blank')}
                            className="bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-100 dark:bg-emerald-900/60 transition-all flex items-center gap-2"
                          >
                            <Download className="w-4 h-4" /> Download
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {adminTab === 'proxies' && (() => {
                const proxyList = Array.isArray(adminSystemProxies) ? adminSystemProxies : [];
                const proxyStats = calculateSystemProxyPoolStats(proxyList);

                return (
                <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800/50 overflow-hidden">
                  <div className="p-5 border-b border-gray-100 dark:border-neutral-800/50 flex items-center justify-between bg-gray-50 dark:bg-neutral-800/50">
                    <div>
                      <h3 className="font-bold text-gray-800 dark:text-neutral-200 flex items-center gap-2">
                        <Wifi className="w-5 h-5 text-blue-500" /> System Proxies Pool
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-neutral-500 mt-1 font-medium">Add dedicated proxies. System will auto-assign these to instances (max 3 per proxy). A proxy must be 'Enabled' to be assigned to new instances. Note: Free proxies die frequently. The app automatically rotates assigned instances if it detects connection drops.</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={async () => {
                         try {
                           const res = await fetch("/api/admin/system-proxies/check-all", { method: "POST", headers: { "x-requester-id": currentUserId || "" } });
                           const data = await res.json();
                           setAppSuccess(data.message);
                           setTimeout(() => setAppSuccess(null), 3000);
                         } catch (e: any) {
                           setAppError(e.message);
                           setTimeout(() => setAppError(null), 3000);
                         }
                      }} className="bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-emerald-600 transition-colors whitespace-nowrap">
                        Check All Proxies
                      </button>
                      <button onClick={loadSystemProxies} className="text-gray-400 dark:text-neutral-600 hover:text-emerald-500 transition-colors px-3 py-1 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700 shadow-sm" title="Refresh List">
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-0 border-b border-gray-100 dark:border-neutral-800/50 bg-white dark:bg-neutral-900">
                    <div className="p-4 border-b md:border-b-0 md:border-r border-gray-100 dark:border-neutral-800/50">
                      <div className="text-[10px] uppercase font-black tracking-widest text-gray-400 dark:text-neutral-600 mb-1">Total Proxies</div>
                      <div className="text-2xl font-black text-gray-800 dark:text-neutral-200">{proxyStats.total}</div>
                    </div>
                    <div className="p-4 border-b md:border-b-0 md:border-r border-gray-100 dark:border-neutral-800/50">
                      <div className="text-[10px] uppercase font-black tracking-widest text-emerald-500 mb-1">Working</div>
                      <div className="text-2xl font-black text-emerald-600">{proxyStats.working}</div>
                    </div>
                    <div className="p-4 border-r border-gray-100 dark:border-neutral-800/50">
                      <div className="text-[10px] uppercase font-black tracking-widest text-red-400 mb-1">Dead / Error</div>
                      <div className="text-2xl font-black text-red-500 dark:text-red-500">{proxyStats.error}</div>
                    </div>
                    <div className="p-4 border-r border-gray-100 dark:border-neutral-800/50">
                      <div className="text-[10px] uppercase font-black tracking-widest text-blue-400 mb-1">Instances Used</div>
                      <div className="text-2xl font-black text-blue-600 dark:text-blue-400">{proxyStats.connectedInstances}</div>
                    </div>
                    <div className="p-4">
                      <div className="text-[10px] uppercase font-black tracking-widest text-purple-400 mb-1">Quota Left</div>
                      <div className="text-2xl font-black text-purple-600">{proxyStats.quotaLeft} <span className="text-sm text-gray-400 dark:text-neutral-600 font-medium">/ {proxyStats.totalQuota}</span></div>
                    </div>
                  </div>
                  
                  <div className="p-5 border-b border-gray-100 dark:border-neutral-800/50">
                    <div className="flex flex-col gap-4">
                      <div className="flex gap-3">
                        <input 
                          type="text" 
                          value={newSystemProxyUrl} 
                          onChange={e => setNewSystemProxyUrl(e.target.value)} 
                          placeholder="socks5://user:pass@ip:port or ip:port" 
                          className="flex-1 bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-800 rounded-lg p-2.5 text-sm font-bold text-gray-700 dark:text-neutral-300 outline-none focus:border-blue-500"
                        />
                        <button 
                          onClick={async () => {
                            if (!newSystemProxyUrl) return;
                            try {
                              await fetch("/api/admin/system-proxies", {
                                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: newSystemProxyUrl, requesterId: currentUserId })
                              });
                              setNewSystemProxyUrl("");
                              loadSystemProxies();
                            } catch(e) { console.error(e); }
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-6 py-2.5 rounded-lg transition-all whitespace-nowrap"
                        >
                           Add Proxy
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-950/50 p-3 rounded-lg border border-blue-100 dark:border-blue-900">
                        <div className="flex-1">
                          <label className="text-xs font-bold text-blue-900 dark:text-blue-200 block mb-1">Auto-Sync from Webshare.io</label>
                          <input 
                            type="text" 
                            value={webshareToken} 
                            onChange={e => setWebshareToken(e.target.value)} 
                            placeholder="Enter Webshare API Token" 
                            className="w-full bg-white dark:bg-neutral-900 border border-blue-200 dark:border-blue-800 rounded-md p-1.5 text-xs font-mono text-gray-700 dark:text-neutral-300 outline-none focus:border-blue-500"
                          />
                        </div>
                        <button 
                          onClick={async () => {
                            if (!webshareToken) return alert("Please enter a Webshare Token");
                            setIsSyncingWebshare(true);
                            try {
                              const res = await fetch("/api/admin/sync-webshare", {
                                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: webshareToken, requesterId: currentUserId })
                              });
                              const data = await res.json();
                              if (data.error) alert(data.error);
                              else alert(`Successfully synchronized ${data.added} proxies from Webshare.io`);
                              loadSystemProxies();
                            } catch(e: any) { alert(e.message); }
                            setIsSyncingWebshare(false);
                          }}
                          disabled={isSyncingWebshare}
                          className="bg-blue-100 dark:bg-blue-900/60 hover:bg-blue-200 text-blue-700 dark:text-blue-300 font-bold text-xs px-4 py-2 mt-4 rounded transition-all whitespace-nowrap disabled:opacity-50"
                        >
                           {isSyncingWebshare ? "Syncing..." : "Sync Proxies"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
                    {adminSystemProxies.length === 0 ? (
                      <div className="p-12 text-center text-gray-400 dark:text-neutral-600 font-bold">No proxies added yet</div>
                    ) : (
                      adminSystemProxies.map((p) => (
                        <div key={p.$id || p.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/50 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400 font-black border border-blue-100 dark:border-blue-900" title={`Quota Used: ${p.load_count || 0}/${MAX_SYSTEM_PROXY_ASSIGNMENTS}. Instances can still be assigned: ${Math.max(0, MAX_SYSTEM_PROXY_ASSIGNMENTS - (p.load_count || 0))}`}>
                              <span className="text-sm">{(p.load_count || 0)}/{MAX_SYSTEM_PROXY_ASSIGNMENTS}</span>
                            </div>
                            <div>
                               <div className="font-bold text-gray-800 dark:text-neutral-200 font-mono text-sm tracking-tight">
                                 {p.url.replace(/:[^:@]+@/, ':***@')}
                               </div>
                               <div className="text-[10px] uppercase font-black text-gray-400 dark:text-neutral-600 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                 <span>Added: {p.created_at ? formatDatePK(p.created_at) : 'Unknown'}</span>
                                 <span>•</span>
                                <span className={getSystemProxyHealthState(p) === 'error' ? 'text-red-500 dark:text-red-500 bg-red-50 dark:bg-red-900/40 px-1 rounded' : getSystemProxyHealthState(p) === 'working' ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 px-1 rounded' : 'text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-1 rounded'}>
                                  {getSystemProxyHealthState(p) === 'error' ? 'Error' : getSystemProxyHealthState(p) === 'working' ? `Working: ${getSystemProxyLatency(p)}ms` : 'Unknown'}
                                 </span>
                                 <span>•</span>
                                 <span>Checked: {p.last_checked ? formatDatePK(p.last_checked, true) : 'Never'}</span>
                                 {p.error_msg ? (<><span>|</span><span className="text-red-500 dark:text-red-400">Reachability failed</span></>) : null}
                               </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={async () => {
                                await fetch(`/api/admin/system-proxies/${p.$id || p.id}/toggle`, { method: 'POST', headers: { "x-requester-id": currentUserId || "" } });
                                loadSystemProxies();
                              }}
                              className={`text-[10px] px-2 py-1 rounded font-black uppercase tracking-widest transition-colors ${p.is_active ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200' : 'bg-gray-100 dark:bg-neutral-800/50 text-gray-500 dark:text-neutral-500 hover:bg-gray-200 dark:bg-neutral-700'}`}
                              title="Toggle whether the system is allowed to assign this proxy to new instances"
                            >
                              {p.is_active ? 'Enabled for Assignment' : 'Disabled'}
                            </button>
                            <button 
                              onClick={() => {
                                setProxyToDelete(p.$id || p.id);
                              }}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/40 text-red-500 dark:text-red-500 hover:bg-red-100 dark:bg-red-900/60 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                );
              })()}
            </div>
          )}

          {activeView === "disclaimer" && (
            <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-gray-100 dark:border-neutral-800/50 p-8 max-w-4xl mx-auto animate-in fade-in zoom-in duration-300">
               <div className="flex items-center gap-3 mb-8 border-b pb-4">
                  <div className="w-12 h-12 bg-amber-50 dark:bg-amber-950/50 rounded-xl flex items-center justify-center text-amber-600">
                    <ShieldAlert className="w-7 h-7" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black text-gray-900 dark:text-neutral-50 tracking-tight">Platform Disclaimer</h2>
                    <p className="text-sm text-gray-500 dark:text-neutral-500 font-medium">Operational, legal, and platform risk notice for Black Arrow clients</p>
                  </div>
               </div>

               <div className="space-y-6 text-sm text-gray-600 dark:text-neutral-400 font-medium leading-relaxed">
                  <div className="bg-amber-50 dark:bg-amber-950/50 border-l-4 border-amber-500 p-5 rounded-r-xl">
                    <p className="text-amber-900 dark:text-amber-200 font-bold">Black Arrow is an automation and AI-assistance platform. It does not replace your legal, compliance, customer support, product, logistics, or business judgment. Last updated: May 16, 2026.</p>
                  </div>

                  <section className="space-y-2">
                    <h3 className="text-lg font-black text-gray-900 dark:text-neutral-50 flex items-center gap-2">
                      <span className="w-6 h-6 bg-gray-100 dark:bg-neutral-800/50 rounded flex items-center justify-center text-xs">1</span>
                      Independent Service
                    </h3>
                    <p>Black Arrow is independent and is not owned, operated, endorsed, certified, or officially approved by WhatsApp, Meta Platforms, Google, PostEx, Leopards Courier, or other third-party providers referenced in the product. Third-party trademarks belong to their respective owners.</p>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-lg font-black text-gray-900 dark:text-neutral-50 flex items-center gap-2 text-red-600 dark:text-red-400">
                      <span className="w-6 h-6 bg-red-50 dark:bg-red-900/40 rounded flex items-center justify-center text-xs">2</span>
                      WhatsApp Automation Risk
                    </h3>
                    <p>WhatsApp may restrict, flag, disconnect, or ban numbers that use automation, bulk messaging, unofficial connection methods, policy-violating content, or unusual traffic patterns. Black Arrow cannot guarantee that any WhatsApp number will remain active. Use a dedicated business or secondary number and follow WhatsApp policies, consent rules, and applicable messaging laws.</p>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-lg font-black text-gray-900 dark:text-neutral-50 flex items-center gap-2">
                      <span className="w-6 h-6 bg-gray-100 dark:bg-neutral-800/50 rounded flex items-center justify-center text-xs">3</span>
                      AI Limitations
                    </h3>
                    <p>AI-generated replies may be incomplete, inaccurate, delayed, repetitive, or unsuitable for a specific customer situation. Response quality depends on your catalog, instructions, training examples, templates, and monitoring. You are responsible for reviewing important conversations and correcting the assistant when needed.</p>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-lg font-black text-gray-900 dark:text-neutral-50 flex items-center gap-2">
                      <span className="w-6 h-6 bg-gray-100 dark:bg-neutral-800/50 rounded flex items-center justify-center text-xs">4</span>
                      Customer and Order Data
                    </h3>
                    <p>The platform may process names, phone numbers, addresses, chat content, order details, media, and delivery information to operate customer support and fulfillment workflows. You are responsible for obtaining required customer permissions and using customer data lawfully.</p>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-lg font-black text-gray-900 dark:text-neutral-50 flex items-center gap-2">
                      <span className="w-6 h-6 bg-gray-100 dark:bg-neutral-800/50 rounded flex items-center justify-center text-xs">5</span>
                      Third-Party Services and Business Outcomes
                    </h3>
                    <p>Courier APIs, AI providers, hosting infrastructure, proxy services, WhatsApp connectivity, payment tools, and logistics systems may experience outages, policy changes, rate limits, pricing changes, or delays. We do not guarantee sales, revenue, delivery success, conversion rates, uninterrupted uptime, or error-free automation.</p>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-lg font-black text-gray-900 dark:text-neutral-50 flex items-center gap-2">
                      <span className="w-6 h-6 bg-gray-100 dark:bg-neutral-800/50 rounded flex items-center justify-center text-xs">6</span>
                      Client Responsibility
                    </h3>
                    <p>By using the platform, you agree to configure it lawfully, monitor conversations, keep credentials secure, avoid spam or deceptive messaging, honor customer requests, and maintain backup processes for critical operations. If you do not accept these risks, do not connect a WhatsApp account or activate automation.</p>
                  </section>

                   <div className="pt-10 border-t border-gray-100 dark:border-neutral-800/50 mt-10">
                     <button 
                       onClick={() => {
                        handleSetView("global_dashboard");
                      }}
                      className="bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-600 transition-all "
                    >
                      I Understand, Take me back
                    </button>
                  </div>
               </div>
            </div>
          )}
          </main>
        </div>
      </div>

      {CRM_UI_ENABLED ? (
        <CrmToastStack toasts={dashboardToasts} onDismiss={(id) => setDashboardToasts((current) => current.filter((item) => item.id !== id))} />
      ) : null}

      {/* Template Details Modal */}
      <AnimatePresence>
        {selectedGroupTemplates && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/65 z-[9999] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
            >
              <div className="p-4 border-b border-gray-100 dark:border-neutral-800 flex items-center justify-between bg-emerald-50/30 dark:bg-emerald-950/20">
                <div>
                   <h3 className="text-sm font-black text-gray-900 dark:text-neutral-50 tracking-tight flex items-center gap-2 uppercase">
                      <Layers className="w-4 h-4 text-emerald-500" />
                      {selectedGroupTemplates.name}
                   </h3>
                   <p className="text-[10px] text-gray-500 dark:text-neutral-500 font-bold uppercase tracking-widest mt-0.5">
                      {selectedGroupTemplates.templates.length} Templates Active in Engine
                   </p>
                </div>
                <button 
                  onClick={() => setSelectedGroupTemplates(null)}
                  className="p-2 hover:bg-white dark:hover:bg-neutral-800 rounded-full transition-colors"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
                 {isLoadingTemplates ? (
                   <div className="py-20 flex flex-col items-center justify-center space-y-4">
                      <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
                      <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Fetching Details...</p>
                   </div>
                 ) : selectedGroupTemplates.templates.length === 0 ? (
                   <div className="py-12 flex flex-col items-center justify-center text-center opacity-40">
                      <FileX className="w-10 h-10 mb-2" />
                      <p className="text-xs font-bold">No templates found for this group yet.</p>
                      <p className="text-[10px] mt-1 italic">Make sure messages are sent to the group then sync again.</p>
                   </div>
                 ) : (
                   selectedGroupTemplates.templates.map((t: any, idx: number) => {
                      const msg = t.message?.ephemeralMessage?.message || t.message?.viewOnceMessage?.message || t.message?.viewOnceMessageV2?.message || t.message || t;
                      const text = msg.conversation || msg.extendedTextMessage?.text || t.caption || "";
                      const isImage = msg.imageMessage;
                      const isVideo = msg.videoMessage;
                      const isAudio = msg.audioMessage;
                      const isDoc = msg.documentMessage;

                      return (
                        <div key={idx} className="p-3 bg-gray-50 dark:bg-neutral-800/40 rounded-xl border border-gray-100 dark:border-neutral-800 relative group/item transition-all hover:bg-white dark:hover:bg-neutral-800 hover:shadow-md cursor-default">
                           <div className="flex items-start gap-4">
                              <div className="bg-emerald-100 dark:bg-emerald-900/40 w-10 h-10 rounded-xl flex items-center justify-center shadow-sm text-emerald-600 dark:text-emerald-400 shrink-0 font-black text-xs">
                                 {idx + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                 <div className="flex items-center gap-2 mb-2">
                                   {isImage && <div className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-[8px] font-black text-amber-600 rounded flex items-center gap-1 uppercase">📷 Image</div>}
                                   {isVideo && <div className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-[8px] font-black text-blue-600 rounded flex items-center gap-1 uppercase">🎥 Video</div>}
                                   {isAudio && <div className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-[8px] font-black text-emerald-600 rounded flex items-center gap-1 uppercase">🎤 Voice</div>}
                                   {isDoc && <div className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-[8px] font-black text-indigo-600 rounded flex items-center gap-1 uppercase">📄 Doc</div>}
                                   
                                   <div className="text-[7px] font-black text-gray-300 dark:text-neutral-700 uppercase tracking-widest ml-auto">
                                      ID: {t.key?.id?.substring(0, 10)}...
                                   </div>
                                 </div>
                                 
                                 <div className="bg-white dark:bg-neutral-900/40 p-2 rounded-lg border border-gray-100 dark:border-neutral-800/60">
                                   <p className="text-[11px] text-gray-700 dark:text-neutral-300 leading-relaxed break-words whitespace-pre-wrap font-medium">
                                      {text || <span className="italic text-gray-400">Pure Media Template (Context understood by AI)</span>}
                                   </p>
                                 </div>

                                 {t.pushName && (
                                   <div className="mt-2 flex items-center gap-1.5 opacity-60">
                                      <User className="w-2.5 h-2.5" />
                                      <span className="text-[8px] font-bold uppercase tracking-tight">Source: {t.pushName}</span>
                                   </div>
                                 )}
                              </div>
                           </div>
                        </div>
                      );
                   })
                 )}
              </div>

              <div className="p-4 bg-gray-50 dark:bg-neutral-950 border-t border-gray-100 dark:border-neutral-800 flex justify-end">
                 <button 
                  onClick={() => setSelectedGroupTemplates(null)}
                  className="px-6 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
                 >
                   Got it
                 </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {newBotModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-md p-6 shadow-sm">
            <h3 className="text-xl font-black text-gray-900 dark:text-neutral-50 mb-2">Create New Instance</h3>
            <p className="text-sm text-gray-500 dark:text-neutral-500 mb-4 font-medium">Enter a friendly name for this WhatsApp instance (e.g. "Main Support").</p>
            <input 
              className="w-full border border-gray-200 dark:border-neutral-800 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm mb-6 font-medium"
              value={newBotName}
              onChange={(e) => setNewBotName(e.target.value)}
              placeholder="Instance Name"
              autoFocus
            />
            <div className="flex items-center justify-end gap-3">
              <button 
                onClick={() => setNewBotModalOpen(false)}
                className="px-4 py-2 font-bold text-sm text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:bg-neutral-800/50 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={executeCreateBot}
                className="px-4 py-2 font-bold text-sm text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Create Identity
              </button>
            </div>
          </div>
        </div>
      )}

      {botToDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-md p-6 shadow-sm">
            <h3 className="text-xl font-black text-gray-900 dark:text-neutral-50 mb-2">Delete Instance?</h3>
            <p className="text-sm text-gray-500 dark:text-neutral-500 mb-6 font-medium">This removes the instance from the active dashboard and disconnects its session. Message history, number-linked settings, and template backups are archived for audit and future recovery.</p>
            <div className="flex items-center justify-end gap-3">
              <button 
                onClick={() => setBotToDelete(null)}
                className="px-4 py-2 font-bold text-sm text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:bg-neutral-800/50 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => confirmDeleteBot(botToDelete)}
                className="px-4 py-2 font-bold text-sm text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" /> Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {wipingBotId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-md p-6 shadow-sm">
            <h3 className="text-xl font-black text-gray-900 dark:text-neutral-50 mb-2">Wipe Bot Data?</h3>
            <p className="text-sm text-gray-500 dark:text-neutral-500 mb-6 font-medium">Are you sure you want to wipe the bot data to start fresh? This clears local templates and messages immediately!</p>
            <div className="flex items-center justify-end gap-3">
              <button 
                onClick={() => setWipingBotId(null)}
                className="px-4 py-2 font-bold text-sm text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:bg-neutral-800/50 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => confirmWipeBot(wipingBotId)}
                className="px-4 py-2 font-bold text-sm text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Yes, Wipe Data
              </button>
            </div>
          </div>
        </div>
      )}

      {adminEditPrompt && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-md p-6 shadow-sm">
            {adminEditPrompt.type === 'subscriptions' ? (
              <>
                <h3 className="text-xl font-black text-gray-900 dark:text-neutral-50 mb-2">Manage User Subscriptions</h3>
                <p className="text-sm text-gray-500 dark:text-neutral-500 mb-6 font-medium">For user: {adminEditPrompt.user?.name}</p>
                <div className="flex flex-col gap-4 mb-6">
                  <div>
                    <div className="flex justify-between mb-1 items-end">
                       <label className="text-xs font-bold text-gray-700 dark:text-neutral-300 block">Trial Expiry Date</label>
                       <button className="text-[10px] text-emerald-600 font-bold hover:underline" onClick={() => setAdminSubsForm(prev => ({...prev, trial_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}))}>+7 Days</button>
                    </div>
                    <input type="date" value={adminSubsForm.trial_expires_at} onChange={e => setAdminSubsForm(prev => ({...prev, trial_expires_at: e.target.value}))} className="w-full border border-gray-200 dark:border-neutral-800 rounded-xl p-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-700 dark:text-neutral-300 block mb-1">Current Auto-Assigned Proxy</label>
                    <div className="w-full bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-800 rounded-xl p-2 text-sm font-mono text-[11px] text-gray-500 dark:text-neutral-500 overflow-x-auto">
                       {adminSubsForm.assigned_proxy_url || "None assigned yet"}
                    </div>
                    <p className="text-[10px] text-gray-400 dark:text-neutral-600 mt-1">Proxies are automatically assigned from the System Proxies pool.</p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <button onClick={() => setAdminEditPrompt(null)} className="px-4 py-2 font-bold text-sm text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:bg-neutral-800/50 rounded-xl transition-colors">Cancel</button>
                  <button onClick={async () => {
                    const payload: any = { userId: adminEditPrompt.userId };
                    payload.trialExpiresAt = adminSubsForm.trial_expires_at ? new Date(adminSubsForm.trial_expires_at).getTime() : null;
                    payload.proxySubscriptionExpiry = null; // No longer used
                    payload.assignedProxyUrl = adminSubsForm.assigned_proxy_url;
                    await fetch("/api/admin/update-subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                    loadAdminUsers();
                    setAdminEditPrompt(null);
                  }} className="px-4 py-2 font-bold text-sm text-white bg-blue-500 hover:bg-blue-600 rounded-xl transition-colors">Save Subs</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-xl font-black text-gray-900 dark:text-neutral-50 mb-2">Edit {adminEditPrompt.type === 'wallet' ? 'Wallet Balance' : 'Extra Bundles'}</h3>
                <p className="text-sm text-gray-500 dark:text-neutral-500 mb-6 font-medium">For user: {adminEditPrompt.userName}</p>
                <input 
                  type="number"
                  value={adminPromptValue}
                  onChange={(e) => setAdminPromptValue(e.target.value)}
                  className="w-full border-gray-200 dark:border-neutral-800 border rounded-xl p-3 mb-6 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Enter new value"
                />
                <div className="flex items-center justify-end gap-3">
                  <button onClick={() => setAdminEditPrompt(null)} className="px-4 py-2 font-bold text-sm text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:bg-neutral-800/50 rounded-xl transition-colors">Cancel</button>
                  <button 
                    onClick={async () => {
                      const val = parseFloat(adminPromptValue);
                      if (!isNaN(val)) {
                         if (adminEditPrompt.type === 'wallet') {
                           await fetch("/api/admin/update-wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: adminEditPrompt.userId, amount: val }) });
                         } else {
                           await fetch("/api/admin/update-limits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: adminEditPrompt.userId, extraBundles: val }) });
                         }
                         loadAdminUsers();
                         setAdminEditPrompt(null);
                      }
                    }}
                    className="px-4 py-2 font-bold text-sm text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl transition-colors"
                  >Save changes</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {productToDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-md p-6 shadow-sm">
            <h3 className="text-xl font-black text-gray-900 dark:text-neutral-50 mb-2">Delete Product?</h3>
            <p className="text-sm text-gray-500 dark:text-neutral-500 mb-6 font-medium">Are you sure you want to permanently delete this product? This action cannot be undone.</p>
            <div className="flex items-center justify-end gap-3">
              <button 
                onClick={() => setProductToDelete(null)}
                className="px-4 py-2 font-bold text-sm text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:bg-neutral-800/50 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  confirmDeleteProduct(productToDelete);
                  setProductToDelete(null);
                }}
                className="px-4 py-2 font-bold text-sm text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" /> Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {proxyToDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-md p-6 shadow-sm">
            <h3 className="text-xl font-black text-gray-900 dark:text-neutral-50 mb-2">Delete Proxy?</h3>
            <p className="text-sm text-gray-500 dark:text-neutral-500 mb-6 font-medium">Are you sure you want to permanently delete this proxy?</p>
            <div className="flex items-center justify-end gap-3">
              <button 
                onClick={() => setProxyToDelete(null)}
                className="px-4 py-2 font-bold text-sm text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:bg-neutral-800/50 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  try {
                    await fetch(`/api/admin/system-proxies/${proxyToDelete}`, { method: 'DELETE', headers: { "x-requester-id": currentUserId || "" } });
                    loadSystemProxies();
                  } catch (e) {
                      console.error("Failed to delete proxy", e);
                  }
                  setProxyToDelete(null);
                }}
                className="px-4 py-2 font-bold text-sm text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" /> Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {stopAllConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-md p-6 shadow-sm">
            <h3 className="text-xl font-black text-gray-900 dark:text-neutral-50 mb-2">Stop All AI Activity?</h3>
            <p className="text-sm text-gray-500 dark:text-neutral-500 mb-6 font-medium">Are you sure you want to stop all active bot instances to stop billing?</p>
            <div className="flex items-center justify-end gap-3">
              <button 
                onClick={() => setStopAllConfirm(false)}
                className="px-4 py-2 font-bold text-sm text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:bg-neutral-800/50 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  setStopAllConfirm(false);
                  try {
                    await Promise.all(bots.filter(b => b.is_active === 1).map(b => 
                      fetch('/api/bots/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUserId, botId: b.id, isActive: 0 }) })
                    ));
                    await fetchBots();
                    setAppSuccess('All instances stopped successfully.'); setTimeout(() => setAppSuccess(null), 5000);
                  } catch(e) {}
                }}
                className="px-4 py-2 font-bold text-sm text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors flex items-center gap-2"
              >
                Yes, Stop
              </button>
            </div>
          </div>
        </div>
      )}

      {resetSessionConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-md p-6 shadow-sm">
            <h3 className="text-xl font-black text-gray-900 dark:text-neutral-50 mb-2">Reconnect WhatsApp?</h3>
            <p className="text-sm text-gray-500 dark:text-neutral-500 mb-6 font-medium">This will disconnect the current WhatsApp session so you can connect it again with a fresh QR scan. Other data like saved replies and products / services will not be deleted. Continue?</p>
            <div className="flex items-center justify-end gap-3">
              <button 
                onClick={() => setResetSessionConfirm(false)}
                className="px-4 py-2 font-bold text-sm text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:bg-neutral-800/50 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  setResetSessionConfirm(false);
                  confirmResetSession();
                }}
                className="px-4 py-2 font-bold text-sm text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors"
              >
                Yes, Reconnect WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {adminConfirmAction && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-md p-6 shadow-sm">
            <h3 className="text-xl font-black text-gray-900 dark:text-neutral-50 mb-2">
              {adminConfirmAction.type === 'delink' ? 'Delink WhatsApp Number?' : 'Generate Access Password?'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-neutral-500 mb-6 font-medium">
              {adminConfirmAction.type === 'delink' 
                ? `Release ${adminConfirmAction.identifier} from this account? The instance, customer history, orders, chats, and settings stay in place; only the active WhatsApp number ownership is removed.` 
                : <span>Generate a <strong>temporary password</strong> for <strong>{adminConfirmAction.identifier}</strong>. This allows you to login to their account manually without affecting their own password.</span>}
            </p>
            
            {adminConfirmAction.type === 'loginAs' && (
              <div className="flex flex-col gap-6 mb-6">
                 {/* Option 1: Temporary Password */}
                 <div className="bg-gray-50 dark:bg-neutral-800 rounded-xl p-4 border border-gray-100 dark:border-neutral-800/50">
                    <h4 className="text-[10px] font-black uppercase text-gray-500 dark:text-neutral-500 tracking-widest mb-3">Option 1: Temporary Password</h4>
                    {tempPasswordResult ? (
                      <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-100 dark:border-emerald-900 rounded-lg p-3 flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-mono font-black text-emerald-900 dark:text-emerald-200">{tempPasswordResult.tempPass}</span>
                            <button onClick={() => { navigator.clipboard.writeText(tempPasswordResult.tempPass); setAppSuccess("Copied!"); setTimeout(() => setAppSuccess(null), 3000); }} className="text-[10px] uppercase font-bold text-emerald-600 underline">Copy</button>
                          </div>
                          <div className="text-[9px] text-emerald-600 font-bold uppercase">Expires: {formatDatePK(tempPasswordResult.expiresAt, true)}</div>
                      </div>
                    ) : (
                      <button 
                         onClick={async () => {
                           const newPass = 'ACCESS_' + Math.random().toString(36).substring(2, 8).toUpperCase();
                           const res = await fetch("/api/admin/temp-password", { 
                             method: "POST", 
                             headers: { "Content-Type": "application/json" }, 
                             body: JSON.stringify({ userId: adminConfirmAction.userId, tempPass: newPass, expiresHours: 24, requesterId: currentUserId }) 
                           });
                           const data = await res.json();
                           if (data.success) { setTempPasswordResult({ tempPass: data.tempPass, expiresAt: data.expiresAt }); }
                         }}
                         className="w-full bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 py-2 rounded-lg text-xs font-bold text-gray-700 dark:text-neutral-300 hover:bg-emerald-50 dark:bg-emerald-950/50 hover:border-emerald-200 dark:border-emerald-800 transition-all flex items-center justify-center gap-2"
                      >
                         <Shield className="w-3 h-3" /> Generate Password
                      </button>
                    )}
                 </div>

                 {/* Option 2: One-Time Magic Link */}
                 <div className="bg-gray-50 dark:bg-neutral-800 rounded-xl p-4 border border-gray-100 dark:border-neutral-800/50">
                    <h4 className="text-[10px] font-black uppercase text-gray-500 dark:text-neutral-500 tracking-widest mb-3">Option 2: One-Time Magic Link</h4>
                    <p className="text-[10px] text-gray-400 dark:text-neutral-600 mb-3 italic">Generates a direct login link. Session expires after 10 mins of inactivity.</p>
                    <button 
                       onClick={async () => {
                         const res = await fetch("/api/admin/generate-login-link", {
                           method: "POST",
                           headers: { "Content-Type": "application/json" },
                           body: JSON.stringify({ userId: adminConfirmAction.userId, requesterId: currentUserId })
                         });
                         const data = await res.json();
                         if (data.success) {
                           navigator.clipboard.writeText(data.link);
                           setAppSuccess("Magic link copied to clipboard!");
                           setTimeout(() => setAppSuccess(null), 3000);
                         }
                       }}
                       className="w-full bg-emerald-500 text-white py-2.5 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"
                    >
                       <Zap className="w-3 h-3" /> Copy Magic Link
                    </button>
                 </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button 
                onClick={() => {
                  setAdminConfirmAction(null);
                  setTempPasswordResult(null);
                }} 
                className="px-4 py-2 font-bold text-sm text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:bg-neutral-800/50 rounded-xl transition-colors"
              >Done / Cancel</button>
              
              {adminConfirmAction.type === 'loginAs' ? (
                <div className="flex gap-2">
                   {tempPasswordResult ? (
                     <button 
                       onClick={async () => {
                         await fetch("/api/admin/temp-password", { 
                            method: "POST", 
                            headers: { "Content-Type": "application/json" }, 
                            body: JSON.stringify({ userId: adminConfirmAction.userId, tempPass: null, requesterId: currentUserId }) 
                         });
                         setTempPasswordResult(null);
                         setAppSuccess("Temporary password removed!");
                         setTimeout(() => setAppSuccess(null), 3000);
                       }}
                       className="px-4 py-2 font-bold text-sm text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors"
                     >Remove Access</button>
                   ) : (
                     <button 
                        onClick={async () => {
                          const newPass = 'ACCESS_' + Math.random().toString(36).substring(2, 8).toUpperCase();
                          const res = await fetch("/api/admin/temp-password", { 
                            method: "POST", 
                            headers: { "Content-Type": "application/json" }, 
                            body: JSON.stringify({ userId: adminConfirmAction.userId, tempPass: newPass, expiresHours: 24, requesterId: currentUser.id }) 
                          });
                          const data = await res.json();
                          if (data.success) {
                            setTempPasswordResult({ tempPass: data.tempPass, expiresAt: data.expiresAt });
                          }
                        }}
                        className="px-4 py-2 font-bold text-sm text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl transition-colors flex items-center gap-2"
                      >
                        <Zap className="w-4 h-4" /> Generate Password
                      </button>
                   )}
                </div>
              ) : (
                <button 
                  onClick={() => {
                    if (adminConfirmAction.type === 'delink') {
                       fetch(`/api/admin/delink-bot`, { 
                         method: "POST", 
                         headers: { "Content-Type": "application/json" }, 
                         body: JSON.stringify({ botId: adminConfirmAction.botId, userId: adminConfirmAction.userId, requesterId: currentUserId }) 
                       }).then(async (res) => {
                         const data = await res.json().catch(() => ({}));
                         if (!res.ok || !data.success) throw new Error(data.error || "Failed to delink WhatsApp number");
                         await loadAdminUsers();
                         setAppSuccess(data.message || "WhatsApp number delinked.");
                         setTimeout(() => setAppSuccess(null), 5000);
                         setAdminConfirmAction(null);
                       }).catch((e: any) => {
                         setAppError(e.message || "Failed to delink WhatsApp number");
                         setTimeout(() => setAppError(null), 5000);
                       });
                    }
                  }}
                  className="px-4 py-2 font-bold text-sm text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors"
                >Confirm Delink</button>
              )}
            </div>
          </div>
        </div>
      )}

      <Chatbot compact />
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }
      `}</style>
    </DashboardShell>
  );
}

import { Server } from "socket.io";
import pino from "pino";

export const logger = pino({ level: "silent" });

export interface IBotConfig {
  prompt: string;
  autoReply: boolean;
  googleSheetWebhookUrl?: string;
  groups?: { name: string, purpose: string, instructions?: string, jid?: string, shortcut_code?: string | null, templateCount?: number, autoSync?: boolean, trigger_keywords?: string }[];
  botVoice?: string;
  botGender?: string;
  botName?: string;
  preferredLanguage?: string;
  customFields?: { name: string, instructions: string }[];
  business_type?: string;
  reply_behavior?: string;
  reply_in_groups?: number;
  human_delay_enabled?: number;
  voice_simulation_enabled?: number;
  reject_calls?: number;
  learned_instructions?: string;
  followup_enabled?: number;
  auto_followup_enabled?: number;
  followup_hours?: number;
  followup_offer_context?: string;
  followups_json?: string;
  muted_numbers?: string[];
}

export const BotState = {
  sock: null as any,
  waAuthState: null as any,
  connectionStatus: "disconnected",
  qrCodeData: null as string | null,
  botConfig: {} as IBotConfig,
  cachedKeywordSequences: {} as Record<string, { jid: string, templates: any[], config: any }>,
  cachedWelcomeTemplates: [] as any[],
  cachedMediaTemplates: [] as any[],
  welcomeGroupJid: null as string | null,
  mediaGroupJid: null as string | null,
  localStore: {} as Record<string, any[]>,
  botSentMessageIds: new Set<string>(),
  teaserSentTo: new Set<string>(),
  currentlyReplying: new Set<string>(),
  pendingResponses: [] as { jid: string, sequenceName: string, type: 'welcome' | 'sequence' | 'shortcut' | 'media', mediaTitle?: string, timestamp: number }[],
  processedMessageIds: new Set<string>(),
  loadTemplatesTimeout: null as NodeJS.Timeout | null,
  isGroupSyncActive: false,
  matchedGroupNames: [] as string[],
  activeAIControllers: new Map<string, AbortController>(),
  messageBuffers: new Map<string, { messages: any[], timer: NodeJS.Timeout | null }>(),
  io: null as Server | null,
};

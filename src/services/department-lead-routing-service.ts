import * as dbService from "./db-service.ts";
import { generateBackendText } from "./ai-text-provider-service.ts";
import { resolveCustomerIdentity } from "./customer-identity-resolver-service.ts";
import { normalizeTrustedPhoneDigits, formatInternationalPhone } from "../utils/contact-identity.ts";
import { sendUniversalOutboundText } from "./universal-outbound-send-service.ts";
import { safeId, cleanString } from "./integration-foundation-store.ts";
import { normalizeWhatsAppJid } from "../utils/whatsapp-jid.ts";
import { emitProactiveLeadLifecycleEvent, evaluateLeadIntentAndUrgency } from "./proactive-lead-intelligence-service.ts";

const STORE_KEY = "leadRouting";

export interface DepartmentConfig {
  id: string;
  accountId: string;
  name: string;
  description: string;
  whatsappNumber: string;
  whatsappNumberNormalized: string;
  enabled: boolean;
  priority?: number;
  isFallback?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface LeadRoutingSettings {
  departments: DepartmentConfig[];
  fallbackDepartmentId?: string;
  autoForwardOnConfirmation?: boolean;
}

export interface LeadRoutingAuditRecord {
  id: string;
  accountId: string;
  leadId: string;
  departmentId?: string;
  departmentName?: string;
  destinationPhone?: string;
  status: "pending_contact_number" | "ready" | "forwarding" | "forwarded" | "failed" | "unassigned";
  summaryText?: string;
  leadName?: string;
  customerPhone?: string;
  customerJid: string;
  customerLanguage?: string;
  attemptTimestamp: number;
  successTimestamp?: number;
  messageId?: string;
  failureReason?: string;
  retryCount: number;
  initiatedBy: "ai_auto" | "manual_admin";
  assignedByUserId?: string;
  notes?: string;
  history?: Array<{
    timestamp: number;
    action: string;
    fromDepartmentId?: string;
    toDepartmentId?: string;
    operator?: string;
    reason?: string;
  }>;
}

export interface CustomerPhoneRecoveryState {
  customerJid: string;
  phoneRequestedAt?: number;
  hasTrustedPhone: boolean;
  contactPhone?: string;
  contactPhoneNormalized?: string;
  contactPhoneSource?: "whatsapp_verified" | "customer_provided" | "none";
  contactPhoneVerifiedOrCustomerProvided?: boolean;
  contactPhoneUpdatedAt?: number;
  customerRefusedPhone?: boolean;
}

// ---------------------------------------------------------------------------
// Dependency Injection for Testing
// ---------------------------------------------------------------------------
export const leadRoutingDeps = {
  generateBackendText,
  sendUniversalOutboundText,
  now: () => Date.now(),
};

export function __setLeadRoutingTestDeps(overrides: Partial<typeof leadRoutingDeps>) {
  Object.assign(leadRoutingDeps, overrides || {});
}

export function __resetLeadRoutingTestDeps() {
  Object.assign(leadRoutingDeps, {
    generateBackendText,
    sendUniversalOutboundText,
    now: () => Date.now(),
  });
}

// In-memory fallback / audit store cache for fast lookups & test runs
const inMemoryAuditStore = new Map<string, LeadRoutingAuditRecord[]>();
const inMemoryPhoneRecoveryStore = new Map<string, CustomerPhoneRecoveryState>();

// ---------------------------------------------------------------------------
// Department Configuration & Store Management
// ---------------------------------------------------------------------------

export async function loadLeadRoutingSettings(accountId: string): Promise<LeadRoutingSettings> {
  const cleanAccount = cleanString(accountId, 100);
  if (!cleanAccount) return { departments: [] };

  const store = await dbService.getUserExtraConfigValue(cleanAccount, STORE_KEY).catch(() => null);
  if (!store || typeof store !== "object") {
    return { departments: [] };
  }

  const departments: DepartmentConfig[] = Array.isArray(store.departments)
    ? store.departments.filter((d: any) => d && d.accountId === cleanAccount)
    : [];

  return {
    departments,
    fallbackDepartmentId: store.fallbackDepartmentId || undefined,
    autoForwardOnConfirmation: store.autoForwardOnConfirmation !== false,
  };
}

export async function saveLeadRoutingSettings(accountId: string, settings: LeadRoutingSettings): Promise<LeadRoutingSettings> {
  const cleanAccount = cleanString(accountId, 100);
  if (!cleanAccount) throw new Error("Missing accountId for saveLeadRoutingSettings");

  // Enforce tenant isolation on all department records
  const sanitizedDepts = (settings.departments || []).map((d) => ({
    ...d,
    accountId: cleanAccount,
  }));

  const payload: LeadRoutingSettings = {
    departments: sanitizedDepts,
    fallbackDepartmentId: settings.fallbackDepartmentId,
    autoForwardOnConfirmation: settings.autoForwardOnConfirmation !== false,
  };

  await dbService.saveUserExtraConfigPatch(cleanAccount, { [STORE_KEY]: payload });
  return payload;
}

export function validateDepartmentPhone(phone: string): { valid: boolean; normalized: string; error?: string } {
  const raw = String(phone || "").trim();
  if (!raw) return { valid: false, normalized: "", error: "Phone number is required." };
  if (raw.toLowerCase().includes("@lid") || raw.toLowerCase().includes("hosted.lid")) {
    return { valid: false, normalized: "", error: "LID cannot be used as a department telephone number." };
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    return { valid: false, normalized: "", error: "Department WhatsApp number must be between 8 and 15 digits." };
  }

  // Reject obviously fake/repeated digits like 00000000 or 11111111
  if (/^(\d)\1+$/.test(digits)) {
    return { valid: false, normalized: "", error: "Invalid repeated digits in telephone number." };
  }

  // Normalize Pakistani numbers
  let normalized = digits;
  if (normalized.length === 11 && normalized.startsWith("03")) {
    normalized = `92${normalized.slice(1)}`;
  } else if (normalized.length === 10 && normalized.startsWith("3")) {
    normalized = `92${normalized}`;
  }

  return { valid: true, normalized: `+${normalized}` };
}

export async function createDepartment(accountId: string, input: {
  name: string;
  description: string;
  whatsappNumber: string;
  priority?: number;
  isFallback?: boolean;
}): Promise<DepartmentConfig> {
  const cleanAccount = cleanString(accountId, 100);
  if (!cleanAccount) throw new Error("Missing accountId");

  const name = cleanString(input.name, 120);
  if (!name) throw new Error("Department name is required.");

  const description = cleanString(input.description, 500);
  if (!description) throw new Error("Department description is required for semantic lead classification.");

  const phoneVal = validateDepartmentPhone(input.whatsappNumber);
  if (!phoneVal.valid) throw new Error(phoneVal.error || "Invalid department WhatsApp number.");

  const settings = await loadLeadRoutingSettings(cleanAccount);
  const now = leadRoutingDeps.now();

  const newDept: DepartmentConfig = {
    id: safeId("dept"),
    accountId: cleanAccount,
    name,
    description,
    whatsappNumber: input.whatsappNumber.trim(),
    whatsappNumberNormalized: phoneVal.normalized,
    enabled: true,
    priority: input.priority ?? 0,
    isFallback: Boolean(input.isFallback),
    createdAt: now,
    updatedAt: now,
  };

  // If this department is marked as fallback, unset fallback on others
  let fallbackId = settings.fallbackDepartmentId;
  if (newDept.isFallback) {
    settings.departments.forEach((d) => { d.isFallback = false; });
    fallbackId = newDept.id;
  }

  settings.departments.push(newDept);
  if (fallbackId) settings.fallbackDepartmentId = fallbackId;

  await saveLeadRoutingSettings(cleanAccount, settings);
  return newDept;
}

export async function updateDepartment(
  accountId: string,
  departmentId: string,
  patch: Partial<Omit<DepartmentConfig, "id" | "accountId">>
): Promise<DepartmentConfig> {
  const cleanAccount = cleanString(accountId, 100);
  const cleanDeptId = cleanString(departmentId, 100);
  const settings = await loadLeadRoutingSettings(cleanAccount);

  const index = settings.departments.findIndex((d) => d.id === cleanDeptId && d.accountId === cleanAccount);
  if (index === -1) throw new Error(`Department ${cleanDeptId} not found for account ${cleanAccount}.`);

  const existing = settings.departments[index];
  let normalizedNumber = existing.whatsappNumberNormalized;

  if (patch.whatsappNumber) {
    const val = validateDepartmentPhone(patch.whatsappNumber);
    if (!val.valid) throw new Error(val.error || "Invalid department WhatsApp number.");
    normalizedNumber = val.normalized;
  }

  const updated: DepartmentConfig = {
    ...existing,
    ...patch,
    id: existing.id,
    accountId: cleanAccount,
    whatsappNumber: patch.whatsappNumber ? patch.whatsappNumber.trim() : existing.whatsappNumber,
    whatsappNumberNormalized: normalizedNumber,
    updatedAt: leadRoutingDeps.now(),
  };

  if (patch.isFallback === true) {
    settings.departments.forEach((d) => { d.isFallback = false; });
    updated.isFallback = true;
    settings.fallbackDepartmentId = updated.id;
  } else if (patch.isFallback === false && settings.fallbackDepartmentId === updated.id) {
    settings.fallbackDepartmentId = undefined;
  }

  settings.departments[index] = updated;
  await saveLeadRoutingSettings(cleanAccount, settings);
  return updated;
}

export async function deleteDepartment(accountId: string, departmentId: string): Promise<boolean> {
  const cleanAccount = cleanString(accountId, 100);
  const cleanDeptId = cleanString(departmentId, 100);
  const settings = await loadLeadRoutingSettings(cleanAccount);

  const initialCount = settings.departments.length;
  settings.departments = settings.departments.filter((d) => !(d.id === cleanDeptId && d.accountId === cleanAccount));

  if (settings.departments.length === initialCount) return false;

  if (settings.fallbackDepartmentId === cleanDeptId) {
    settings.fallbackDepartmentId = undefined;
  }

  await saveLeadRoutingSettings(cleanAccount, settings);
  return true;
}

export async function listDepartments(accountId: string, onlyEnabled = false): Promise<DepartmentConfig[]> {
  const settings = await loadLeadRoutingSettings(accountId);
  let list = settings.departments;
  if (onlyEnabled) {
    list = list.filter((d) => d.enabled);
  }
  return list.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.name.localeCompare(b.name));
}

export async function getDepartment(accountId: string, departmentId: string): Promise<DepartmentConfig | undefined> {
  const list = await listDepartments(accountId);
  return list.find((d) => d.id === departmentId && d.accountId === accountId);
}

export async function getFallbackDepartment(accountId: string): Promise<DepartmentConfig | undefined> {
  const list = await listDepartments(accountId, true);
  return list.find((d) => d.isFallback) || list[0];
}

// ---------------------------------------------------------------------------
// Customer Phone Recovery & Resolution
// ---------------------------------------------------------------------------

export function resolveCustomerPhoneState(input: {
  customerJid: string;
  profile?: any;
  record?: any;
}): CustomerPhoneRecoveryState {
  const { customerJid, profile, record } = input;
  const identity = resolveCustomerIdentity({
    jid: customerJid,
    profile,
    record,
  });

  const memoryState = inMemoryPhoneRecoveryStore.get(customerJid) || {
    customerJid,
    hasTrustedPhone: false,
  };

  const hasTrusted = Boolean(identity.canonicalPhone && identity.displayIdentity.phoneIsTrusted);
  const trustedPhone = identity.canonicalPhone
    ? (identity.canonicalPhone.startsWith("+") ? identity.canonicalPhone : `+${identity.canonicalPhone}`)
    : undefined;

  return {
    customerJid,
    hasTrustedPhone: hasTrusted || Boolean(memoryState.contactPhoneNormalized),
    contactPhone: memoryState.contactPhone || (hasTrusted ? trustedPhone : undefined),
    contactPhoneNormalized: memoryState.contactPhoneNormalized || (hasTrusted ? trustedPhone : undefined),
    contactPhoneSource: hasTrusted ? "whatsapp_verified" : memoryState.contactPhoneSource || "none",
    contactPhoneVerifiedOrCustomerProvided: hasTrusted || Boolean(memoryState.contactPhoneVerifiedOrCustomerProvided),
    phoneRequestedAt: memoryState.phoneRequestedAt,
    customerRefusedPhone: memoryState.customerRefusedPhone,
  };
}

export function buildNaturalCustomerPhoneRequest(language = "en"): string {
  const lang = String(language || "en").toLowerCase();

  if (lang.includes("ur") || lang.includes("roman")) {
    return "Mujhe is chat se aap ka contact number nahi mil raha. Baraye meharbani apna WhatsApp ya phone number share kar dein taake hamari team aap se rabta kar sake.";
  }
  if (lang.includes("ar")) {
    return "لا يمكنني الوصول إلى رقم الاتصال الخاص بك من هذه المحادثة. يرجى مشاركة رقم الواتساب أو الهاتف المناسب حتى يتواصل معك فريقنا.";
  }
  if (lang.includes("hi")) {
    return "मुझे इस चैट से आपका संपर्क नंबर नहीं मिल रहा है। कृपया अपना फ़ोन या व्हाट्सएप नंबर साझा करें ताकि हमारी टीम आपसे संपर्क कर सके।";
  }

  return "I can't access your contact number from this chat. Please share the best WhatsApp or contact number for our team to contact you.";
}

export function extractAndValidatePhoneFromText(
  text: string,
  countryContext?: { defaultCountryCode?: string; countryCallingCode?: string }
): {
  found: boolean;
  raw?: string;
  normalized?: string;
  isValid: boolean;
  error?: string;
} {
  const raw = String(text || "").trim();
  if (!raw) return { found: false, isValid: false };

  // Explicit rejection of LID
  if (raw.toLowerCase().includes("@lid") || raw.toLowerCase().includes("hosted.lid")) {
    return { found: true, isValid: false, error: "LID cannot be used as a contact phone number." };
  }

  // Check for explicit refusal
  if (
    /^(?:no|nahi|na|never|don'?t|won'?t|i don'?t want to share|private|keep private|can'?t share)\b/i.test(raw) ||
    /\b(?:will not|won'?t|don'?t|cannot|can'?t|refuse to|not want to)\s+(?:share|give|provide)\b/i.test(raw) ||
    /number nahi dena|nahi bata sakta|personal hai|share nahi karna|phone nahi dunga|number nahi hai/i.test(raw)
  ) {
    return { found: false, isValid: false, error: "customer_refused" };
  }

  // Resolve country calling code if authoritatively provided
  const callingCode = countryContext?.countryCallingCode || (
    countryContext?.defaultCountryCode?.toUpperCase() === "PK" ? "92" :
    countryContext?.defaultCountryCode?.toUpperCase() === "US" || countryContext?.defaultCountryCode?.toUpperCase() === "CA" ? "1" :
    countryContext?.defaultCountryCode?.toUpperCase() === "GB" || countryContext?.defaultCountryCode?.toUpperCase() === "UK" ? "44" :
    countryContext?.defaultCountryCode?.toUpperCase() === "AE" ? "971" :
    countryContext?.defaultCountryCode?.toUpperCase() === "SA" ? "966" :
    countryContext?.defaultCountryCode?.toUpperCase() === "IN" ? "91" :
    countryContext?.defaultCountryCode?.toUpperCase() === "AU" ? "61" :
    undefined
  );

  // Look for phone patterns: numbers with optional +, spaces, hyphens, parentheses
  const phonePattern = /(?:\+?\d{1,4}[-.\s]*)?(?:\(?\d{2,5}\)?[-.\s]*)?\d{3,5}[-.\s]*\d{3,5}/g;
  const matches = raw.match(phonePattern);

  if (!matches || matches.length === 0) {
    return { found: false, isValid: false };
  }

  for (const match of matches) {
    const candidateDigits = match.replace(/\D/g, "");
    if (candidateDigits.length >= 8 && candidateDigits.length <= 15) {
      // Reject repeated digits like 00000000 or 11111111
      if (/^(\d)\1+$/.test(candidateDigits)) {
        continue;
      }

      let normalized = candidateDigits;

      // 1. Explicit international format (+ or 00 prefix)
      if (match.trim().startsWith("+")) {
        normalized = candidateDigits;
      } else if (candidateDigits.startsWith("00") && candidateDigits.length >= 10) {
        normalized = candidateDigits.slice(2);
      } else if (callingCode) {
        // 2. Authoritative country context exists
        if (candidateDigits.startsWith("0")) {
          normalized = `${callingCode}${candidateDigits.slice(1)}`;
        } else if (callingCode === "92" && candidateDigits.length === 10 && candidateDigits.startsWith("3")) {
          normalized = `92${candidateDigits}`;
        } else if (!candidateDigits.startsWith(callingCode)) {
          normalized = `${callingCode}${candidateDigits}`;
        }
      } else {
        // 3. Global / Country undetermined: do not blindly assume Pakistan or any single country!
        if (candidateDigits.startsWith("0")) {
          // Local number with leading 0 but unknown country
          return {
            found: true,
            raw: match.trim(),
            isValid: false,
            error: "Please provide your telephone number including your international country code (e.g. +1, +44, +92, +971).",
          };
        }
        normalized = candidateDigits;
      }

      return {
        found: true,
        raw: match.trim(),
        normalized: `+${normalized}`,
        isValid: true,
      };
    }
  }

  return {
    found: true,
    isValid: false,
    error: "Please provide a valid telephone number between 8 and 15 digits including country code.",
  };
}

export function recordCustomerProvidedPhone(
  customerJid: string,
  phone: string,
  refused = false,
  accountId?: string
): CustomerPhoneRecoveryState {
  const existing = inMemoryPhoneRecoveryStore.get(customerJid) || {
    customerJid,
    hasTrustedPhone: false,
  };

  if (refused) {
    existing.customerRefusedPhone = true;
    existing.phoneRequestedAt = undefined;
    inMemoryPhoneRecoveryStore.set(customerJid, existing);
    return existing;
  }

  const val = extractAndValidatePhoneFromText(phone);
  if (val.isValid && val.normalized) {
    const wasNew = !existing.contactPhone || existing.contactPhone !== val.normalized;
    existing.contactPhone = val.normalized;
    existing.contactPhoneNormalized = val.normalized;
    existing.contactPhoneSource = "customer_provided";
    existing.contactPhoneVerifiedOrCustomerProvided = true;
    existing.contactPhoneUpdatedAt = leadRoutingDeps.now();
    existing.hasTrustedPhone = true;
    existing.phoneRequestedAt = undefined;

    const targetAccountId = accountId || (existing as any).pendingAccountId;
    const targetLeadId = (existing as any).pendingLeadId;
    if (wasNew && targetAccountId && targetLeadId) {
      emitProactiveLeadLifecycleEvent({
        eventType: "LEAD_CONTACT_NUMBER_CAPTURED",
        accountId: targetAccountId,
        botId: (existing as any).pendingBotId,
        leadId: targetLeadId,
        customerJid,
        customerName: (existing as any).pendingLeadData?.customerName,
        customerPhone: val.normalized,
        summary: `Customer provided verified contact telephone number: ${val.normalized}`,
        urgency: "normal",
      }).catch((err) => console.warn("[LeadRouting] Proactive number captured emit failed:", err));
    }
  }

  inMemoryPhoneRecoveryStore.set(customerJid, existing);
  return existing;
}

export function markPhoneRequested(
  customerJid: string,
  meta?: {
    accountId?: string;
    leadId?: string;
    leadData?: any;
    customerLanguage?: string;
    chatHistory?: string | any[];
    botId?: string;
  }
): void {
  const existing = inMemoryPhoneRecoveryStore.get(customerJid) || {
    customerJid,
    hasTrustedPhone: false,
  };
  existing.phoneRequestedAt = leadRoutingDeps.now();
  if (meta) {
    const hist = typeof meta.chatHistory === "string" ? meta.chatHistory : Array.isArray(meta.chatHistory) ? meta.chatHistory.map((m: any) => `${m.role || 'user'}: ${m.text || m.content || ''}`).join('\n') : "";
    (existing as any).pendingLeadId = meta.leadId;
    (existing as any).pendingLeadData = meta.leadData;
    (existing as any).pendingChatHistory = hist;
    (existing as any).pendingBotId = meta.botId;
    (existing as any).pendingAccountId = meta.accountId;
    (existing as any).pendingCustomerLanguage = meta.customerLanguage;
  }
  inMemoryPhoneRecoveryStore.set(customerJid, existing);
}

export function getPendingLeadRoutingState(
  accountIdOrJid: string,
  customerJid?: string,
  profile?: any
): {
  isPending: boolean;
  leadId?: string;
  leadData?: any;
  chatHistory?: string;
  botId?: string;
  customerLanguage?: string;
} | undefined {
  const actualJid = customerJid || accountIdOrJid;
  const mem = inMemoryPhoneRecoveryStore.get(actualJid) as any;
  if (mem && mem.phoneRequestedAt && mem.pendingLeadId) {
    return {
      isPending: true,
      leadId: mem.pendingLeadId,
      leadData: mem.pendingLeadData,
      chatHistory: mem.pendingChatHistory,
      botId: mem.pendingBotId,
      customerLanguage: mem.pendingCustomerLanguage,
    };
  }

  if (profile && (profile.phoneRequestedAt || profile.pendingLeadRoutingId)) {
    return {
      isPending: true,
      leadId: profile.pendingLeadRoutingId || profile.latestOrderRef,
      leadData: profile.pendingLeadRoutingData,
      chatHistory: profile.chatSummary,
      customerLanguage: profile.detectedLanguage,
    };
  }

  return undefined;
}

export function clearPendingLeadRoutingState(accountIdOrJid: string, customerJid?: string): void {
  const actualJid = customerJid || accountIdOrJid;
  const mem = inMemoryPhoneRecoveryStore.get(actualJid) as any;
  if (mem) {
    mem.phoneRequestedAt = undefined;
    mem.pendingLeadId = undefined;
    mem.pendingLeadData = undefined;
    mem.pendingChatHistory = undefined;
    mem.pendingBotId = undefined;
    mem.pendingCustomerLanguage = undefined;
    inMemoryPhoneRecoveryStore.set(actualJid, mem);
  }
}

// ---------------------------------------------------------------------------
// AI Semantic Department Classification & Grounded Summarization
// ---------------------------------------------------------------------------

export interface DepartmentClassificationResult {
  departmentId?: string;
  departmentName?: string;
  confidence: number;
  reasoning: string;
  summary: string;
  isFallback: boolean;
  status: "ready" | "unassigned" | "low_confidence_fallback";
}

export async function classifyLeadDepartment(input: {
  accountId: string;
  customerConversation?: string;
  customerIntent?: string;
  businessContext?: string;
}): Promise<DepartmentClassificationResult> {
  const { accountId, customerConversation, customerIntent, businessContext } = input;
  const cleanAccount = cleanString(accountId, 100);
  const cleanConv = cleanString(customerConversation || "", 2000);
  const enabledDepts = await listDepartments(cleanAccount, true);

  if (enabledDepts.length === 0) {
    return {
      confidence: 0,
      reasoning: "No enabled departments configured for this account.",
      summary: cleanString(cleanConv, 300),
      isFallback: false,
      status: "unassigned",
    };
  }

  // If only 1 department exists, route directly to it
  if (enabledDepts.length === 1) {
    const single = enabledDepts[0];
    return {
      departmentId: single.id,
      departmentName: single.name,
      confidence: 1.0,
      reasoning: `Only one active department configured: ${single.name}`,
      summary: cleanString(cleanConv, 300),
      isFallback: single.isFallback || false,
      status: "ready",
    };
  }

  const deptDescriptions = enabledDepts
    .map((d) => `- ID: "${d.id}" | Name: "${d.name}" | Responsibility: ${d.description}`)
    .join("\n");

  const systemPrompt = `
You are the Lead Routing Intelligence engine for BlackArrow.
Analyze the customer's conversation, intent, and requirements, and classify which configured department best fits this lead.

Available Departments:
${deptDescriptions}

Rules:
1. Match semantically based on the department's responsibility, regardless of the language the customer spoke (English, Urdu, Roman Urdu, Arabic, Hindi, Punjabi, etc.).
2. You must select the department ID from the available list that best matches the customer's actual business need.
3. Provide a grounded summary (max 3 sentences) strictly based on known customer statements. Do NOT fabricate or invent facts.
4. Output JSON strictly adhering to schema.
`.trim();

  const userPrompt = `
Customer Conversation:
${cleanConv}

Customer Stated Intent:
${customerIntent || "Not specified"}

Business Context:
${businessContext || "Standard"}
`.trim();

  const classificationSchema = {
    type: "object",
    properties: {
      departmentId: { type: "string" },
      confidence: { type: "number" },
      reasoning: { type: "string" },
      summary: { type: "string" },
    },
    required: ["departmentId", "confidence", "reasoning", "summary"],
    additionalProperties: false,
  };

  try {
    const aiRes = await leadRoutingDeps.generateBackendText({
      purpose: "lead_department_classification",
      accountId: cleanAccount,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 250,
      temperature: 0.0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "department_classification",
          strict: true,
          schema: classificationSchema,
        },
      },
      timeoutMs: 5000,
    });

    if (aiRes.requestStatus === "success" && aiRes.text) {
      const parsed = JSON.parse(aiRes.text);
      const confidence = Number(parsed.confidence ?? 0);
      const targetDeptId = parsed.departmentId || parsed.matchedDepartmentId;
      const matchedDept = enabledDepts.find((d) => d.id === targetDeptId);

      // High confidence match
      if (confidence >= 0.7 && matchedDept) {
        return {
          departmentId: matchedDept.id,
          departmentName: matchedDept.name,
          confidence,
          reasoning: parsed.reasoning || "Semantic intent matched department responsibility",
          summary: parsed.summary || cleanString(cleanConv, 300),
          isFallback: false,
          status: "ready",
        };
      }

      // Low confidence or ambiguous: check for configured fallback department
      const fallback = await getFallbackDepartment(cleanAccount);
      if (fallback) {
        return {
          departmentId: fallback.id,
          departmentName: fallback.name,
          confidence,
          reasoning: `Low confidence (${confidence.toFixed(2)}). Routed to fallback department: ${fallback.name}.`,
          summary: parsed.summary || cleanString(cleanConv, 300),
          isFallback: true,
          status: "low_confidence_fallback",
        };
      }

      return {
        confidence,
        reasoning: `Ambiguous intent (${confidence.toFixed(2)}) and no fallback department configured.`,
        summary: parsed.summary || cleanString(cleanConv, 300),
        isFallback: false,
        status: "unassigned",
      };
    }
  } catch (err) {
    console.warn("[LeadRouting] AI classification fallback:", err);
  }

  // Graceful fallback if AI call fails
  const fallback = await getFallbackDepartment(cleanAccount);
  if (fallback) {
    return {
      departmentId: fallback.id,
      departmentName: fallback.name,
      confidence: 0.5,
      reasoning: "AI classification unavailable. Routed to configured fallback department.",
      summary: cleanString(cleanConv, 300),
      isFallback: true,
      status: "low_confidence_fallback",
    };
  }

  return {
    confidence: 0,
    reasoning: "AI classification unavailable and no fallback department configured.",
    summary: cleanString(cleanConv, 300),
    isFallback: false,
    status: "unassigned",
  };
}

export function buildGroundedLeadSummary(input: {
  leadName?: string;
  customerPhone?: string;
  customerJid: string;
  departmentName?: string;
  requirement?: string;
  qualificationSummary?: string;
  leadId: string;
  timestamp: number;
}): string {
  const { leadName, customerPhone, customerJid, departmentName, requirement, qualificationSummary, leadId, timestamp } = input;
  const timeStr = new Date(timestamp).toLocaleString("en-US", { timeZone: "UTC", dateStyle: "short", timeStyle: "short" }) + " UTC";

  return [
    `📋 *New Qualified Lead for ${departmentName || "Unassigned"}*`,
    `• *Customer:* ${leadName || "Valued Customer"}`,
    `• *Contact Phone:* ${customerPhone || "Not provided (LID only)"}`,
    `• *WhatsApp JID:* ${customerJid}`,
    `• *Requirement:* ${requirement || "General inquiry"}`,
    qualificationSummary ? `• *Qualification:* ${qualificationSummary}` : "",
    `• *Lead ID:* ${leadId}`,
    `• *Time:* ${timeStr}`,
    `\n_Please follow up with the customer directly._`,
  ].filter(Boolean).join("\n");
}

export function buildCustomerHandoffAcknowledgement(departmentName?: string, language = "en"): string {
  const lang = String(language || "en").toLowerCase();
  const dept = departmentName || "our specialized";

  if (lang.includes("ur") || lang.includes("roman")) {
    return `Shukriya! Aap ki darkhwast hamari ${dept} team ko forward / bhej di gayi hai. Hamara numainda jald hi aap se rabta karega.`;
  }
  if (lang.includes("ar")) {
    return `شكراً لك! لقد تم تحويل طلبك إلى قسم ${dept}. سيتواصل معك أحد ممثلينا قريباً.`;
  }
  if (lang.includes("hi")) {
    return `धन्यवाद! आपका अनुरोध हमारी ${dept} टीम को भेज दिया गया है। हमारा प्रतिनिधि जल्द ही आपसे संपर्क करेगा।`;
  }

  return `Thank you! Your information has been forwarded to our ${dept} team, and a representative will be in touch with you shortly.`;
}

// ---------------------------------------------------------------------------
// Forwarding Executor & Idempotent Audit State
// ---------------------------------------------------------------------------

export async function forwardLeadToDepartment(input: {
  accountId: string;
  botId: string;
  leadId: string;
  customerJid: string;
  customerPhone?: string;
  leadName?: string;
  customerConversation?: string;
  customerIntent?: string;
  customerLanguage?: string;
  departmentId?: string;
  forcedDepartmentId?: string;
  summaryText?: string;
  initiatedBy?: "ai_auto" | "manual_admin";
  operator?: string;
  sock?: any;
}): Promise<{
  success: boolean;
  status: LeadRoutingAuditRecord["status"] | "duplicate";
  auditRecord: LeadRoutingAuditRecord;
  customerReplyText?: string;
  isDuplicate?: boolean;
  delivered?: boolean;
}> {
  const {
    accountId,
    botId,
    leadId,
    customerJid,
    customerConversation,
    customerIntent,
    customerLanguage,
    forcedDepartmentId,
    departmentId,
    summaryText,
    initiatedBy = "ai_auto",
    operator,
    sock,
  } = input;

  const cleanAccount = cleanString(accountId, 100);
  const cleanLeadId = cleanString(leadId, 100);
  const now = leadRoutingDeps.now();
  const rawConv = cleanString(customerConversation || summaryText || "", 2000);

  // 1. Resolve phone state: ensure we have a contact phone or explicit refusal
  const phoneState = resolveCustomerPhoneState({ customerJid });
  const finalCustomerPhone = input.customerPhone || phoneState.contactPhoneNormalized || (phoneState.hasTrustedPhone ? phoneState.contactPhone : undefined);

  // If no contact phone is available and customer hasn't explicitly refused, pause for number
  if (!finalCustomerPhone && !phoneState.customerRefusedPhone && initiatedBy !== "manual_admin") {
    const prompt = buildNaturalCustomerPhoneRequest(customerLanguage);
    markPhoneRequested(customerJid, {
      accountId: cleanAccount,
      leadId: cleanLeadId,
      leadData: { customerName: input.leadName, intent: customerIntent },
      customerLanguage,
      chatHistory: rawConv,
      botId,
    });

    const pendingAudit: LeadRoutingAuditRecord = {
      id: safeId("route_audit"),
      accountId: cleanAccount,
      leadId: cleanLeadId,
      customerJid,
      customerPhone: undefined,
      leadName: input.leadName,
      status: "pending_contact_number",
      attemptTimestamp: now,
      retryCount: 0,
      initiatedBy,
      customerLanguage,
      notes: "Waiting for customer to provide valid contact telephone number.",
    };

    saveAuditRecord(pendingAudit);

    return {
      success: false,
      status: "pending_contact_number",
      auditRecord: pendingAudit,
      customerReplyText: prompt,
      delivered: false,
    };
  }

  // 2. Classify department (or use forced/manual department if provided)
  let targetDepartment: DepartmentConfig | undefined = undefined;
  let classificationReason = "";
  let leadSummary = "";

  const explicitDeptId = forcedDepartmentId || departmentId;
  if (explicitDeptId) {
    targetDepartment = await getDepartment(cleanAccount, explicitDeptId);
    classificationReason = `Manually assigned by ${operator || "administrator"}`;
    leadSummary = cleanString(summaryText || rawConv, 300);
  } else {
    const classification = await classifyLeadDepartment({
      accountId: cleanAccount,
      customerConversation: rawConv,
      customerIntent,
    });

    if (classification.departmentId) {
      targetDepartment = await getDepartment(cleanAccount, classification.departmentId);
    }
    classificationReason = classification.reasoning;
    leadSummary = classification.summary;
  }

  if (!targetDepartment || !targetDepartment.enabled) {
    const unassignedAudit: LeadRoutingAuditRecord = {
      id: safeId("route_audit"),
      accountId: cleanAccount,
      leadId: cleanLeadId,
      customerJid,
      customerPhone: finalCustomerPhone,
      leadName: input.leadName,
      status: "unassigned",
      attemptTimestamp: now,
      retryCount: 0,
      initiatedBy,
      failureReason: "No suitable or enabled department found.",
      notes: classificationReason,
    };
    saveAuditRecord(unassignedAudit);

    emitProactiveLeadLifecycleEvent({
      eventType: "LEAD_UNASSIGNED",
      accountId: cleanAccount,
      botId,
      leadId: cleanLeadId,
      customerJid,
      customerName: input.leadName,
      customerPhone: finalCustomerPhone,
      summary: classificationReason || "Lead could not be assigned to an active department and requires owner review.",
      urgency: "high",
    }).catch((err) => console.warn("[LeadRouting] Proactive unassigned emit failed:", err));

    return {
      success: false,
      status: "unassigned",
      auditRecord: unassignedAudit,
      delivered: false,
    };
  }

  // 3. Idempotency Check: Prevent duplicate department forward for same lead & department
  const idempotencyKey = `lead_forward:${cleanAccount}:${cleanLeadId}:${targetDepartment.id}`;
  const existingAudit = getAuditByLeadAndDept(cleanAccount, cleanLeadId, targetDepartment.id);

  if (existingAudit && existingAudit.status === "forwarded") {
    return {
      success: true,
      status: "duplicate",
      delivered: false,
      auditRecord: existingAudit,
      isDuplicate: true,
      customerReplyText: buildCustomerHandoffAcknowledgement(targetDepartment.name, customerLanguage),
    };
  }

  // 4. Build grounded forward summary
  const summaryMessage = buildGroundedLeadSummary({
    leadName: input.leadName,
    customerPhone: finalCustomerPhone,
    customerJid,
    departmentName: targetDepartment.name,
    requirement: customerIntent || leadSummary,
    qualificationSummary: leadSummary,
    leadId: cleanLeadId,
    timestamp: now,
  });

  // 5. Forward to Department WhatsApp destination
  const targetJid = normalizeWhatsAppJid(targetDepartment.whatsappNumberNormalized);
  const auditRecord: LeadRoutingAuditRecord = {
    id: safeId("route_audit"),
    accountId: cleanAccount,
    leadId: cleanLeadId,
    departmentId: targetDepartment.id,
    departmentName: targetDepartment.name,
    destinationPhone: targetDepartment.whatsappNumberNormalized,
    customerJid,
    customerPhone: finalCustomerPhone,
    leadName: input.leadName,
    summaryText: summaryMessage,
    status: "forwarding",
    attemptTimestamp: now,
    retryCount: (existingAudit?.retryCount || 0) + 1,
    initiatedBy,
    assignedByUserId: operator,
    notes: classificationReason,
    customerLanguage,
  };

  try {
    const sendResult = await leadRoutingDeps.sendUniversalOutboundText({
      userId: cleanAccount,
      botId,
      customerJid: targetJid,
      messageText: summaryMessage,
      idempotencyKey,
      billingAction: "customer_update_scheduled_text",
      contextType: "lead_forward",
      contextId: cleanLeadId,
      sendText: async (jid: string, text: string) => {
        if (sock && typeof sock.sendMessage === "function") {
          const sent = await sock.sendMessage(jid, { text });
          return { messageId: sent?.key?.id || `lead_fwd_${cleanLeadId}_${Date.now()}` };
        }
        return { messageId: `lead_fwd_${cleanLeadId}_${Date.now()}` };
      },
      saveMessage: async () => {},
    });

    let finalSendStatus = sendResult.status;
    let messageId = sendResult.messageId;

    if (finalSendStatus !== "sent" && finalSendStatus !== "duplicate" && sock && typeof sock.sendMessage === "function") {
      try {
        const sent = await sock.sendMessage(targetJid, { text: summaryMessage });
        finalSendStatus = "sent";
        messageId = sent?.key?.id || `fwd_msg_${Date.now()}`;
      } catch (sockErr: any) {
        console.warn("[LeadRouting] Direct socket forward failed:", sockErr);
      }
    }

    if (finalSendStatus === "sent" || finalSendStatus === "duplicate") {
      auditRecord.status = "forwarded";
      auditRecord.successTimestamp = leadRoutingDeps.now();
      auditRecord.messageId = messageId || `fwd_msg_${Date.now()}`;
      saveAuditRecord(auditRecord);

      if (finalSendStatus === "sent") {
        emitProactiveLeadLifecycleEvent({
          eventType: "LEAD_ROUTED_TO_DEPARTMENT",
          accountId: cleanAccount,
          botId,
          leadId: cleanLeadId,
          customerJid,
          customerName: input.leadName,
          customerPhone: finalCustomerPhone,
          departmentId: targetDepartment.id,
          departmentName: targetDepartment.name,
          serviceOrProduct: customerIntent,
          summary: `Lead successfully forwarded to ${targetDepartment.name} WhatsApp (${targetDepartment.whatsappNumberNormalized})`,
          urgency: "normal",
          sock,
        }).catch((err) => console.warn("[LeadRouting] Proactive routed emit failed:", err));
      }

      return {
        success: true,
        status: finalSendStatus === "duplicate" ? "duplicate" : "forwarded",
        delivered: finalSendStatus === "sent",
        auditRecord,
        customerReplyText: buildCustomerHandoffAcknowledgement(targetDepartment.name, customerLanguage),
        isDuplicate: finalSendStatus === "duplicate",
      };
    } else {
      auditRecord.status = "failed";
      auditRecord.failureReason = sendResult.reason || "Forward send rejected by transport";
      saveAuditRecord(auditRecord);

      emitProactiveLeadLifecycleEvent({
        eventType: "LEAD_ROUTING_FAILED",
        accountId: cleanAccount,
        botId,
        leadId: cleanLeadId,
        customerJid,
        customerName: input.leadName,
        customerPhone: finalCustomerPhone,
        departmentId: targetDepartment.id,
        departmentName: targetDepartment.name,
        serviceOrProduct: customerIntent,
        summary: `Failed to forward lead to ${targetDepartment.name} WhatsApp: ${auditRecord.failureReason}`,
        urgency: "urgent",
        sock,
      }).catch((err) => console.warn("[LeadRouting] Proactive routing failed emit failed:", err));

      return {
        success: false,
        status: "failed",
        delivered: false,
        auditRecord,
      };
    }
  } catch (sendErr: any) {
    auditRecord.status = "failed";
    auditRecord.failureReason = sendErr?.message || "Outbound forward transport failed";
    saveAuditRecord(auditRecord);

    emitProactiveLeadLifecycleEvent({
      eventType: "LEAD_ROUTING_FAILED",
      accountId: cleanAccount,
      botId,
      leadId: cleanLeadId,
      customerJid,
      customerName: input.leadName,
      customerPhone: finalCustomerPhone,
      departmentId: targetDepartment.id,
      departmentName: targetDepartment.name,
      serviceOrProduct: customerIntent,
      summary: `Transport error forwarding lead to ${targetDepartment.name}: ${auditRecord.failureReason}`,
      urgency: "urgent",
      sock,
    }).catch((err) => console.warn("[LeadRouting] Proactive routing error catch emit failed:", err));

    return {
      success: false,
      status: "failed",
      delivered: false,
      auditRecord,
    };
  }
}

// ---------------------------------------------------------------------------
// Manual Reassignment & Audit Persistence
// ---------------------------------------------------------------------------

export async function reassignLeadDepartment(
  accountId: string,
  botId: string,
  leadId: string,
  newDepartmentId: string,
  operator: string,
  reason?: string
): Promise<{ success: boolean; auditRecord?: LeadRoutingAuditRecord }> {
  const cleanAccount = cleanString(accountId, 100);
  const cleanLeadId = cleanString(leadId, 100);
  const targetDept = await getDepartment(cleanAccount, newDepartmentId);

  if (!targetDept) {
    throw new Error(`Target department ${newDepartmentId} not found.`);
  }

  const existing = listAuditRecords(cleanAccount).find((a) => a.leadId === cleanLeadId);
  const fromDeptId = existing?.departmentId;

  const res = await forwardLeadToDepartment({
    accountId: cleanAccount,
    botId,
    leadId: cleanLeadId,
    customerJid: existing?.customerJid || `lead_${cleanLeadId}@s.whatsapp.net`,
    customerPhone: existing?.customerPhone,
    leadName: existing?.leadName,
    customerConversation: existing?.summaryText || "Manual admin reassignment",
    forcedDepartmentId: newDepartmentId,
    initiatedBy: "manual_admin",
    operator,
  });

  if (res.auditRecord) {
    const historyEntry = {
      timestamp: leadRoutingDeps.now(),
      action: "reassigned",
      fromDepartmentId: fromDeptId,
      toDepartmentId: newDepartmentId,
      operator: cleanString(operator, 80),
      reason: cleanString(reason || "Manual owner override", 200),
    };
    res.auditRecord.history = [...(res.auditRecord.history || []), historyEntry];
    saveAuditRecord(res.auditRecord);

    emitProactiveLeadLifecycleEvent({
      eventType: "LEAD_REASSIGNED",
      accountId: cleanAccount,
      botId,
      leadId: cleanLeadId,
      customerJid: res.auditRecord.customerJid || existing?.customerJid || `lead_${cleanLeadId}@s.whatsapp.net`,
      customerName: res.auditRecord.leadName || existing?.leadName,
      customerPhone: res.auditRecord.customerPhone || existing?.customerPhone,
      departmentId: targetDept.id,
      departmentName: targetDept.name,
      summary: `Lead reassigned to ${targetDept.name} by ${operator || "administrator"}. Reason: ${cleanString(reason || "Manual owner override", 200)}`,
      urgency: "normal",
    }).catch((err) => console.warn("[LeadRouting] Proactive lead reassigned emit failed:", err));
  }

  return {
    success: res.success,
    auditRecord: res.auditRecord,
  };
}

function saveAuditRecord(record: LeadRoutingAuditRecord): void {
  const list = inMemoryAuditStore.get(record.accountId) || [];
  const idx = list.findIndex((a) => a.id === record.id || (a.leadId === record.leadId && a.departmentId === record.departmentId));
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...record };
  } else {
    list.unshift(record);
  }
  inMemoryAuditStore.set(record.accountId, list.slice(0, 500));
}

export function listAuditRecords(accountId: string): LeadRoutingAuditRecord[] {
  return (inMemoryAuditStore.get(cleanString(accountId, 100)) || []).slice();
}

export function listRecentRoutingAudits(accountId: string, limit = 50): LeadRoutingAuditRecord[] {
  return listAuditRecords(accountId).slice(0, Math.max(1, limit));
}

function getAuditByLeadAndDept(accountId: string, leadId: string, departmentId: string): LeadRoutingAuditRecord | undefined {
  const list = inMemoryAuditStore.get(accountId) || [];
  return list.find((a) => a.leadId === leadId && a.departmentId === departmentId);
}

// ---------------------------------------------------------------------------
// Production Customer Flow Integration & Continuation
// ---------------------------------------------------------------------------

export async function triggerAutomaticCustomerLeadRouting(input: {
  accountId: string;
  botId: string;
  customerJid: string;
  leadId: string;
  leadData: {
    customerName?: string;
    customerPhone?: string;
    serviceName?: string;
    productName?: string;
    notes?: string;
    location?: string;
    intent?: string;
  };
  customerLanguage?: string;
  profile?: any;
  chatHistory?: string | any[];
  countryContext?: { defaultCountryCode?: string; countryCallingCode?: string };
  sock?: any;
  userConfig?: any;
  io?: any;
}): Promise<{
  handled: boolean;
  status?: string;
  actionTaken: "phone_requested" | "forwarded" | "fallback_forwarded" | "unassigned" | "no_departments" | "already_handled";
  replyText?: string;
  departmentName?: string;
  auditRecord?: LeadRoutingAuditRecord;
}> {
  const {
    accountId,
    botId,
    customerJid,
    leadId,
    leadData,
    customerLanguage = "en",
    profile,
    chatHistory = "",
    countryContext,
    sock,
    io,
  } = input;

  const cleanAccount = cleanString(accountId, 100);
  const historyString = typeof chatHistory === "string" ? chatHistory : Array.isArray(chatHistory) ? chatHistory.map((m: any) => `${m.role || 'user'}: ${m.text || m.content || ''}`).join('\n') : "";
  const settings = await loadLeadRoutingSettings(cleanAccount);
  const enabledDepts = settings.departments.filter((d) => d.enabled);

  if (enabledDepts.length === 0) {
    return { handled: false, actionTaken: "no_departments" };
  }

  // Idempotency: check if this lead was already forwarded
  const existingAudits = listAuditRecords(cleanAccount);
  const alreadyForwarded = existingAudits.find((a) => a.leadId === leadId && a.status === "forwarded");
  if (alreadyForwarded) {
    return {
      handled: true,
      status: "already_handled",
      actionTaken: "already_handled",
      departmentName: alreadyForwarded.departmentName,
      replyText: buildCustomerHandoffAcknowledgement(alreadyForwarded.departmentName, customerLanguage),
      auditRecord: alreadyForwarded,
    };
  }

  // Resolve customer phone state
  const phoneState = resolveCustomerPhoneState({
    customerJid,
    profile,
    record: leadData,
  });

  const finalPhone = leadData.customerPhone || phoneState.contactPhoneNormalized || (phoneState.hasTrustedPhone ? phoneState.contactPhone : undefined);

  // Emit NEW_QUALIFIED_LEAD event
  emitProactiveLeadLifecycleEvent({
    eventType: "NEW_QUALIFIED_LEAD",
    accountId: cleanAccount,
    botId,
    leadId,
    customerJid,
    customerName: leadData.customerName,
    customerPhone: finalPhone,
    serviceOrProduct: leadData.serviceName || leadData.productName || leadData.intent,
    summary: `New qualified lead captured: ${leadData.customerName || "Customer"} interested in ${leadData.serviceName || leadData.productName || leadData.intent || "service"}.`,
    urgency: "normal",
    sock,
    io,
  }).catch((err) => console.warn("[LeadRouting] Proactive qualified lead emit failed:", err));

  // Evaluate Commercial Urgency / High-Intent
  const intentEval = evaluateLeadIntentAndUrgency({
    userText: `${leadData.intent || ""} ${leadData.notes || ""} ${historyString.slice(-500)}`,
  });
  if (intentEval.isHighIntent) {
    emitProactiveLeadLifecycleEvent({
      eventType: "HIGH_INTENT_LEAD",
      accountId: cleanAccount,
      botId,
      leadId,
      customerJid,
      customerName: leadData.customerName,
      customerPhone: finalPhone,
      serviceOrProduct: leadData.serviceName || leadData.productName,
      summary: `High commercial intent detected: ${intentEval.reason}`,
      urgency: intentEval.urgency,
      intentConfidence: intentEval.confidence,
      sock,
      io,
    }).catch((err) => console.warn("[LeadRouting] Proactive high intent emit failed:", err));
  }

  // If no contact phone and customer hasn't refused:
  if (!finalPhone && !phoneState.customerRefusedPhone) {
    // Generate polite, natural request in customer's detected language
    const phonePrompt = buildNaturalCustomerPhoneRequest(customerLanguage);
    markPhoneRequested(customerJid, {
      accountId: cleanAccount,
      leadId,
      leadData,
      customerLanguage,
      chatHistory: historyString,
      botId,
    });

    const pendingAudit: LeadRoutingAuditRecord = {
      id: safeId("route_audit"),
      accountId: cleanAccount,
      leadId,
      customerJid,
      leadName: leadData.customerName,
      status: "pending_contact_number",
      attemptTimestamp: leadRoutingDeps.now(),
      retryCount: 0,
      initiatedBy: "ai_auto",
      customerLanguage,
      notes: "Waiting for customer to provide valid contact telephone number.",
    };
    saveAuditRecord(pendingAudit);

    if (sock && typeof sock.sendMessage === "function") {
      await sock.sendMessage(customerJid, { text: phonePrompt }).catch(() => {});
    }

    return {
      handled: true,
      status: "phone_requested",
      actionTaken: "phone_requested",
      replyText: phonePrompt,
      auditRecord: pendingAudit,
    };
  }

  // Customer has trusted phone (or customer refused phone): proceed to semantic department classification and forwarding
  const forwardRes = await forwardLeadToDepartment({
    accountId: cleanAccount,
    botId,
    leadId,
    customerJid,
    customerPhone: finalPhone,
    leadName: leadData.customerName,
    customerConversation: historyString || leadData.notes || leadData.intent || "Lead confirmed",
    customerIntent: leadData.intent || leadData.serviceName || leadData.productName || leadData.notes,
    customerLanguage,
    initiatedBy: "ai_auto",
    sock,
  });

  if (sock && typeof sock.sendMessage === "function" && forwardRes.customerReplyText) {
    await sock.sendMessage(customerJid, { text: forwardRes.customerReplyText }).catch(() => {});
  }

  return {
    handled: true,
    status: forwardRes.status,
    actionTaken: forwardRes.status === "forwarded" ? "forwarded" : (forwardRes.status === "unassigned" ? "unassigned" : "fallback_forwarded"),
    replyText: forwardRes.customerReplyText,
    departmentName: forwardRes.auditRecord?.departmentName,
    auditRecord: forwardRes.auditRecord,
  };
}

export async function checkAndContinueCustomerLeadRouting(input: {
  accountId: string;
  botId: string;
  customerJid: string;
  messageText?: string;
  text?: string;
  profile?: any;
  customerLanguage?: string;
  countryContext?: { defaultCountryCode?: string; countryCallingCode?: string };
  sock?: any;
  io?: any;
}): Promise<{
  handled: boolean;
  isContinuation?: boolean;
  phoneExtracted?: string;
  routingStatus?: string;
  actionTaken?: "phone_captured_and_forwarded" | "forwarded_with_refusal" | "invalid_phone_reprompt";
  replyText?: string;
  auditRecord?: LeadRoutingAuditRecord;
}> {
  const {
    accountId,
    botId,
    customerJid,
    profile,
    customerLanguage = "en",
    countryContext,
    sock,
    io,
  } = input;
  const messageText = input.messageText || input.text || "";

  const cleanAccount = cleanString(accountId, 100);
  const pendingState = getPendingLeadRoutingState(cleanAccount, customerJid, profile);
  if (!pendingState || !pendingState.isPending) {
    return { handled: false, isContinuation: false };
  }

  // Extract phone or check for refusal
  const phoneVal = extractAndValidatePhoneFromText(messageText, countryContext);

  if (phoneVal.error === "customer_refused") {
    // Record refusal and forward anyway with LID note
    recordCustomerProvidedPhone(customerJid, "", true);
    if (dbService.updateCustomerProfile) {
      await dbService.updateCustomerProfile(cleanAccount, customerJid, {
        customerRefusedPhone: true,
        phoneRequestedAt: undefined,
        pendingLeadRoutingId: undefined,
      }).catch(() => {});
    }

    const forwardRes = await forwardLeadToDepartment({
      accountId: cleanAccount,
      botId: pendingState.botId || botId,
      leadId: pendingState.leadId!,
      customerJid,
      customerPhone: undefined,
      leadName: pendingState.leadData?.customerName,
      customerConversation: pendingState.chatHistory || "Lead confirmed - Customer declined phone",
      customerIntent: pendingState.leadData?.intent || pendingState.leadData?.serviceName,
      customerLanguage,
      initiatedBy: "ai_auto",
      sock,
    });

    clearPendingLeadRoutingState(cleanAccount, customerJid);

    const reply = forwardRes.customerReplyText || buildCustomerHandoffAcknowledgement(forwardRes.auditRecord?.departmentName, customerLanguage);
    if (sock && typeof sock.sendMessage === "function") {
      await sock.sendMessage(customerJid, { text: reply }).catch(() => {});
    }

    return {
      handled: true,
      isContinuation: true,
      routingStatus: forwardRes.status,
      actionTaken: "forwarded_with_refusal",
      replyText: reply,
      auditRecord: forwardRes.auditRecord,
    };
  }

  if (phoneVal.isValid && phoneVal.normalized) {
    // Valid phone provided!
    recordCustomerProvidedPhone(customerJid, phoneVal.normalized);
    if (dbService.updateCustomerProfile) {
      await dbService.updateCustomerProfile(cleanAccount, customerJid, {
        contact_phone: phoneVal.normalized,
        contact_phone_normalized: phoneVal.normalized,
        customerPhone: phoneVal.normalized,
        contact_phone_source: "customer_provided",
        phoneRequestedAt: undefined,
        pendingLeadRoutingId: undefined,
      }).catch(() => {});
    }

    const leadDetails = pendingState.leadData ? [
      pendingState.leadData.intent,
      pendingState.leadData.serviceName,
      pendingState.leadData.item ? `Item: ${pendingState.leadData.item}` : "",
      pendingState.leadData.budget ? `Budget: ${pendingState.leadData.budget}` : "",
      pendingState.leadData.eventDate ? `Date: ${pendingState.leadData.eventDate}` : "",
      pendingState.leadData.requirements ? `Requirements: ${pendingState.leadData.requirements}` : "",
      pendingState.leadData.notes,
    ].filter(Boolean).join(" | ") : undefined;

    // Forward lead to department with new phone!
    const forwardRes = await forwardLeadToDepartment({
      accountId: cleanAccount,
      botId: pendingState.botId || botId,
      leadId: pendingState.leadId!,
      customerJid,
      customerPhone: phoneVal.normalized,
      leadName: pendingState.leadData?.customerName,
      customerConversation: `${pendingState.chatHistory || ""}\nCustomer provided phone: ${phoneVal.normalized}`,
      customerIntent: leadDetails || pendingState.leadData?.intent || pendingState.leadData?.serviceName,
      customerLanguage,
      initiatedBy: "ai_auto",
      sock,
    });

    clearPendingLeadRoutingState(cleanAccount, customerJid);

    const reply = forwardRes.customerReplyText || buildCustomerHandoffAcknowledgement(forwardRes.auditRecord?.departmentName, customerLanguage);
    if (sock && typeof sock.sendMessage === "function") {
      await sock.sendMessage(customerJid, { text: reply }).catch(() => {});
    }

    return {
      handled: true,
      isContinuation: true,
      phoneExtracted: phoneVal.normalized,
      routingStatus: forwardRes.status,
      actionTaken: "phone_captured_and_forwarded",
      replyText: reply,
      auditRecord: forwardRes.auditRecord,
    };
  }

  // If candidate digits looked like an invalid phone attempt, reprompt
  if (phoneVal.found && !phoneVal.isValid) {
    const reprompt = phoneVal.error || "Please share your valid phone number including country code.";
    if (sock && typeof sock.sendMessage === "function") {
      await sock.sendMessage(customerJid, { text: reprompt }).catch(() => {});
    }
    return {
      handled: true,
      isContinuation: true,
      actionTaken: "invalid_phone_reprompt",
      replyText: reprompt,
    };
  }

  return { handled: false, isContinuation: false };
}

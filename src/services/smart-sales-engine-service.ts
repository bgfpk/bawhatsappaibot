import fs from "fs";
import path from "path";
import { maskBillingToken } from "./billing-report-service.ts";

export const SMART_SALES_PROMPT_VERSION = "v1";
export const SMART_SALES_EXTRA_CHARGE_USD = 0.001;
const SMART_SALES_GLOBAL_SETTING_KEY = "smart_sales_engine_prompt";
const LOG_DIR = path.join(process.cwd(), "data", "smart-sales-engine");
const DECISION_LOG = path.join(LOG_DIR, "decision-log.jsonl");

export const DEFAULT_SMART_SALES_PROMPT = `SMART SALES ENGINE INSTRUCTION

When this feature is enabled, improve every customer reply using smart, helpful, and natural sales thinking.

Your goal is not to push the customer. Your goal is to help the customer make the right decision using only the business information, products, services, prices, policies, saved knowledge, and conversation context already provided.

Always follow these rules:

1. Reply in the customer's language and tone when possible.
2. Keep replies short, clear, natural, and human.
3. Use the business's existing instructions, products, services, prices, policies, and saved knowledge as the source of truth.
4. Never invent prices, discounts, stock, delivery time, warranty, refund policy, reviews, guarantees, business results, or offers.
5. If important information is missing, ask one useful question or hand off to admin.
6. Ask only one important question at a time.
7. Do not send long catalogs unless the customer asks for many options.
8. Recommend the best fit based on customer need, budget, location, urgency, and previous messages.
9. If the customer is confused, compare 1 to 3 suitable options in a simple way.
10. If the customer asks price, answer clearly and guide them to the next step.
11. If the customer has an objection, respond with empathy, explain value if facts are available, and offer a helpful next step.
12. If the customer shows buying intent, move toward order, booking, quote, lead completion, or handoff naturally.
13. If the customer is angry, asking for refund, asking for sensitive advice, or needs custom negotiation, stop selling and hand off to admin.
14. If useful proof, media, reviews, policy, or portfolio is available, suggest or use it to build trust.
15. End most replies with one clear next step, such as choosing an option, confirming city, sharing details, booking a slot, or asking if they want help.

Reply formula:
Acknowledge the customer + give the most useful answer + guide to one next step.

Do not sound robotic, desperate, pushy, or overly formal. Sound like a smart human sales assistant who listens first, helps clearly, and sells naturally.`;

function clean(value: any, limit = 8000) {
  return String(value || "").trim().slice(0, limit);
}

export function isSmartSalesEnabled(config: any) {
  return config?.smartSalesEngineEnabled === true ||
    config?.smartSalesEngineEnabled === 1 ||
    config?.smart_sales_engine_enabled === true ||
    config?.smart_sales_engine_enabled === 1;
}

export function getSmartSalesExtraCharge(config: any) {
  const value = Number(config?.smartSalesExtraCharge ?? config?.smart_sales_extra_charge ?? SMART_SALES_EXTRA_CHARGE_USD);
  return Number.isFinite(value) && value >= 0 ? value : SMART_SALES_EXTRA_CHARGE_USD;
}

export async function getSmartSalesPromptConfig() {
  const dbService = await import("./db-service.ts");
  const raw = await dbService.getGlobalSetting(SMART_SALES_GLOBAL_SETTING_KEY).catch(() => null);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return {
        smartSalesPromptText: clean(parsed.smartSalesPromptText, 12000) || DEFAULT_SMART_SALES_PROMPT,
        smartSalesPromptVersion: clean(parsed.smartSalesPromptVersion, 40) || SMART_SALES_PROMPT_VERSION,
        smartSalesPromptUpdatedAt: Number(parsed.smartSalesPromptUpdatedAt || 0) || null,
        smartSalesPromptUpdatedBy: clean(parsed.smartSalesPromptUpdatedBy, 120) || "",
      };
    } catch {}
  }
  return {
    smartSalesPromptText: DEFAULT_SMART_SALES_PROMPT,
    smartSalesPromptVersion: SMART_SALES_PROMPT_VERSION,
    smartSalesPromptUpdatedAt: null,
    smartSalesPromptUpdatedBy: "",
  };
}

export async function saveSmartSalesPromptConfig(input: {
  smartSalesPromptText?: string;
  smartSalesPromptVersion?: string;
  updatedBy?: string;
}) {
  const dbService = await import("./db-service.ts");
  const payload = {
    smartSalesPromptText: clean(input.smartSalesPromptText, 12000) || DEFAULT_SMART_SALES_PROMPT,
    smartSalesPromptVersion: clean(input.smartSalesPromptVersion, 40) || SMART_SALES_PROMPT_VERSION,
    smartSalesPromptUpdatedAt: Math.floor(Date.now() / 1000),
    smartSalesPromptUpdatedBy: clean(input.updatedBy, 120),
  };
  await dbService.setGlobalSetting(SMART_SALES_GLOBAL_SETTING_KEY, JSON.stringify(payload));
  return payload;
}

export async function buildSmartSalesPromptLayer(config: any) {
  if (!isSmartSalesEnabled(config)) return { enabled: false, promptText: "", promptVersion: "", extraCharge: SMART_SALES_EXTRA_CHARGE_USD };
  const globalPrompt = await getSmartSalesPromptConfig();
  return {
    enabled: true,
    promptText: globalPrompt.smartSalesPromptText,
    promptVersion: clean(globalPrompt.smartSalesPromptVersion || config?.smartSalesPromptVersion || config?.smart_sales_prompt_version, 40) || SMART_SALES_PROMPT_VERSION,
    extraCharge: getSmartSalesExtraCharge(config),
  };
}

export function buildSmartSalesStableSection(input: { promptText?: string; promptVersion?: string }) {
  const body = clean(input.promptText, 12000) || DEFAULT_SMART_SALES_PROMPT;
  return [
    `Smart Sales prompt version: ${clean(input.promptVersion, 40) || SMART_SALES_PROMPT_VERSION}`,
    body,
    "",
    "Priority boundary: Smart Sales Engine must never override safety rules, client business instructions, learned knowledge, product/service facts, prices, stock, policies, custom confirmation fields, or customer-specific instructions.",
  ].join("\n").trim();
}

const RISKY_CLAIMS = [
  "guaranteed",
  "100%",
  "sure success",
  "limited stock",
  "free",
  "today delivery",
  "discount",
  "refund",
  "warranty",
];

export function findUnsupportedSmartSalesClaim(replyText: string, supportText: string) {
  const reply = clean(replyText, 4000).toLowerCase();
  if (!reply) return "";
  const support = clean(supportText, 30000).toLowerCase();
  return RISKY_CLAIMS.find((claim) => reply.includes(claim) && !support.includes(claim)) || "";
}

export function appendSmartSalesDecisionLog(entry: {
  smartSalesUsed: boolean;
  smartSalesPromptVersion?: string;
  extraChargeApplied?: boolean;
  replyMessageId?: string;
  reasonSkipped?: string;
  botId?: string;
  accountId?: string;
  timestamp?: number;
}) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const safe = {
      timestamp: entry.timestamp || Date.now(),
      smartSalesUsed: Boolean(entry.smartSalesUsed),
      smartSalesPromptVersion: clean(entry.smartSalesPromptVersion, 40),
      extraChargeApplied: Boolean(entry.extraChargeApplied),
      replyMessageId: entry.replyMessageId ? maskBillingToken(entry.replyMessageId, 4) : "",
      reasonSkipped: clean(entry.reasonSkipped, 240),
      botId: entry.botId ? maskBillingToken(entry.botId, 4) : "",
      accountId: entry.accountId ? maskBillingToken(entry.accountId, 4) : "",
    };
    fs.appendFileSync(DECISION_LOG, `${JSON.stringify(safe)}\n`, "utf8");
  } catch {}
}

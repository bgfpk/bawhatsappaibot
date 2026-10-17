import * as dbService from "./db-service.ts";
import { resolveAccountDataOwnerKey } from "./account-data-owner.ts";
import { learnFromManualReply } from "./manual-learning.ts";
import { shouldAnalyzeManualReply } from "./manual-learning-policy.ts";

export async function learnFromManualOutboundMessage(input: {
  sock: any;
  botConfig: any;
  io?: any;
  jid: string;
  text: string;
  kind: string;
  senderName?: string;
  messageId?: string;
  userId?: string;
  botId?: string;
}) {
  if (!input.text || !input.sock?.user?.id) {
    return { learnedInstructions: input.botConfig?.learned_instructions || "", notes: [], chatSummary: "" };
  }

  const myJid = input.sock.user.id.split(":")[0] + "@s.whatsapp.net";
  const dataOwnerKey = await resolveAccountDataOwnerKey(input.userId, myJid);

  await dbService.saveMessage(dataOwnerKey, input.jid, "model", input.text, input.messageId);

  const profile = await dbService.getCustomerProfile(dataOwnerKey, input.jid);
  if (!shouldAnalyzeManualReply({ text: input.text, kind: input.kind, profile })) {
    console.info("[AiCallBudget] ai_call_budget_skipped_learning reason=no_reusable_content");
    console.info("[ManualLearning] learning_extraction_skipped_no_reusable_content");
    input.io?.emit?.("system-log", { type: "info", msg: "learning_extraction_skipped_no_reusable_content" });
    return { learnedInstructions: input.botConfig?.learned_instructions || "", notes: [], chatSummary: "" };
  }

  const [history, accountConfig] = await Promise.all([
    dbService.getChatHistory(dataOwnerKey, input.jid, 10),
    input.userId ? dbService.loadUserConfig(input.userId).catch(() => null) : Promise.resolve(null),
  ]);

  await dbService.updateCustomerProfile(dataOwnerKey, input.jid, { manualLearningAnalyzedAt: Math.floor(Date.now() / 1000) }).catch(() => {});

  const result = await learnFromManualReply({
    botId: input.botId,
    botConfig: input.botConfig,
    dataOwnerKey,
    customerJid: input.jid,
    manualText: input.text,
    manualKind: input.kind,
    customerName: input.senderName,
    sharedInstructions: input.botConfig?.prompt || accountConfig?.ai_prompt || "",
    existingLearned: input.botConfig?.learned_instructions || accountConfig?.learned_instructions || "",
    existingSummary: profile?.chatSummary || "",
    recentHistory: history,
  });

  if (result.learnedInstructions) {
    input.botConfig.learned_instructions = result.learnedInstructions;
  }

  if (result.notes.length > 0) {
    input.io?.emit("system-log", { type: "info", msg: `AI learned from manual reply (${result.notes.length} note${result.notes.length === 1 ? "" : "s"}).` });
  } else if (result.chatSummary) {
    input.io?.emit("system-log", { type: "info", msg: "Updated customer chat summary from manual reply." });
  }

  return result;
}

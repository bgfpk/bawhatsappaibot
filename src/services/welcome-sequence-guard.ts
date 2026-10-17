import * as dbService from "./db-service.ts";
import { shouldSendWelcomeSequence } from "./sequence-history-service.ts";

const welcomeGuardDeps = {
  checkWelcomeSequence: dbService.checkWelcomeSequence,
};

export function __setWelcomeSequenceGuardTestDeps(overrides: Partial<typeof welcomeGuardDeps>) {
  Object.assign(welcomeGuardDeps, overrides || {});
}

export function __resetWelcomeSequenceGuardTestDeps() {
  Object.assign(welcomeGuardDeps, {
    checkWelcomeSequence: dbService.checkWelcomeSequence,
  });
}

export async function shouldSendWelcomeSequenceNow(input: {
  dataOwnerKey: string;
  customerJid: string;
  historyArray?: any[];
  isAdmin?: boolean;
}) {
  if (Array.isArray(input.historyArray) && input.historyArray.length > 0) {
    if (!shouldSendWelcomeSequence(input.historyArray)) {
      return { shouldSend: false, reason: "chat_has_history" };
    }
  }

  const alreadyMarked = !input.isAdmin
    ? await welcomeGuardDeps.checkWelcomeSequence(input.dataOwnerKey, input.customerJid)
    : false;

  if (alreadyMarked) {
    return { shouldSend: false, reason: "already_marked_sent" };
  }

  return {
    shouldSend: true,
    reason: "new_customer",
  };
}

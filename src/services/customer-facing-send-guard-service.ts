import * as dbService from "./db-service.ts";

type GuardInput = {
  userId?: string;
  context: string;
  customerJid?: string;
  io?: any;
  logger?: Pick<Console, "warn">;
};

const guardDeps = {
  canSendCustomerFacingMessage: dbService.canSendCustomerFacingMessage,
};

export function __setCustomerFacingSendGuardTestDeps(overrides: Partial<typeof guardDeps>) {
  Object.assign(guardDeps, overrides || {});
}

export function __resetCustomerFacingSendGuardTestDeps() {
  Object.assign(guardDeps, {
    canSendCustomerFacingMessage: dbService.canSendCustomerFacingMessage,
  });
}

function clean(value: any) {
  return String(value || "").trim();
}

export async function assertCustomerFacingSendAllowed(input: GuardInput) {
  const access = await guardDeps.canSendCustomerFacingMessage(input.userId);
  if (access.allowed) {
    return { allowed: true as const, reason: "", detail: "" };
  }

  const reason = clean(access.reason) || "account_access_expired";
  const target = clean(input.customerJid).split("@")[0];
  const detail = `Blocked customer-facing send (${input.context})${target ? ` for ${target}` : ""}: ${reason}.`;
  input.logger?.warn?.(`[CustomerFacingSendGuard] ${detail}`);
  input.io?.emit?.("system-log", { type: "warning", msg: detail });
  return { allowed: false as const, reason, detail };
}

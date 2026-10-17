import crypto from "crypto";

const INTERNAL_HEADER_NAME = "x-internal-worker-secret";
let serverInternalSecret = "";

function clean(value: any) {
  return String(value || "").trim();
}

export function getOrCreateServerInternalSecret(): string {
  if (!serverInternalSecret) {
    serverInternalSecret = clean(process.env.INTERNAL_WORKER_SECRET) || crypto.randomBytes(32).toString("hex");
  }
  return serverInternalSecret;
}

export function buildWorkerInternalHeaders(customSecret?: string): Record<string, string> {
  const secret = clean(customSecret) || getOrCreateServerInternalSecret();
  return {
    [INTERNAL_HEADER_NAME]: secret,
  };
}

export function verifyWorkerInternalSecret(providedSecret: any, expectedSecret?: string): boolean {
  const provided = clean(providedSecret);
  const expected = clean(expectedSecret) || clean(process.env.INTERNAL_WORKER_SECRET) || serverInternalSecret;
  if (!provided || !expected) return false;

  const providedHash = crypto.createHash("sha256").update(provided).digest();
  const expectedHash = crypto.createHash("sha256").update(expected).digest();

  return crypto.timingSafeEqual(providedHash, expectedHash);
}

export function isWorkerInternalRequest(req: any, expectedSecret?: string): boolean {
  const headerVal = req?.headers?.[INTERNAL_HEADER_NAME] || req?.headers?.[INTERNAL_HEADER_NAME.toLowerCase()];
  return verifyWorkerInternalSecret(headerVal, expectedSecret);
}

export const WORKER_AUTH_CONSTANTS = {
  INTERNAL_HEADER_NAME,
};

import test from "node:test";
import assert from "node:assert/strict";
import {
  getOrCreateServerInternalSecret,
  buildWorkerInternalHeaders,
  verifyWorkerInternalSecret,
  isWorkerInternalRequest,
  WORKER_AUTH_CONSTANTS,
} from "./worker-internal-auth-service.ts";

test("Worker internal auth service: token generation, validation and isolation", () => {
  const secret = getOrCreateServerInternalSecret();
  assert.ok(secret, "Secret generated");
  assert.equal(secret.length >= 64, true, "Secret is at least 64 hex characters (256 bits)");

  // Header builder
  const headers = buildWorkerInternalHeaders(secret);
  assert.equal(headers[WORKER_AUTH_CONSTANTS.INTERNAL_HEADER_NAME], secret);

  // Exact matching
  assert.equal(verifyWorkerInternalSecret(secret, secret), true);
  assert.equal(verifyWorkerInternalSecret("wrong-secret", secret), false);
  assert.equal(verifyWorkerInternalSecret("", secret), false);
  assert.equal(verifyWorkerInternalSecret(undefined, secret), false);

  // Mock Request validation
  const validReq: any = {
    headers: {
      [WORKER_AUTH_CONSTANTS.INTERNAL_HEADER_NAME]: secret,
    },
  };
  assert.equal(isWorkerInternalRequest(validReq, secret), true);

  const invalidReq: any = {
    headers: {
      [WORKER_AUTH_CONSTANTS.INTERNAL_HEADER_NAME]: "attacker_forged_secret",
      origin: "https://blackarrow-source.offline.invalid",
    },
  };
  assert.equal(isWorkerInternalRequest(invalidReq, secret), false);

  const missingHeaderReq: any = {
    headers: {
      origin: "http://localhost:3000",
    },
  };
  assert.equal(isWorkerInternalRequest(missingHeaderReq, secret), false, "Trusted Origin cannot bypass internal secret requirement");

  const spoofedOriginReq: any = {
    headers: {
      origin: "https://blackarrow-source.offline.invalid",
      host: "127.0.0.1:5001",
    },
  };
  assert.equal(isWorkerInternalRequest(spoofedOriginReq, secret), false, "Spoofed Origin header is strictly denied without internal secret");
});

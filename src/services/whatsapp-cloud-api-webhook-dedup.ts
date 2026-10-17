// src/services/whatsapp-cloud-api-webhook-dedup.ts
import { CloudWebhookEventEnvelope } from "./whatsapp-cloud-api-inbound-adapter.ts";

/**
 * Resolves a unique string key for deduplicating incoming webhook events.
 * Returns null if the event is malformed or unsupported.
 */
export function getCloudWebhookDedupKey(
  envelope: CloudWebhookEventEnvelope
): string | null {
  try {
    if (!envelope || !envelope.eventType || !envelope.event) {
      return null;
    }

    const { eventType, event } = envelope;

    if (eventType === "message" && event.message?.id) {
      return `whatsapp_cloud_api:message:${event.message.id}`;
    }

    if (eventType === "status" && event.status?.id) {
      const statusVal = String(event.status.status || "").trim();
      return `whatsapp_cloud_api:status:${event.status.id}:${statusVal}`;
    }

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Dedup options.
 */
export interface CloudWebhookDeduperOptions {
  maxSize?: number;
  ttlMs?: number;
}

/**
 * In-memory dedup store that remembers recent webhook event keys.
 */
export class CloudWebhookDeduper {
  private maxSize: number;
  private ttlMs: number;
  private cache: Map<string, number>;

  constructor(options: CloudWebhookDeduperOptions = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.ttlMs = options.ttlMs ?? 10 * 60 * 1000; // default 10 minutes TTL
    this.cache = new Map<string, number>();
  }

  /**
   * Evaluates a key. Returns true if the key is new (accepted), false if duplicate.
   */
  checkAndRecord(key: string | null): { success: boolean; isDuplicate: boolean; reason?: string } {
    if (!key) {
      return { success: false, isDuplicate: false, reason: "invalid_key" };
    }

    this.evictStale();

    const now = Date.now();
    if (this.cache.has(key)) {
      // update timestamp to extend lifespan
      this.cache.set(key, now);
      return { success: true, isDuplicate: true };
    }

    // Enforce size limit before adding new key
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, now);
    return { success: true, isDuplicate: false };
  }

  /**
   * Evicts expired items based on TTL.
   */
  private evictStale(): void {
    const now = Date.now();
    for (const [key, timestamp] of this.cache.entries()) {
      if (now - timestamp > this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Helper to inspect internal size for testing.
   */
  getSize(): number {
    return this.cache.size;
  }

  /**
   * Clear cache for testing.
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Creates a deduper instance.
 */
export function createCloudWebhookDeduper(
  options?: CloudWebhookDeduperOptions
): CloudWebhookDeduper {
  return new CloudWebhookDeduper(options);
}

/**
 * Summarizes the deduplication check outcome.
 */
export function summarizeCloudWebhookDedupResult(result: any): Record<string, any> {
  if (!result) {
    return { status: "unsupported" };
  }
  return {
    success: result.success,
    isDuplicate: result.isDuplicate,
    reason: result.reason || undefined,
  };
}

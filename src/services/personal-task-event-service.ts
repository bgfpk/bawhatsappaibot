/**
 * Personal Task Event Service
 * 
 * Manages append-only task event trails and event-level idempotency:
 * - Stable event tracking preventing duplicate transitions
 * - Safe metadata sanitization (no passwords, OTPs, raw sensitive values)
 * - In-memory and persistent event history
 */

import { createHash } from "node:crypto";
import type { PersonalTaskEvent, PersonalTaskEventType, PersonalTaskState } from "./personal-task-types.ts";

const eventStore = new Map<string, PersonalTaskEvent[]>();
const processedEventKeys = new Set<string>();

export function buildEventIdempotencyKey(
  taskId: string,
  eventType: PersonalTaskEventType,
  discriminator: string | number
): string {
  const raw = `${taskId}:${eventType}:${discriminator}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 20);
}

export function isEventAlreadyProcessed(dedupKey: string): boolean {
  return processedEventKeys.has(dedupKey);
}

export function recordEventIdempotencyKey(dedupKey: string): void {
  processedEventKeys.add(dedupKey);
}

export function sanitizeEventMetadata(metadata?: Record<string, any>): Record<string, any> {
  if (!metadata) return {};
  const safe: Record<string, any> = {};
  for (const [k, v] of Object.entries(metadata)) {
    const lk = k.toLowerCase();
    if (
      lk.includes("pass") ||
      lk.includes("otp") ||
      lk.includes("pin") ||
      lk.includes("secret") ||
      lk.includes("credential") ||
      lk.includes("token")
    ) {
      safe[k] = "[REDACTED]";
    } else if (typeof v === "string" && v.length > 300) {
      safe[k] = `${v.slice(0, 300)}...`;
    } else {
      safe[k] = v;
    }
  }
  return safe;
}

export function recordPersonalTaskEvent(params: {
  taskId: string;
  type: PersonalTaskEventType;
  actor: "owner" | "contact" | "system" | "timer" | "worker";
  stateBefore: PersonalTaskState;
  stateAfter: PersonalTaskState;
  metadata?: Record<string, any>;
  relatedActionId?: string;
  idempotencyDiscriminator?: string | number;
}): { recorded: boolean; event: PersonalTaskEvent } {
  const { taskId, type, actor, stateBefore, stateAfter, metadata, relatedActionId, idempotencyDiscriminator } = params;

  if (idempotencyDiscriminator) {
    const dedupKey = buildEventIdempotencyKey(taskId, type, idempotencyDiscriminator);
    if (isEventAlreadyProcessed(dedupKey)) {
      const existing = (eventStore.get(taskId) || []).find((e) => e.type === type);
      return {
        recorded: false,
        event: existing || {
          eventId: `pte_dup_${Date.now()}`,
          taskId,
          timestamp: Date.now(),
          type,
          actor,
          stateBefore,
          stateAfter,
          metadata: sanitizeEventMetadata(metadata),
        },
      };
    }
    recordEventIdempotencyKey(dedupKey);
  }

  const eventId = `pte_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const event: PersonalTaskEvent = {
    eventId,
    taskId,
    timestamp: Date.now(),
    type,
    actor,
    stateBefore,
    stateAfter,
    metadata: sanitizeEventMetadata(metadata),
    relatedActionId,
  };

  const list = eventStore.get(taskId) || [];
  list.push(event);
  eventStore.set(taskId, list);

  return { recorded: true, event };
}

export function getPersonalTaskEvents(taskId: string): PersonalTaskEvent[] {
  return [...(eventStore.get(taskId) || [])];
}

export function __clearTaskEventsForTest(): void {
  eventStore.clear();
  processedEventKeys.clear();
}

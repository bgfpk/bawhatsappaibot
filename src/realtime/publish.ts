import { getPubClient } from "./redis.js";
import { EventEnvelope } from "./events.js";

/**
 * Global function to publish an event to Redis pub/sub.
 * These events are typically picked up by the Socket.IO Redis adapter
 * if they are directed to specific rooms, or they can be listened to 
 * manually if doing custom processing.
 */
export async function publishEvent(channel: string, event: EventEnvelope) {
  const pubClient = getPubClient();
  if (!pubClient || pubClient.status !== "ready") {
    // Fail silently but log if in dev or debug mode to avoid crashing the worker
    return;
  }
  
  try {
    const payloadStr = JSON.stringify(event);
    await pubClient.publish(channel, payloadStr);
  } catch (err: any) {
    console.warn(`[Realtime] Failed to publish event to channel ${channel}: ${err.message}`);
  }
}

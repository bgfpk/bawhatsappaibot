import Redis from "ioredis";

// Use environment variables for Redis config
const REDIS_URL = process.env.REDIS_URL || "redis://redis.offline.invalid:6379";
const isTestEnv = process.env.NODE_ENV === "test" || !!process.env.NODE_TEST_CONTEXT;

const redisOptions = {
  maxRetriesPerRequest: null, // Required by bullmq later if used, but safe for standard pubsub
  lazyConnect: isTestEnv,
  enableOfflineQueue: !isTestEnv,
  retryStrategy: (times: number) => {
    // In test environment, stop retrying to prevent open handles
    if (isTestEnv) {
      return null;
    }
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
};

let pubClient: Redis | null = null;
let subClient: Redis | null = null;
let initAttempted = false;

function ensureRedisClients() {
  if (process.env.BLACKARROW_STAGE === '1') return;
  if (initAttempted) return;
  initAttempted = true;
  try {
    pubClient = new Redis(REDIS_URL, redisOptions);
    subClient = pubClient.duplicate();

    pubClient.on("error", (err) => {
      if (!isTestEnv) {
        console.warn("[Redis] PubClient Connection Error:", err.message);
      }
    });

    subClient.on("error", (err) => {
      if (!isTestEnv) {
        console.warn("[Redis] SubClient Connection Error:", err.message);
      }
    });

    pubClient.on("connect", () => {
      console.log("[Redis] PubClient Connected successfully.");
    });

    subClient.on("connect", () => {
      console.log("[Redis] SubClient Connected successfully.");
    });
  } catch (err: any) {
    if (!isTestEnv) {
      console.warn("[Redis] Initialization failed. Realtime features will be disabled. Error:", err.message);
    }
    pubClient = null;
    subClient = null;
  }
}

export const getPubClient = () => {
  ensureRedisClients();
  return pubClient;
};

export const getSubClient = () => {
  ensureRedisClients();
  return subClient;
};

export const checkRedisHealth = async (): Promise<boolean> => {
  ensureRedisClients();
  if (!pubClient) return false;
  try {
    const res = await pubClient.ping();
    return res === "PONG";
  } catch (err) {
    return false;
  }
};

export const closeRedisClients = async () => {
  if (pubClient) {
    try {
      pubClient.disconnect();
    } catch {}
    pubClient = null;
  }
  if (subClient) {
    try {
      subClient.disconnect();
    } catch {}
    subClient = null;
  }
  initAttempted = false;
};

import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { getPubClient, getSubClient } from "./redis.js";
import { MAIN_REALTIME_SOCKET_PATH } from "./constants.js";
import type { EventEnvelope } from "./events.js";
import { ROOMS } from "./rooms.js";
import { Server as HttpServer } from "http";
import { collectAccountDataOwnerCandidates } from "../utils/account-data-owner.js";

export function maskIdentifierForLog(identifier: string): string {
  const cleanId = String(identifier || "").trim();
  if (!cleanId) return "[empty]";
  if (cleanId.length <= 8) return "[masked]";
  return `${cleanId.slice(0, 4)}...${cleanId.slice(-4)}`;
}

function maskJidForLog(jid: string): string {
  const cleanJid = String(jid || "").trim();
  if (!cleanJid) return "[empty]";
  if (cleanJid.length <= 8) return "[masked]";
  return `${cleanJid.slice(0, 4)}...${cleanJid.slice(-4)}`;
}

export async function isConversationJoinAllowed(
  socketData: { accountId: string; user: any; isAdmin?: boolean },
  dataOwnerKey: string,
  listUserBots?: (userId: string) => Promise<any[]>
): Promise<boolean> {
  const requestedKey = String(dataOwnerKey || "").trim().toLowerCase();
  if (!requestedKey) return false;

  const isAdmin = Boolean(socketData.isAdmin);
  if (isAdmin) return true;

  let currentBots: any[] = [];
  if (listUserBots) {
    try {
      currentBots = await listUserBots(socketData.accountId);
    } catch {}
  }

  const allowedCandidates = new Set(
    collectAccountDataOwnerCandidates(socketData.user, currentBots).map((c) => String(c || "").trim().toLowerCase())
  );
  return allowedCandidates.has(requestedKey);
}

export function initSocketServer(
  httpServer: HttpServer,
    options: {
    parseSessionToken: (cookieVal: string) => any;
    readCookieValueFromHeader: (cookieHeader: string | undefined, name: string) => string;
    authCookieName: string;
    getUser: (userId: string) => Promise<any>;
    getStableUserId: (user: any) => string;
    isAdminAccount: (user: any) => boolean;
    listUserBots?: (userId: string) => Promise<any[]>;
  }
): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    path: MAIN_REALTIME_SOCKET_PATH,
    cors: {
      origin: true,
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  const pubClient = getPubClient();
  const subClient = getSubClient();
  if (pubClient && subClient) {
    io.adapter(createAdapter(pubClient, subClient));
  }

  const relayPatterns = [
    "user:*",
    "account:*",
    "account-owner:*",
    "bot:*",
    "conversation:*",
    "admin",
  ];

  const relayClient = getSubClient() || getPubClient();
  if (!relayClient) {
    console.warn("[Realtime] Redis client unavailable; skipping cross-process event relay subscriptions");
    return io;
  }

  const emitRedisEnvelope = (_channel: string, envelope: EventEnvelope) => {
    const rooms = new Set<string>();
    if (envelope.accountId) rooms.add(ROOMS.account(envelope.accountId));
    if (envelope.dataOwnerKey) rooms.add(ROOMS.accountOwner(envelope.dataOwnerKey));
    if (envelope.botId) rooms.add(ROOMS.bot(envelope.botId));
    if (envelope.dataOwnerKey && envelope.customerJid) {
      rooms.add(ROOMS.conversation(envelope.dataOwnerKey, envelope.customerJid));
    }
    for (const room of rooms) {
      io.to(room).emit(envelope.eventType, envelope);
    }
  };

  relayClient.on("pmessage", (_pattern, channel, payload) => {
    try {
      const envelope = JSON.parse(String(payload || "")) as EventEnvelope;
      if (!envelope?.eventType) return;
      emitRedisEnvelope(channel, envelope);
    } catch (err) {
      console.warn("[Realtime] Failed parsing relayed Redis event:", (err as any)?.message || err);
    }
  });

  relayClient.on("error", (err) => {
    console.warn("[Realtime] Relay Redis subscription error:", err.message);
  });

  relayClient.psubscribe(...relayPatterns).catch((err) => {
    console.warn("[Realtime] Failed subscribing relay Redis patterns:", err?.message || err);
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.request.headers.cookie;
      const token = options.readCookieValueFromHeader(cookieHeader, options.authCookieName);
      if (!token) {
        return next(new Error("Authentication error: No session token"));
      }

      const session = options.parseSessionToken(token);
      if (!session || !session.userId) {
        return next(new Error("Authentication error: Invalid session"));
      }

      const user = await options.getUser(String(session.userId));
      if (!user) {
        return next(new Error("Authentication error: User not found"));
      }

      // Attach user info to the socket
      socket.data.user = user;
      socket.data.accountId = options.getStableUserId(user);
      socket.data.isAdmin = options.isAdminAccount(user);
      
      next();
    } catch (err) {
      console.error("[Realtime] Socket Auth Error:", err);
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", async (socket) => {
    const accountId = socket.data.accountId;
    
    // Always join their own account room
    socket.join(ROOMS.account(accountId));
    let userBots: any[] = [];
    if (options.listUserBots) {
      try {
        userBots = await options.listUserBots(accountId);
      } catch (e) {}
    }
    const ownerRooms = collectAccountDataOwnerCandidates(socket.data.user, userBots).map((candidate) => ROOMS.accountOwner(candidate));
    ownerRooms.forEach((room) => socket.join(room));
    
    if (socket.data.isAdmin) {
      socket.join(ROOMS.admin());
    }

    console.info(`[Realtime] account socket connected account=${maskIdentifierForLog(accountId)} admin=${socket.data.isAdmin ? "true" : "false"} ownerRooms=${ownerRooms.length}`);

    // Authoritatively verify tenant ownership before allowing dynamic conversation room joins
    socket.on("join_conversation", async (data: { dataOwnerKey: string; customerJid: string }) => {
      if (!data || !data.dataOwnerKey || !data.customerJid) {
        return;
      }
      const requestedKey = String(data.dataOwnerKey || "").trim().toLowerCase();
      const customerJid = String(data.customerJid || "").trim();
      if (!requestedKey || !customerJid) return;

      const allowed = await isConversationJoinAllowed(
        { accountId, user: socket.data.user, isAdmin: socket.data.isAdmin },
        requestedKey,
        options.listUserBots
      );

      if (!allowed) {
        console.warn(`[Realtime Security] Blocked unauthorized join_conversation account=${maskIdentifierForLog(accountId)} dataOwnerKey=${maskIdentifierForLog(requestedKey)} jid=${maskJidForLog(customerJid)}`);
        return;
      }

      const roomName = ROOMS.conversation(data.dataOwnerKey, data.customerJid);
      socket.join(roomName);
      console.info(`[Realtime] joined authorized conversation room account=${maskIdentifierForLog(accountId)} dataOwnerKey=${maskIdentifierForLog(requestedKey)} jid=${maskJidForLog(customerJid)}`);
    });

    socket.on("leave_conversation", (data: { dataOwnerKey: string; customerJid: string }) => {
      if (data && data.dataOwnerKey && data.customerJid) {
        const roomName = ROOMS.conversation(data.dataOwnerKey, data.customerJid);
        socket.leave(roomName);
      }
    });
    
    socket.on("disconnect", () => {
      // Auto leave rooms handled by socket.io
    });
  });

  return io;
}

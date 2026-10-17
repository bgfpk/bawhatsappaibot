import test from "node:test";
import assert from "node:assert";
import { EventEmitter } from "events";
import { BaileysTransportProvider } from "./baileys-transport-provider.ts";

// Helper to create a fake Baileys‑like socket
function createFakeSocket() {
  const socket = new EventEmitter() as any;
  // Stub sendMessage – resolves with a simple result structure
  socket.sendMessage = async (jid: string, payload: any, options?: any) => {
    // Echo back a fake key.id derived from payload type for test clarity
    const id = payload?.text ? "textId" : payload?.audio ? "voiceId" : "msgId";
    return { key: { id, remoteJid: jid }, status: "sent" };
  };
  return socket;
}

test("BaileysTransportProvider default status is disconnected", async () => {
  const provider = new BaileysTransportProvider({});
  assert.equal(provider.getStatus(), "disconnected");
});

test("start attaches listeners when socket is provided", async () => {
  const socket = createFakeSocket();
  const provider = new BaileysTransportProvider({ socket });
  await provider.start();
  // EventEmitter internal API: listenerCount is not part of Node's public API but we can check via listeners()
  const msgs = socket.listeners("messages.upsert");
  const conn = socket.listeners("connection.update");
  assert.equal(msgs.length, 1);
  assert.equal(conn.length, 1);
  await provider.stop();
});

test("stop removes listeners", async () => {
  const socket = createFakeSocket();
  const provider = new BaileysTransportProvider({ socket });
  await provider.start();
  await provider.stop();
  assert.equal(socket.listeners("messages.upsert").length, 0);
  assert.equal(socket.listeners("connection.update").length, 0);
});

test("incoming message upsert normalizes and calls subscriber", async () => {
  const socket = createFakeSocket();
  const provider = new BaileysTransportProvider({ socket });
  let received:any = null;
  provider.subscribeToIncomingMessages((msg) => { received = msg; });
  await provider.start();
  const rawMsg = { key: { remoteJid: "contact-bb1fa5c89e92@example.invalid", id: "msg1" }, message: { conversation: "hi" } };
  socket.emit("messages.upsert", { messages: [rawMsg] });
  // Allow the event loop to process
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(received);
  assert.equal(received.chatId, "contact-bb1fa5c89e92@example.invalid");
  assert.equal(received.messageType, "text");
  assert.equal(received.text, "hi");
});

test("group JID detection works in incoming messages", async () => {
  const socket = createFakeSocket();
  const provider = new BaileysTransportProvider({ socket });
  let received:any = null;
  provider.subscribeToIncomingMessages((msg) => { received = msg; });
  await provider.start();
  const rawMsg = { key: { remoteJid: "contact-8568d401fd8b@example.invalid", id: "msg2" }, message: { conversation: "group msg" } };
  socket.emit("messages.upsert", { messages: [rawMsg] });
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(received);
  assert.equal(received.isGroup, true);
  assert.equal(received.groupId, "contact-8568d401fd8b@example.invalid");
});

test("connection.update normalizes and invokes subscriber", async () => {
  const socket = createFakeSocket();
  const provider = new BaileysTransportProvider({ socket });
  let status:any = null;
  provider.subscribeToConnectionEvents((s) => { status = s; });
  await provider.start();
  socket.emit("connection.update", { connection: "open" });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(status, "connected");
  assert.equal(provider.getStatus(), "connected");
});

test("sendText maps to socket.sendMessage and normalizes result", async () => {
  const socket = createFakeSocket();
  const provider = new BaileysTransportProvider({ socket });
  const result = await provider.sendText("contact-bb1fa5c89e92@example.invalid", "hello");
  assert.equal(result.success, true);
  assert.equal(result.providerMessageId, "textId");
});

test("sendVoice maps to audio payload and normalizes result", async () => {
  const socket = createFakeSocket();
  const provider = new BaileysTransportProvider({ socket });
  const buf = Buffer.from([0,1,2]);
  const result = await provider.sendVoice("contact-bb1fa5c89e92@example.invalid", buf);
  assert.equal(result.success, true);
  // The fake socket returns "voiceId" for audio payloads – we check success flag.
  assert.ok(result.providerMessageId);
});

test("sendTemplate returns unsupported operation", async () => {
  const provider = new BaileysTransportProvider({});
  const result = await provider.sendTemplate("contact-bb1fa5c89e92@example.invalid", "temp1", "en_US", []);
  assert.equal(result.success, false);
  assert.ok(result.errorMessage?.includes("unsupported_operation"));
});

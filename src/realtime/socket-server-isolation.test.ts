import test from "node:test";
import assert from "node:assert/strict";
import { isConversationJoinAllowed } from "./socket-server.ts";

test("Socket server real join authorization enforces strict tenant boundary", async () => {
  const userAlpha = { $id: "user_alpha", id: "user_alpha", email: "contact-e0905a263469@example.invalid", role: "user" };
  const userBeta = { $id: "user_beta", id: "user_beta", email: "contact-3dfeda449172@example.invalid", role: "user" };
  const userAdmin = { $id: "user_admin", id: "user_admin", email: "contact-258d8dc916db@example.invalid", role: "super_admin" };

  const listUserBots = async (userId: string) => {
    if (userId === "user_alpha") {
      return [{ $id: "bot_alpha_1", id: "bot_alpha_1", user_id: "user_alpha" }];
    }
    if (userId === "user_beta") {
      return [{ $id: "bot_beta_1", id: "bot_beta_1", user_id: "user_beta" }];
    }
    return [];
  };

  const socketAlpha = { accountId: "user_alpha", user: userAlpha, isAdmin: false };
  const socketBeta = { accountId: "user_beta", user: userBeta, isAdmin: false };
  const socketAdmin = { accountId: "user_admin", user: userAdmin, isAdmin: true };

  // 1. Account A own owner key -> allowed
  assert.equal(await isConversationJoinAllowed(socketAlpha, "user_alpha", listUserBots), true);
  assert.equal(await isConversationJoinAllowed(socketAlpha, "account:user_alpha", listUserBots), true);
  assert.equal(await isConversationJoinAllowed(socketAlpha, "bot_alpha_1", listUserBots), true);

  // 2. Account A foreign owner key (Account B) -> blocked
  assert.equal(await isConversationJoinAllowed(socketAlpha, "user_beta", listUserBots), false);
  assert.equal(await isConversationJoinAllowed(socketAlpha, "account:user_beta", listUserBots), false);
  assert.equal(await isConversationJoinAllowed(socketAlpha, "bot_beta_1", listUserBots), false);

  // 3. Account B own owner key -> allowed
  assert.equal(await isConversationJoinAllowed(socketBeta, "user_beta", listUserBots), true);
  assert.equal(await isConversationJoinAllowed(socketBeta, "account:user_beta", listUserBots), true);
  assert.equal(await isConversationJoinAllowed(socketBeta, "bot_beta_1", listUserBots), true);

  // 4. Account B foreign owner key (Account A) -> blocked
  assert.equal(await isConversationJoinAllowed(socketBeta, "user_alpha", listUserBots), false);
  assert.equal(await isConversationJoinAllowed(socketBeta, "bot_alpha_1", listUserBots), false);

  // 5. Malformed requests -> rejected
  assert.equal(await isConversationJoinAllowed(socketAlpha, "", listUserBots), false);
  assert.equal(await isConversationJoinAllowed(socketAlpha, "   ", listUserBots), false);

  // 6. Super admin account -> permitted cross-account
  assert.equal(await isConversationJoinAllowed(socketAdmin, "user_alpha", listUserBots), true);
  assert.equal(await isConversationJoinAllowed(socketAdmin, "user_beta", listUserBots), true);
});

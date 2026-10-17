import test from "node:test";
import assert from "node:assert/strict";

import {
  parseTemplateItem,
  buildMediaLibraryItems,
  buildSequenceGroupItems,
} from "../content-library-runtime-adapter.ts";
import { unwrapMessageContent } from "../../services/whatsapp-message-content.ts";

// Simulate worker-level ingestion & auto-sync logic
function simulateGroupMessageIngest(options: {
  botConfig: { groups: any[] };
  incomingJid: string;
  msg: any;
  localStore: Record<string, any[]>;
}) {
  const { botConfig, incomingJid, msg, localStore } = options;

  if (!incomingJid.endsWith("@g.us")) return { captured: false, reason: "not_a_group" };

  // Match group configuration by exact JID
  const matchedConfig = botConfig?.groups?.find((g: any) => g.jid === incomingJid);
  if (!matchedConfig) return { captured: false, reason: "no_matching_jid" };

  const isEnabled = matchedConfig.enabled !== false;
  if (!isEnabled) return { captured: false, reason: "group_disabled" };

  const isAutoSync = matchedConfig.autoSync !== false;
  if (!isAutoSync) return { captured: false, reason: "auto_sync_disabled" };

  const rawMsg = msg?.originalMessage?.message || msg?.message || msg?.originalMessage || msg;
  const content = unwrapMessageContent(rawMsg);
  if (!content || content.protocolMessage) return { captured: false, reason: "no_content" };

  const hasMedia = !!(
    content.imageMessage ||
    content.videoMessage ||
    content.documentMessage ||
    content.audioMessage ||
    content.stickerMessage
  );

  const purpose = matchedConfig.purpose;
  if (purpose === "media" && !hasMedia) {
    return { captured: false, reason: "media_requires_media_payload" };
  }

  if (!localStore[incomingJid]) localStore[incomingJid] = [];
  const exists = localStore[incomingJid].some((existing: any) => existing.key?.id === msg.key?.id);
  if (!exists) {
    localStore[incomingJid].push(msg);
    return { captured: true, localStoreCount: localStore[incomingJid].length };
  }

  return { captured: false, reason: "already_exists" };
}

test("Requirement 31-A: messages.upsert image on configured Media JID auto-captures", () => {
  const localStore: Record<string, any[]> = {};
  const botConfig = {
    groups: [
      { jid: "contact-5875fcb80c19@example.invalid", name: "Camas Media", purpose: "media", enabled: true, autoSync: true },
    ],
  };

  const imageMsg = {
    key: { id: "wamid_img_001", remoteJid: "contact-5875fcb80c19@example.invalid" },
    message: {
      imageMessage: {
        caption: "Luxury King Bed Model A",
        url: "https://mmg.whatsapp.net/v/img001.jpg",
        mimetype: "image/jpeg",
      },
    },
  };

  const result = simulateGroupMessageIngest({
    botConfig,
    incomingJid: "contact-5875fcb80c19@example.invalid",
    msg: imageMsg,
    localStore,
  });

  assert.equal(result.captured, true);
  assert.equal(localStore["contact-5875fcb80c19@example.invalid"].length, 1);

  const parsed = parseTemplateItem(localStore["contact-5875fcb80c19@example.invalid"][0], 0);
  assert.equal(parsed.type, "image");
  assert.equal(parsed.content, "Luxury King Bed Model A");
  assert.equal(parsed.mediaUrl, "https://mmg.whatsapp.net/v/img001.jpg");
});

test("Requirement 31-B: Video auto-captures and dashboard normalized type remains 'video'", () => {
  const localStore: Record<string, any[]> = {};
  const botConfig = {
    groups: [
      { jid: "contact-4f6d472a389e@example.invalid", name: "Video Demos", purpose: "media", enabled: true, autoSync: true },
    ],
  };

  const videoMsg = {
    key: { id: "wamid_vid_002", remoteJid: "contact-4f6d472a389e@example.invalid" },
    message: {
      videoMessage: {
        caption: "Bed Assembly Video Guide",
        url: "https://mmg.whatsapp.net/v/vid002.mp4",
        mimetype: "video/mp4",
      },
    },
  };

  const result = simulateGroupMessageIngest({
    botConfig,
    incomingJid: "contact-4f6d472a389e@example.invalid",
    msg: videoMsg,
    localStore,
  });

  assert.equal(result.captured, true);
  const parsed = parseTemplateItem(localStore["contact-4f6d472a389e@example.invalid"][0], 0);
  assert.equal(parsed.type, "video");
  assert.equal(parsed.content, "Bed Assembly Video Guide");
});

test("Requirement 31-C: Document auto-captures and retains filename and type 'document'", () => {
  const localStore: Record<string, any[]> = {};
  const botConfig = {
    groups: [
      { jid: "contact-4fa3a8472a00@example.invalid", name: "PDF Catalogs", purpose: "media", enabled: true, autoSync: true },
    ],
  };

  const docMsg = {
    key: { id: "wamid_doc_003", remoteJid: "contact-4fa3a8472a00@example.invalid" },
    message: {
      documentMessage: {
        fileName: "Catalogo_Camas_2026.pdf",
        caption: "Official Pricing Catalog",
        url: "https://mmg.whatsapp.net/v/doc003.pdf",
        mimetype: "application/pdf",
      },
    },
  };

  const result = simulateGroupMessageIngest({
    botConfig,
    incomingJid: "contact-4fa3a8472a00@example.invalid",
    msg: docMsg,
    localStore,
  });

  assert.equal(result.captured, true);
  const parsed = parseTemplateItem(localStore["contact-4fa3a8472a00@example.invalid"][0], 0);
  assert.equal(parsed.type, "document");
  assert.equal(parsed.fileName, "Catalogo_Camas_2026.pdf");
});

test("Requirement 31-D & 31-E: Captured media appears in dashboard items and AI inventory without misclassifying wrapped payload as text", () => {
  // Wrapped message structure from Baileys
  const wrappedRaw = {
    originalMessage: {
      key: { id: "wamid_wrapped_004" },
      message: {
        imageMessage: {
          caption: "Beds Special Edition White",
          url: "https://mmg.whatsapp.net/v/bed_white.jpg",
        },
      },
    },
  };

  const templateDetails = {
    media: {
      templates: [wrappedRaw],
    },
  };

  const items = buildMediaLibraryItems(templateDetails);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, "image");
  assert.equal(items[0].name, "Beds Special Edition White");
  assert.equal(items[0].previewUrl, "https://mmg.whatsapp.net/v/bed_white.jpg");
});

test("Requirement 31-F: Sequence group new messages auto-capture text and media in order", () => {
  const localStore: Record<string, any[]> = {};
  const botConfig = {
    groups: [
      { jid: "contact-3c86c3d5861c@example.invalid", name: "Welcome Flow", purpose: "sequence", enabled: true, autoSync: true },
    ],
  };

  const step1 = {
    key: { id: "step_1" },
    message: { conversation: "Hello and welcome to Camas Guatemala!" },
  };
  const step2 = {
    key: { id: "step_2" },
    message: { imageMessage: { caption: "Here is our 2026 catalog.", url: "https://cdn.example.com/catalog.jpg" } },
  };

  simulateGroupMessageIngest({ botConfig, incomingJid: "contact-3c86c3d5861c@example.invalid", msg: step1, localStore });
  simulateGroupMessageIngest({ botConfig, incomingJid: "contact-3c86c3d5861c@example.invalid", msg: step2, localStore });

  assert.equal(localStore["contact-3c86c3d5861c@example.invalid"].length, 2);

  const seqItems = buildSequenceGroupItems(
    botConfig.groups,
    {
      sequences: {
        "contact-3c86c3d5861c@example.invalid": {
          templates: localStore["contact-3c86c3d5861c@example.invalid"],
        },
      },
    }
  );

  assert.equal(seqItems.length, 1);
  assert.equal(seqItems[0].itemCount, 2);
  assert.equal(seqItems[0].items[0].type, "text");
  assert.equal(seqItems[0].items[0].content, "Hello and welcome to Camas Guatemala!");
  assert.equal(seqItems[0].items[1].type, "image");
});

test("Requirement 31-G: Auto Sync OFF blocks auto-index of incoming group messages", () => {
  const localStore: Record<string, any[]> = {};
  const botConfig = {
    groups: [
      { jid: "contact-c7dd5198dc5c@example.invalid", name: "Manual Group", purpose: "media", enabled: true, autoSync: false },
    ],
  };

  const imageMsg = {
    key: { id: "wamid_no_sync" },
    message: { imageMessage: { caption: "Should not sync automatically" } },
  };

  const result = simulateGroupMessageIngest({
    botConfig,
    incomingJid: "contact-c7dd5198dc5c@example.invalid",
    msg: imageMsg,
    localStore,
  });

  assert.equal(result.captured, false);
  assert.equal(result.reason, "auto_sync_disabled");
  assert.equal(localStore["contact-c7dd5198dc5c@example.invalid"], undefined);
});

test("Requirement 31-H: Enabled OFF prevents active group capture", () => {
  const localStore: Record<string, any[]> = {};
  const botConfig = {
    groups: [
      { jid: "contact-20cdfaf7ed6a@example.invalid", name: "Paused Group", purpose: "media", enabled: false, autoSync: true },
    ],
  };

  const imageMsg = {
    key: { id: "wamid_paused" },
    message: { imageMessage: { caption: "Should not capture when disabled" } },
  };

  const result = simulateGroupMessageIngest({
    botConfig,
    incomingJid: "contact-20cdfaf7ed6a@example.invalid",
    msg: imageMsg,
    localStore,
  });

  assert.equal(result.captured, false);
  assert.equal(result.reason, "group_disabled");
});

test("Requirement 31-I: Blank instructions does NOT block sync", () => {
  const localStore: Record<string, any[]> = {};
  const botConfig = {
    groups: [
      { jid: "contact-db2d9c109f4a@example.invalid", name: "No Notes Group", purpose: "media", enabled: true, autoSync: true, instructions: "" },
    ],
  };

  const imageMsg = {
    key: { id: "wamid_no_notes" },
    message: { imageMessage: { caption: "Bed item without instructions" } },
  };

  const result = simulateGroupMessageIngest({
    botConfig,
    incomingJid: "contact-db2d9c109f4a@example.invalid",
    msg: imageMsg,
    localStore,
  });

  assert.equal(result.captured, true);
  assert.equal(localStore["contact-db2d9c109f4a@example.invalid"].length, 1);
});

test("Requirement 31-J: Group NAME mismatch does NOT affect JID capture; JID is authoritative identity", () => {
  const localStore: Record<string, any[]> = {};
  const botConfig = {
    groups: [
      // Name in config is "Catalogos Antiguos", but incoming group is matched strictly by JID
      { jid: "contact-285761367306@example.invalid", name: "Catalogos Antiguos", purpose: "media", enabled: true, autoSync: true },
    ],
  };

  const imageMsg = {
    key: { id: "wamid_jid_auth" },
    message: { imageMessage: { caption: "New Bed 2026" } },
  };

  const result = simulateGroupMessageIngest({
    botConfig,
    incomingJid: "contact-285761367306@example.invalid",
    msg: imageMsg,
    localStore,
  });

  assert.equal(result.captured, true);
  assert.equal(localStore["contact-285761367306@example.invalid"].length, 1);
});

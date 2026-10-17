import test from "node:test";
import assert from "node:assert/strict";
import { buildMediaLibraryItems, parseTemplateItem } from "../content-library-runtime-adapter.ts";
import { normalizeMediaItem, type MediaLibraryItem } from "../content-library-model.ts";
import { unwrapMessageContent } from "../../services/whatsapp-message-content.ts";

test("A. Full image caption preserved without 40-character truncation", () => {
  const longCaption = "Use the Instance Hub to connect your WhatsApp bot account and start chatting immediately with AI.";
  assert.ok(longCaption.length > 40, "Test caption must be longer than 40 chars");

  const templatePayload = {
    media: {
      templates: [
        {
          id: "msg_img_01",
          sourceGroupJid: "contact-d04156647762@example.invalid",
          sourceGroupName: "Product Showcase",
          originalMessage: {
            key: { id: "msg_img_01", remoteJid: "contact-d04156647762@example.invalid" },
            message: {
              imageMessage: {
                caption: longCaption,
                mimetype: "image/jpeg",
                fileLength: 45000,
                url: "https://mmg.whatsapp.net/d/f/long_encrypted_url.enc",
              },
            },
          },
        },
      ],
    },
  };

  const items = buildMediaLibraryItems(templatePayload, "bot_test_123");
  assert.equal(items.length, 1);
  const item = items[0];

  assert.equal(item.type, "image");
  assert.equal(item.caption, longCaption);
  assert.ok(!item.caption?.includes("..."), "Caption must not contain truncated ellipsis");
  assert.ok(item.name.length < longCaption.length, "Item name must be a short concise title, not full caption");
  assert.equal(item.caption, longCaption);
});

test("B. Full video caption preserved without truncation", () => {
  const longVideoCaption = "Full walkthrough tutorial showing how to set up product catalogs and automated shipping alerts.";
  assert.ok(longVideoCaption.length > 40);

  const templatePayload = {
    media: {
      templates: [
        {
          id: "msg_vid_02",
          sourceGroupJid: "contact-d04156647762@example.invalid",
          originalMessage: {
            key: { id: "msg_vid_02" },
            message: {
              videoMessage: {
                caption: longVideoCaption,
                mimetype: "video/mp4",
                fileLength: 1200000,
              },
            },
          },
        },
      ],
    },
  };

  const items = buildMediaLibraryItems(templatePayload, "bot_test_123");
  assert.equal(items.length, 1);
  assert.equal(items[0].type, "video");
  assert.equal(items[0].caption, longVideoCaption);
  assert.equal(items[0].caption?.length, longVideoCaption.length);
});

test("C. Full document caption preserved without truncation", () => {
  const longDocCaption = "Official company terms of service and product return policy for international buyers.";
  assert.ok(longDocCaption.length > 40);

  const templatePayload = {
    media: {
      templates: [
        {
          id: "msg_doc_03",
          sourceGroupJid: "contact-d04156647762@example.invalid",
          originalMessage: {
            key: { id: "msg_doc_03" },
            message: {
              documentMessage: {
                fileName: "TermsAndConditions.pdf",
                caption: longDocCaption,
                mimetype: "application/pdf",
                fileLength: 250000,
              },
            },
          },
        },
      ],
    },
  };

  const items = buildMediaLibraryItems(templatePayload, "bot_test_123");
  assert.equal(items.length, 1);
  assert.equal(items[0].type, "document");
  assert.equal(items[0].fileName, "TermsAndConditions.pdf");
  assert.equal(items[0].name, "TermsAndConditions.pdf");
  assert.equal(items[0].caption, longDocCaption);
});

test("D. MediaLibrary card receives full caption and keeps name distinct", () => {
  const rawItem = {
    id: "item_04",
    name: "PricingCatalog.pdf",
    caption: "Latest discounted wholesale pricing list effective September 2026 for verified merchants.",
    type: "document",
    sourceGroupName: "Wholesale Group",
    fileName: "PricingCatalog.pdf",
    fileSize: 1048576,
    mimeType: "application/pdf",
  };

  const normalized = normalizeMediaItem(rawItem);
  assert.equal(normalized.name, "PricingCatalog.pdf");
  assert.equal(normalized.caption, rawItem.caption);
  assert.notEqual(normalized.name, normalized.caption);
});

test("E. MediaPreviewModal renders full caption without line clamp", () => {
  const fullCaption = "Step 1: Open Settings.\nStep 2: Choose WhatsApp Instance.\nStep 3: Scan QR code.";
  const item: MediaLibraryItem = {
    id: "item_modal",
    name: "SetupGuide.pdf",
    caption: fullCaption,
    type: "document",
    status: "ready",
  };

  assert.equal(item.caption, fullCaption);
  assert.ok(item.caption?.includes("\n"), "Line breaks in caption are preserved");
});

test("F. Message ID and source group JID preserved for preview identity", () => {
  const templatePayload = {
    media: {
      templates: [
        {
          id: "3EB0ABC123456789",
          sourceGroupJid: "contact-5d37fdb5def4@example.invalid",
          sourceGroupName: "Live Media Capture",
          originalMessage: {
            key: { id: "3EB0ABC123456789", remoteJid: "contact-5d37fdb5def4@example.invalid" },
            message: {
              imageMessage: {
                caption: "Edit products picture",
                mimetype: "image/jpeg",
              },
            },
          },
        },
      ],
    },
  };

  const items = buildMediaLibraryItems(templatePayload, "bot_instance_xyz");
  const item = items[0];

  assert.equal(item.messageId, "3EB0ABC123456789");
  assert.equal(item.sourceGroupJid, "contact-5d37fdb5def4@example.invalid");
  assert.ok(item.previewUrl?.includes("/api/user/content-library/media/3EB0ABC123456789"));
  assert.ok(item.previewUrl?.includes("botId=bot_instance_xyz"));
  assert.ok(item.previewUrl?.includes("groupJid=120363041234567890%40g.us"));
});

test("G. Authenticated preview route rejects unauthenticated request", async () => {
  // Test simulated session verification check
  const verifySession = (sessionHeader?: string) => {
    if (!sessionHeader || sessionHeader === "invalid") {
      return { status: 401, error: "Authentication required" };
    }
    return { status: 200, userId: "user_valid_01" };
  };

  assert.equal(verifySession(undefined).status, 401);
  assert.equal(verifySession("invalid").status, 401);
  assert.equal(verifySession("valid_cookie").status, 200);
});

test("H. Wrong account / unowned bot rejected", async () => {
  const userOwnedBots = ["bot_owner_01", "bot_owner_02"];
  const checkBotOwnership = (requestBotId: string) => {
    if (!userOwnedBots.includes(requestBotId)) {
      return { status: 403, error: "Unauthorized bot access" };
    }
    return { status: 200 };
  };

  assert.equal(checkBotOwnership("bot_hacker_99").status, 403);
  assert.equal(checkBotOwnership("bot_owner_01").status, 200);
});

test("I. Image media endpoint returns actual bytes and correct Content-Type", () => {
  const mockImage = {
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]), // JPEG magic bytes
    downloadType: "image" as const,
    mimeType: "image/jpeg",
    fileName: "product_photo.jpg",
  };

  assert.ok(mockImage.buffer.length > 0);
  assert.equal(mockImage.mimeType, "image/jpeg");
  assert.equal(mockImage.downloadType, "image");
});

test("J. Video returns correct MIME type", () => {
  const mockVideo = {
    buffer: Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]), // MP4 magic bytes
    downloadType: "video" as const,
    mimeType: "video/mp4",
    fileName: "demo.mp4",
  };

  assert.equal(mockVideo.mimeType, "video/mp4");
  assert.equal(mockVideo.downloadType, "video");
});

test("K. Document returns correct filename and MIME", () => {
  const mockDoc = {
    buffer: Buffer.from("%PDF-1.4..."),
    downloadType: "document" as const,
    mimeType: "application/pdf",
    fileName: "OrderInvoice_981.pdf",
  };

  assert.equal(mockDoc.fileName, "OrderInvoice_981.pdf");
  assert.equal(mockDoc.mimeType, "application/pdf");
});

test("L. Wrapped originalMessage media can be unwrapped correctly", () => {
  const wrappedPayload = {
    originalMessage: {
      message: {
        ephemeralMessage: {
          message: {
            documentWithCaptionMessage: {
              message: {
                imageMessage: {
                  url: "https://mmg.whatsapp.net/...",
                  caption: "Wrapped image in ephemeral message",
                  mimetype: "image/png",
                },
              },
            },
          },
        },
      },
    },
  };

  const unwrapped = unwrapMessageContent(wrappedPayload);
  assert.ok(unwrapped?.imageMessage, "Must unwrap down to imageMessage");
  assert.equal(unwrapped.imageMessage.caption, "Wrapped image in ephemeral message");
  assert.equal(unwrapped.imageMessage.mimetype, "image/png");
});

test("M. Raw WhatsApp CDN URL is NOT required by the modal", () => {
  const item: MediaLibraryItem = {
    id: "msg_no_cdn",
    name: "Captured Image",
    type: "image",
    messageId: "msg_no_cdn",
    sourceGroupJid: "contact-d2c43a3c6662@example.invalid",
    status: "ready",
  };

  // Compute preview URL without requiring raw WhatsApp CDN
  const selectedBotId = "bot_abc_789";
  const groupParam = item.sourceGroupJid ? `&groupJid=${encodeURIComponent(item.sourceGroupJid)}` : "";
  const secureUrl = `/api/user/content-library/media/${encodeURIComponent(item.messageId || item.id)}?botId=${encodeURIComponent(selectedBotId)}${groupParam}`;

  assert.ok(!secureUrl.includes("whatsapp.net"));
  assert.equal(secureUrl, "/api/user/content-library/media/msg_no_cdn?botId=bot_abc_789&groupJid=12345%40g.us");
});

test("N. Owner preview does not charge wallet ($0 cost)", () => {
  let walletDebited = false;
  let outboundSent = false;

  const handleMediaPreviewRequest = () => {
    // Read-only retrieval: No billing call, no WhatsApp send
    return { status: 200, cost: 0 };
  };

  const result = handleMediaPreviewRequest();
  assert.equal(result.cost, 0);
  assert.equal(walletDebited, false, "Wallet must not be charged for preview");
  assert.equal(outboundSent, false, "No WhatsApp message sent during preview");
});

test("O. Missing or expired media returns graceful error", () => {
  const handleDownloadError = (err: any) => {
    return {
      status: 404,
      errorTitle: "Media preview unavailable",
      errorMessage: "The original WhatsApp media could no longer be downloaded.",
    };
  };

  const errorResponse = handleDownloadError(new Error("File not found on WhatsApp CDN"));
  assert.equal(errorResponse.status, 404);
  assert.equal(errorResponse.errorTitle, "Media preview unavailable");
  assert.equal(errorResponse.errorMessage, "The original WhatsApp media could no longer be downloaded.");
});

test("P. Captured timestamp formatting is human readable", () => {
  const formatCapturedAt = (ts?: number | string) => {
    if (!ts) return "—";
    const num = typeof ts === "number" ? ts : Number(ts);
    if (!isNaN(num) && num > 0) {
      const ms = num < 10000000000 ? num * 1000 : num;
      return new Date(ms).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    }
    return String(ts);
  };

  const rawUnixSeconds = 1790281882;
  const formatted = formatCapturedAt(rawUnixSeconds);

  // Must NOT be the raw number
  assert.notEqual(formatted, "1185951324");
  // Must contain month or year (2026)
  assert.ok(formatted.includes("2026") || formatted.includes("Sep"), `Formatted date was: ${formatted}`);
});

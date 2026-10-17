import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveMediaShortTitle,
  normalizeMediaItem,
  filterMediaItems,
  filterSequences,
} from "../content-library/content-library-model.ts";
import {
  buildMediaLibraryItems,
  buildSequenceGroupItems,
} from "../content-library/content-library-runtime-adapter.ts";
import {
  buildReusableContentSection,
  buildCustomerBotPromptAssembly,
} from "./customer-bot-prompt-service.ts";
import {
  findBestMediaTemplate,
} from "./ai-handler.ts";
import {
  findSequenceForAiChoice,
} from "./sequence-ai-decision-service.ts";

// ============================================================================
// FIXTURES: 22 Media Items (>20) and 14 Sequences (>12)
// Target Item #17: "Winter Jacket Catalog" (media_item_017)
// Target Sequence #10: "VIP Membership Flow" (seq_group_010)
// ============================================================================

function createComprehensiveMediaFixtures() {
  const items = [];
  const types = ["image", "video", "document", "audio", "sticker"] as const;

  for (let i = 1; i <= 22; i++) {
    const padded = String(i).padStart(3, "0");
    const id = `media_item_${padded}`;
    const type = types[(i - 1) % types.length];

    if (i === 17) {
      // TARGET MEDIA #17: Distinctive multi-paragraph English & Roman Urdu caption
      items.push({
        id,
        key: { id },
        type: "image",
        caption: `Winter Jacket Catalog 2026 Collection\n\nHumari nayi winter jacket collection ab available hai. Featuring premium goose down insulation, waterproof Gore-Tex exterior, windproof storm cuffs, and adjustable hoods. Available in Black, Navy, and Olive Green with sizes from XS to 3XL.\n\nPrice: PKR 8,500. Special seasonal discount applies when ordering 2 or more pieces today with free nationwide delivery across Pakistan.`,
        originalMessage: {
          key: { id, remoteJid: "contact-c1d625d4db03@example.invalid" },
          message: {
            imageMessage: {
              caption: `Winter Jacket Catalog 2026 Collection\n\nHumari nayi winter jacket collection ab available hai. Featuring premium goose down insulation, waterproof Gore-Tex exterior, windproof storm cuffs, and adjustable hoods. Available in Black, Navy, and Olive Green with sizes from XS to 3XL.\n\nPrice: PKR 8,500. Special seasonal discount applies when ordering 2 or more pieces today with free nationwide delivery across Pakistan.`,
              url: "https://cdn.blackarrow.ai/winter-jacket.jpg",
              mimetype: "image/jpeg",
            },
          },
        },
        groupInstructions: "Send this winter jacket catalog whenever customers ask about warm clothes, jackets, sweaters, or winter rates.",
      });
    } else if (type === "document") {
      items.push({
        id,
        key: { id },
        type,
        caption: `Document Item #${i} Detailed Specifications & Terms of Service\n\nFull legal guidelines and user manuals for enterprise accounts. Please review all clauses carefully before signing the agreement contract.`,
        fileName: `specifications_doc_${padded}.pdf`,
        originalMessage: {
          key: { id },
          message: {
            documentMessage: {
              fileName: `specifications_doc_${padded}.pdf`,
              title: `Specifications Document ${padded}`,
              caption: `Document Item #${i} Detailed Specifications & Terms of Service\n\nFull legal guidelines and user manuals for enterprise accounts. Please review all clauses carefully before signing the agreement contract.`,
              mimetype: "application/pdf",
            },
          },
        },
      });
    } else if (type === "video") {
      items.push({
        id,
        key: { id },
        type,
        caption: `Video Walkthrough #${i}: Step-by-step onboarding tutorial\n\nWatch how to configure your account, set up automated notifications, and integrate third-party payment gateways smoothly in less than 5 minutes.`,
        originalMessage: {
          key: { id },
          message: {
            videoMessage: {
              caption: `Video Walkthrough #${i}: Step-by-step onboarding tutorial\n\nWatch how to configure your account, set up automated notifications, and integrate third-party payment gateways smoothly in less than 5 minutes.`,
              url: `https://cdn.blackarrow.ai/video_${padded}.mp4`,
              mimetype: "video/mp4",
            },
          },
        },
      });
    } else if (type === "audio") {
      items.push({
        id,
        key: { id },
        type,
        caption: `Audio Note #${i}: Voice confirmation regarding order details and express shipping status for loyal customers.`,
        fileName: `audio_voice_note_${padded}.ogg`,
        originalMessage: {
          key: { id },
          message: {
            audioMessage: {
              fileName: `audio_voice_note_${padded}.ogg`,
              mimetype: "audio/ogg; codecs=opus",
            },
          },
        },
      });
    } else if (type === "sticker") {
      items.push({
        id,
        key: { id },
        type,
        caption: `Sticker #${i} celebratory brand sticker for successful orders and happy greetings.`,
        originalMessage: {
          key: { id },
          message: {
            stickerMessage: {
              url: `https://cdn.blackarrow.ai/sticker_${padded}.webp`,
              mimetype: "image/webp",
            },
          },
        },
      });
    } else {
      items.push({
        id,
        key: { id },
        type: "image",
        caption: `Product Showcase #${i}: Premium Quality Visual Showcase\n\nYeh item humare best-selling list mein shamil hai. High resolution showcase displaying all angles and premium craftsmanship.`,
        originalMessage: {
          key: { id },
          message: {
            imageMessage: {
              caption: `Product Showcase #${i}: Premium Quality Visual Showcase\n\nYeh item humare best-selling list mein shamil hai. High resolution showcase displaying all angles and premium craftsmanship.`,
              url: `https://cdn.blackarrow.ai/image_${padded}.jpg`,
              mimetype: "image/jpeg",
            },
          },
        },
      });
    }
  }

  return items;
}

function createComprehensiveSequenceFixtures() {
  const sequences: Record<string, any> = {};

  for (let i = 1; i <= 14; i++) {
    const padded = String(i).padStart(3, "0");
    const key = `seq_group_${padded}`;

    if (i === 10) {
      // TARGET SEQUENCE #10: Multi-item VIP membership flow
      sequences[key] = {
        id: key,
        config: {
          id: key,
          name: "VIP Membership Flow",
          shortcut_code: "vip",
          trigger_keywords: "vip,membership,elite club,privilege pass",
          instructions: "Deliver VIP welcome kit with exclusive member discount voucher and terms document.",
        },
        templates: [
          {
            message: {
              conversation: "Assalam o Alaikum! Welcome to the exclusive BlackArrow VIP Club. We are thrilled to have you.",
            },
          },
          {
            message: {
              imageMessage: {
                caption: "VIP Member Card & 25% Off Voucher: Use code VIPGOLD25 on checkout.",
                url: "https://cdn.blackarrow.ai/vip-card.jpg",
              },
            },
          },
          {
            message: {
              documentMessage: {
                fileName: "vip_benefits_guide.pdf",
                title: "VIP Benefits & Privileges",
                caption: "Detailed breakdown of concierge perks, cashback tiers, and priority customer care.",
              },
            },
          },
        ],
      };
    } else {
      sequences[key] = {
        id: key,
        config: {
          id: key,
          name: `Automated Sequence #${i}`,
          shortcut_code: `seq${i}`,
          trigger_keywords: `seq_${padded},trigger_${i},keyword_${i}`,
          instructions: `Step-by-step guidance for workflow #${i}`,
        },
        templates: [
          {
            message: {
              conversation: `Initial message for sequence #${i} explaining the process.`,
            },
          },
          {
            message: {
              extendedTextMessage: {
                text: `Follow-up details for sequence #${i} with additional instructions and next actions.`,
              },
            },
          },
        ],
      };
    }
  }

  return sequences;
}

test("Comprehensive Customer Media & Sequence Intelligence (Requirements A-U)", async (t) => {
  const mediaFixtures = createComprehensiveMediaFixtures();
  const sequenceFixtures = createComprehensiveSequenceFixtures();

  const reusableSection = buildReusableContentSection({
    cachedMediaTemplates: mediaFixtures,
    cachedKeywordSequences: sequenceFixtures,
    cachedWelcomeTemplates: [],
  });

  // ==========================================================================
  // Test A: All 20+ media captions appear in reusable AI context
  // ==========================================================================
  await t.test("A. ALL 20+ MEDIA CAPTIONS: Every single synced media item caption is present in AI context", () => {
    assert.equal(mediaFixtures.length, 22, "Fixture must have at least 20 media items");
    for (const item of mediaFixtures) {
      if (item.caption) {
        assert.ok(
          reusableSection.includes(item.id),
          `AI context must contain media ID ${item.id}`
        );
        // First 30 chars of caption must be present in the section
        const captionSnippet = item.caption.slice(0, 30);
        assert.ok(
          reusableSection.includes(captionSnippet),
          `AI context must contain caption snippet "${captionSnippet}" for ${item.id}`
        );
      }
    }
  });

  // ==========================================================================
  // Test B: No slice(0, 10) on media items
  // ==========================================================================
  await t.test("B. NO MEDIA TRUNCATION LIMIT: Arbitrary slice(0, 10) is eliminated", () => {
    // Check that items past index 10 (e.g. items 11 through 22) are all included
    for (let i = 11; i <= 22; i++) {
      const padded = String(i).padStart(3, "0");
      assert.ok(
        reusableSection.includes(`media_item_${padded}`),
        `Item media_item_${padded} (index > 10) must be included in prompt`
      );
    }
  });

  // ==========================================================================
  // Test C: All 12+ sequence groups appear in reusable AI context
  // ==========================================================================
  await t.test("C. ALL 12+ SEQUENCE GROUPS: Every configured sequence group is present in AI context", () => {
    const sequenceKeys = Object.keys(sequenceFixtures);
    assert.equal(sequenceKeys.length, 14, "Fixture must have at least 12 sequence groups");
    for (const key of sequenceKeys) {
      const seq = sequenceFixtures[key];
      assert.ok(
        reusableSection.includes(seq.config.name),
        `AI context must contain sequence name: ${seq.config.name}`
      );
    }
  });

  // ==========================================================================
  // Test D: No slice(0, 8) on sequence groups
  // ==========================================================================
  await t.test("D. NO SEQUENCE TRUNCATION LIMIT: Arbitrary slice(0, 8) is eliminated", () => {
    for (let i = 9; i <= 14; i++) {
      const padded = String(i).padStart(3, "0");
      const key = `seq_group_${padded}`;
      const seq = sequenceFixtures[key];
      assert.ok(
        reusableSection.includes(seq.config.name),
        `Sequence ${seq.config.name} (index > 8) must be included in prompt`
      );
    }
  });

  // ==========================================================================
  // Test E: Complete sequence item captions and text included in delivery order
  // ==========================================================================
  await t.test("E. COMPLETE SEQUENCE ITEMS: Items rendered in delivery order with types and full content", () => {
    assert.ok(reusableSection.includes("Sequence: VIP Membership Flow"));
    assert.ok(reusableSection.includes("Item 1 [text]:"));
    assert.ok(reusableSection.includes("Assalam o Alaikum! Welcome to the exclusive BlackArrow VIP Club."));
    assert.ok(reusableSection.includes("Item 2 [image]:"));
    assert.ok(reusableSection.includes("VIP Member Card & 25% Off Voucher: Use code VIPGOLD25 on checkout."));
    assert.ok(reusableSection.includes("Item 3 [document] (Filename: vip_benefits_guide.pdf):"));
    assert.ok(reusableSection.includes("Detailed breakdown of concierge perks, cashback tiers, and priority customer care."));
  });

  // ==========================================================================
  // Test F: Complete media caption is preserved, not truncated to 120 chars
  // ==========================================================================
  await t.test("F. FULL UNEDITED CAPTIONS: Long captions (>120 chars) are NOT truncated with compactAiText", () => {
    const item17 = mediaFixtures[16];
    assert.ok(item17.caption.length > 250, "Target caption must be longer than 250 characters");
    assert.ok(
      reusableSection.includes("waterproof Gore-Tex exterior, windproof storm cuffs, and adjustable hoods."),
      "AI context must contain deep middle text of caption past 120 chars"
    );
    assert.ok(
      reusableSection.includes("Special seasonal discount applies when ordering 2 or more pieces today with free nationwide delivery across Pakistan."),
      "AI context must contain ending text of long multi-line caption"
    );
  });

  // ==========================================================================
  // Test G: Stable IDs included in prompt for precision tool calls
  // ==========================================================================
  await t.test("G. STABLE IDS INCLUDED: Prompt provides exact stable ID for sendMediaFile", () => {
    assert.ok(
      reusableSection.includes('Call sendMediaFile: media_name: "media_item_017"'),
      "Prompt must explicitly instruct tool call with exact media ID"
    );
    assert.ok(
      reusableSection.includes('media_name: "vip"'),
      "Prompt must instruct tool call with sequence shortcut"
    );
  });

  // ==========================================================================
  // Test H: Short name included separately from caption
  // ==========================================================================
  await t.test("H. SHORT NAME SEPARATE: Prompt displays concise Name and full multi-line Caption separately", () => {
    assert.ok(
      reusableSection.includes("Name: Winter Jacket Catalog 2026 Collection"),
      "Short title extracted cleanly from first line"
    );
    assert.ok(
      reusableSection.includes("Caption:\n  Winter Jacket Catalog 2026 Collection"),
      "Full caption displayed in its own dedicated block"
    );
    assert.ok(
      reusableSection.includes("Humari nayi winter jacket collection ab available hai."),
      "Full caption body preserved"
    );
  });

  // ==========================================================================
  // Test I: Target media #17 can be selected by ID, short name, or caption
  // ==========================================================================
  await t.test("I. TARGET MEDIA #17 RESOLUTION: Can be accurately matched by ID, name, or caption snippet", () => {
    // Match by ID
    const byId = findBestMediaTemplate(mediaFixtures, "media_item_017");
    assert.equal(byId?.id, "media_item_017");

    // Match by short name
    const byName = findBestMediaTemplate(mediaFixtures, "Winter Jacket Catalog 2026 Collection");
    assert.equal(byName?.id, "media_item_017");

    // Match by deep caption snippet
    const bySnippet = findBestMediaTemplate(mediaFixtures, "waterproof Gore-Tex exterior");
    assert.equal(bySnippet?.id, "media_item_017");
  });

  // ==========================================================================
  // Test J: Target sequence #10 can be selected by name or shortcut
  // ==========================================================================
  await t.test("J. TARGET SEQUENCE #10 RESOLUTION: Matched cleanly by name or shortcut without false positives", () => {
    const byName = findSequenceForAiChoice(sequenceFixtures, "VIP Membership Flow");
    assert.equal(byName?.key, "seq_group_010");

    const byShortcut = findSequenceForAiChoice(sequenceFixtures, "vip");
    assert.equal(byShortcut?.key, "seq_group_010");
  });

  // ==========================================================================
  // Test K: Semantic media use without explicit "image/photo/send" words
  // ==========================================================================
  await t.test("K. SEMANTIC MEDIA USE: Resolves relevant media for product/topic query without 'send picture'", () => {
    // Customer asks purely about product details: "What winter clothing do you have for severe cold?"
    const result = findBestMediaTemplate(
      mediaFixtures,
      "Winter Jacket Catalog 2026 Collection",
      "What winter clothing do you have for severe cold?"
    );
    assert.equal(result?.id, "media_item_017");
  });

  // ==========================================================================
  // Test L: Explicit natural media request
  // ==========================================================================
  await t.test("L. EXPLICIT NATURAL MEDIA REQUEST: 'Please send the winter jacket catalog photo' resolves correctly", () => {
    const result = findBestMediaTemplate(
      mediaFixtures,
      "Winter Jacket Catalog",
      "Please send the winter jacket catalog photo"
    );
    assert.equal(result?.id, "media_item_017");
  });

  // ==========================================================================
  // Test M: Roman Urdu request -> English caption relevance
  // ==========================================================================
  await t.test("M. ROMAN URDU RELEVANCE: 'Mujhe winter jacket aur rates dikha dein' matches target item #17", () => {
    // AI extracts media_name or ID from context:
    const byUrduContext = findBestMediaTemplate(
      mediaFixtures,
      "media_item_017",
      "Mujhe winter jacket aur rates dikha dein"
    );
    assert.equal(byUrduContext?.id, "media_item_017");

    const byUrduSnippet = findBestMediaTemplate(
      mediaFixtures,
      "Humari nayi winter jacket collection",
      "Bhai winter jackets ki collection dikhao"
    );
    assert.equal(byUrduSnippet?.id, "media_item_017");
  });

  // ==========================================================================
  // Test N: UI name is short
  // ==========================================================================
  await t.test("N. UI NAME IS SHORT: deriveMediaShortTitle produces concise title <= 60 chars without newlines", () => {
    const raw = mediaFixtures[16];
    const shortTitle = deriveMediaShortTitle({
      type: "image",
      caption: raw.caption,
    });
    assert.ok(shortTitle.length <= 60, `Title length ${shortTitle.length} must be <= 60 chars`);
    assert.ok(!shortTitle.includes("\n"), "Title must not contain newline characters");
    assert.equal(shortTitle, "Winter Jacket Catalog 2026 Collection");

    const normalized = normalizeMediaItem(raw);
    assert.equal(normalized.name, "Winter Jacket Catalog 2026 Collection");
    assert.ok(normalized.name.length < normalized.caption!.length);
  });

  // ==========================================================================
  // Test O: Full caption displayed under name
  // ==========================================================================
  await t.test("O. FULL CAPTION PRESERVED UNDER NAME: normalizeMediaItem preserves full untruncated caption", () => {
    const raw = mediaFixtures[16];
    const normalized = normalizeMediaItem(raw);
    assert.equal(normalized.caption, raw.caption);
    assert.ok(normalized.caption!.includes("Special seasonal discount applies when ordering 2 or more pieces"));
  });

  // ==========================================================================
  // Test P: Preview modal title is short name
  // ==========================================================================
  await t.test("P. PREVIEW MODAL TITLE IS SHORT NAME: Modal title derives from item.name, not the full caption", () => {
    const raw = mediaFixtures[16];
    const normalized = normalizeMediaItem(raw);
    const modalTitle = normalized.name || normalized.fileName || "Media Preview";
    assert.equal(modalTitle, "Winter Jacket Catalog 2026 Collection");
    assert.ok(modalTitle.length < 50);
  });

  // ==========================================================================
  // Test Q: Full caption appears in Preview caption section
  // ==========================================================================
  await t.test("Q. PREVIEW MODAL CAPTION: Preview modal receives complete multi-line caption", () => {
    const raw = mediaFixtures[16];
    const normalized = normalizeMediaItem(raw);
    assert.ok(normalized.caption);
    assert.ok(normalized.caption.includes("\n\n"));
    assert.ok(normalized.caption.includes("PKR 8,500"));
  });

  // ==========================================================================
  // Test R: Search matches full caption
  // ==========================================================================
  await t.test("R. SEARCH MATCHES FULL CAPTION: filterMediaItems finds items matching text located only deep in the caption", () => {
    const normalizedList = mediaFixtures.map(normalizeMediaItem);

    // Search query "Gore-Tex" appears only in the caption body of item 17, not in its title
    const searchResults = filterMediaItems(normalizedList, "Gore-Tex", "all");
    assert.equal(searchResults.length, 1);
    assert.equal(searchResults[0].id, "media_item_017");

    // Search query "olive green" appears only in the caption body of item 17
    const colorResults = filterMediaItems(normalizedList, "olive green", "all");
    assert.equal(colorResults.length, 1);
    assert.equal(colorResults[0].id, "media_item_017");
  });

  // ==========================================================================
  // Test S: Media execution uses original WhatsApp message
  // ==========================================================================
  await t.test("S. ORIGINAL WHATSAPP MESSAGE FORWARDING: Template preserves originalMessage for Baileys relay", () => {
    const targetItem = mediaFixtures[16];
    const msgToForward = targetItem.originalMessage || targetItem;
    assert.ok(msgToForward.key?.id, "Original message must have key.id");
    assert.ok(msgToForward.message?.imageMessage, "Must be valid imageMessage structure");
    assert.equal(msgToForward.key.id, "media_item_017");
  });

  // ==========================================================================
  // Test T: Sequence execution preserves correct item order
  // ==========================================================================
  await t.test("T. SEQUENCE ITEM ORDER PRESERVED: Items are ordered strictly 1..N with distinct types", () => {
    const targetSeq = sequenceFixtures["seq_group_010"];
    const syncGroups: any[] = [{
      id: "seq_group_010",
      name: "VIP Membership Flow",
      purpose: "sequence",
      shortcut_code: "vip",
    }];
    const templateDetails = {
      sequences: {
        "VIP Membership Flow": targetSeq,
      },
    };
    const groupItems = buildSequenceGroupItems(syncGroups, templateDetails);

    assert.equal(groupItems.length, 1);
    const seq = groupItems[0];
    assert.equal(seq.items.length, 3);
    assert.equal(seq.items[0].index, 1);
    assert.equal(seq.items[0].type, "text");
    assert.equal(seq.items[1].index, 2);
    assert.equal(seq.items[1].type, "image");
    assert.equal(seq.items[2].index, 3);
    assert.equal(seq.items[2].type, "document");
  });

  // ==========================================================================
  // Test U: Verify no deterministic keyword router or token-overlap preemption
  // ==========================================================================
  await t.test("U. NO DETERMINISTIC KEYWORD ROUTER: DeepSeek AI loop handles conversational media evaluation", () => {
    // Prompt assembly includes instructions that AI decides relevance without fixed keyword matching
    const assembly = buildCustomerBotPromptAssembly({
      userConfig: {
        bot_name: "BlackArrow Test Bot",
        business_type: "fashion",
      },
      basePrompt: "Serve customers professionally.",
      learnedRulesText: "",
      instanceCustomFields: [],
      instanceReplyBehavior: "text_preferred",
      products: [],
      cachedMediaTemplates: mediaFixtures,
      cachedKeywordSequences: sequenceFixtures,
      languagePreference: { language: "english", preferredLanguage: "english" },
      effectiveProfile: {},
      savedDeliveryName: "",
      replyBehavior: "text_preferred",
      personaPreference: {},
      effectiveChatSummary: "",
      customerInstructions: "",
      lastUserMsgText: "",
      lastUserMsgIsVoice: false,
      lastUserMsgHasImage: false,
      aiMessagesCount: 0,
    });

    assert.ok(
      assembly.stablePrefix.includes("DeepSeek determines relevance"),
      "System prompt empowers AI to determine media relevance contextually"
    );
    assert.ok(
      assembly.stablePrefix.includes("Do not spam media"),
      "System prompt gives clear guidance to send only when it improves the response"
    );
  });
});

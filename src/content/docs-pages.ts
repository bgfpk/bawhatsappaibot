export type DocsSection = {
  id: string;
  title: string;
  body: string[];
  steps?: string[];
  warnings?: string[];
  bestPractices?: string[];
};

export type DocsPage = {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  shortLabel: string;
  summary: string;
  intro: string[];
  sections: DocsSection[];
  relatedDocs: string[];
  relatedLinks: { href: string; label: string }[];
  ctaTitle: string;
  ctaBody: string;
};

export const DOCS_PAGES: DocsPage[] = [
  {
    slug: "getting-started",
    title: "Quick Start and Account Setup",
    metaTitle: "BlackArrow Docs: Quick Start and Account Setup | BlackArrow",
    metaDescription: "Create a BlackArrow account, understand the trial, pick a plan, and prepare a safe WhatsApp AI automation launch.",
    shortLabel: "Quick start",
    summary: "Account setup, trial basics, billing overview, and the first launch checklist.",
    intro: [
      "BlackArrow helps businesses run WhatsApp AI sales and support automation with CRM, customer profiles, follow-ups, customer updates, products, media, sequences, API/webhooks, WooCommerce, WordPress Website Connector, and Website Knowledge.",
      "Start with a narrow workflow, confirm billing and safety settings, then expand once your team has reviewed real conversations.",
    ],
    sections: [
      {
        id: "what-blackarrow-is",
        title: "What BlackArrow is",
        body: [
          "BlackArrow connects a client-controlled WhatsApp identity to AI replies, CRM pipeline tools, customer profiles, product or service knowledge, reusable WhatsApp-native media, follow-ups, customer updates, and integrations.",
          "It is built to help with repeat sales/support conversations while keeping humans responsible for policies, pricing, delivery promises, refunds, compliance, and edge cases.",
        ],
      },
      {
        id: "account-setup",
        title: "Account setup",
        body: [
          "Create an account, accept the required legal terms, review dashboard basics, then confirm who owns billing, WhatsApp connection, and conversation review.",
          "New accounts may use a 7-day free trial or 100 hosted AI replies limit with $1 AI test credit. The live Billing page shows your current plan, wallet, subscription, trial, and usage state.",
        ],
        steps: [
          "Sign up with a business-controlled email and complete legal acceptance.",
          "Review Billing, Instance Hub, Intelligence, Products, CRM, Follow-up Center, and Integrations.",
          "Pick one first workflow to test before enabling broad automation.",
        ],
      },
      {
        id: "billing-basics",
        title: "Plans, wallet, and usage basics",
        body: [
          "Client-facing plans are Starter at $9/mo, Growth at $29/mo, and Pro at $89/mo. Wallet top-ups are $5, $10, $25, $50, and $100.",
          "Limited-time AI text discount: regular $0.005, now $0.003 per successful AI text reply/message, saving $0.002 (40%). Fixed follow-ups are $0.001 per successful sent message. AI Smart Follow-ups and Customer Updates use the same regular $0.005 to now $0.003 limited-time pricing per successful sent message. Sequence/template and media pricing follows the configured pricing shown in Billing.",
        ],
        warnings: [
          "Failed, skipped, duplicate, cancelled, invalid, insufficient-wallet, or unsent attempts should not be treated as successful billable sends.",
          "Automation can pause when wallet is empty, the trial ends, the hosted reply limit is exhausted, or the subscription is inactive or expired.",
        ],
      },
    ],
    relatedDocs: ["whatsapp-setup", "intelligence-reply-behavior", "plans-wallet-source-values"],
    relatedLinks: [
      { href: "/features", label: "See current features" },
      { href: "/pricing", label: "Review pricing" },
    ],
    ctaTitle: "Ready to connect WhatsApp?",
    ctaBody: "Open the WhatsApp setup guide before scanning the QR code.",
  },
  {
    slug: "whatsapp-setup",
    title: "WhatsApp Instance Setup",
    metaTitle: "BlackArrow Docs: WhatsApp Instance Setup | BlackArrow",
    metaDescription: "Use Instance Hub, Sync New Identity, QR scan, connection states, reset login, and safe WhatsApp number practices.",
    shortLabel: "WhatsApp setup",
    summary: "Instance Hub, QR linking, connection states, reset login, and number safety.",
    intro: [
      "Instance Hub is where you connect and monitor the WhatsApp identity used for automation. Use a business or secondary number and keep a human owner responsible for the connection.",
    ],
    sections: [
      {
        id: "instance-hub",
        title: "Instance Hub and Sync New Identity",
        body: [
          "Create or open the instance you want to connect, then use Sync New Identity when you need a fresh WhatsApp identity/session flow. The dashboard shows whether the connection is connected, waiting for QR, reconnecting, disconnected, or needs action.",
        ],
        steps: [
          "Open Instance Hub.",
          "Choose the instance you want to connect.",
          "Start connection or Sync New Identity when needed.",
          "Scan the QR with WhatsApp Linked Devices on the phone that owns the business number.",
        ],
      },
      {
        id: "reset-login",
        title: "Reset login and reconnect",
        body: [
          "Use Reset Login when the QR is stale, the number was logged out, the wrong WhatsApp account was linked, or the session is unstable.",
          "After reset, scan the new QR and test a small real conversation before relying on live automation again.",
        ],
      },
      {
        id: "number-safety",
        title: "WhatsApp number safety",
        body: [
          "Use a number your business controls, avoid spam or cold outreach, and do not promise guaranteed WhatsApp account safety. Keep the phone available for manual review and avoid unnecessary linked-device changes during busy periods.",
        ],
        warnings: [
          "Client remains responsible for WhatsApp account usage, customer consent, message content, and compliance.",
        ],
      },
    ],
    relatedDocs: ["getting-started", "daily-operations-safe-controls", "launch-safety-client-responsibility"],
    relatedLinks: [{ href: "/features", label: "Feature overview" }],
    ctaTitle: "Connection healthy?",
    ctaBody: "Configure Intelligence next so replies use the right tone, language, and safety rules.",
  },
  {
    slug: "intelligence-reply-behavior",
    title: "Intelligence, AI Replies, and Knowledge",
    metaTitle: "BlackArrow Docs: Intelligence, AI Replies, and Knowledge | BlackArrow",
    metaDescription: "Configure bot name, persona, instructions, reply modes, language behavior, Gemini options, and Website Knowledge.",
    shortLabel: "Intelligence",
    summary: "Bot persona, business instructions, reply modes, training, Gemini options, and Website Knowledge.",
    intro: [
      "Intelligence settings shape how the AI replies in WhatsApp. Keep rules clear, current, and business-friendly so the assistant can answer common questions without inventing policies.",
    ],
    sections: [
      {
        id: "persona-instructions",
        title: "Bot name, persona, and business instructions",
        body: [
          "Set the bot name/persona, business type, reply style, handoff rules, pricing rules, delivery rules, and support boundaries. Put stable business facts in instructions and product/service facts in the catalog or Website Knowledge where possible.",
        ],
      },
      {
        id: "reply-modes",
        title: "Reply modes",
        body: [
          "Always Text replies in text. Always Voice favors audio replies. Customer Preference follows the customer's format where practical. Text Preferred understands voice or media where available but keeps text as the safer default.",
          "Text Preferred is usually the easiest mode to review and control during launch.",
        ],
      },
      {
        id: "knowledge-options",
        title: "Training, Website Knowledge, and Gemini options",
        body: [
          "Client-facing training optimization/compaction can help reduce repeated instructions and keep AI context cleaner. Website Knowledge lets synced WordPress site content help answers when relevant.",
          "If enabled for the account, clients can use a Google AI Studio Gemini API key mode and Gemini Cache Boost for stable reusable context. Keep keys private and follow the Billing page for any active usage rules.",
        ],
      },
    ],
    relatedDocs: ["products-services-media-sequences", "website-knowledge-wordpress", "plans-wallet-source-values"],
    relatedLinks: [{ href: "/ai-whatsapp-bot", label: "AI WhatsApp bot overview" }],
    ctaTitle: "Need accurate answers?",
    ctaBody: "Keep products, services, media, sequences, and Website Knowledge current.",
  },
  {
    slug: "products-services-media-sequences",
    title: "Products, Services, Media, and Sequences",
    metaTitle: "BlackArrow Docs: Products, Services, Media, and Sequences | BlackArrow",
    metaDescription: "Use catalog items, media groups, sequence groups, welcome flows, keyword flows, and shortcut sequences.",
    shortLabel: "Catalog and media",
    summary: "Catalog setup, product/service facts, WhatsApp-native media, welcome sequences, keywords, and shortcuts.",
    intro: [
      "BlackArrow works best when repeatable product, service, and media details are structured instead of buried in long instructions.",
    ],
    sections: [
      {
        id: "catalog",
        title: "Products and services catalog",
        body: [
          "Add product/service names, descriptions, prices, photos, notes, availability, variants, and practical rules. The AI can use catalog knowledge in replies when customer questions match.",
        ],
        bestPractices: [
          "Keep prices, stock, refund rules, delivery expectations, and product names accurate.",
          "Remove expired offers and discontinued products.",
        ],
      },
      {
        id: "media-groups",
        title: "Media groups",
        body: [
          "Media groups store reusable WhatsApp-native content such as photos, videos, PDFs, captions, brochures, product examples, and portfolio files. Good captions and keywords help matching.",
        ],
      },
      {
        id: "sequence-groups",
        title: "Sequence groups",
        body: [
          "Sequence groups can power welcome sequences, keyword sequences, and shortcut sequences. They are useful for onboarding, product education, service explanations, and repeated sales flows.",
        ],
        warnings: [
          "Keep sequences short and relevant. Avoid spammy repeated messages.",
        ],
      },
    ],
    relatedDocs: ["intelligence-reply-behavior", "followups-customer-updates", "launch-safety-client-responsibility"],
    relatedLinks: [{ href: "/features", label: "See feature list" }],
    ctaTitle: "Catalog ready?",
    ctaBody: "Use CRM and follow-ups to turn conversations into tracked leads.",
  },
  {
    slug: "crm-pipeline-smart-actions",
    title: "CRM Pipeline and Smart Actions",
    metaTitle: "BlackArrow Docs: CRM Pipeline and Smart Actions | BlackArrow",
    metaDescription: "Use lead list, lead detail drawer, pipeline board, lead intelligence, staff assignment, follow-ups, call logs, deals, reports, and alerts.",
    shortLabel: "CRM",
    summary: "Lead workspace, pipeline board, intelligence, smart actions, tasks, reports, and deal tracking.",
    intro: [
      "CRM Pipeline turns WhatsApp, Website, API, WooCommerce, WordPress, and manual lead sources into a client-facing lead workflow.",
    ],
    sections: [
      {
        id: "lead-workspace",
        title: "Lead list, drawer, and source tracking",
        body: [
          "Use the lead list to search, filter, assign, and review leads. Selecting a lead opens the detail drawer without shrinking the table or pipeline board.",
          "Lead detail includes name, phone, source, overview, timeline, follow-ups, calls, deal, and activity tabs.",
        ],
      },
      {
        id: "intelligence",
        title: "Lead intelligence and Smart CRM actions",
        body: [
          "Lead intelligence shows temperature, health, suggested next action, and missing details. Smart CRM actions can suggest follow-ups, staff assignment, missing-field capture, quotation movement, callbacks, order confirmation review, and won/lost review.",
          "Safe actions require a user click and can create a follow-up, set a status, set a deal stage, or assign staff. Draft text may be shown for review, but BlackArrow does not auto-send WhatsApp messages from Smart CRM actions in this sprint.",
        ],
      },
      {
        id: "operations",
        title: "Staff, follow-ups, calls, deals, reports, and alerts",
        body: [
          "Use staff/team management for assignment, follow-ups for reminders, call logs for phone outcomes, deal tracking for stages and values, activity timeline for audit history, reports for counts, and Tasks/Alerts for high-priority work.",
        ],
      },
    ],
    relatedDocs: ["followups-customer-updates", "api-webhooks", "website-knowledge-wordpress"],
    relatedLinks: [{ href: "/features", label: "CRM feature overview" }],
    ctaTitle: "Want cleaner CRM operations?",
    ctaBody: "Keep lead details and follow-up dates current so Smart CRM Actions stay useful.",
  },
  {
    slug: "followups-customer-updates",
    title: "Follow-up Center and Customer Updates",
    metaTitle: "BlackArrow Docs: Follow-up Center and Customer Updates | BlackArrow",
    metaDescription: "Use fixed follow-ups, AI Smart Follow-ups, saved lists, customer updates, schedules, and successful-send billing rules.",
    shortLabel: "Follow-ups",
    summary: "Fixed follow-ups, AI Smart Follow-ups, customer updates, broadcasts, saved lists, and safe billing behavior.",
    intro: [
      "Follow-ups and customer updates help teams continue conversations without manually remembering every customer.",
    ],
    sections: [
      {
        id: "follow-up-center",
        title: "Fixed and AI Smart Follow-ups",
        body: [
          "Fixed follow-ups send configured messages based on timing and audience rules. AI Smart Follow-ups can create a context-aware next-step message from existing customer summary, recent chat, and active order or lead context.",
          "Follow-up due logic helps separate overdue, due today, due soon, upcoming, and completed work.",
        ],
      },
      {
        id: "customer-updates",
        title: "Customer Updates and broadcasts",
        body: [
          "Customer Updates support saved lists, manual recipient lists, send-to-list workflows, and scheduled or repeating updates. Use them for expected updates such as stock availability, order progress, appointment changes, or relevant announcements.",
        ],
      },
      {
        id: "billing-safety",
        title: "Successful-send billing",
        body: [
          "Fixed follow-ups are $0.001 per successful sent message. AI Smart Follow-ups and Customer Updates show regular $0.005 pricing discounted to $0.003 per successful sent message, saving $0.002 (40%). Failed, skipped, duplicate, cancelled, invalid, or insufficient-wallet attempts are not charged as successful sends.",
        ],
      },
    ],
    relatedDocs: ["crm-pipeline-smart-actions", "daily-operations-safe-controls", "plans-wallet-source-values"],
    relatedLinks: [{ href: "/pricing", label: "Billing and wallet" }],
    ctaTitle: "Before sending broadly",
    ctaBody: "Confirm audience, message purpose, wallet state, and opt-out handling.",
  },
  {
    slug: "api-webhooks",
    title: "Public API and Webhooks",
    metaTitle: "BlackArrow Docs: Public API and Webhooks | BlackArrow",
    metaDescription: "Use API keys, public lead intake, message APIs, status lookup, webhook endpoints, events, deliveries, idempotency, and safe secret handling.",
    shortLabel: "API and webhooks",
    summary: "API keys, scopes, lead intake, message APIs, status lookup, webhook events, deliveries, and idempotency.",
    intro: [
      "Public API and Webhooks let technical teams connect external forms, websites, CRMs, and business tools to BlackArrow without exposing internal systems.",
    ],
    sections: [
      {
        id: "api-keys",
        title: "API keys and scopes",
        body: [
          "Create API keys with only the scopes needed for the integration. Store keys securely, rotate them if exposed, and avoid placing secrets in browser code or public logs.",
        ],
      },
      {
        id: "lead-message-api",
        title: "Lead intake and message APIs",
        body: [
          "Use public lead intake to create CRM leads from forms or external systems. Where enabled, message APIs support sending messages or bulk messages and checking message status.",
          "Use idempotency for retries so repeated requests do not create duplicate leads or sends.",
        ],
      },
      {
        id: "webhooks",
        title: "Webhook endpoints and deliveries",
        body: [
          "Webhook endpoints can receive supported events and delivery records. Review failed deliveries, keep endpoints stable, and do not log secrets or sensitive customer content unnecessarily.",
        ],
      },
    ],
    relatedDocs: ["crm-pipeline-smart-actions", "website-knowledge-wordpress", "launch-safety-client-responsibility"],
    relatedLinks: [{ href: "/docs", label: "Docs index" }],
    ctaTitle: "Connecting external systems?",
    ctaBody: "Use least-privilege API keys and retry safely with idempotency.",
  },
  {
    slug: "website-knowledge-wordpress",
    title: "WooCommerce, WordPress Connector, and Website Knowledge",
    metaTitle: "BlackArrow Docs: WooCommerce, WordPress Connector, and Website Knowledge | BlackArrow",
    metaDescription: "Connect WooCommerce, sync selected products, use the WordPress Website Connector, and review Website Knowledge sync results.",
    shortLabel: "Integrations",
    summary: "WooCommerce products, WordPress Website Connector, Website Knowledge sync, failed rows, and AI usage.",
    intro: [
      "BlackArrow can use client-facing website and store data to improve CRM source tracking, product knowledge, and AI replies.",
    ],
    sections: [
      {
        id: "woocommerce",
        title: "WooCommerce integration",
        body: [
          "Connect a store, test the connection, preview products, then sync selected items into Products/Services. Synced products can support AI replies and CRM source context where available.",
          "Keep store credentials secure and remove or rotate credentials if access changes.",
        ],
      },
      {
        id: "wordpress-connector",
        title: "WordPress Website Connector",
        body: [
          "For non-WooCommerce website content, use the WordPress Website Connector with an API key that has write:knowledge, default API URL https://blackarrow-source.offline.invalid, and the correct Bot ID.",
          "Use Test Connection first, then sync pages/posts. The connector can also support a floating WhatsApp button when configured on the website.",
        ],
      },
      {
        id: "website-knowledge",
        title: "Website Knowledge dashboard",
        body: [
          "Website Knowledge shows synced and failed rows, source type, titles, URLs, timestamps, and failure reasons. AI replies can use synced snippets when relevant and should not invent details beyond available knowledge.",
          "Content may be skipped or fail if it is empty, inaccessible, too large, duplicated, rate limited, or missing required connection details.",
        ],
      },
    ],
    relatedDocs: ["intelligence-reply-behavior", "products-services-media-sequences", "api-webhooks"],
    relatedLinks: [{ href: "/features", label: "Integration features" }],
    ctaTitle: "Knowledge synced?",
    ctaBody: "Review successful and failed rows so customer answers stay accurate.",
  },
  {
    slug: "plans-wallet-source-values",
    title: "Billing, Wallet, Plans, and Usage",
    metaTitle: "BlackArrow Docs: Billing, Wallet, Plans, and Usage | BlackArrow",
    metaDescription: "Understand trial, plan pricing, wallet top-ups, AI reply charges, follow-up charges, customer update charges, and pause conditions.",
    shortLabel: "Billing",
    summary: "Trial, plans, wallet top-ups, client-facing usage prices, successful-send billing, and pause conditions.",
    intro: [
      "Billing combines subscription status, wallet balance, trial limits, usage categories, and send eligibility.",
    ],
    sections: [
      {
        id: "current-pricing",
        title: "Current client-facing pricing",
        body: [
          "Trial: 7-day free trial or 100 hosted AI replies limit, with $1 AI test credit. Plans: Starter $9/mo, Growth $29/mo, Pro $89/mo. Wallet top-ups: $5, $10, $25, $50, and $100.",
          "Limited-time AI text discount: regular $0.005, now $0.003 per successful AI text reply/message, saving $0.002 (40%). Fixed follow-up: $0.001 per successful sent message. AI Smart Follow-up: regular $0.005, now $0.003 per successful sent message. Customer Updates: regular $0.005, now $0.003 per successful sent message.",
        ],
      },
      {
        id: "successful-send",
        title: "Successful-send charging",
        body: [
          "Applicable sends are charged only after successful send/receipt where the product flow supports that evidence. Failed, skipped, duplicate, cancelled, invalid, or insufficient-wallet attempts are not charged as successful sends.",
          "Sequence/template and media pricing uses the configured client-facing pricing shown in Billing.",
        ],
      },
      {
        id: "pause-conditions",
        title: "Pause and alert conditions",
        body: [
          "The bot can pause or stop when wallet is empty, the trial ended, hosted reply limit is exhausted, or subscription is inactive/expired. Low-wallet and subscription alerts may appear where enabled.",
        ],
      },
    ],
    relatedDocs: ["getting-started", "followups-customer-updates", "launch-safety-client-responsibility"],
    relatedLinks: [{ href: "/pricing", label: "Pricing page" }],
    ctaTitle: "Avoid interruptions",
    ctaBody: "Review wallet balance and subscription state before high-volume sends.",
  },
  {
    slug: "daily-operations-safe-controls",
    title: "Daily Operations, Chat Shortcuts, and Human Handoff",
    metaTitle: "BlackArrow Docs: Daily Operations and Human Handoff | BlackArrow",
    metaDescription: "Use client-facing WhatsApp shortcuts, pause/resume, manual review, and human handoff safely.",
    shortLabel: "Operations",
    summary: "Client-facing WhatsApp chat shortcuts, pause/resume, manual review, and human handoff.",
    intro: [
      "Daily operations are about knowing when automation should help and when staff should take over.",
    ],
    sections: [
      {
        id: "chat-shortcuts",
        title: "WhatsApp chat control shortcuts",
        body: [
          "Use .0 to temporarily pause bot replies for a customer, .00 to permanently stop bot replies until resumed, and .1 to resume bot replies.",
          "These shortcuts are for staff control in WhatsApp chats. They should not be presented as customer commands.",
        ],
      },
      {
        id: "handoff",
        title: "Human handoff and manual review",
        body: [
          "Staff should take over when a customer asks for a person, the issue is sensitive, the AI is unsure, pricing/refund/delivery details need judgment, or the conversation has been stopped with .00.",
        ],
      },
      {
        id: "review-habits",
        title: "Launch review habits",
        body: [
          "Monitor AI replies at launch, keep product/pricing/privacy/refund/delivery information accurate, and update instructions when real customer conversations show gaps.",
        ],
      },
    ],
    relatedDocs: ["crm-pipeline-smart-actions", "whatsapp-setup", "launch-safety-client-responsibility"],
    relatedLinks: [{ href: "/docs", label: "Docs index" }],
    ctaTitle: "Need safer automation?",
    ctaBody: "Keep handoff rules short, visible, and easy for staff to use.",
  },
  {
    slug: "launch-safety-client-responsibility",
    title: "Troubleshooting, Safety, and Compliance",
    metaTitle: "BlackArrow Docs: Troubleshooting, Safety, and Compliance | BlackArrow",
    metaDescription: "Troubleshoot WhatsApp connection, QR expiry, bot replies, wallet, API keys, WordPress sync, WooCommerce, media, sequences, and dashboard data.",
    shortLabel: "Troubleshooting",
    summary: "Common fixes plus safe-use rules for WhatsApp, billing, integrations, media, sequences, and compliance.",
    intro: [
      "Troubleshooting should start with the visible client dashboard state: connection, wallet, subscription, settings, content, and integration status.",
    ],
    sections: [
      {
        id: "common-issues",
        title: "Common troubleshooting checks",
        body: [
          "If WhatsApp is disconnected or QR expired, reset login and rescan from Linked Devices. If the bot is not replying, check instance connection, reply mode, wallet, trial/subscription state, pause shortcuts, and whether the chat was stopped.",
          "If API keys fail, check scope, copied key value, and endpoint usage. If WordPress sync fails or rate limits, use Test Connection, confirm API URL, Bot ID, write:knowledge scope, and review failed sync reasons. If WooCommerce fails, test the connection and verify store URL and credentials.",
          "If media is not found or sequences are not sending, review media group captions, sequence triggers, wallet state, and whether the customer or audience is eligible. If dashboard data looks stale, refresh and check the relevant integration status.",
        ],
      },
      {
        id: "media-voice-image",
        title: "Voice, image, and media limits",
        body: [
          "Voice/image understanding can help, but not every file is clear or useful. Staff should review unclear media, important pricing questions, and sensitive cases.",
        ],
      },
      {
        id: "safety-compliance",
        title: "Safety and compliance",
        body: [
          "Use a business or secondary WhatsApp number, avoid spam or cold outreach, do not make misleading offers, keep refund/delivery/pricing/privacy information accurate, and monitor replies during launch.",
          "BlackArrow provides tooling. The client remains responsible for WhatsApp account usage, customer consent, message content, and compliance.",
        ],
        warnings: [
          "Do not claim official WhatsApp API guarantees or guaranteed no-ban outcomes unless your own account setup separately supports that claim.",
        ],
      },
    ],
    relatedDocs: ["whatsapp-setup", "daily-operations-safe-controls", "plans-wallet-source-values"],
    relatedLinks: [{ href: "/features", label: "Review features" }],
    ctaTitle: "Keep operations healthy",
    ctaBody: "Review connection, wallet, content, and handoff rules before expanding automation volume.",
  },
  {
    slug: "courier-integrations-setup",
    title: "PostEx and Leopards Courier Integration Setup",
    metaTitle: "BlackArrow Docs: PostEx & Leopards Courier Integration Setup | BlackArrow",
    metaDescription: "Step-by-step instructions for connecting PostEx API tokens and Leopards merchant credentials in BlackArrow for order tracking lookups.",
    shortLabel: "Courier setup",
    summary: "PostEx and Leopards API configuration, parcel creation from order UI, tracking lookups, and status response behavior.",
    intro: [
      "BlackArrow supports merchant API credential configuration for PostEx Courier and Leopards Courier in Pakistan.",
      "When configured, the bot can fetch parcel tracking status for customers in WhatsApp chat, while staff can format consignment booking payloads from the workspace order UI.",
    ],
    sections: [
      {
        id: "postex-configuration",
        title: "PostEx Courier API Configuration",
        body: [
          "To enable PostEx order lookups, navigate to Workspace Settings -> Integrations -> PostEx Courier.",
          "Enter your active PostEx Merchant API Token (`postex_api_key`) and save configuration. Test API connectivity using the workspace credential check.",
        ],
        steps: [
          "Open Workspace Settings -> Integrations -> PostEx.",
          "Paste your PostEx Merchant API Token.",
          "Click Save Credentials & Verify Connection.",
          "Enable 'Allow Bot Tracking Lookups' to let AI answer customer order status queries.",
        ],
        warnings: [
          "Tracking lookups require an active PostEx merchant account in good standing. BlackArrow does not guarantee third-party courier API uptime.",
        ],
      },
      {
        id: "leopards-configuration",
        title: "Leopards Courier API Configuration",
        body: [
          "To enable Leopards Courier tracking lookups, navigate to Workspace Settings -> Integrations -> Leopards Courier.",
          "Provide your Leopards Merchant API Key and Account Password.",
        ],
        steps: [
          "Open Workspace Settings -> Integrations -> Leopards.",
          "Enter your Leopards API Key and Account Password.",
          "Save credentials and run preflight verification.",
          "Confirm tracking query activation for customer conversations.",
        ],
      },
      {
        id: "consignment-booking-behavior",
        title: "Consignment Booking vs Chat Lookups",
        body: [
          "Distinguish clearly between parcel tracking lookups in WhatsApp chat and consignment booking.",
          "Tracking status lookups occur automatically in WhatsApp chat when a customer provides a valid phone number or order tracking reference.",
          "Consignment booking payload formatting is an action initiated by staff from the workspace order UI, allowing team members to review verified shipping addresses before dispatching parcels to couriers.",
        ],
      },
    ],
    relatedDocs: ["api-webhooks", "crm-pipeline-smart-actions", "getting-started"],
    relatedLinks: [
      { href: "/postex-whatsapp-integration", label: "PostEx integration overview" },
      { href: "/leopards-whatsapp-integration", label: "Leopards integration overview" },
      { href: "/whatsapp-order-tracking-automation", label: "WhatsApp tracking automation" },
    ],
    ctaTitle: "Ready to test courier lookups?",
    ctaBody: "Ensure your API credentials are active in PostEx or Leopards merchant portals before enabling customer queries.",
  },
  {
    slug: "cod-order-confirmation-setup",
    title: "Cash on Delivery (COD) Order Confirmation Setup",
    metaTitle: "BlackArrow Docs: Cash on Delivery (COD) Order Confirmation Setup | BlackArrow",
    metaDescription: "How to configure automated post-purchase WhatsApp confirmation triggers, shipping address verification prompts, and staff exception alerts.",
    shortLabel: "COD confirmation",
    summary: "Post-checkout webhook configuration, COD confirmation prompts, address verification rules, and workspace order state management.",
    intro: [
      "Automating Cash on Delivery (COD) order confirmation helps e-commerce stores verify buyer intent and shipping addresses on WhatsApp before parcel dispatch.",
      "Follow this guide to set up checkout webhooks, customize address verification prompts, and manage order states in your dashboard.",
    ],
    sections: [
      {
        id: "webhook-trigger-setup",
        title: "Connecting Store Checkout Webhooks",
        body: [
          "COD verification begins when your store (WooCommerce or custom webhooks) sends a new order event to BlackArrow.",
          "In Workspace Settings -> Webhooks, copy your inbound Webhook Secret and URL, then map new order events.",
        ],
        steps: [
          "Navigate to Settings -> Webhooks & Integrations.",
          "Copy your inbound Webhook Endpoint URL.",
          "Configure your WooCommerce or store platform to send `order.created` payloads.",
          "Enable 'Trigger COD Confirmation Flow' for orders with Cash on Delivery payment methods.",
        ],
      },
      {
        id: "prompt-and-address-verification",
        title: "Customizing Confirmation Prompts & Address Verification",
        body: [
          "Set the message template used to confirm COD orders on WhatsApp. Prompts should display itemized order summary, total amount, and clear confirmation actions.",
          "Configure address verification rules to prompt buyers for missing house numbers, street names, landmarks, or city names.",
        ],
        bestPractices: [
          "Keep confirmation messages concise and itemized.",
          "Provide simple reply options like '1 to Confirm' or '2 to Cancel'.",
          "Include a clear customer support note in case the buyer needs to modify items.",
        ],
      },
      {
        id: "order-state-management",
        title: "Dashboard Order States & Staff Exception Alerts",
        body: [
          "When a customer responds on WhatsApp, BlackArrow updates the order record state to 'Confirmed', 'Address Updated', or 'Cancelled'.",
          "If a customer requests address modifications or asks a complex question, the system flags the order for staff review and triggers a human handoff alert.",
        ],
        warnings: [
          "Unconfirmed orders should remain in a holding state before booking courier dispatch to help prevent unnecessary return fees.",
        ],
      },
    ],
    relatedDocs: ["api-webhooks", "website-knowledge-wordpress", "daily-operations-safe-controls"],
    relatedLinks: [
      { href: "/whatsapp-cod-order-automation", label: "WhatsApp COD order automation" },
      { href: "/whatsapp-automation-pakistan", label: "Pakistani WhatsApp automation" },
      { href: "/ecommerce-whatsapp-bot", label: "Ecommerce WhatsApp bot" },
    ],
    ctaTitle: "Set up COD verification",
    ctaBody: "Test your store checkout webhooks with a sample COD order before going live to real customers.",
  },
];

export const DOCS_PAGE_BY_SLUG = new Map(DOCS_PAGES.map((page) => [page.slug, page]));

export function getDocsPageBySlug(slug: string) {
  return DOCS_PAGE_BY_SLUG.get(slug) || null;
}

export function getDocsPagePath(slug?: string) {
  return slug ? `/docs/${slug}` : "/docs";
}

export function getDocsPageFromPath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, "");
  if (!normalized.startsWith("/docs/")) return null;
  const slug = normalized.slice("/docs/".length);
  return slug ? getDocsPageBySlug(slug) : null;
}

export function isDocsDetailPath(pathname: string) {
  return getDocsPageFromPath(pathname) !== null;
}

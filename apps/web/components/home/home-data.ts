export const homeHowItWorks = [
  ["01", "Connect WhatsApp", "Link the WhatsApp number your business already uses."],
  [
    "02",
    "Add your business information",
    "Add your products, services, policies, and preferred reply style.",
  ],
  [
    "03",
    "Let BlackArrow help",
    "It answers customers, captures useful details, follows up, and keeps your team informed.",
  ],
] as const;

export const homeOutcomes = [
  ["01", "Answer customers", "Provide helpful WhatsApp replies using your business information."],
  [
    "02",
    "Capture sales and orders",
    "Collect customer details, product interest, bookings, leads, or order information.",
  ],
  [
    "03",
    "Follow up automatically",
    "Use saved flows and scheduled follow-ups so opportunities are not forgotten.",
  ],
  [
    "04",
    "Help the owner and team",
    "See waiting customers, important activity, and the next useful action.",
  ],
] as const;

export const homeWorkflow = [
  "Customer sends a WhatsApp message.",
  "BlackArrow answers using business information.",
  "Useful customer details are saved.",
  "A configured saved flow may be sent when relevant.",
  "The team sees that the customer needs attention.",
  "BlackArrow suggests the next useful action.",
] as const;

export const homeTeamSignals = [
  ["18", "customers contacted you today"],
  ["3", "customers need a reply"],
  ["2", "customers appear ready to buy"],
  ["Connected", "WhatsApp status"],
] as const;

export const homePricing = [
  ["Starter", "$9", "For a small business starting with one WhatsApp number."],
  ["Growth", "$29", "For a growing team handling more customers and orders."],
  ["Pro", "$89", "For larger teams that need more capacity and control."],
] as const;

export const homeFaqs = [
  [
    "Does BlackArrow work with my existing WhatsApp number?",
    "Yes. You can link the business WhatsApp number you already use through the supported connection flow.",
  ],
  ["Can my staff take over a conversation?", "Yes. Your team can step in whenever a customer needs human attention."],
  [
    "Can I turn AI replies off?",
    "Yes. Turn AI replies on or off whenever needed. Incoming messages remain visible, and saved sequences, shortcuts, scheduled follow-ups, broadcasts, and manual replies can continue.",
  ],
  [
    "What information can the bot learn?",
    "Add your products, services, policies, business instructions, website knowledge, and preferred reply style.",
  ],
  ["Can it understand voice notes and images?", "Yes. BlackArrow can understand supported voice notes and images in customer conversations."],
  [
    "How do saved flows and follow-ups work?",
    "Your team configures reusable flows and schedules follow-ups, so BlackArrow only uses them when the setup calls for it.",
  ],
  [
    "How do the subscription and wallet work?",
    "The subscription pays for platform access. The separate wallet pays for AI usage and paid outgoing automation.",
  ],
  [
    "Is Shopify or Google Sheets available?",
    "Not yet. Direct Shopify and Google Sheets integrations are planned and are not presented as available today.",
  ],
  ["Can I cancel or change my plan?", "You can manage eligible plan changes through the existing account and checkout process."],
  ["Is setup help available?", "Yes. Optional full account setup is available if you want help getting started."],
] as const;

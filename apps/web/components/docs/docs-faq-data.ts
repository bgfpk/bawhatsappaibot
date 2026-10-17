export interface DocsFaqItem {
  question: string;
  answer: string;
}

export const DOCS_FAQS: DocsFaqItem[] = [
  {
    question: "Is BlackArrow an official Meta API or Cloud API partner?",
    answer:
      "No. BlackArrow uses QR-based WhatsApp Linked Devices session pairing. It does not claim Meta Cloud API connection or Meta partnership on the public website.",
  },
  {
    question: "How do I connect a WhatsApp number?",
    answer:
      "On your phone, open WhatsApp, go to Linked Devices, choose Link a Device, and use the WhatsApp scanner to scan the QR code displayed in BlackArrow.",
  },
  {
    question: "What happens if I log out from Linked Devices on my phone?",
    answer:
      "Logging out of the linked device on your physical phone disconnects the automated session immediately. You will need to click Reset Login in your dashboard and scan a new QR code to reconnect.",
  },
  {
    question: "When should I reset login?",
    answer:
      "Use Reset Login if your session gets stuck in a reconnecting loop, if you switch physical phones, or if credentials expire. Reset Login clears local session credentials so you can perform a fresh QR scan.",
  },
  {
    question: "How do AI reply modes control bot responses?",
    answer:
      "Reply modes determine when the AI responds automatically. In Text Preferred mode, text messages get automated AI replies while voice notes generate operational flags. In Always Voice or Always Text modes, replies adhere strictly to configured format rules.",
  },
  {
    question: "What is the difference between Media Groups and Sequence Groups?",
    answer:
      "Media Groups organize related images or files for catalog display (e.g. product color variants). Sequence Groups orchestrate multi-step message flows (e.g. Welcome Sequences or Keyword/Shortcut triggers).",
  },
  {
    question: "Does WooCommerce integration perform automatic real-time sync?",
    answer:
      "No. Configured or imported WooCommerce product catalog data can be formatted into AI context where available. BlackArrow does not automatically connect to WooCommerce APIs, perform real-time store inventory sync, or retrieve WooCommerce orders.",
  },
  {
    question: "How do PostEx and Leopards courier lookups work?",
    answer:
      "Connecting PostEx or Leopards merchant credentials allows your team to perform consignment tracking lookups and generate booking payloads directly within your dashboard.",
  },
  {
    question: "What subscription plans are available?",
    answer:
      "BlackArrow offers Starter ($9/mo), Growth ($29/mo), and Pro ($89/mo). All plans include a 7-day trial with $1 AI credit. Optional Full Setup Service is available for $49.",
  },
  {
    question: "What are the metered AI usage rates?",
    answer:
      "Subscription fees and metered usage charges apply separately. Metered rates: AI text: $0.003 per reply, Image: $0.007 per image, Voice note: $0.010 per voice note, Generated voice: from $0.020 per reply, Sequence or template: $0.0005 per item, Media file: $0.001 per file. Minimum wallet top-up is $5.",
  },
  {
    question: "Does BlackArrow guarantee zero risk of number ban?",
    answer:
      "No software provider can guarantee zero platform risk. Operating WhatsApp automation carries inherent platform risk. Clients are responsible for sending relevant, opted-in messages and complying with WhatsApp Terms of Service.",
  },
];

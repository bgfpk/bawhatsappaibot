export type HomepageFaqItem = {
  question: string;
  answer: string;
};

export const HOMEPAGE_FAQS: HomepageFaqItem[] = [
  {
    question: "Is BlackArrow compatible with standard WhatsApp and WhatsApp Business?",
    answer: "Yes. BlackArrow connects with supported standard WhatsApp or WhatsApp Business numbers through Linked Devices QR pairing.",
  },
  {
    question: "How does the Linked Devices QR setup work?",
    answer: "You scan a QR code generated in your BlackArrow dashboard using the 'Linked Devices' feature in your mobile WhatsApp application.",
  },
  {
    question: "Does my primary phone need to stay online indefinitely?",
    answer: "Your primary phone is required for initial QR setup and periodic session refreshes. While paired, the session remains active in Linked Devices.",
  },
  {
    question: "What happens if a WhatsApp session disconnects?",
    answer: "If a session disconnects or is logged out from the mobile app, BlackArrow alerts your account dashboard so staff can re-scan the QR code.",
  },
  {
    question: "How does BlackArrow process voice notes and product photos?",
    answer: "Incoming voice notes are transcribed and understood using Gemini audio models ($0.010 per voice note). Product photos are analyzed for item codes ($0.007 per image).",
  },
  {
    question: "How do I train the AI to answer according to my business rules?",
    answer: "You configure business instructions, catalog items, shipping rates, refund rules, and FAQs in your Intelligence settings.",
  },
  {
    question: "Can staff pause automated AI replies during a conversation?",
    answer: "Yes. Staff members can toggle 'Pause AI' per conversation in the chat interface to take over manually anytime.",
  },
  {
    question: "How are reusable media templates and sequences billed?",
    answer: "Sequence template sends are billed at $0.0005 per item, and Media Group file sends are billed at $0.001 per file from your AI wallet.",
  },
  {
    question: "How are customer orders captured in chat?",
    answer: "BlackArrow extracts items, quantities, and delivery address details into a structured order summary draft for staff review.",
  },
  {
    question: "How does billing work for monthly plans and AI wallet usage?",
    answer: "Monthly plans cover your instance limits and platform features. AI response actions (text, voice, image, sequences) are billed pay-as-you-go from your wallet balance.",
  },
  {
    question: "What are the rules for safe and compliant WhatsApp usage?",
    answer: "BlackArrow provides rate guidance and pause controls. Clients remain responsible for adhering to WhatsApp messaging policies and avoiding spam reports.",
  },
  {
    question: "What business types are best suited for BlackArrow?",
    answer: "BlackArrow is built for e-commerce stores, local service contractors, clinics, and client agencies handling repeated customer inquiries.",
  },
];

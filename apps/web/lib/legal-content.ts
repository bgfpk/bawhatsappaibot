export type LegalSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDocument = {
  eyebrow: string;
  title: string;
  description: string;
  sections: LegalSection[];
};

export const TERMS_DOCUMENT: LegalDocument = {
  eyebrow: "Terms of Service",
  title: "Terms that set expectations for platform usage, billing, and business responsibility",
  description:
    "These terms explain how BlackArrow is provided, what clients remain responsible for, and where billing, courier, and platform boundaries sit.",
  sections: [
    {
      id: "terms-1",
      title: "1. Overview and Account Usage",
      paragraphs: [
        "BlackArrow provides software tools for WhatsApp automated responses, customer support workflows, and order detail extraction.",
        "Users must be authorized business representatives and maintain accurate account credentials. For subscription or account assistance, contact contact-086473cbd844@example.invalid.",
      ],
    },
    {
      id: "terms-2",
      title: "2. Business Responsibilities",
      paragraphs: [
        "Clients maintain ownership and operational responsibility for their product information, pricing accuracy, stock availability, and customer service guidelines.",
        "Clients remain responsible for customer inquiries, fulfillment execution, and resolving customer disputes.",
      ],
    },
    {
      id: "terms-3",
      title: "3. WhatsApp Linked Devices Connection",
      paragraphs: [
        "BlackArrow connects to customer-provided WhatsApp numbers through the standard WhatsApp Linked Devices protocol.",
        "BlackArrow is an independent software platform and does not claim or operate Meta WhatsApp Cloud API infrastructure. BlackArrow is not affiliated with or endorsed by Meta Platforms, Inc. or WhatsApp Inc.",
      ],
    },
    {
      id: "terms-4",
      title: "4. Acceptable Use and Messaging Consent",
      paragraphs: [
        "BlackArrow is intended for lawful business communication and customer support workflows.",
        "Clients are responsible for obtaining appropriate consent from end-customers before sending messages or follow-ups via WhatsApp, in accordance with applicable local laws in their operating regions.",
      ],
    },
    {
      id: "terms-5",
      title: "5. AI Conversational Assistance",
      paragraphs: [
        "BlackArrow incorporates artificial intelligence processing to generate automated response suggestions based on client-provided instructions.",
        "AI outputs provide conversational assistance and should be supervised by human agents. AI responses may not be 100% accurate in every scenario.",
      ],
    },
    {
      id: "terms-6",
      title: "6. E-Commerce Order Extraction",
      paragraphs: [
        "Order extraction features help structure chat details into order records. BlackArrow does not manufacture, inspect, store, or deliver physical products.",
        "Clients remain solely responsible for product delivery, shipping timelines, and customer return or exchange policies.",
      ],
    },
    {
      id: "terms-7",
      title: "7. Subscription Plans and Prepaid Wallet",
      paragraphs: [
        "Access to BlackArrow requires an active subscription plan (Starter: $9/month, Growth: $29/month, Pro: $89/month) and uses a prepaid wallet model for metered usage deductions. Displayed rates and plan details are viewable at /pricing.",
        "Minimum wallet top-up amount is $5. New accounts may receive a 7-day trial period with $1 in AI trial credit.",
      ],
    },
    {
      id: "terms-8",
      title: "8. Billing Reviews and Purchase Circumstances",
      paragraphs: [
        "Refund eligibility, billing disputes, and setup-service adjustments are reviewed according to the applicable purchase circumstances and any policy presented during checkout.",
        "For subscription or account assistance, contact contact-086473cbd844@example.invalid.",
      ],
    },
    {
      id: "terms-9",
      title: "9. Optional Full Setup Service",
      paragraphs: [
        "BlackArrow offers an optional, one-time Full Setup Service ($49) for guided account onboarding, knowledge base configuration, and workflow setup assistance.",
      ],
    },
    {
      id: "terms-10",
      title: "10. Third-Party Logistics Connectors",
      paragraphs: [
        "BlackArrow supports optional data connections with client-configured logistics providers (such as PostEx or Leopards) based on API credentials supplied by the client.",
        "BlackArrow does not control third-party courier operations or courier status updates.",
      ],
    },
    {
      id: "terms-11",
      title: "11. WhatsApp Platform Risk",
      paragraphs: [
        "Connecting WhatsApp numbers via automation tools carries platform and policy risks governed independently by Meta and WhatsApp.",
        "WhatsApp or Meta reserve the right to restrict or ban numbers under their independent policies. BlackArrow connection management tools do not guarantee immunity or zero-ban operation.",
      ],
    },
    {
      id: "terms-12",
      title: "12. Workspace Data Control and Support Contact",
      paragraphs: [
        "Clients may clear WhatsApp session logins, pause active bot instances, or wipe workspace data using available dashboard administrative controls.",
        "Contact contact-086473cbd844@example.invalid to request assistance with account or stored-data controls. Available actions depend on the current account and workspace configuration.",
      ],
    },
  ],
};

export const PRIVACY_DOCUMENT: LegalDocument = {
  eyebrow: "Privacy Policy",
  title: "Privacy principles for account data, conversational data, and operational processing",
  description:
    "This policy outlines the categories of information BlackArrow processes to run WhatsApp automation, customer support, and order workflows.",
  sections: [
    {
      id: "privacy-1",
      title: "1. Overview",
      paragraphs: [
        "BlackArrow processes information to provide configured platform functions, messaging automation, and order detail extraction for business accounts.",
      ],
    },
    {
      id: "privacy-2",
      title: "2. Information Processed",
      bullets: [
        "Account Details: Email address and authentication credentials used to manage account access.",
        "WhatsApp Connection Data: Session identifiers required to maintain WhatsApp Linked Devices connections.",
        "Conversational Context: Text messages, voice notes, and media files processed through connected WhatsApp instances to generate replies.",
        "Order & Lead Details: Customer names, phone numbers, delivery addresses, and item requests extracted from customer chats.",
        "Integration Credentials: Client-provided API keys or tokens for third-party services (such as PostEx or Leopards).",
        "Billing Logs: Plan selections, wallet top-up records, and usage deduction logs generated via payment processor (Creem).",
      ],
    },
    {
      id: "privacy-3",
      title: "3. Service Providers and External Processing",
      paragraphs: [
        "BlackArrow processes information to provide configured platform functions. Information may also be processed by relevant service providers under their own policies:",
      ],
      bullets: [
        "Appwrite: Database infrastructure supporting workspace data storage.",
        "Google Gemini AI: AI processing model infrastructure used to generate support replies when AI features are enabled.",
        "Creem: Merchant payment processor handling subscription billing and wallet top-ups.",
        "Logistics Providers: Order information transmitted to client-configured couriers (PostEx or Leopards) when enabled by client setup.",
      ],
    },
    {
      id: "privacy-4",
      title: "4. Client Operational Guidance",
      paragraphs: [
        "Clients remain responsible for securing customer messaging consent and providing appropriate customer privacy notices in their operating jurisdictions.",
        "Clients must keep API keys and account credentials secure. Support requests should never include passwords, OTPs, credit card numbers, or WhatsApp QR codes.",
      ],
    },
    {
      id: "privacy-5",
      title: "5. Data Control and Retention",
      paragraphs: [
        "Retention varies by data type, operational requirement, third-party service, and available workspace controls. Contact support for questions about a specific account or data category.",
        "Contact contact-086473cbd844@example.invalid to request assistance with account or stored-data controls. Available actions depend on the current account and workspace configuration.",
      ],
    },
  ],
};

export const DISCLAIMER_DOCUMENT: LegalDocument = {
  eyebrow: "Important Notice",
  title: "Practical limits around AI replies, WhatsApp risk, and third-party services",
  description:
    "This disclaimer explains what BlackArrow helps with, what still depends on client judgment, and where external platform risk remains outside BlackArrow control.",
  sections: [
    {
      id: "disclaimer-1",
      title: "1. Independent Service and Trademarks",
      paragraphs: [
        "BlackArrow is an independent software tool provided for WhatsApp automation and customer support workflows.",
        "BlackArrow is not affiliated with, endorsed by, sponsored by, or officially partnered with Meta Platforms, Inc. or WhatsApp Inc. WhatsApp and Meta are registered trademarks of Meta Platforms, Inc.",
      ],
    },
    {
      id: "disclaimer-2",
      title: "2. WhatsApp Platform Risk",
      paragraphs: [
        "BlackArrow connects to WhatsApp accounts using the standard WhatsApp Linked Devices protocol. Operating automated messaging on WhatsApp carries platform policy risks.",
      ],
      bullets: [
        "Meta or WhatsApp may rate-limit, restrict, or ban WhatsApp numbers under their independent policy enforcement.",
        "BlackArrow connection controls do not guarantee immunity or zero-ban operation.",
        "The client remains solely responsible for managing WhatsApp numbers connected to the Platform.",
      ],
    },
    {
      id: "disclaimer-3",
      title: "3. Artificial Intelligence Output Limits",
      paragraphs: [
        "Automated AI responses assist customer communication based on client-provided instructions, but AI models are not error-free.",
        "Clients should review product details, pricing accuracy, and support policies before deploying live AI automation.",
      ],
    },
    {
      id: "disclaimer-4",
      title: "4. E-Commerce Order Fulfillment",
      paragraphs: [
        "Clients are solely responsible for product quality, inventory availability, pricing accuracy, delivery timelines, and customer refunds.",
        "BlackArrow provides software infrastructure for order extraction; it does not handle physical goods or delivery execution.",
      ],
    },
    {
      id: "disclaimer-5",
      title: "5. Third-Party Service Dependencies",
      paragraphs: [
        "BlackArrow relies on external service infrastructure (including Google Gemini AI, Creem payment gateway, Appwrite database hosting, and courier APIs like PostEx or Leopards).",
      ],
    },
    {
      id: "disclaimer-6",
      title: "6. No Guaranteed Results",
      paragraphs: [
        "BlackArrow does not guarantee specific sales growth, revenue increases, conversion rate improvements, or 100% platform uptime.",
      ],
    },
    {
      id: "disclaimer-7",
      title: "7. Contact Information",
      paragraphs: [
        "For questions regarding platform boundaries or support assistance, contact contact-086473cbd844@example.invalid.",
      ],
    },
  ],
};

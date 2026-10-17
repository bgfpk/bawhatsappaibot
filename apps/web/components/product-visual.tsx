type ProductVisualProps = {
  variant?: "home" | "features" | "pricing" | "about" | "contact";
};

const visualCopy = {
  home: {
    badge: "Live overview",
    title: "Chats, orders, wallet",
    note: "AI replies, captures details, and keeps handoff visible.",
    left: "Human handoff",
    right: "Lead saved",
  },
  features: {
    badge: "Feature workspace",
    title: "Reply modes, catalog, orders",
    note: "Control the active WhatsApp workflow from one operating view.",
    left: "QR connected",
    right: "Catalog synced",
  },
  pricing: {
    badge: "Billing workspace",
    title: "Plan capacity plus wallet usage",
    note: "Track subscription capacity, AI usage, and paid sends together.",
    left: "Usage visible",
    right: "Growth plan",
  },
  about: {
    badge: "Mission system",
    title: "Conversation to operation",
    note: "Built around useful automation, human control, and practical commerce.",
    left: "Built by Firdosi Digital",
    right: "Remote-first",
  },
  contact: {
    badge: "Contact routing hub",
    title: "Message, route, respond",
    note: "Sales, support, billing, and setup questions move to the right path.",
    left: "WhatsApp sales",
    right: "Support inbox",
  },
};

export function ProductVisual({ variant = "home" }: ProductVisualProps) {
  const copy = visualCopy[variant];

  return (
    <div className={`hero-visual hero-visual-${variant}`} aria-label="BlackArrow product visual">
      <div className="hero-rings" aria-hidden="true" />
      <article className="hero-product-preview">
        <div className="product-preview-top">
          <span>{copy.badge}</span>
          <strong><i aria-hidden="true" /> WhatsApp connected</strong>
        </div>
        <div className="product-preview-grid">
          <div className="product-conversation">
            <div className="wa-head">
              <div className="wa-brand"><span className="bot-mark">AI</span> BlackArrow</div>
              <span className="online" aria-label="Connected" />
            </div>
            <div className="chat-stack">
              <div className="bubble user">Is this available for delivery today?</div>
              <div className="ai-card">
                <strong>AI Reply</strong>
                <p>Yes. I can check the product details and collect what the team needs for the order.</p>
              </div>
              <div className="product-saved-note"><span aria-hidden="true">✓</span> Product interest and delivery request saved</div>
            </div>
          </div>
          <div className="product-operation">
            <p className="mockup-kicker">{copy.title}</p>
            <h3>Keep the next action clear.</h3>
            <p>{copy.note}</p>
            <div className="product-status-list">
              <div><span>{copy.left}</span><strong>Ready</strong></div>
              <div><span>{copy.right}</span><strong>Saved</strong></div>
              <div><span>AI replies</span><strong>On</strong></div>
              <div><span>Suggested next step</span><strong>Review customer details</strong></div>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

const iconKinds: Record<string, "chat" | "globe" | "code" | "nodes" | "grid" | "bag" | "calendar" | "inbox"> = {
  WhatsApp: "chat",
  "Website Knowledge": "globe",
  WordPress: "globe",
  WooCommerce: "bag",
  "Public API": "code",
  Webhooks: "nodes",
  "Google Sheets": "grid",
  Shopify: "bag",
  "Google Calendar and bookings": "calendar",
  Zapier: "nodes",
  Make: "nodes",
  "Meta inboxes": "inbox",
};

export function IntegrationIcon({ name }: { name: string }) {
  const kind = iconKinds[name] || "nodes";

  return (
    <span className="integration-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        {kind === "chat" ? <path d="M5 5.5h14v9H9l-4 3v-12Z" /> : null}
        {kind === "globe" ? <><circle cx="12" cy="12" r="7" /><path d="M5 12h14M12 5c2.2 2 3.2 4.3 3.2 7S14.2 17 12 19c-2.2-2-3.2-4.3-3.2-7S9.8 7 12 5Z" /></> : null}
        {kind === "code" ? <path d="m9 7-5 5 5 5m6-10 5 5-5 5m-2-12-2 14" /> : null}
        {kind === "nodes" ? <><circle cx="6" cy="12" r="2" /><circle cx="18" cy="7" r="2" /><circle cx="18" cy="17" r="2" /><path d="m8 11 8-3m-8 5 8 3" /></> : null}
        {kind === "grid" ? <><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M5 9h14M10 9v11M15 9v11M5 14h14" /></> : null}
        {kind === "bag" ? <><path d="M5 9h14l-1 11H6L5 9Z" /><path d="M9 9V7a3 3 0 0 1 6 0v2" /></> : null}
        {kind === "calendar" ? <><rect x="4" y="6" width="16" height="14" rx="2" /><path d="M8 4v4m8-4v4M4 11h16m-11 4h2m2 0h2" /></> : null}
        {kind === "inbox" ? <><path d="M5 5h14v14H5V5Z" /><path d="M5 14h4l1.5 2h3l1.5-2h4" /></> : null}
      </svg>
    </span>
  );
}

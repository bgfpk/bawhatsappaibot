/**
 * Safe, centralized public site analytics telemetry helper for BlackArrow.
 * Emits standardized event payloads to window.gtag without modifying dashboard/backend systems.
 */

export type CtaClickParams = {
  cta_name: string;
  source_page?: string;
  destination: string;
  cta_location?: string;
};

export type WhatsAppClickParams = {
  cta_name?: string;
  source_page?: string;
  destination_type?: "direct_chat" | "support_sales";
  destination_url?: string;
};

export function trackCtaClick(params: CtaClickParams): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return;
  }
  const source_page =
    params.source_page ||
    (typeof window.location !== "undefined" ? window.location.pathname : "");

  window.gtag("event", "cta_click", {
    cta_name: params.cta_name,
    source_page,
    destination: params.destination,
    cta_location: params.cta_location || "page_body",
  });
}

export function trackWhatsAppClick(params: WhatsAppClickParams = {}): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return;
  }
  const source_page =
    params.source_page ||
    (typeof window.location !== "undefined" ? window.location.pathname : "");

  window.gtag("event", "whatsapp_click", {
    cta_name: params.cta_name || "WhatsApp Chat",
    source_page,
    destination_type: params.destination_type || "direct_chat",
    destination_url: params.destination_url || "https://wa.me/923136923129",
  });
}

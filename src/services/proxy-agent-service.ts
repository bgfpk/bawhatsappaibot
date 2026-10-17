import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { ProxyAgent, Socks5ProxyAgent } from "undici";

export function normalizeProxyUrl(value: any) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.includes("://") ? raw : `http://${raw}`;
}

export function maskProxyUrl(value: any) {
  const proxyUrl = normalizeProxyUrl(value);
  if (!proxyUrl) return "";
  try {
    const parsed = new URL(proxyUrl);
    if (parsed.password) parsed.password = "***";
    if (parsed.username) parsed.username = parsed.username ? parsed.username : "";
    return parsed.toString();
  } catch {
    return proxyUrl.replace(/:[^:@/]+@/, ":***@");
  }
}

function getProxyScheme(proxyUrl: string) {
  try {
    return new URL(proxyUrl).protocol.replace(":", "").toLowerCase();
  } catch {
    return "";
  }
}

export function createProxyAgents(proxyUrlInput: any) {
  const proxyUrl = normalizeProxyUrl(proxyUrlInput);
  if (!proxyUrl) {
    throw new Error("No proxy URL available. Refusing direct WhatsApp connection from VPS IP.");
  }

  const scheme = getProxyScheme(proxyUrl);
  if (scheme === "http" || scheme === "https") {
    const wsAgent = new HttpsProxyAgent(proxyUrl);
    const fetchAgent = new ProxyAgent(proxyUrl);
    return { proxyUrl, maskedProxyUrl: maskProxyUrl(proxyUrl), wsAgent, fetchAgent };
  }

  if (scheme === "socks" || scheme === "socks5" || scheme === "socks5h") {
    const wsAgent = new SocksProxyAgent(proxyUrl);
    const fetchProxyUrl = scheme === "socks" ? proxyUrl.replace(/^socks:/i, "socks5:") : proxyUrl;
    const fetchAgent = new Socks5ProxyAgent(fetchProxyUrl);
    return { proxyUrl, maskedProxyUrl: maskProxyUrl(proxyUrl), wsAgent, fetchAgent };
  }

  throw new Error(`Unsupported proxy protocol "${scheme || "unknown"}". Use HTTP, HTTPS, or SOCKS5.`);
}

export function createWhatsAppProxyAgents(proxyUrlInput: any) {
  return createProxyAgents(proxyUrlInput);
}

async function verifyProxyRequest(fetchAgent: any, input: {
  url: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  success: (response: Response) => boolean;
  errorMessage: (response: Response) => string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs || 15000);
  const startedAt = Date.now();
  try {
    const response = await fetch(input.url, {
      dispatcher: fetchAgent,
      method: "GET",
      headers: input.headers,
      signal: controller.signal,
    } as any);
    if (!input.success(response)) {
      throw new Error(input.errorMessage(response));
    }
    return Date.now() - startedAt;
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyProxyReachability(fetchAgent: any, timeoutMs = 10000, checkUrl = "https://ipv4.webshare.io/") {
  return verifyProxyRequest(fetchAgent, {
    url: checkUrl,
    timeoutMs,
    success: (response) => response.ok,
    errorMessage: (response) => `Proxy reachability check returned HTTP ${response.status}`,
  });
}

export async function verifyWhatsAppProxyTunnel(fetchAgent: any, timeoutMs = 15000) {
  return verifyProxyRequest(fetchAgent, {
    url: "https://web.whatsapp.com/",
    timeoutMs,
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
    },
    success: (response) => response.status < 500,
    errorMessage: (response) => `WhatsApp proxy check returned HTTP ${response.status}`,
  });
}

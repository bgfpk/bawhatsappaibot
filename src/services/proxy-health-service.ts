import { createProxyAgents, maskProxyUrl, normalizeProxyUrl, verifyProxyReachability, verifyWhatsAppProxyTunnel } from "./proxy-agent-service.ts";

export const PROXY_HEALTH_INTERVAL_MS = Math.max(5 * 60 * 1000, Number(process.env.PROXY_HEALTH_INTERVAL_MS || 10 * 60 * 1000));
export const PROXY_HEALTH_INITIAL_DELAY_MS = Math.max(1000, Number(process.env.PROXY_HEALTH_INITIAL_DELAY_MS || 5000));
export const PROXY_REACHABILITY_CHECK_URL = process.env.PROXY_REACHABILITY_CHECK_URL || "https://ipv4.webshare.io/";
export const PROXY_REACHABILITY_TIMEOUT_MS = Math.max(3000, Number(process.env.PROXY_REACHABILITY_TIMEOUT_MS || 10000));
export const WHATSAPP_PROXY_TIMEOUT_MS = Math.max(5000, Number(process.env.WHATSAPP_PROXY_TIMEOUT_MS || 15000));
export const PROXY_REACHABILITY_RETRY_COUNT = Math.max(0, Number(process.env.PROXY_REACHABILITY_RETRY_COUNT || 1));

type ProxyDb = {
  getSystemProxies: () => Promise<any[]>;
  updateSystemProxyStatus: (proxyId: string, latency: number | null, errorMsg: string | null) => Promise<any>;
};

type ProxyCheckResult = {
  total: number;
  ok: number;
  failed: number;
};

function proxyId(proxy: any) {
  return proxy?.$id || proxy?.id || "";
}

export function sanitizeProxyErrorMessage(error: any, fallback = "Proxy check failed") {
  const raw = String(error?.message || error || fallback).replace(/\s+/g, " ").trim();
  if (!raw) return fallback;
  const masked = raw.replace(/\b(?:https?|socks5h?|socks):\/\/[^\s]+/gi, (value) => maskProxyUrl(value));
  return masked.slice(0, 120);
}

export function isRetryableProxyCheckError(error: any) {
  if (error?.name === "AbortError") return true;
  const message = String(error?.message || error || "").toLowerCase();
  return /timed out|timeout|fetch failed|socket|econnreset|etimedout|ehostunreach|temporary|network/.test(message);
}

export function shouldTreatAsGenericProxyFailure(error: any) {
  const message = String(error?.message || error || "").toLowerCase();
  return /proxy|407|authentication|econnrefused|ehostunreach|enotfound|etimedout|connection refused|network is unreachable|fetch failed|socket hang up|tunneling/.test(message);
}

async function runGenericProxyReachabilityCheck(fetchAgent: any) {
  let lastError: any = null;
  for (let attempt = 0; attempt <= PROXY_REACHABILITY_RETRY_COUNT; attempt++) {
    try {
      return await verifyProxyReachability(fetchAgent, PROXY_REACHABILITY_TIMEOUT_MS, PROXY_REACHABILITY_CHECK_URL);
    } catch (error: any) {
      lastError = error;
      if (attempt >= PROXY_REACHABILITY_RETRY_COUNT || !isRetryableProxyCheckError(error)) {
        break;
      }
    }
  }
  throw lastError || new Error("Proxy reachability check failed");
}

export async function checkSystemProxy(proxy: any, dbService: ProxyDb) {
  const id = proxyId(proxy);
  const proxyUrl = normalizeProxyUrl(proxy?.url);
  if (!id || !proxyUrl) {
    return { ok: false, error: "Proxy has no URL or database id." };
  }

  try {
    const agents = createProxyAgents(proxyUrl);
    const latency = await runGenericProxyReachabilityCheck(agents.fetchAgent);
    await dbService.updateSystemProxyStatus(id, latency, null);
    return { ok: true, latency, proxy: agents.maskedProxyUrl };
  } catch (error: any) {
    const message = sanitizeProxyErrorMessage(error, "Proxy reachability check failed");
    await dbService.updateSystemProxyStatus(id, null, message);
    return { ok: false, error: message, proxy: maskProxyUrl(proxyUrl) };
  }
}

export async function testProxyUrl(proxyUrlInput: any) {
  const agents = createProxyAgents(proxyUrlInput);
  const latency = await runGenericProxyReachabilityCheck(agents.fetchAgent);
  let whatsappReachable = true;
  let whatsappWarning = "";
  try {
    await verifyWhatsAppProxyTunnel(agents.fetchAgent, WHATSAPP_PROXY_TIMEOUT_MS);
  } catch (error: any) {
    whatsappReachable = false;
    whatsappWarning = sanitizeProxyErrorMessage(error, "WhatsApp suitability check failed");
  }
  return { latency, proxy: agents.maskedProxyUrl, whatsappReachable, whatsappWarning };
}

export async function checkSystemProxyList(dbService: ProxyDb, proxies?: any[]): Promise<ProxyCheckResult> {
  const list = Array.isArray(proxies) ? proxies : await dbService.getSystemProxies();
  const result = { total: list.length, ok: 0, failed: 0 };

  for (const proxy of list) {
    const checked = await checkSystemProxy(proxy, dbService);
    if (checked.ok) result.ok++;
    else result.failed++;
  }

  return result;
}

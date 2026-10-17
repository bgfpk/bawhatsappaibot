import * as dbService from "./db-service.ts";
import { maskProxyUrl, normalizeProxyUrl } from "./proxy-agent-service.ts";

function usesCustomProxy(config: any) {
  return Boolean(config?.proxy_url) && config?.use_dedicated_proxy !== 1 && config?.useDedicatedProxy !== true;
}

export async function resolveWhatsAppProxyUrl(userId: string) {
  if (!userId) return null;

  const config = await dbService.loadUserConfig(userId);
  if (usesCustomProxy(config)) {
    const proxyUrl = normalizeProxyUrl(config.proxy_url);
    if (proxyUrl) {
      return { proxyUrl, source: "custom", maskedProxyUrl: maskProxyUrl(proxyUrl) };
    }
  }

  const systemProxyUrl = normalizeProxyUrl(await dbService.getOrAssignAutoProxy(userId));
  if (!systemProxyUrl) return null;
  return { proxyUrl: systemProxyUrl, source: "system", maskedProxyUrl: maskProxyUrl(systemProxyUrl) };
}

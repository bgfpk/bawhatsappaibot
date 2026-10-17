export const MAX_SYSTEM_PROXY_ASSIGNMENTS = 3;

function toNumber(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getSystemProxyLatency(proxy: any) {
  return toNumber(proxy?.ping_latency || proxy?.latency);
}

export function getSystemProxyLoadCount(proxy: any) {
  return Math.max(0, toNumber(proxy?.load_count));
}

export function isSystemProxyEnabled(proxy: any) {
  return !(proxy?.is_active === 0 || proxy?.is_active === false || proxy?.is_active === "0");
}

export function getSystemProxyError(proxy: any) {
  return String(proxy?.error_msg || "").trim();
}

export function hasSystemProxyGenericError(proxy: any) {
  return Boolean(getSystemProxyError(proxy));
}

export function isSystemProxyGenericallyHealthy(proxy: any) {
  return !hasSystemProxyGenericError(proxy) && getSystemProxyLatency(proxy) > 0;
}

export function getSystemProxyHealthState(proxy: any): "working" | "error" | "unknown" {
  if (hasSystemProxyGenericError(proxy)) return "error";
  if (getSystemProxyLatency(proxy) > 0) return "working";
  return "unknown";
}

export function canKeepAssignedSystemProxy(proxy: any) {
  return isSystemProxyEnabled(proxy) && !hasSystemProxyGenericError(proxy);
}

export function canAssignSystemProxy(proxy: any) {
  return canKeepAssignedSystemProxy(proxy) && getSystemProxyLoadCount(proxy) < MAX_SYSTEM_PROXY_ASSIGNMENTS;
}

export function calculateSystemProxyPoolStats(proxyList: any[]) {
  const proxies = Array.isArray(proxyList) ? proxyList : [];
  const total = proxies.length;
  const working = proxies.filter(isSystemProxyGenericallyHealthy).length;
  const error = proxies.filter((proxy) => getSystemProxyHealthState(proxy) === "error").length;
  const unknown = total - working - error;
  const connectedInstances = proxies.reduce((sum, proxy) => sum + getSystemProxyLoadCount(proxy), 0);
  const totalQuota = working * MAX_SYSTEM_PROXY_ASSIGNMENTS;
  const quotaLeft = Math.max(0, totalQuota - connectedInstances);
  return { total, working, error, unknown, connectedInstances, totalQuota, quotaLeft };
}

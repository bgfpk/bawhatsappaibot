import dns from "node:dns/promises";
import net from "node:net";

const LOCALHOST_NAMES = new Set(["localhost", "localhost.localdomain", "0.0.0.0"]);
const BLOCKED_HOST_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home", ".test"];
const BLOCKED_EXACT_HOSTS = new Set(["metadata.google.internal", "169.254.169.254"]);

function isExplicitLocalDev() {
  return process.env.NODE_ENV === "development" || process.env.BLACKARROW_ALLOW_LOCAL_WEBHOOKS === "true" || process.env.BLACKARROW_ALLOW_LOCAL_INTEGRATION_URLS === "true";
}

function normalizeHostname(hostname: string) {
  return String(hostname || "").trim().toLowerCase().replace(/^\[(.*)\]$/, "$1").replace(/\.$/, "");
}

function isPrivateIpv4Address(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function isPrivateIpv6Address(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

export function isBlockedOutboundHostname(hostname: string, options: { allowLocalDevelopment?: boolean } = {}) {
  const host = normalizeHostname(hostname);
  if (!host) return true;
  if (options.allowLocalDevelopment && isExplicitLocalDev() && (LOCALHOST_NAMES.has(host) || host === "::1" || host === "127.0.0.1")) return false;
  if (LOCALHOST_NAMES.has(host) || BLOCKED_EXACT_HOSTS.has(host)) return true;
  if (!host.includes(".") && net.isIP(host) === 0) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) return isPrivateIpv4Address(host);
  if (ipVersion === 6) return isPrivateIpv6Address(host);
  return false;
}

export function validateExternalServiceUrl(value: any, options: {
  label: string;
  requireHttps?: boolean;
  allowLocalDevelopment?: boolean;
  maxLength?: number;
}) {
  const maxLength = options.maxLength || 500;
  const rawText = String(value || "").trim();
  if (rawText.length > maxLength) throw new Error(`${options.label} URL is too long.`);
  const text = rawText;
  if (!text) throw new Error(`${options.label} URL is required.`);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`Enter a valid ${options.label} URL.`);
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`${options.label} URL must use HTTP or HTTPS.`);
  const localAllowed = options.allowLocalDevelopment && isExplicitLocalDev();
  if (options.requireHttps !== false && url.protocol !== "https:" && !localAllowed) {
    throw new Error(`${options.label} URL must use HTTPS.`);
  }
  if (isBlockedOutboundHostname(url.hostname, { allowLocalDevelopment: options.allowLocalDevelopment })) {
    throw new Error(`${options.label} URL cannot use localhost, private, link-local, or internal hosts.`);
  }
  url.username = "";
  url.password = "";
  return url;
}

export async function assertSafeExternalServiceUrl(value: any, options: {
  label: string;
  requireHttps?: boolean;
  allowLocalDevelopment?: boolean;
  maxLength?: number;
}) {
  const url = validateExternalServiceUrl(value, options);
  const host = normalizeHostname(url.hostname);
  if (net.isIP(host) === 0) {
    const addresses = await dns.lookup(host, { all: true, verbatim: true }).catch(() => null);
    if (!addresses || addresses.length === 0) throw new Error(`${options.label} URL could not be resolved safely.`);
    if (addresses.some((entry) => isBlockedOutboundHostname(entry.address, { allowLocalDevelopment: options.allowLocalDevelopment }))) {
      throw new Error(`${options.label} URL resolves to a private or internal address.`);
    }
  }
  return url;
}

export const __outboundUrlSafetyTestUtils = {
  isPrivateIpv4Address,
  isPrivateIpv6Address,
  isExplicitLocalDev,
};

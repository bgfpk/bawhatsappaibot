#!/usr/bin/env node

/**
 * BlackArrow IndexNow Submission Utility (Release-Ready, Changed-URL-First)
 *
 * Submits updated public canonical URLs directly to the IndexNow protocol endpoint (supported by Bing, Yandex, Seznam, Naver).
 * Protocol specification: https://www.indexnow.org/documentation
 *
 * Governance:
 *   Use IndexNow after meaningful public URL creation, modification, or deletion.
 *   Do not routinely resubmit the unchanged 58-URL sitemap.
 *
 * Usage:
 *   node scripts/submit-indexnow.mjs
 *     -> Prints usage and exits safely without submitting.
 *
 *   node scripts/submit-indexnow.mjs https://blackarrow-source.offline.invalid/whatsapp-automation https://blackarrow-source.offline.invalid/pricing
 *     -> Submits only the specified changed/new URLs (restricted to blackarrow-source.offline.invalid).
 *
 *   node scripts/submit-indexnow.mjs --all
 *     -> Explicit manual full-sitemap submission mode.
 */

export const INDEXNOW_HOST = "blackarrow-source.offline.invalid";
export const INDEXNOW_KEY = process.env.BLACKARROW_INDEXNOW_KEY || "";
export const INDEXNOW_KEY_LOCATION = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;
export const INDEXNOW_API_ENDPOINT = "https://api.indexnow.org/indexnow";

export function filterValidBlackArrowUrls(urls) {
  return Array.from(
    new Set(
      urls.filter((url) => {
        try {
          const parsed = new URL(url);
          return parsed.hostname === INDEXNOW_HOST && parsed.protocol === "https:";
        } catch {
          return false;
        }
      })
    )
  );
}

export function printUsage() {
  console.log(`
BlackArrow IndexNow Submission Utility (Changed-URL-First)

Governance:
  Use IndexNow after meaningful public URL creation, modification or deletion.
  Do not routinely resubmit the unchanged 58-URL sitemap.

Usage:
  # Submit specific changed or added URLs (Recommended):
  node scripts/submit-indexnow.mjs https://blackarrow-source.offline.invalid/url-1 https://blackarrow-source.offline.invalid/url-2

  # Explicit full-sitemap submission (Only after major site architecture overhauls):
  node scripts/submit-indexnow.mjs --all

  # View this help message:
  node scripts/submit-indexnow.mjs --help

Host constraint: All submitted URLs must match hostname '${INDEXNOW_HOST}'.
Endpoint: ${INDEXNOW_API_ENDPOINT}
Key file: ${INDEXNOW_KEY_LOCATION}
`);
}

export async function submitUrls(urls) {
  if (!/^[A-Za-z0-9-]{8,128}$/.test(INDEXNOW_KEY)) {
    throw new Error("Set a private BLACKARROW_INDEXNOW_KEY and host its verification file before submitting.");
  }
  const validUrls = filterValidBlackArrowUrls(urls);

  if (validUrls.length === 0) {
    console.warn("[WARN] No valid https://blackarrow-source.offline.invalid URLs provided for submission.");
    return { status: 400, count: 0, submitted: [] };
  }

  console.log(`Submitting ${validUrls.length} URL(s) to IndexNow (${INDEXNOW_API_ENDPOINT})...`);

  const payload = {
    host: INDEXNOW_HOST,
    key: INDEXNOW_KEY,
    keyLocation: INDEXNOW_KEY_LOCATION,
    urlList: validUrls,
  };

  const response = await fetch(INDEXNOW_API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 200 || response.status === 202) {
    console.log(`[PASS] IndexNow submission successful (HTTP ${response.status}). ${validUrls.length} URLs queued for rapid crawl.`);
  } else {
    const responseText = await response.text();
    console.warn(`[WARN] IndexNow response: HTTP ${response.status} - ${responseText}`);
  }

  return { status: response.status, count: validUrls.length, submitted: validUrls };
}

async function main() {
  const args = process.argv.slice(2);

  // 1. Zero arguments or help request -> safe exit with usage instructions
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  // 2. Explicit manual full-sitemap flag
  if (args.includes("--all")) {
    console.log("Fetching live sitemap from https://blackarrow-source.offline.invalid/sitemap.xml for manual full-site submission...");
    try {
      const res = await fetch("https://blackarrow-source.offline.invalid/sitemap.xml");
      if (!res.ok) {
        throw new Error(`Failed to fetch live sitemap: HTTP ${res.status}`);
      }
      const xml = await res.text();
      const locMatches = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
      const sitemapUrls = filterValidBlackArrowUrls(locMatches);
      await submitUrls(sitemapUrls);
    } catch (err) {
      console.error("[ERROR] Failed to fetch and submit full sitemap:", err.message);
      process.exit(1);
    }
    return;
  }

  // 3. Explicit changed URLs supplied via CLI
  const explicitUrls = args.filter((arg) => !arg.startsWith("--"));
  if (explicitUrls.length === 0) {
    printUsage();
    process.exit(0);
  }

  try {
    await submitUrls(explicitUrls);
  } catch (err) {
    console.error("[ERROR] IndexNow submission error:", err.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("submit-indexnow.mjs")) {
  main();
}

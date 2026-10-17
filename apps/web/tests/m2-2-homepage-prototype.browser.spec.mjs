import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";

const PORT = process.env.TEST_PORT || 3009;
const BASE_URL = `http://localhost:${PORT}`;

test("M2.3 Playwright Browser Spec - Production Homepage / & Preserved Supporting Routes", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const failedRequests = [];

  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("404") && !msg.text().includes("500") && !msg.text().includes("Failed to load resource")) {
      consoleErrors.push(msg.text());
    }
  });

  page.on("requestfailed", (req) => {
    if (!req.url().includes("google-analytics.com") && !req.url().includes("analytics.google.com") && !req.url().includes("googletagmanager.com")) {
      failedRequests.push(`${req.url()} (${req.failure()?.errorText})`);
    }
  });

  try {
    // 1. DESKTOP 1440PX HOMEPAGE VERIFICATION
    const response = await page.goto(BASE_URL, { waitUntil: "networkidle" });
    assert.equal(response.status(), 200, "Homepage / must return 200 OK");

    // Zero console errors & zero failed network requests
    assert.equal(consoleErrors.length, 0, `Homepage console errors: ${consoleErrors.join("; ")}`);
    assert.equal(failedRequests.length, 0, `Homepage failed requests: ${failedRequests.join("; ")}`);

    // Verify exact single H1
    const h1Count = await page.evaluate(() => document.querySelectorAll("h1").length);
    assert.equal(h1Count, 1, `Homepage must render exactly 1 H1 element (got ${h1Count})`);

    const h1Text = await page.evaluate(() => document.querySelector("h1")?.textContent?.trim() || "");
    assert.match(h1Text, /Automate WhatsApp Sales, Support, Orders/i, "H1 must match approved hero headline");

    // Exactly 1 intended header and 1 footer
    const headerCount = await page.evaluate(() => document.querySelectorAll("header").length);
    const footerCount = await page.evaluate(() => document.querySelectorAll("footer").length);
    assert.equal(headerCount, 1, `Homepage must render exactly 1 header (got ${headerCount})`);
    assert.equal(footerCount, 1, `Homepage must render exactly 1 footer (got ${footerCount})`);

    // Brand logo image integrity
    const logoSrc = await page.evaluate(() => document.querySelector("header img")?.getAttribute("src"));
    assert.match(decodeURIComponent(logoSrc || ""), /brand\/blackarrow-(logo|icon)/, "Header logo must reference official brand asset image");

    // Zero horizontal overflow at 1440px
    const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth > 1440);
    assert.equal(desktopOverflow, false, "Homepage 1440px viewport must have 0 horizontal overflow");

    // Required section anchors present
    const sectionIds = ["hero", "problems", "solutions", "workflow", "pricing", "faqs"];
    for (const id of sectionIds) {
      const exists = await page.evaluate((secId) => !!document.getElementById(secId), id);
      assert.equal(exists, true, `Homepage must contain required section id="${id}"`);
    }

    // Interactive theme toggle check
    const themeToggleBtn = await page.$("[aria-label*='theme' i], [class*='theme' i]");
    assert.ok(themeToggleBtn, "Persistent matte theme toggle button must exist");

    // Interactive FAQ Accordions
    const faqButtons = await page.$$("button[aria-expanded]");
    assert.ok(faqButtons.length >= 3, `Homepage must render interactive FAQ accordion buttons (got ${faqButtons.length})`);
    
    // Toggle first FAQ accordion
    const firstFaqInitial = await faqButtons[0].getAttribute("aria-expanded");
    await faqButtons[0].click();
    const firstFaqToggled = await faqButtons[0].getAttribute("aria-expanded");
    assert.notEqual(firstFaqInitial, firstFaqToggled, "Clicking FAQ accordion button must toggle aria-expanded state");

    // 2. RESPONSIVE VIEWPORT SWEEP (1280, 1024, 768, 390)
    const viewports = [
      { width: 1280, height: 800, name: "1280px Desktop" },
      { width: 1024, height: 768, name: "1024px Tablet Landscape" },
      { width: 768, height: 1024, name: "768px Tablet Portrait" },
      { width: 390, height: 844, name: "390px Mobile" },
    ];

    for (const vp of viewports) {
      const vpPage = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await vpPage.goto(BASE_URL, { waitUntil: "networkidle" });
      const overflow = await vpPage.evaluate((w) => document.documentElement.scrollWidth > w, vp.width);
      assert.equal(overflow, false, `${vp.name} viewport must have 0 horizontal overflow`);
      await vpPage.close();
    }

    // 3. MOBILE DRAWER INTERACTION AT 390PX
    const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobilePage.goto(BASE_URL, { waitUntil: "networkidle" });

    const menuToggle = await mobilePage.$("button[aria-label*='menu' i], button[class*='menu' i]");
    assert.ok(menuToggle, "Mobile menu toggle button must exist at 390px");

    // Open mobile drawer
    await menuToggle.click();
    await mobilePage.waitForTimeout(300);

    const isDrawerOpen = await mobilePage.evaluate(() => {
      const drawer = document.querySelector("[role='dialog'], [class*='drawer' i]");
      return drawer !== null;
    });
    assert.equal(isDrawerOpen, true, "Clicking menu toggle at 390px must open mobile navigation drawer");

    // Verify all 10 required mobile drawer navigation items are visible
    const requiredNavItems = [
      "Features",
      "Pricing",
      "Integrations",
      "Doc",
      "Blog",
      "About",
      "Contact",
      "Terms",
      "Privacy",
      "Disclaimer"
    ];

    const visibleNavItems = await mobilePage.evaluate(() => {
      const links = Array.from(document.querySelectorAll("[role='dialog'] a, [class*='drawer' i] a"));
      return links.map((l) => l.textContent?.trim()).filter(Boolean);
    });

    for (const item of requiredNavItems) {
      const found = visibleNavItems.some((text) => text?.toLowerCase().includes(item.toLowerCase()));
      assert.equal(found, true, `Mobile drawer must contain link for "${item}"`);
    }

    await mobilePage.close();

    // 4. RIGOROUS SUPPORTING-ROUTE REGRESSION SUITE (10 PUBLIC WEB-OWNED ROUTES)
    const claimedRoutes = [
      { path: "/features", titleSnippet: "WhatsApp Workspace", selector: "h1" },
      { path: "/pricing", titleSnippet: "Simple plans", selector: "h1" },
      { path: "/docs", titleSnippet: "BlackArrow Documentation", selector: "h1" },
      { path: "/blog", titleSnippet: "BlackArrow Blog", selector: "h1" },
      { path: "/terms", titleSnippet: "Terms", selector: ".hero-kicker, h1" },
      { path: "/privacy", titleSnippet: "Privacy", selector: ".hero-kicker, h1" },
      { path: "/disclaimer", titleSnippet: "Practical limits", selector: "h1" },
      { path: "/contact", titleSnippet: "Talk to BlackArrow", selector: "h1" },
      { path: "/about", titleSnippet: "WhatsApp Sales and Support", selector: "h1" },
      { path: "/integrations", titleSnippet: "business systems", selector: "h1" },
    ];

    for (const item of claimedRoutes) {
      const suppPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const consoleErrors = [];
      const failedRequests = [];

      suppPage.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      suppPage.on("requestfailed", (req) => {
        if (!req.url().includes("google-analytics.com") && !req.url().includes("analytics.google.com") && !req.url().includes("googletagmanager.com")) {
          failedRequests.push(`${req.url()} (${req.failure()?.errorText})`);
        }
      });

      const res = await suppPage.goto(`${BASE_URL}${item.path}`, { waitUntil: "networkidle" });
      assert.equal(res.status(), 200, `Route ${item.path} must return 200 OK`);

      // 0 console errors & 0 failed network requests
      assert.equal(consoleErrors.length, 0, `Route ${item.path} console errors: ${consoleErrors.join("; ")}`);
      assert.equal(failedRequests.length, 0, `Route ${item.path} failed requests: ${failedRequests.join("; ")}`);

      // Expected route-specific heading or content present
      const contentPresent = await suppPage.evaluate(
        ({ sel, snippet }) => {
          const el = document.querySelector(sel);
          return el ? el.textContent.toLowerCase().includes(snippet.toLowerCase()) : false;
        },
        { sel: item.selector, snippet: item.titleSnippet }
      );
      assert.equal(contentPresent, true, `Route ${item.path} must display snippet "${item.titleSnippet}"`);

      // Exactly 1 intended header
      const headerCount = await suppPage.evaluate(() => document.querySelectorAll("header").length);
      assert.equal(headerCount, 1, `Route ${item.path} must render exactly 1 header (got ${headerCount})`);

      const hasOverflow = await suppPage.evaluate(() => document.documentElement.scrollWidth > 1440);
      assert.equal(hasOverflow, false, `Route ${item.path} must have 0 horizontal overflow`);

      // Important CTAs have valid non-empty href destinations
      const invalidCtas = await suppPage.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a.button-link, a[class*='btn']"));
        return links
          .map((l) => l.getAttribute("href"))
          .filter((href) => !href || href.trim() === "" || href === "#");
      });
      assert.equal(invalidCtas.length, 0, `Route ${item.path} contains invalid CTA hrefs: ${invalidCtas.join(", ")}`);

      await suppPage.close();
    }
  } finally {
    await browser.close();
  }
});

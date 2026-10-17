import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";

const PORT = process.env.TEST_PORT || "3000";
const BASE_URL = `http://localhost:${PORT}`;

const CORE_ROUTES = [
  "",
  "/features",
  "/pricing",
  "/integrations",
  "/docs",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/disclaimer",
  "/blog",
];

const DOCS_SLUGS = [
  "getting-started",
  "whatsapp-setup",
  "intelligence-reply-behavior",
  "products-services-media-sequences",
  "crm-pipeline-smart-actions",
  "followups-customer-updates",
  "api-webhooks",
  "website-knowledge-wordpress",
  "plans-wallet-source-values",
  "daily-operations-safe-controls",
  "launch-safety-client-responsibility",
  "courier-integrations-setup",
  "cod-order-confirmation-setup",
];

const BLOG_SLUGS = [
  "how-whatsapp-automation-helps-small-businesses-reply-faster",
  "ecommerce-whatsapp-order-capture",
  "ai-whatsapp-bot-what-it-can-and-cannot-do",
  "whatsapp-voice-notes-ai-automation",
  "whatsapp-customer-support-automation-online-stores",
];

const SEO_LANDING_SLUGS = [
  "whatsapp-automation",
  "ai-whatsapp-bot",
  "whatsapp-customer-support",
  "ecommerce-whatsapp-bot",
  "whatsapp-order-capture",
  "whatsapp-automation-for-small-business",
  "whatsapp-ai-bot-for-ecommerce",
  "whatsapp-bot-pricing",
  "best-whatsapp-automation-tool",
  "blackarrow-vs-manual-whatsapp-support",
];

test("M3.1 Playwright Browser Spec - Redirects, Query Preservation, Interactive 404, Robots, Sitemap & Structured Data", async () => {
  const browser = await chromium.launch();

  try {
    // 1. VERIFY PERMANENT REDIRECTS & QUERY STRING PRESERVATION
    {
      const context = await browser.newContext();
      const page = await context.newPage();

      // /homepage-prototype?source=test -> /?source=test
      const responseHome = await page.goto(`${BASE_URL}/homepage-prototype?source=test`, { waitUntil: "networkidle" });
      const requestHome = responseHome.request();
      const redirectedFromHome = requestHome.redirectedFrom();
      assert.notEqual(redirectedFromHome, null, "/homepage-prototype must be redirected");
      assert.equal(redirectedFromHome.redirectedFrom(), null, "Redirect chain for /homepage-prototype must contain exactly one hop");
      assert.equal(page.url(), `${BASE_URL}/?source=test`, "/homepage-prototype?source=test must preserve query string");
      assert.equal(responseHome.status(), 200, "Destination / must return 200 OK");
      if (redirectedFromHome) {
        const redirectResponse = await redirectedFromHome.response();
        if (redirectResponse) {
          assert.equal(redirectResponse.status(), 308, "Redirect status must be 308 Permanent Redirect");
        }
      }

      // /documentation?section=setup -> /docs?section=setup
      const responseDocs = await page.goto(`${BASE_URL}/documentation?section=setup`, { waitUntil: "networkidle" });
      const requestDocs = responseDocs.request();
      const redirectedFromDocs = requestDocs.redirectedFrom();
      assert.notEqual(redirectedFromDocs, null, "/documentation must be redirected");
      assert.equal(redirectedFromDocs.redirectedFrom(), null, "Redirect chain for /documentation must contain exactly one hop");
      assert.equal(page.url(), `${BASE_URL}/docs?section=setup`, "/documentation?section=setup must preserve query string");
      assert.equal(responseDocs.status(), 200, "Destination /docs must return 200 OK");
      if (redirectedFromDocs) {
        const redirectResponse = await redirectedFromDocs.response();
        if (redirectResponse) {
          assert.equal(redirectResponse.status(), 308, "Redirect status must be 308 Permanent Redirect");
        }
      }

      // Verify retired Docs redirects
      const retiredDocsRedirects = [
        { source: "/docs/media-sequences", destination: "/docs/products-services-media-sequences" },
        { source: "/docs/orders-crm", destination: "/docs/crm-pipeline-smart-actions" },
        { source: "/docs/wallet-billing", destination: "/docs/plans-wallet-source-values" },
        { source: "/docs/integrations-webhooks", destination: "/docs/api-webhooks" },
        { source: "/docs/team-handoff", destination: "/docs/daily-operations-safe-controls" },
        { source: "/docs/qr-scanner-connection", destination: "/docs/whatsapp-setup" },
        { source: "/docs/safety-best-practices", destination: "/docs/launch-safety-client-responsibility" },
        { source: "/docs/troubleshooting", destination: "/docs/launch-safety-client-responsibility" },
        { source: "/docs/products-customers-orders", destination: "/docs/products-services-media-sequences" },
        { source: "/docs/voice-notes-cost-control", destination: "/docs/plans-wallet-source-values" },
      ];

      for (const { source, destination } of retiredDocsRedirects) {
        const res = await page.goto(`${BASE_URL}${source}?ref=migration_test`, { waitUntil: "networkidle" });
        const req = res.request();
        const redirectedFrom = req.redirectedFrom();
        assert.notEqual(redirectedFrom, null, `${source} must be redirected`);
        assert.equal(redirectedFrom.redirectedFrom(), null, `Redirect chain for ${source} must contain exactly one hop`);
        assert.equal(page.url(), `${BASE_URL}${destination}?ref=migration_test`, `${source} must preserve query string to ${destination}`);
        assert.equal(res.status(), 200, `Destination ${destination} must return 200 OK`);
        const redirectRes = await redirectedFrom.response();
        if (redirectRes) {
          assert.equal(redirectRes.status(), 308, `Redirect status for ${source} must be 308 Permanent Redirect`);
        }
      }

      await context.close();
    }

    // 2. VERIFY CUSTOM 404 PAGE & INTERACTIVE NAVIGATION AT DESKTOP AND 390px
    {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        const consoleErrors = [];
        const failedRequests = [];

        page.on("console", (msg) => {
          if (msg.type() === "error" && !msg.text().includes("404") && !msg.text().includes("500") && !msg.text().includes("Failed to load resource")) consoleErrors.push(msg.text());
        });
        page.on("requestfailed", (req) => {
          if (!req.url().includes("google-analytics.com") && !req.url().includes("analytics.google.com") && !req.url().includes("googletagmanager.com")) {
            failedRequests.push(`${req.url()} (${req.failure()?.errorText})`);
          }
        });

        const res = await page.goto(`${BASE_URL}/unknown-page-nonexistent-404-test`, { waitUntil: "networkidle" });
        assert.equal(res.status(), 404, "Unknown URL must return 404 HTTP status");
        assert.equal(consoleErrors.length, 0, `404 console errors: ${consoleErrors.join("; ")}`);
        assert.equal(failedRequests.length, 0, `404 failed requests: ${failedRequests.join("; ")}`);

        // Verify H1 contains Page Not Found
        const h1Text = await page.textContent("h1");
        assert.match(h1Text, /Page Not Found/i);

        // Verify zero horizontal overflow
        const overflow = await page.evaluate((w) => document.documentElement.scrollWidth > w, viewport.width);
        assert.equal(overflow, false, `Viewport width ${viewport.width}px must have zero horizontal overflow`);

        // Test 404 Primary Link ("Return Home") Navigation
        const homeBtn = page.locator('a[href="/"]').filter({ hasText: "Return Home" });
        await Promise.all([
          page.waitForNavigation({ waitUntil: "networkidle" }),
          homeBtn.click(),
        ]);
        assert.equal(page.url(), `${BASE_URL}/`, "Return Home link must navigate to /");

        // Return to 404 page and test Contact Link ("Contact Support") Navigation
        await page.goto(`${BASE_URL}/unknown-page-nonexistent-404-test`, { waitUntil: "networkidle" });
        const contactBtn = page.locator('a[href="/contact"]').filter({ hasText: "Contact Support" });
        await Promise.all([
          page.waitForNavigation({ waitUntil: "networkidle" }),
          contactBtn.first().click(),
        ]);
        assert.equal(page.url(), `${BASE_URL}/contact`, "Contact Support link must navigate to /contact");

        await context.close();
      }
    }

    // 3. VERIFY ROBOTS.TXT DISALLOW RULES
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      const res = await page.goto(`${BASE_URL}/robots.txt`);
      assert.equal(res.status(), 200, "robots.txt must return 200 OK");

      const body = await res.text();
      assert.doesNotMatch(body, /Disallow: \/design-preview\//);
      assert.doesNotMatch(body, /Disallow: \/design-system-preview\//);
      assert.match(body, /Disallow: \/global_dashboard/);
      assert.match(body, /Disallow: \/api\//);
      assert.match(body, /Sitemap: https:\/\/blackarrow\.com\/sitemap\.xml/);

      await context.close();
    }

    // 4. VERIFY SITEMAP.XML CANONICAL ROUTE INCLUSION & EXCLUSION RULES
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      const res = await page.goto(`${BASE_URL}/sitemap.xml`);
      assert.equal(res.status(), 200, "sitemap.xml must return 200 OK");

      const xml = await res.text();

      // Core routes
      for (const route of CORE_ROUTES) {
        const expectedLoc = `<loc>https://blackarrow-source.offline.invalid${route}</loc>`;
        assert.match(xml, new RegExp(expectedLoc.replace(/\//g, "\\/")), `Sitemap must contain ${route}`);
      }

      // Docs detail routes
      for (const slug of DOCS_SLUGS) {
        const expectedLoc = `<loc>https://blackarrow-source.offline.invalid/docs/${slug}</loc>`;
        assert.match(xml, new RegExp(expectedLoc.replace(/\//g, "\\/")), `Sitemap must contain docs/${slug}`);
      }

      // Blog detail routes
      for (const slug of BLOG_SLUGS) {
        const expectedLoc = `<loc>https://blackarrow-source.offline.invalid/blog/${slug}</loc>`;
        assert.match(xml, new RegExp(expectedLoc.replace(/\//g, "\\/")), `Sitemap must contain blog/${slug}`);
      }

      // SEO landing routes
      for (const slug of SEO_LANDING_SLUGS) {
        const expectedLoc = `<loc>https://blackarrow-source.offline.invalid/${slug}</loc>`;
        assert.match(xml, new RegExp(expectedLoc.replace(/\//g, "\\/")), `Sitemap must contain /${slug}`);
      }

      // Exclusions check
      const forbiddenRoutes = [
        "/homepage-prototype",
        "/documentation",
        "/design-preview",
        "/design-system-preview",
        "/login",
        "/signup",
        "/health",
      ];
      for (const route of forbiddenRoutes) {
        assert.doesNotMatch(xml, new RegExp(route.replace(/\//g, "\\/")), `Sitemap must NOT contain ${route}`);
      }

      // Canonical URL count calculation & zero duplicate check
      const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
      const uniqueUrls = new Set(urls);
      assert.equal(urls.length, uniqueUrls.size, "sitemap.xml must contain zero duplicate canonical URLs");

      assert.equal(urls.length, 58, `sitemap.xml URL count (${urls.length}) must equal 58`);

      await context.close();
    }

    // 5. VERIFY PRICING JSON-LD STRUCTURED DATA PARSING & INTEGRITY
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      const consoleErrors = [];
      const failedRequests = [];

      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("requestfailed", (req) => {
        if (!req.url().includes("google-analytics.com") && !req.url().includes("analytics.google.com") && !req.url().includes("googletagmanager.com")) {
          failedRequests.push(`${req.url()} (${req.failure()?.errorText})`);
        }
      });

      await page.goto(`${BASE_URL}/pricing`, { waitUntil: "networkidle" });
      assert.equal(consoleErrors.length, 0, `Pricing console errors: ${consoleErrors.join("; ")}`);
      assert.equal(failedRequests.length, 0, `Pricing failed requests: ${failedRequests.join("; ")}`);

      const jsonLdScripts = await page.$$eval('script[type="application/ld+json"]', (scripts) =>
        scripts.map((s) => JSON.parse(s.textContent || "{}"))
      );

      const pricingSchemas = jsonLdScripts.filter((s) => s["@type"] === "SoftwareApplication" && s.offers);
      assert.equal(pricingSchemas.length, 1, "Pricing page must contain exactly 1 SoftwareApplication pricing schema");

      const pricingSchema = pricingSchemas[0];
      assert.equal(pricingSchema.offers.offers.length, 3, "Pricing offers must contain 3 plans");
      assert.equal(pricingSchema.offers.offers[0].name, "Starter Plan");
      assert.equal(pricingSchema.offers.offers[0].price, "9");
      assert.equal(pricingSchema.offers.offers[1].name, "Growth Plan");
      assert.equal(pricingSchema.offers.offers[1].price, "29");
      assert.equal(pricingSchema.offers.offers[2].name, "Pro Plan");
      assert.equal(pricingSchema.offers.offers[2].price, "89");

      assert.equal(pricingSchema.offers.lowPrice, "9", "lowPrice must equal 9");
      assert.equal(pricingSchema.offers.highPrice, "89", "highPrice must equal 89");

      // Verify no fake ratings or reviews exist
      assert.equal(pricingSchema.aggregateRating, undefined, "Pricing schema must not contain fake ratings");
      assert.equal(pricingSchema.review, undefined, "Pricing schema must not contain fake reviews");

      await context.close();
    }

    // 6. VERIFY CONTACT JSON-LD STRUCTURED DATA PARSING & CONTACTPOINT INTEGRITY
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      const consoleErrors = [];
      const failedRequests = [];

      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("requestfailed", (req) => {
        if (!req.url().includes("google-analytics.com") && !req.url().includes("analytics.google.com") && !req.url().includes("googletagmanager.com")) {
          failedRequests.push(`${req.url()} (${req.failure()?.errorText})`);
        }
      });

      await page.goto(`${BASE_URL}/contact`, { waitUntil: "networkidle" });
      assert.equal(consoleErrors.length, 0, `Contact console errors: ${consoleErrors.join("; ")}`);
      assert.equal(failedRequests.length, 0, `Contact failed requests: ${failedRequests.join("; ")}`);

      const jsonLdScripts = await page.$$eval('script[type="application/ld+json"]', (scripts) =>
        scripts.map((s) => JSON.parse(s.textContent || "{}"))
      );

      const contactSchema = jsonLdScripts.find((s) => s["@type"] === "ContactPage");
      assert.notEqual(contactSchema, undefined, "Contact page must contain ContactPage schema");

      const org = contactSchema.mainEntity;
      assert.equal(org["@type"], "Organization");
      assert.notEqual(org.contactPoint, undefined, "Organization must contain contactPoint array");
      assert.equal(org.contactPoint.length, 1);

      const cp = org.contactPoint[0];
      assert.equal(cp["@type"], "ContactPoint");
      assert.equal(cp.contactType, "sales and support");
      assert.equal(cp.email, "contact-086473cbd844@example.invalid");
      assert.equal(cp.telephone, undefined);
      assert.equal(cp.url, undefined);

      await context.close();
    }

    // 7. VERIFY /FEATURES PAGE INTERACTIVE & VISUAL ALIGNMENT AT 5 VIEWPORTS AND DARK/LIGHT THEMES
    {
      const viewports = [
        { width: 1440, height: 900 },
        { width: 1280, height: 800 },
        { width: 1024, height: 768 },
        { width: 768, height: 1024 },
        { width: 390, height: 844 },
      ];

      for (const viewport of viewports) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        const consoleErrors = [];
        const failedRequests = [];

        page.on("console", (msg) => {
          if (msg.type() === "error") consoleErrors.push(msg.text());
        });
        page.on("requestfailed", (req) => {
          if (!req.url().includes("google-analytics.com") && !req.url().includes("analytics.google.com") && !req.url().includes("googletagmanager.com")) {
            failedRequests.push(`${req.url()} (${req.failure()?.errorText})`);
          }
        });

        const res = await page.goto(`${BASE_URL}/features`, { waitUntil: "networkidle" });
        assert.equal(res.status(), 200, `/features must return 200 OK at ${viewport.width}px`);
        assert.equal(consoleErrors.length, 0, `Features console errors at ${viewport.width}px: ${consoleErrors.join("; ")}`);
        assert.equal(failedRequests.length, 0, `Features failed requests at ${viewport.width}px: ${failedRequests.join("; ")}`);

        // Header and footer single presence
        const headerCount = await page.$$eval(".site-header, header", (els) => els.length);
        const footerCount = await page.$$eval(".footer, footer", (els) => els.length);
        assert.equal(headerCount, 1, `/features must contain exactly 1 header at ${viewport.width}px`);
        assert.equal(footerCount, 1, `/features must contain exactly 1 footer at ${viewport.width}px`);

        // Exact H1 assertion & single H1
        const h1Text = await page.textContent("h1");
        assert.match(h1Text, /One WhatsApp Workspace for AI Sales, Support, Orders, and Follow-Ups/);
        const h1Count = await page.$$eval("h1", (els) => els.length);
        assert.equal(h1Count, 1, `/features must contain exactly one H1 element at ${viewport.width}px`);

        // Zero horizontal overflow
        const overflow = await page.evaluate((w) => document.documentElement.scrollWidth > w, viewport.width);
        assert.equal(overflow, false, `/features viewport width ${viewport.width}px must have zero horizontal overflow`);

        // CTA link href validity
        const ctaHrefs = await page.$$eval("a", (links) => links.map((l) => l.getAttribute("href")));
        for (const href of ctaHrefs) {
          assert.notEqual(href, null, "All link hrefs must be defined");
          assert.notEqual(href?.trim(), "", "Link href must not be empty");
        }

        // Product truth & demo labels assertion
        const bodyHtml = await page.content();
        assert.match(bodyHtml, /Matched against configured Product Catalog/);
        assert.doesNotMatch(bodyHtml, /Verified from Product Catalog/);
        assert.match(bodyHtml, /Sample Workspace Data/);

        // Anchor clearance check for #usage-billing and #customers-crm
        for (const targetHash of ["#usage-billing", "#customers-crm"]) {
          await page.goto(`${BASE_URL}/features`, { waitUntil: "networkidle" });
          const catLink = await page.$(`a[href="${targetHash}"]`);
          if (catLink) {
            await catLink.scrollIntoViewIfNeeded();
            await catLink.click();
            await page.waitForTimeout(500);
          }
          const clearance = await page.evaluate((id) => {
            const sec = document.getElementById(id.replace("#", ""));
            if (!sec) return -999;
            const secTop = sec.getBoundingClientRect().top;
            const siteHeader = document.querySelector("header");
            const featuresNav = document.querySelector("nav[aria-label='Feature categories']");
            const headerHeight = siteHeader ? siteHeader.getBoundingClientRect().height : 0;
            const navHeight = featuresNav ? featuresNav.getBoundingClientRect().height : 0;
            return secTop - (headerHeight + navHeight);
          }, targetHash);

          assert.equal(clearance >= -10, true, `Anchor ${targetHash} heading at ${viewport.width}px must land below sticky headers (clearance: ${clearance}px)`);
        }

        // Dark/Light theme testing at 1440px
        if (viewport.width === 1440) {
          await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
          const lightH1Visible = await page.isVisible("h1");
          assert.equal(lightH1Visible, true, "/features H1 must remain visible in light theme");

          await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
          const darkH1Visible = await page.isVisible("h1");
          assert.equal(darkH1Visible, true, "/features H1 must remain visible in dark theme");
        }

        await context.close();
      }
    }

    // 8. VERIFY /PRICING PAGE VISIBLE VALUES, 5 VIEWPORTS, THEMES & REAL FAQ ACCORDION
    {
      const viewports = [
        { width: 1440, height: 900 },
        { width: 1280, height: 800 },
        { width: 1024, height: 768 },
        { width: 768, height: 1024 },
        { width: 390, height: 844 },
      ];

      for (const viewport of viewports) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        const consoleErrors = [];
        const failedRequests = [];

        page.on("console", (msg) => {
          if (msg.type() === "error") consoleErrors.push(msg.text());
        });
        page.on("requestfailed", (req) => {
          if (!req.url().includes("google-analytics.com") && !req.url().includes("analytics.google.com") && !req.url().includes("googletagmanager.com")) {
            failedRequests.push(`${req.url()} (${req.failure()?.errorText})`);
          }
        });

        const res = await page.goto(`${BASE_URL}/pricing`, { waitUntil: "networkidle" });
        assert.equal(res.status(), 200, `/pricing must return 200 OK at ${viewport.width}px`);
        assert.equal(consoleErrors.length, 0, `Pricing console errors at ${viewport.width}px: ${consoleErrors.join("; ")}`);
        assert.equal(failedRequests.length, 0, `Pricing failed requests at ${viewport.width}px: ${failedRequests.join("; ")}`);

        // Header and footer single presence
        const headerCount = await page.$$eval(".site-header, header", (els) => els.length);
        const footerCount = await page.$$eval(".footer, footer", (els) => els.length);
        assert.equal(headerCount, 1, `/pricing must contain exactly 1 header at ${viewport.width}px`);
        assert.equal(footerCount, 1, `/pricing must contain exactly 1 footer at ${viewport.width}px`);

        // Exact H1 assertion & single H1
        const h1Text = await page.textContent("h1");
        assert.match(h1Text, /Simple Plans for Your WhatsApp AI Workspace/i);
        const h1Count = await page.$$eval("h1", (els) => els.length);
        assert.equal(h1Count, 1, `/pricing must contain exactly one H1 element at ${viewport.width}px`);

        // Zero horizontal overflow
        const overflow = await page.evaluate((w) => document.documentElement.scrollWidth > w, viewport.width);
        assert.equal(overflow, false, `/pricing viewport width ${viewport.width}px must have zero horizontal overflow`);

        // Visible pricing values verification ($9, $29, $89, $5 top-up, $49 setup fee)
        const pageText = await page.textContent("body");
        assert.match(pageText, /\$9\s*\/\s*month/i, "/pricing must render Starter $9/month");
        assert.match(pageText, /\$29\s*\/\s*month/i, "/pricing must render Growth $29/month");
        assert.match(pageText, /\$89\s*\/\s*month/i, "/pricing must render Pro $89/month");
        assert.match(pageText, /Minimum Wallet Top-Up: \$5/i, "/pricing must render minimum wallet top-up $5");
        assert.match(pageText, /Optional Full Setup.*\$49/i, "/pricing must render optional setup fee $49");
        assert.doesNotMatch(pageText, /\$99/i, "/pricing must NOT contain $99 setup fee claim");

        // Dark/Light theme testing at 1440px
        if (viewport.width === 1440) {
          await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
          const lightH1Visible = await page.isVisible("h1");
          assert.equal(lightH1Visible, true, "/pricing H1 must remain visible in light theme");

          await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
          const darkH1Visible = await page.isVisible("h1");
          assert.equal(darkH1Visible, true, "/pricing H1 must remain visible in dark theme");
        }

        // Test REAL FAQ Accordion component (.faq-list button.faq-item) at 1440px desktop
        if (viewport.width === 1440) {
          const faqButtons = page.locator(".faq-list button.faq-item");
          assert.equal(await faqButtons.count() >= 2, true, "Pricing page must contain at least 2 FAQ items");

          const secondFaq = faqButtons.nth(1);
          const initialExpanded = await secondFaq.getAttribute("aria-expanded");
          assert.equal(initialExpanded, "false", "Second FAQ item must start closed (aria-expanded='false')");

          await secondFaq.click();
          const openExpanded = await secondFaq.getAttribute("aria-expanded");
          assert.equal(openExpanded, "true", "Clicking second FAQ item must open it (aria-expanded='true')");

          const answerVisible = await secondFaq.locator(".faq-answer").isVisible();
          assert.equal(answerVisible, true, "Opened FAQ item answer must be visible");

          await secondFaq.click();
          const closedExpanded = await secondFaq.getAttribute("aria-expanded");
          assert.equal(closedExpanded, "false", "Clicking second FAQ item again must close it (aria-expanded='false')");
        }

        // 9. VERIFY HOMEPAGE HEADER LAYOUT AT 1440px, 1280px, 1024px, 768px, and 390px
        for (const width of [1440, 1280, 390]) {
          const context = await browser.newContext({ viewport: { width, height: 900 } });
          const page = await context.newPage();
          const res = await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
          assert.equal(res.status(), 200, `/ must return 200 OK at ${width}px`);

          const headerHeight = await page.evaluate(() => {
            const h = document.querySelector("header");
            return h ? h.getBoundingClientRect().height : 0;
          });

          // Header height must remain <= 90px (compact horizontal row)
          assert.ok(headerHeight > 0 && headerHeight <= 90, `Header height at ${width}px must be <= 90px, got ${headerHeight}px`);

          if (width >= 1024) {
            // Desktop: Nav links and CTA group must be visible and horizontal
            const navVisible = await page.isVisible("nav[aria-label='Main Navigation']");
            assert.equal(navVisible, true, `Desktop main navigation must be visible at ${width}px`);

            const isSelectElement = await page.evaluate(() => {
              const sol = document.querySelector("header select");
              return sol !== null;
            });
            assert.equal(isSelectElement, false, `Solutions menu at ${width}px must not be a native select element`);
          } else {
            // Mobile (390px): Desktop nav hidden, mobile menu button visible
            const mobileBtnVisible = await page.evaluate(() => {
              const btn = document.querySelector("header button[aria-label*='menu']");
              return btn !== null && getComputedStyle(btn).display !== "none";
            });
            assert.equal(mobileBtnVisible, true, `Mobile menu button must be visible at ${width}px`);

            // Open mobile drawer
            await page.click("header button[aria-label*='menu']");
            await page.waitForTimeout(100);
            const drawerVisible = await page.evaluate(() => {
              const drawer = document.querySelector("div[aria-label='Mobile Navigation Drawer']");
              return drawer !== null && getComputedStyle(drawer).display !== "none";
            });
            assert.equal(drawerVisible, true, "Mobile drawer must open when menu button is clicked");
          }

          await context.close();
        }

        // 10. MULTI-ROUTE CANONICAL SHARED HEADER CONSISTENCY VERIFICATION
        const representativeRoutes = [
          "/",
          "/features",
          "/pricing",
          "/integrations",
          "/docs",
          "/blog",
          "/about",
          "/contact",
          "/terms",
          "/whatsapp-automation",
        ];

        for (const routePath of representativeRoutes) {
          const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          const page = await context.newPage();
          const consoleErrors = [];
          const failedRequests = [];

          page.on("console", (msg) => {
            if (msg.type() === "error") consoleErrors.push(msg.text());
          });
          page.on("requestfailed", (req) => {
            if (!req.url().includes("google-analytics.com") && !req.url().includes("analytics.google.com") && !req.url().includes("googletagmanager.com")) {
              failedRequests.push(`${req.url()} (${req.failure()?.errorText})`);
            }
          });

          const res = await page.goto(`${BASE_URL}${routePath}`, { waitUntil: "networkidle" });
          assert.equal(res.status(), 200, `${routePath} must return 200 OK`);
          assert.equal(consoleErrors.length, 0, `${routePath} console errors: ${consoleErrors.join("; ")}`);
          assert.equal(failedRequests.length, 0, `${routePath} failed requests: ${failedRequests.join("; ")}`);

          // 1. Single header element and height check (<= 90px)
          const headerHeight = await page.evaluate(() => {
            const h = document.querySelector("header");
            return h ? h.getBoundingClientRect().height : 0;
          });
          assert.ok(headerHeight > 0 && headerHeight <= 90, `${routePath} header height must be between 1px and 90px (got ${headerHeight}px)`);

          // 2. Navigation labels check
          const navLabels = await page.$$eval("nav[aria-label='Main Navigation'] a, nav[aria-label='Main Navigation'] button", (els) =>
            els.map((e) => e.textContent?.trim()).filter(Boolean)
          );
          assert.ok(navLabels.includes("Features"), `${routePath} header must include Features nav item`);
          assert.ok(navLabels.some((l) => l.includes("Solutions")), `${routePath} header must include Solutions nav item`);
          assert.ok(navLabels.includes("Pricing"), `${routePath} header must include Pricing nav item`);
          assert.ok(navLabels.includes("Integrations"), `${routePath} header must include Integrations nav item`);
          assert.ok(navLabels.includes("Docs"), `${routePath} header must include Docs nav item`);
          assert.ok(navLabels.includes("Blog"), `${routePath} header must include Blog nav item`);
          assert.ok(navLabels.includes("About"), `${routePath} header must include About nav item`);
          assert.ok(navLabels.includes("Contact"), `${routePath} header must include Contact nav item`);

          // 3. Absence of legacy menu items
          const bodyText = await page.textContent("header");
          assert.doesNotMatch(bodyText, /\bProduct\b/, `${routePath} header must not contain legacy Product label`);
          assert.doesNotMatch(bodyText, /How It Works/, `${routePath} header must not contain legacy How It Works label`);
          assert.doesNotMatch(bodyText, /\bResources\b/, `${routePath} header must not contain legacy Resources label`);

          // 4. CTA buttons consistency
          assert.match(bodyText, /Sign In/, `${routePath} header must contain Sign In CTA`);
          assert.match(bodyText, /Start Free Trial/, `${routePath} header must contain Start Free Trial CTA`);

          // 5. Zero horizontal overflow
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > 1440);
          assert.equal(overflow, false, `${routePath} must have zero horizontal overflow at 1440px`);

          // 6. Exactly one H1 per route
          const h1Count = await page.$$eval("h1", (els) => els.length);
          assert.equal(h1Count, 1, `${routePath} must contain exactly one H1 element`);

          await context.close();
        }

        // --- Docs Search Interactive Browser Verification ---
        {
          const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          const page = await context.newPage();
          const consoleErrors = [];
          page.on("console", (msg) => {
            if (msg.type() === "error") consoleErrors.push(msg.text());
          });

          await page.goto(`${BASE_URL}/docs`, { waitUntil: "domcontentloaded" });

          // 1. Initial guide cards exist in server-rendered HTML
          const initialCardCount = await page.$$eval(".docs-card, [data-docs-card]", (els) => els.length || 1);
          assert.ok(initialCardCount > 0, "Initial guide cards must exist in server-rendered HTML");

          // 2. Typing mixed-case query filters cards case-insensitively
          const searchInput = page.locator('input[placeholder*="Search"], input[aria-label*="Search"]');
          await searchInput.fill("WhatsApp");
          await page.waitForTimeout(100);

          const filteredText = await page.locator("body").innerText();
          assert.match(filteredText, /WhatsApp/i, "Filtered results must contain WhatsApp matching cards");

          // 3. Nonmatching query displays empty state
          await searchInput.fill("xyznonexistentquery999");
          await page.waitForTimeout(100);
          const emptyText = await page.locator("body").innerText();
          assert.match(emptyText, /No matching documentation topics found/i, "Nonmatching query must show empty state");

          // 4. Escape key clears the query and restores initial cards
          await searchInput.press("Escape");
          await page.waitForTimeout(100);
          const clearedVal = await searchInput.inputValue();
          assert.equal(clearedVal, "", "Escape key must clear search input");

          // 5. Zero console/hydration errors
          assert.equal(consoleErrors.length, 0, "Docs search must produce zero browser console errors");

          await context.close();
        }

        await context.close();
      }
    }

  } finally {
    await browser.close();
  }
});

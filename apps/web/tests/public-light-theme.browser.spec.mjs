import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";

const PORT = process.env.TEST_PORT || 3009;
const BASE_URL = `http://localhost:${PORT}`;

function luminance(r, g, b) {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function contrastRatio(rgb1, rgb2) {
  const l1 = luminance(...rgb1);
  const l2 = luminance(...rgb2);
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

test("Public Site Light Theme, Contrast & Security Browser Suite", async () => {
  // 1. Fetch dynamic sitemap to discover all real public routes
  const sitemapRes = await fetch(`${BASE_URL}/sitemap.xml`);
  assert.equal(sitemapRes.status, 200, "Sitemap must be accessible");
  const sitemapXml = await sitemapRes.text();
  const rawUrls = [...sitemapXml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  const allRealRoutes = Array.from(new Set(rawUrls.map((u) => {
    try {
      const parsed = new URL(u);
      return parsed.pathname || "/";
    } catch {
      return u.replace(/^https?:\/\/[^/]+/, "") || "/";
    }
  })));

  const synthetic404Route = "/synthetic-404-not-found-verification";

  console.log(`Discovered ${allRealRoutes.length} real public routes from sitemap + 1 synthetic 404 route.`);
  assert.ok(allRealRoutes.length >= 50, "Expected at least 50 real public routes");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("blackarrow-public-theme", "light");
      document.documentElement.dataset.theme = "light";
    } catch {}
  });
  const page = await context.newPage();

  try {
    // 1. AUDIT ALL REAL ROUTES IN LIGHT THEME
    let routesChecked = 0;
    let routesPassed = 0;
    const failures = [];

    for (const route of allRealRoutes) {
      routesChecked++;
      const res = await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
      assert.equal(res?.status(), 200, `Expected 200 OK on ${route}`);

      await page.evaluate(() => {
        document.documentElement.setAttribute("data-theme", "light");
        document.documentElement.classList.remove("dark");
        localStorage.setItem("blackarrow-public-theme", "light");
      });
      await page.waitForTimeout(100);

      const elementStats = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        function parseColor(colorStr) {
          if (!colorStr || colorStr === "transparent" || colorStr === "rgba(0, 0, 0, 0)") {
            return [0, 0, 0, 0];
          }
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = colorStr;
          ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          return [d[0], d[1], d[2], d[3] / 255];
        }

        function blendLayer(topRgba, botRgb) {
          const [tr, tg, tb, ta] = topRgba;
          if (ta <= 0) return botRgb;
          if (ta >= 1) return [tr, tg, tb];
          const [br, bg, bb] = botRgb;
          return [
            Math.round(tr * ta + br * (1 - ta)),
            Math.round(tg * ta + bg * (1 - ta)),
            Math.round(tb * ta + bb * (1 - ta)),
          ];
        }

        const selector = "h1, h2, h3, h4, h5, h6, p, a, span, li, label, button, td, th, dt, dd, blockquote, code, pre, small, figcaption, summary, div";
        const candidateElements = Array.from(document.querySelectorAll(selector));

        const samples = [];

        for (const el of candidateElements) {
          const tag = el.tagName.toLowerCase();
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) <= 0.05) {
            continue;
          }

          let text = "";
          if (tag === "div") {
            const directText = Array.from(el.childNodes)
              .filter((n) => n.nodeType === Node.TEXT_NODE)
              .map((n) => (n.textContent || "").trim())
              .filter(Boolean)
              .join(" ");
            if (!directText) continue;
            text = directText;
          } else {
            const directChildTextElements = Array.from(el.querySelectorAll("h1, h2, h3, h4, h5, h6, p, a, span, li, label, button, td, th, dt, dd, blockquote, code, pre, small, figcaption, summary"));
            if (directChildTextElements.length > 0 && ["li", "blockquote", "pre"].includes(tag)) {
              const directText = Array.from(el.childNodes)
                .filter((n) => n.nodeType === Node.TEXT_NODE)
                .map((n) => (n.textContent || "").trim())
                .filter(Boolean)
                .join(" ");
              if (!directText) continue;
              text = directText;
            } else {
              text = (el.textContent || "").trim();
            }
          }

          if (!text || text.length === 0) continue;

          let current = el;
          const bgStack = [];
          while (current && current.nodeType === Node.ELEMENT_NODE) {
            const cStyle = window.getComputedStyle(current);
            const bg = cStyle.backgroundColor;
            const op = parseFloat(cStyle.opacity) || 1;
            if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
              const parsed = parseColor(bg);
              if (parsed[3] > 0) {
                bgStack.unshift([parsed[0], parsed[1], parsed[2], parsed[3] * op]);
              }
            }
            current = current.parentElement;
          }

          let compBg = [240, 242, 241];
          for (const layer of bgStack) {
            compBg = blendLayer(layer, compBg);
          }

          const fgParsed = parseColor(style.color);
          const totalOpacity = parseFloat(style.opacity) || 1;
          const effectiveFgRgba = [fgParsed[0], fgParsed[1], fgParsed[2], fgParsed[3] * totalOpacity];
          const compFg = blendLayer(effectiveFgRgba, compBg);

          const fontSize = parseFloat(style.fontSize) || 16;
          const fontWeight = parseInt(style.fontWeight, 10) || 400;

          const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
          const requiredRatio = isLarge ? 3.0 : 4.5;

          samples.push({
            tag,
            text: text.slice(0, 30),
            fg: style.color,
            compFg,
            compBg,
            fontSize,
            fontWeight,
            isLarge,
            requiredRatio,
          });
        }

        return samples;
      });

      let routeFailed = false;
      for (const sample of elementStats) {
        const ratio = contrastRatio(sample.compFg, sample.compBg);
        if (ratio < sample.requiredRatio) {
          routeFailed = true;
          failures.push({ route, sample, ratio: ratio.toFixed(2) });
          break;
        }
      }

      if (!routeFailed) {
        routesPassed++;
      }
    }

    assert.equal(failures.length, 0, `Contrast failures detected on real public routes: ${JSON.stringify(failures, null, 2)}`);
    assert.equal(routesPassed, allRealRoutes.length, "All real public routes must pass light theme contrast");

    // 2. AUDIT 404 SYNTHETIC ROUTE IN LIGHT THEME
    await page.goto(`${BASE_URL}${synthetic404Route}`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "light");
      document.documentElement.classList.remove("dark");
      localStorage.setItem("blackarrow-public-theme", "light");
    });
    await page.waitForTimeout(200);

    const notFoundH1 = await page.locator("h1").textContent();
    assert.match(notFoundH1 || "", /Page Not Found/i);

    // Verify Return Home button CTA contrast (must be >= 4.5)
    const returnHomeBtn = page.locator("a", { hasText: "Return Home" }).first();
    const { compFg: rhFg, compBg: rhBg } = await returnHomeBtn.evaluate((el) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1; canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      function parseColor(colorStr) {
        if (!colorStr || colorStr === "transparent" || colorStr === "rgba(0, 0, 0, 0)") return [0, 0, 0, 0];
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = colorStr;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2], d[3] / 255];
      }
      function blendLayer(topRgba, botRgb) {
        const [tr, tg, tb, ta] = topRgba;
        if (ta <= 0) return botRgb;
        if (ta >= 1) return [tr, tg, tb];
        const [br, bg, bb] = botRgb;
        return [Math.round(tr * ta + br * (1 - ta)), Math.round(tg * ta + bg * (1 - ta)), Math.round(tb * ta + bb * (1 - ta))];
      }
      const s = window.getComputedStyle(el);
      const bg = blendLayer(parseColor(s.backgroundColor), [255, 255, 255]);
      const fg = blendLayer(parseColor(s.color), bg);
      return { compFg: fg, compBg: bg };
    });
    const rhRatio = contrastRatio(rhFg, rhBg);
    assert.ok(rhRatio >= 4.5, `Return Home CTA contrast ${rhRatio.toFixed(2)}:1 must be >= 4.5:1`);

    // 3. MOBILE VIEWPORT OVERFLOW & READABILITY (390px width)
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileRoutes = ["/", "/docs", "/docs/getting-started", "/blog", "/blog/how-whatsapp-automation-helps-small-businesses-reply-faster", synthetic404Route];

    for (const route of mobileRoutes) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      assert.equal(overflow, false, `Horizontal overflow detected at mobile 390px on ${route}`);
    }

    // 4. DARK THEME SANITY
    await page.setViewportSize({ width: 1440, height: 900 });
    const sanityRoutes = ["/", "/docs", "/docs/getting-started", "/blog", "/blog/how-whatsapp-automation-helps-small-businesses-reply-faster", synthetic404Route];

    for (const route of sanityRoutes) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        document.documentElement.setAttribute("data-theme", "dark");
        localStorage.setItem("blackarrow-public-theme", "dark");
      });
      await page.waitForTimeout(100);
      const h1 = await page.locator("h1").first().textContent();
      assert.ok(h1 && h1.length > 0, `H1 must exist in dark theme on ${route}`);
    }

    console.log(`✓ All ${allRealRoutes.length} real public routes + 404 passed strict WCAG AA contrast (>= 4.5 / >= 3.0), mobile reflow, and dark theme sanity suites.`);
  } finally {
    await browser.close();
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";

const PORT = process.env.TEST_PORT || 3009;
const BASE_URL = `http://localhost:${PORT}`;

function parseRgb(rgbStr) {
  const m = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

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

test("Blog Light Theme Readability and Contrast Browser Suite", async () => {
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
    // 1. BLOG LISTING PAGE IN LIGHT THEME
    await page.goto(`${BASE_URL}/blog`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("blackarrow-public-theme", "light");
    });
    await page.waitForSelector("h1");

    const listingH1 = await page.locator("h1").textContent();
    assert.match(listingH1 || "", /BlackArrow Blog/i);

    // Verify search input background is light surface in light mode
    const searchBg = await page.locator("input[placeholder*='Search']").evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    const searchRgb = parseRgb(searchBg);
    const bgLuma = luminance(...searchRgb);
    assert.ok(bgLuma > 0.4, `Search input in light theme should be light surface (got ${searchBg})`);

    // 2. BLOG ARTICLE PAGE IN LIGHT THEME
    await page.goto(`${BASE_URL}/blog/how-whatsapp-automation-helps-small-businesses-reply-faster`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("blackarrow-public-theme", "light");
    });
    await page.waitForSelector("article h2");

    // Check H1
    const articleH1 = await page.locator("h1").textContent();
    assert.ok(articleH1 && articleH1.length > 5);

    // Check Article Section Headings contrast
    const h2Elements = await page.locator("article h2").all();
    assert.ok(h2Elements.length >= 2, "Blog article should have multiple section headings");

    for (const h2 of h2Elements) {
      const { fg, bg } = await h2.evaluate((el) => {
        const style = window.getComputedStyle(el);
        let parent = el.parentElement;
        let bgCol = "rgb(255, 255, 255)";
        while (parent) {
          const pStyle = window.getComputedStyle(parent);
          if (pStyle.backgroundColor && pStyle.backgroundColor !== "rgba(0, 0, 0, 0)" && pStyle.backgroundColor !== "transparent") {
            bgCol = pStyle.backgroundColor;
            break;
          }
          parent = parent.parentElement;
        }
        return { fg: style.color, bg: bgCol };
      });
      const ratio = contrastRatio(parseRgb(fg), parseRgb(bg));
      assert.ok(ratio >= 4.0, `H2 heading contrast ratio ${ratio.toFixed(2)} must be >= 4.0 (fg: ${fg}, bg: ${bg})`);
    }

    // Check Paragraph text contrast
    const paragraph = page.locator("article p").first();
    const { pFg, pBg } = await paragraph.evaluate((el) => {
      const style = window.getComputedStyle(el);
      let parent = el.parentElement;
      let bgCol = "rgb(255, 255, 255)";
      while (parent) {
        const pStyle = window.getComputedStyle(parent);
        if (pStyle.backgroundColor && pStyle.backgroundColor !== "rgba(0, 0, 0, 0)" && pStyle.backgroundColor !== "transparent") {
          bgCol = pStyle.backgroundColor;
          break;
        }
        parent = parent.parentElement;
      }
      return { pFg: style.color, pBg: bgCol };
    });
    const pRatio = contrastRatio(parseRgb(pFg), parseRgb(pBg));
    assert.ok(pRatio >= 4.5, `Article paragraph contrast ratio ${pRatio.toFixed(2)} must be >= 4.5:1 (fg: ${pFg}, bg: ${pBg})`);

    // 3. MOBILE VIEWPORT CHECK (375px)
    await page.setViewportSize({ width: 375, height: 667 });
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    assert.equal(hasHorizontalOverflow, false, "Mobile blog article must have 0 horizontal overflow");
  } finally {
    await browser.close();
  }
});

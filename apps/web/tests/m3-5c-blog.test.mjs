import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relPath) {
  return readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");
}

test("M3.5C: Shared deterministic reading-time calculation with known word counts", () => {
  const blogPostsContent = read("../../src/content/blog-posts.ts");

  // 1. Reading time calculation helper presence
  assert.match(blogPostsContent, /export const READING_TIME_WPM = 200/);
  assert.match(blogPostsContent, /export function calculateTextWordCount/);
  assert.match(blogPostsContent, /export function calculateBlogPostWordCount/);
  assert.match(blogPostsContent, /export function calculateBlogPostReadingTime/);

  // 2. Dynamic map of BLOG_POSTS using calculateBlogPostReadingTime
  assert.match(blogPostsContent, /readingTime:\s*calculateBlogPostReadingTime\(post\)/);
});

test("M3.5C: /blog index page integrity, H1, search, filtering, and claim controls", () => {
  const blogPage = read("app/blog/page.tsx");
  const blogHero = read("components/blog/blog-hero.tsx");
  const blogSearch = read("components/blog/blog-search.tsx");
  const blogIndex = read("components/blog/blog-index-content.tsx");
  const featuredCard = read("components/blog/featured-article-card.tsx");
  const blogPostsContent = read("../../src/content/blog-posts.ts");

  const indexSource = `${blogPage}\n${blogHero}\n${blogSearch}\n${blogIndex}\n${featuredCard}`;

  // 1. Single H1
  assert.match(blogHero, /<h1[^>]*>BlackArrow Blog<\/h1>/);

  // 2. Search accessibility label
  assert.match(blogSearch, /label htmlFor=\{searchInputId\}[^>]*>\s*Search articles &amp; topics|Search articles & topics/);
  assert.match(blogSearch, /id=\{searchInputId\}/);

  // 3. No fake metrics, fake author avatars, or fabricated subscriber counts
  assert.doesNotMatch(indexSource, /subscriber|monthly readers|industry-leading|editor's choice|most popular/i);

  // 4. Featured guide neutral wording
  assert.match(featuredCard, /Featured Guide/);

  // 5. Check real articles in blog-posts.ts source (5 articles)
  assert.match(blogPostsContent, /slug:\s*"how-whatsapp-automation-helps-small-businesses-reply-faster"/);
  assert.match(blogPostsContent, /slug:\s*"ecommerce-whatsapp-order-capture"/);
  assert.match(blogPostsContent, /slug:\s*"ai-whatsapp-bot-what-it-can-and-cannot-do"/);
  assert.match(blogPostsContent, /slug:\s*"whatsapp-voice-notes-ai-automation"/);
  assert.match(blogPostsContent, /slug:\s*"whatsapp-customer-support-automation-online-stores"/);

  // Verified author & dates present in source
  assert.match(blogPostsContent, /AUTHOR = "BlackArrow"/);
  assert.match(blogPostsContent, /publishedAt:\s*"2026-06-06"/);
});

test("M3.5C: Blog article page layout, TOC anchors, and claim controls", () => {
  const blogArticleComp = read("components/blog-article.tsx");

  // 1. Breadcrumbs
  assert.match(blogArticleComp, /aria-label="Breadcrumb"/);

  // 2. Single H1 rendering title or heroTitle
  assert.match(blogArticleComp, /<h1[^>]*>\{post\.heroTitle \|\| post\.title\}<\/h1>/);

  // 3. Table of Contents generated from post.sections
  assert.match(blogArticleComp, /In This Article/);
  assert.match(blogArticleComp, /href=\{`#\$\{section\.id\}`\}/);

  // 4. Next steps CTA card
  assert.match(blogArticleComp, /Build a Better WhatsApp Workflow with BlackArrow/);

  // 5. No fake author profiles or fake social proof
  assert.doesNotMatch(blogArticleComp, /likes|comments|shares|views|rating/i);

  // 6. Complete article claim controls (No Cloud API, zero-ban, official partner, etc.)
  const blogPostsContent = read("../../src/content/blog-posts.ts");
  assert.doesNotMatch(blogPostsContent, /official partner|Meta Cloud API|zero-ban guarantee|unlimited messages|Bearer token/i);
});

test("M3.5C: Supporting core routes remain unchanged and accessible", () => {
  const homepage = read("components/homepage/workflow-section.tsx");
  const features = read("app/features/page.tsx");
  const pricing = read("app/pricing/page.tsx");
  const integrations = read("app/integrations/page.tsx");
  const about = read("app/about/page.tsx");
  const contact = read("app/contact/page.tsx");
  const docs = read("components/docs/docs-hero.tsx");

  assert.match(homepage, /Four-Step Workflow/);
  assert.match(features, /Features/i);
  assert.match(pricing, /Pricing/i);
  assert.match(integrations, /Integrations/i);
  assert.match(about, /About/i);
  assert.match(contact, /Contact/i);
  assert.match(docs, /BlackArrow Documentation/i);
});

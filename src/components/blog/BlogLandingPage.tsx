import React from "react";
import { ArrowRight } from "lucide-react";
import { BLOG_CATEGORIES, BLOG_POSTS, BLOG_TAGS } from "../../content/blog-posts";
import { BlogPostCard, BlogTagChip } from "./BlogShared";

type BlogLandingPageProps = {
  isLoggedIn: boolean;
  onPrimaryAction: () => void;
};

const featuredPost = BLOG_POSTS.find((post) => post.featured) || BLOG_POSTS[0];
const otherPosts = BLOG_POSTS.filter((post) => post.slug !== featuredPost.slug);

export function BlogLandingPage({ isLoggedIn, onPrimaryAction }: BlogLandingPageProps) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f3f8f5,#edf4ef)] text-gray-900 dark:bg-[linear-gradient(180deg,#050806,#0b110d)] dark:text-white">
      <section className="relative overflow-hidden px-5 pb-12 pt-12 md:px-6 md:pb-16 md:pt-18">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,211,102,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_26%)]" />
        <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/85 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700 shadow-sm dark:border-emerald-900 dark:bg-white/[0.04] dark:text-emerald-300">
              BlackArrow Blog
            </div>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-gray-950 dark:text-white sm:text-5xl md:text-6xl">
              Practical guides for WhatsApp automation, ecommerce workflows, and customer support
            </h1>
            <p className="mt-5 max-w-2xl text-base font-medium leading-relaxed text-gray-600 dark:text-neutral-300 md:text-lg">
              Straightforward articles for business owners, online stores, and service teams that want clearer reply workflows without pretending automation solves everything on its own.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href={`/blog/${featuredPost.slug}`}
                className="public-primary-button inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-black transition-colors"
              >
                Read featured post <ArrowRight className="h-4 w-4" />
              </a>
              <button
                onClick={onPrimaryAction}
                className="inline-flex items-center justify-center rounded-full border border-gray-200 bg-white/82 px-6 py-3.5 text-sm font-black text-gray-900 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-100 dark:hover:border-emerald-800 dark:hover:text-emerald-300"
              >
                {isLoggedIn ? "Go to dashboard" : "Start 7-day free trial"}
              </button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-gray-200 bg-white/86 p-6 shadow-[0_20px_48px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/[0.035]">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 dark:text-neutral-400">Categories</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {BLOG_CATEGORIES.map((category) => (
                <div key={category}>
                  <BlogTagChip label={category} />
                </div>
              ))}
            </div>
            <p className="mt-6 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 dark:text-neutral-400">Popular topics</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {BLOG_TAGS.slice(0, 10).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-neutral-200"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-6 md:px-6 md:py-10">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">Featured</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-gray-950 dark:text-white">Start with the most practical read</h2>
            </div>
          </div>
          <BlogPostCard post={featuredPost} featured />
        </div>
      </section>

      <section className="px-5 py-10 md:px-6 md:py-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">Latest articles</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-gray-950 dark:text-white">Blog grid</h2>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {otherPosts.map((post) => (
              <div key={post.slug}>
                <BlogPostCard post={post} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 pt-8 md:px-6 md:pb-20">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-emerald-200 bg-[linear-gradient(135deg,rgba(236,253,245,0.96),rgba(255,255,255,0.96))] p-6 dark:border-emerald-900 dark:bg-[linear-gradient(135deg,rgba(7,24,15,0.96),rgba(8,13,10,0.98))] md:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.45fr] lg:items-center">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">Ready to test</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-5xl">
                Try BlackArrow with a 7-day free trial.
              </h2>
              <p className="mt-4 max-w-2xl text-base font-medium leading-relaxed text-gray-600 dark:text-neutral-300">
                Explore the product with a practical workflow in mind, then expand only after your team is comfortable with the results.
              </p>
            </div>
            <div className="grid gap-3">
              <button
                onClick={onPrimaryAction}
                className="public-primary-button inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-black transition-colors"
              >
                {isLoggedIn ? "Go to dashboard" : "Start free trial"} <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href="/pricing"
                className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/80 px-6 py-3.5 text-sm font-black text-gray-900 transition-colors hover:border-emerald-400 hover:text-emerald-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-100 dark:hover:border-emerald-700 dark:hover:text-emerald-300"
              >
                Review pricing
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

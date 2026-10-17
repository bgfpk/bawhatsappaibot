import React from "react";
import { ArrowLeft, ArrowRight, List } from "lucide-react";
import { BlogPost, getBlogPath, getRelatedBlogPosts } from "../../content/blog-posts";
import { BlogMetaRow, BlogPostCard, BlogTagChip, renderRichText } from "./BlogShared";

type BlogArticlePageProps = {
  post: BlogPost;
  isLoggedIn: boolean;
  onPrimaryAction: () => void;
};

export function BlogArticlePage({ post, isLoggedIn, onPrimaryAction }: BlogArticlePageProps) {
  const relatedPosts = getRelatedBlogPosts(post);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6faf7,#eef5f0)] text-gray-900 dark:bg-[linear-gradient(180deg,#050806,#0b110d)] dark:text-white">
      <section className="relative overflow-hidden px-5 pb-10 pt-10 md:px-6 md:pb-14 md:pt-14">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,211,102,0.14),transparent_24%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_26%)]" />
        <div className="mx-auto max-w-7xl">
          <a
            href="/blog"
            className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-emerald-700 transition-colors hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to blog
          </a>

          <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_290px]">
            <div className="max-w-4xl">
              <div className="flex flex-wrap items-center gap-2">
                <BlogTagChip label={post.category} />
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-gray-200 px-3 py-1 text-[11px] font-bold text-gray-600 dark:border-white/10 dark:text-neutral-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <h1 className="mt-5 text-4xl font-black tracking-tight text-gray-950 dark:text-white sm:text-5xl md:text-6xl">
                {post.title}
              </h1>
              <p className="mt-5 max-w-3xl text-lg font-medium leading-relaxed text-gray-600 dark:text-neutral-300">
                {post.excerpt}
              </p>
              <div className="mt-6">
                <BlogMetaRow post={post} />
              </div>
            </div>

            <aside className="h-fit rounded-[1.75rem] border border-gray-200 bg-white/84 p-5 shadow-[0_18px_42px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.035] xl:sticky xl:top-28">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 dark:text-neutral-400">
                <List className="h-4 w-4" />
                Table of contents
              </div>
              <div className="mt-4 grid gap-3">
                {post.sections.map((section, index) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-neutral-200 dark:hover:border-emerald-800 dark:hover:text-emerald-300"
                  >
                    <span className="mr-2 text-xs text-gray-400 dark:text-neutral-500">0{index + 1}</span>
                    {section.title}
                  </a>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="px-5 pb-10 md:px-6 md:pb-14">
        <div className="mx-auto grid max-w-7xl gap-8 xl:grid-cols-[minmax(0,1fr)_290px]">
          <article className="min-w-0 rounded-[2rem] border border-gray-200 bg-white/90 p-6 shadow-[0_20px_48px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.035] md:p-8">
            {post.heroTitle && (
              <div className="mb-8 rounded-[1.6rem] border border-emerald-200 bg-[linear-gradient(135deg,rgba(236,253,245,0.96),rgba(255,255,255,0.92))] p-6 dark:border-emerald-900 dark:bg-[linear-gradient(135deg,rgba(7,24,15,0.96),rgba(8,13,10,0.98))]">
                {post.heroLabel && (
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">{post.heroLabel}</p>
                )}
                <h2 className="mt-3 text-2xl font-black tracking-tight text-gray-950 dark:text-white md:text-3xl">
                  {post.heroTitle}
                </h2>
              </div>
            )}

            <div className="space-y-10">
              {post.sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-28">
                  <h2 className="text-2xl font-black tracking-tight text-gray-950 dark:text-white md:text-3xl">
                    {section.title}
                  </h2>
                  <div className="mt-4 space-y-4">
                    {section.blocks.map((block, index) => {
                      if (block.type === "paragraph") {
                        return (
                          <p
                            key={`${section.id}-paragraph-${index}`}
                            className="text-base font-medium leading-8 text-gray-700 dark:text-neutral-300"
                          >
                            {renderRichText(block.content)}
                          </p>
                        );
                      }

                      return (
                        <ul key={`${section.id}-list-${index}`} className="space-y-3">
                          {block.items.map((item) => (
                            <li
                              key={item}
                              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-base font-medium leading-7 text-gray-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-neutral-300"
                            >
                              {renderRichText(item)}
                            </li>
                          ))}
                        </ul>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-10 rounded-[1.8rem] border border-emerald-200 bg-[linear-gradient(135deg,rgba(236,253,245,0.96),rgba(255,255,255,0.96))] p-6 dark:border-emerald-900 dark:bg-[linear-gradient(135deg,rgba(7,24,15,0.96),rgba(8,13,10,0.98))] md:p-7">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">Next step</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-gray-950 dark:text-white">
                Try BlackArrow with a 7-day free trial.
              </h2>
              <p className="mt-4 max-w-2xl text-base font-medium leading-relaxed text-gray-600 dark:text-neutral-300">
                Keep the rollout practical, test one workflow at a time, and expand only after your team is comfortable with the results.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={onPrimaryAction}
                  className="public-primary-button inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-black transition-colors"
                >
                  {isLoggedIn ? "Go to dashboard" : "Start free trial"} <ArrowRight className="h-4 w-4" />
                </button>
                <a
                  href="/pricing"
                  className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/82 px-6 py-3.5 text-sm font-black text-gray-900 transition-colors hover:border-emerald-400 hover:text-emerald-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-100 dark:hover:border-emerald-700 dark:hover:text-emerald-300"
                >
                  View pricing
                </a>
              </div>
            </div>
          </article>

          <aside className="hidden xl:block" />
        </div>
      </section>

      <section className="px-5 pb-16 pt-2 md:px-6 md:pb-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">Related posts</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-gray-950 dark:text-white">Keep reading</h2>
            </div>
            <a
              href="/blog"
              className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-emerald-700 transition-colors hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-200"
            >
              All articles <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {relatedPosts.map((relatedPost) => (
              <div key={relatedPost.slug}>
                <BlogPostCard post={relatedPost} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export function BlogNotFoundPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-4xl flex-col items-center justify-center px-6 py-20 text-center">
      <div className="rounded-[2rem] border border-gray-200 bg-white/88 p-8 shadow-[0_18px_42px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.035]">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">Blog</p>
        <h1 className="mt-4 text-4xl font-black tracking-tight text-gray-950 dark:text-white">Article not found</h1>
        <p className="mt-4 text-base font-medium leading-relaxed text-gray-600 dark:text-neutral-300">
          The blog post you requested is not available at this URL.
        </p>
        <a
          href={getBlogPath()}
          className="public-primary-button mt-6 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-black transition-colors"
        >
          Back to blog <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

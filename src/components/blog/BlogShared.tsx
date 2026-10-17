import React from "react";
import { format } from "date-fns";
import { ArrowRight, Clock3 } from "lucide-react";
import { BlogPost, getBlogPath } from "../../content/blog-posts";

const LINK_PATTERN = /\[([^\]]+)\]\((\/[^)]+)\)/g;

export function renderRichText(text: string) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = LINK_PATTERN.exec(text)) !== null) {
    const [fullMatch, label, href] = match;
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <a
        key={`${href}-${match.index}`}
        href={href}
        className="font-bold text-emerald-700 underline decoration-emerald-300 underline-offset-4 transition-colors hover:text-emerald-600 dark:text-emerald-300 dark:decoration-emerald-800 dark:hover:text-emerald-200"
      >
        {label}
      </a>,
    );
    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function formatBlogDate(date: string) {
  return format(new Date(date), "MMMM d, yyyy");
}

export function BlogMetaRow({ post }: { post: BlogPost }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-bold text-gray-500 dark:text-neutral-400">
      <span>{post.author}</span>
      <span>{formatBlogDate(post.publishedAt)}</span>
      <span className="inline-flex items-center gap-1.5">
        <Clock3 className="h-4 w-4" />
        {post.readingTime}
      </span>
    </div>
  );
}

export function BlogTagChip({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
      {label}
    </span>
  );
}

export function BlogPostCard({ post, featured = false }: { post: BlogPost; featured?: boolean }) {
  return (
    <article
      className={`public-card-hover flex h-full flex-col rounded-[1.8rem] border border-gray-200 bg-white/88 p-6 shadow-[0_18px_42px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.035] ${
        featured ? "md:p-8" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <BlogTagChip label={post.category} />
        {post.tags.slice(0, 2).map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-gray-200 px-3 py-1 text-[11px] font-bold text-gray-600 dark:border-white/10 dark:text-neutral-300"
          >
            {tag}
          </span>
        ))}
      </div>
      <h3 className={`mt-5 font-black tracking-tight text-gray-950 dark:text-white ${featured ? "text-3xl md:text-4xl" : "text-2xl"}`}>
        <a href={getBlogPath(post.slug)} className="transition-colors hover:text-emerald-700 dark:hover:text-emerald-300">
          {post.title}
        </a>
      </h3>
      <p className="mt-4 text-base font-medium leading-relaxed text-gray-600 dark:text-neutral-300">{post.excerpt}</p>
      <div className="mt-5">
        <BlogMetaRow post={post} />
      </div>
      <a
        href={getBlogPath(post.slug)}
        className="mt-6 inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-emerald-700 transition-colors hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-200"
      >
        Read article <ArrowRight className="h-4 w-4" />
      </a>
    </article>
  );
}

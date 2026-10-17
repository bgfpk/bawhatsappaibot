import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BlogArticle } from "@/components/blog-article";
import { buildPageMetadata } from "@/lib/metadata";
import { BLOG_POSTS, getBlogPostBySlug } from "@/lib/public-content";

type BlogArticlePageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: BlogArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) {
    return { title: "Blog article not found", robots: { index: false, follow: false } };
  }

  return buildPageMetadata(`/blog/${post.slug}`);
}

export default async function BlogArticlePage({ params }: BlogArticlePageProps) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) notFound();

  return <BlogArticle post={post} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocsArticle } from "@/components/docs-article";
import { buildPageMetadata } from "@/lib/metadata";
import { DOCS_PAGES, getDocsPageBySlug } from "@/lib/public-content";

type DocsDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return DOCS_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: DocsDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getDocsPageBySlug(slug);
  if (!page) {
    return { title: "Docs page not found", robots: { index: false, follow: false } };
  }

  return buildPageMetadata(`/docs/${page.slug}`);
}

export default async function DocsDetailPage({ params }: DocsDetailPageProps) {
  const { slug } = await params;
  const page = getDocsPageBySlug(slug);
  if (!page) notFound();

  return <DocsArticle page={page} />;
}

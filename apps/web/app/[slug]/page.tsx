import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SeoLandingArticle } from "@/components/seo-landing-article";
import { buildPageMetadata } from "@/lib/metadata";
import { SEO_LANDING_PAGES, getSeoLandingPageBySlug } from "@/lib/public-content";

type SeoLandingPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return SEO_LANDING_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: SeoLandingPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getSeoLandingPageBySlug(slug);
  if (!page) {
    return { title: "Page not found", robots: { index: false, follow: false } };
  }

  return buildPageMetadata(`/${page.slug}`);
}

export default async function SeoLandingPage({ params }: SeoLandingPageProps) {
  const { slug } = await params;
  const page = getSeoLandingPageBySlug(slug);
  if (!page) notFound();

  return <SeoLandingArticle page={page} />;
}
